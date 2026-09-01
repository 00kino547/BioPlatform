-- Grant the profiles.customDomain permission to the default "user" role
-- so PRO/ENTERPRISE users can request custom domains without requiring
-- an admin to manually edit the role permissions.
UPDATE roles
SET permissions = array_append(permissions, 'profiles.customDomain')
WHERE slug = 'user'
  AND NOT ('profiles.customDomain' = ANY(permissions));
