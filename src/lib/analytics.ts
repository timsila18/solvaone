export type AnalyticsEvent =
  | "page_view"
  | "product_page_view"
  | "signup"
  | "start_document"
  | "start_checkout"
  | "payment_initiated"
  | "payment_successful"
  | "payment_failed"
  | "document_generated"
  | "pdf_downloaded"
  | "docx_downloaded"
  | "receipt_downloaded";

export function trackEvent(event: AnalyticsEvent, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const win = window as typeof window & {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: { track?: (event: string, payload?: Record<string, unknown>) => void };
    clarity?: (...args: unknown[]) => void;
  };

  win.gtag?.("event", event, properties);
  win.fbq?.("trackCustom", event, properties);
  win.ttq?.track?.(event, properties);
  win.clarity?.("event", event);
}
