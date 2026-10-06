export const RESERVED_SLUGS = [
  "admin",
  "api",
  "api-docs",
  "dashboard",
  "health",
  "invite",
  "login",
  "oauth",
  "privacy",
  "register",
  "terms",
  "unlock",
];

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.toLowerCase());
}