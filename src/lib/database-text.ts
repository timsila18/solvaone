/** Remove code points PostgreSQL text and JSONB cannot represent. */
export function databaseText(value: string): string {
  return Array.from(value, character => {
    const point = character.codePointAt(0)!;
    if (point === 0) return "";
    return point >= 0xd800 && point <= 0xdfff ? "\ufffd" : character;
  }).join("");
}
