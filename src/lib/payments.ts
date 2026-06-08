import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPricingProduct, type ProductId } from "./pricing";
import { notifyPaymentFailed, notifyPaymentSuccessful, notifyReceiptGenerated } from "./notifications";

export type PaymentStatus = "pending" | "processing" | "successful" | "failed" | "cancelled" | "timed_out" | "paid";

type StkPushInput = {
  userId: string;
  projectId: string;
  productId: ProductId;
  phone: string;
};

type DarajaCallbackItem = { Name: string; Value?: string | number };

function env(name: string, fallback?: string) {
  return process.env[name] ?? (fallback ? process.env[fallback] : undefined);
}

function getDarajaBaseUrl() {
  const mode = env("DARAJA_ENV", "MPESA_ENV");
  return mode === "live" || mode === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function getDarajaConfig() {
  const consumerKey = env("DARAJA_CONSUMER_KEY", "MPESA_CONSUMER_KEY");
  const consumerSecret = env("DARAJA_CONSUMER_SECRET", "MPESA_CONSUMER_SECRET");
  const shortcode = env("DARAJA_SHORTCODE", "MPESA_SHORTCODE");
  const passkey = env("DARAJA_PASSKEY", "MPESA_PASSKEY");
  const callbackUrl = env("DARAJA_CALLBACK_URL", "MPESA_CALLBACK_URL");
  if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackUrl) {
    throw new Error("Daraja credentials are not configured.");
  }
  return { consumerKey, consumerSecret, shortcode, passkey, callbackUrl };
}

function timestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
}

export function normalizeSafaricomPhone(input: string) {
  const digits = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  if (/^0(7|1)\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^(7|1)\d{8}$/.test(digits)) return `254${digits}`;
  throw new Error("Use a valid Safaricom number, for example 2547XXXXXXXX.");
}

async function getAccessToken() {
  const { consumerKey, consumerSecret } = getDarajaConfig();
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const response = await fetch(`${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  if (!response.ok) throw new Error("Unable to authenticate with M-Pesa Daraja.");
  const payload = (await response.json()) as { access_token: string };
  return payload.access_token;
}

async function generateReceiptNumber() {
  const supabase = createSupabaseAdminClient();
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const { count } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .like("receipt_number", `SOLVAONE-${ymd}-%`);
  return `SOLVAONE-${ymd}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

async function paymentRateLimit(userId: string) {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if ((count ?? 0) >= 5) throw new Error("Too many payment attempts. Please wait a few minutes.");
}

export async function initiateDarajaStkPush(input: StkPushInput) {
  await paymentRateLimit(input.userId);
  const product = getPricingProduct(input.productId);
  if (!product || !product.isActive) throw new Error("Product is not available for purchase.");

  const phone = normalizeSafaricomPhone(input.phone);
  const { shortcode, passkey, callbackUrl } = getDarajaConfig();
  const token = await getAccessToken();
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");
  const accountReference = `S1-${input.projectId.slice(0, 8)}`;

  const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: product.price,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: product.productName
    })
  });

  const darajaPayload = await response.json();
  if (!response.ok || darajaPayload.ResponseCode !== "0") {
    throw new Error(darajaPayload.errorMessage ?? darajaPayload.ResponseDescription ?? "M-Pesa STK push failed.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      product: product.productId === "cv_cover_bundle" ? "cv_builder" : product.productId,
      product_id: product.productId,
      amount: product.price,
      currency: product.currency,
      phone_number: phone,
      payment_method: "mpesa",
      status: "processing",
      provider: "mpesa",
      checkout_request_id: darajaPayload.CheckoutRequestID,
      merchant_request_id: darajaPayload.MerchantRequestID,
      raw_request: darajaPayload
    })
    .select("id,checkout_request_id")
    .single();

  if (error) throw new Error(error.message);
  await supabase.from("payment_events").insert({ payment_id: payment.id, event_type: "stk_push_initiated", raw_payload: darajaPayload });
  await supabase.from("projects").update({ status: "awaiting_payment" }).eq("id", input.projectId);
  return payment;
}

function parseDarajaDate(value?: string | number) {
  if (!value) return null;
  const raw = String(value);
  if (!/^\d{14}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+03:00`;
}

export async function handleDarajaCallback(payload: any) {
  const supabase = createSupabaseAdminClient();
  const callback = payload?.Body?.stkCallback;
  const checkoutRequestId = callback?.CheckoutRequestID as string | undefined;
  if (!checkoutRequestId) {
    await supabase.from("payment_events").insert({ event_type: "callback_unmatched", raw_payload: payload });
    return { ok: true, matched: false };
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id,user_id,project_id,status,receipt_number,product_id,amount,phone_number")
    .eq("checkout_request_id", checkoutRequestId)
    .maybeSingle();

  if (!payment) {
    await supabase.from("payment_events").insert({ event_type: "callback_unknown_checkout", raw_payload: payload });
    return { ok: true, matched: false };
  }

  await supabase.from("payment_events").insert({ payment_id: payment.id, event_type: "daraja_callback_received", raw_payload: payload });
  if (payment.status === "successful" || payment.status === "paid") return { ok: true, matched: true, duplicate: true };

  const metadata = callback?.CallbackMetadata?.Item as DarajaCallbackItem[] | undefined;
  const getItem = (name: string) => metadata?.find((item) => item.Name === name)?.Value;
  const resultCode = Number(callback?.ResultCode);
  const status: PaymentStatus = resultCode === 0 ? "successful" : resultCode === 1032 ? "cancelled" : resultCode === 1037 ? "timed_out" : "failed";
  const receipt = getItem("MpesaReceiptNumber")?.toString();
  const transactionDate = parseDarajaDate(getItem("TransactionDate"));
  const receiptNumber = status === "successful" ? payment.receipt_number ?? (await generateReceiptNumber()) : payment.receipt_number;

  await supabase
    .from("payments")
    .update({
      status,
      mpesa_receipt_number: receipt,
      provider_reference: receipt,
      receipt_number: receiptNumber,
      transaction_date: transactionDate,
      result_code: resultCode,
      result_description: callback?.ResultDesc,
      raw_callback: payload,
      paid_at: status === "successful" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", payment.id);

  await supabase
    .from("projects")
    .update({ status: status === "successful" ? "paid" : "draft", updated_at: new Date().toISOString() })
    .eq("id", payment.project_id);

  if (status === "successful") {
    await notifyPaymentSuccessful({
      userId: payment.user_id,
      phone: payment.phone_number,
      subject: "SolvaOne payment successful",
      message: "Your payment has been confirmed.",
      metadata: { receipt, receiptNumber, productId: payment.product_id }
    });
    await notifyReceiptGenerated({
      userId: payment.user_id,
      phone: payment.phone_number,
      subject: "SolvaOne receipt generated",
      message: "Your receipt is ready.",
      metadata: { receiptNumber }
    });
  } else {
    await notifyPaymentFailed({
      userId: payment.user_id,
      phone: payment.phone_number,
      subject: "SolvaOne payment failed",
      message: callback?.ResultDesc ?? "Payment failed.",
      metadata: { resultCode, productId: payment.product_id }
    });
  }

  return { ok: true, matched: true, status };
}

export async function userHasPaidProject(userId: string, projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("payments")
    .select("id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .in("status", ["successful", "paid"])
    .maybeSingle();
  return Boolean(data);
}
