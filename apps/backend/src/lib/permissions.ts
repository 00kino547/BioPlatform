export const PERMISSIONS = {
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  PROFILES_MANAGE: "profiles.manage",
  INVITES_MANAGE: "invites.manage",
  INVITES_GENERATE: "invites.generate",
  BANS_MANAGE: "bans.manage",
  ROLES_MANAGE: "roles.manage",
  BADGES_MANAGE: "badges.manage",
  LOGS_VIEW: "logs.view",
  API_BASIC: "api.basic",
  API_ADVANCED: "api.advanced",
  API_ENTERPRISE: "api.enterprise",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const ADMIN_GATE_PERMISSIONS: ReadonlySet<Permission> = new Set([
  PERMISSIONS.USERS_VIEW,
  PERMISSIONS.USERS_MANAGE,
  PERMISSIONS.PROFILES_MANAGE,
  PERMISSIONS.INVITES_MANAGE,
  PERMISSIONS.BANS_MANAGE,
  PERMISSIONS.ROLES_MANAGE,
  PERMISSIONS.BADGES_MANAGE,
  PERMISSIONS.LOGS_VIEW,
]);

export const SYSTEM_ROLE_SLUGS = {
  ADMIN: "admin",
  USER: "user",
} as const;

export interface RoleInfo {
  slug: string;
  permissions: string[];
}

export function permissionsFor(role: RoleInfo | null | undefined): string[] {
  if (!role) return [];
  if (role.slug === SYSTEM_ROLE_SLUGS.ADMIN) return [...ALL_PERMISSIONS];
  return role.permissions;
}

export function hasPermission(role: RoleInfo | null | undefined, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export type ApiLevel = "basic" | "advanced" | "enterprise";

export const API_LEVEL_INDEX: Record<ApiLevel, number> = { basic: 0, advanced: 1, enterprise: 2 };

const TIER_TO_API_LEVEL: Record<string, ApiLevel> = {
  FREE: "basic",
  PRO: "advanced",
  ENTERPRISE: "enterprise",
};

export function effectiveApiLevel(role: RoleInfo | null | undefined, tier: string): ApiLevel {
  const perms = permissionsFor(role);
  let level = API_LEVEL_INDEX[TIER_TO_API_LEVEL[tier] ?? "basic"];
  if (perms.includes(PERMISSIONS.API_ENTERPRISE)) level = API_LEVEL_INDEX.enterprise;
  else if (perms.includes(PERMISSIONS.API_ADVANCED)) level = Math.max(level, API_LEVEL_INDEX.advanced);
  return level >= API_LEVEL_INDEX.enterprise ? "enterprise" : level === API_LEVEL_INDEX.advanced ? "advanced" : "basic";
}

export function hasApiLevel(role: RoleInfo | null | undefined, tier: string, required: ApiLevel): boolean {
  return API_LEVEL_INDEX[effectiveApiLevel(role, tier)] >= API_LEVEL_INDEX[required];
}
