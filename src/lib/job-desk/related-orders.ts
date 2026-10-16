export type OrderIdentity = { full_name?: string | null; email?: string | null; whatsapp_phone?: string | null };

const normalized = (value?: string | null) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const phone = (value?: string | null) => (value ?? "").replace(/\D/g, "");

// Never connect histories on a name alone or on a shared household contact.
export function sameOrderIdentity(left: OrderIdentity, right: OrderIdentity) {
  const name = normalized(left.full_name);
  const email = normalized(left.email);
  const number = phone(left.whatsapp_phone);
  return Boolean(name && email && number.length >= 9 && name === normalized(right.full_name)
    && email === normalized(right.email) && number === phone(right.whatsapp_phone));
}
