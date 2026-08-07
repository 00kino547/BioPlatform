export const PERMISSIONS = {
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  PROFILES_MANAGE: "profiles.manage",
  INVITES_MANAGE: "invites.manage",
  BANS_MANAGE: "bans.manage",
  ROLES_MANAGE: "roles.manage",
  BADGES_MANAGE: "badges.manage",
  LOGS_VIEW: "logs.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

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
