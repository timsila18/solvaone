import { normalizeSafaricomPhone } from "./payments";
import { pricingProducts } from "./pricing";

export function runPricingConfigChecks() {
  const expected = {
    cv_builder: 299,
    cv_revamp: 499,
    cover_letter: 199,
    cv_cover_bundle: 699,
    company_profile: 999,
    business_plan: 1499
  };

  return Object.entries(expected).map(([productId, price]) => ({
    productId,
    pass: pricingProducts[productId as keyof typeof pricingProducts]?.price === price
  }));
}

export function runPhoneNormalizationChecks() {
  const cases = [
    ["0712345678", "254712345678"],
    ["712345678", "254712345678"],
    ["+254712345678", "254712345678"],
    ["0112345678", "254112345678"]
  ] as const;

  return cases.map(([input, expected]) => ({
    input,
    expected,
    actual: normalizeSafaricomPhone(input),
    pass: normalizeSafaricomPhone(input) === expected
  }));
}

export function callbackResultExpectation(resultCode: number) {
  if (resultCode === 0) return "successful";
  if (resultCode === 1032) return "cancelled";
  if (resultCode === 1037) return "timed_out";
  return "failed";
}

export function receiptNumberPattern() {
  return /^SOLVAONE-\d{8}-\d{4}$/;
}
