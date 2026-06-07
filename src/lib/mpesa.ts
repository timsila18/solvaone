type StkPushInput = {
  phone: string;
  amount: number;
  accountReference: string;
  transactionDescription: string;
};

function getBaseUrl() {
  return process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function timestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`;
}

async function getAccessToken() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error("M-Pesa consumer credentials are not configured.");
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const response = await fetch(`${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });

  if (!response.ok) {
    throw new Error("Unable to authenticate with M-Pesa Daraja.");
  }

  const payload = (await response.json()) as { access_token: string };
  return payload.access_token;
}

export async function initiateStkPush(input: StkPushInput) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;

  if (!shortcode || !passkey || !callbackUrl) {
    throw new Error("M-Pesa STK configuration is incomplete.");
  }

  const token = await getAccessToken();
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");

  const response = await fetch(`${getBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: input.amount,
      PartyA: input.phone,
      PartyB: shortcode,
      PhoneNumber: input.phone,
      CallBackURL: callbackUrl,
      AccountReference: input.accountReference,
      TransactionDesc: input.transactionDescription
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`M-Pesa STK push failed: ${body}`);
  }

  return response.json();
}
