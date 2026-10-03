import { hasVerifiedJobDeskPayment } from "./payment";
import { readApplicationScope } from "./application-scope";
import { successfulDelivery, distinctSuccessfulDeliveries, deliveryStage, type DeliveryApplication } from "./application-progress";

export function zeroDeliveryReview(order: { created_at: string; status: string; payment_status: string; amount: number; payment_reference: string | null; application_authorized: boolean; service_details: unknown }, applications: DeliveryApplication[], now = Date.now()) {
  if (!hasVerifiedJobDeskPayment(order) || ["completed", "cancelled", "paused", "awaiting_payment"].includes(order.status) || applications.some(successfulDelivery)) return null;
  const ageHours = Math.max(0, Math.floor((now - Date.parse(order.created_at)) / 3600000));
  const stages = applications.map(deliveryStage);
  const nextAction = stages.includes("accepted") || stages.includes("processing")
    ? "Check delivery or portal evidence. Do not resend an accepted or uncertain application."
    : ["intake", "cv_processing", "cv_review", "awaiting_information", "failed"].includes(order.status)
      ? "Open the order, resolve missing information or processing issues, and approve the latest CV."
      : !order.application_authorized || !readApplicationScope(order.service_details)
        ? "Record the agreed application scope before starting submissions."
        : stages.includes("blocked")
          ? "Review blockers and prepared packets; continue searching for ready applications."
          : "Refresh official vacancies and review agreed broader-job choices. Keep the search active.";
  return { ageHours, overdue: ageHours >= 24, nextAction };
}

export function underTargetDeliveryReview(order: Parameters<typeof zeroDeliveryReview>[0], applications: DeliveryApplication[], now = Date.now()) {
  const delivered = distinctSuccessfulDeliveries(applications);
  if (delivered >= 10 || !hasVerifiedJobDeskPayment(order) || ["completed", "cancelled", "paused", "awaiting_payment"].includes(order.status)) return null;
  const review = zeroDeliveryReview(order, applications, now);
  return { delivered, remaining: 10 - delivered, ageHours: review?.ageHours ?? Math.max(0, Math.floor((now - Date.parse(order.created_at)) / 3600000)), overdue: review?.overdue ?? now - Date.parse(order.created_at) >= 24 * 3600000, nextAction: review?.nextAction ?? "Continue discovery for replacement openings until ten distinct applications have verified delivery evidence." };
}
