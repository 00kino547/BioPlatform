/**
 * Returns the value when it can stand in as a delivery address, otherwise undefined.
 *
 * The register and login forms both accept an identifier that is not necessarily
 * an email, and the guest checkout identifies a buyer only by the address its
 * codes are sent to. Prefilling that field with a username would produce an
 * unpayable, undeliverable order, so anything that is not a single address-like
 * token is ignored and the field is left empty.
 */
export function asEmailHint(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.includes("@") && !/\s/.test(trimmed) ? trimmed : undefined;
}