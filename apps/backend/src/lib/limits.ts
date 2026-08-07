import type { User } from "@prisma/client";

const DEFAULT_PROFILE_LIMITS = {
  FREE: 1,
  PRO: 3,
  ENTERPRISE: 10,
} as const;

const DEFAULT_ALIAS_LIMITS = {
  FREE: 0,
  PRO: 5,
  ENTERPRISE: 25,
} as const;

export function getProfileLimit(user: Pick<User, "tier" | "profileLimit">): number {
  if (user.profileLimit !== null && user.profileLimit !== undefined && user.profileLimit > 0) {
    return user.profileLimit;
  }
  return DEFAULT_PROFILE_LIMITS[user.tier] ?? 1;
}

export function getAliasLimit(user: Pick<User, "tier" | "aliasLimit">): number {
  if (user.aliasLimit !== null && user.aliasLimit !== undefined && user.aliasLimit > 0) {
    return user.aliasLimit;
  }
  return DEFAULT_ALIAS_LIMITS[user.tier] ?? 0;
}
