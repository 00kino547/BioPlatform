// PocketBase integration — everything the backend needs to talk to an optional
// PocketBase instance. PocketBase exists for exactly one purpose here: the
// optional sign-in provider. Nothing runs unless the operator sets POCKETBASE_URL
// plus POCKETBASE_OAUTH_ENABLED, so the feature is invisible on a stock deploy and
// BioPlatform is fully functional with PocketBase absent or unreachable.
//
// The former analytics module was removed: pageviews/link clicks were already
// stored, aggregated and pruned in PostgreSQL, so the module was a second,
// write-only, never-pruned copy of data the core already owned. Storage/content
// module flags were removed too — they were declared and advertised through
// /api/features but never implemented.
export { buildPocketbaseConfig, getPocketbaseConfig } from "./config.js";
export type { PocketbaseConfig } from "./config.js";
export {
  PocketBaseError,
  authAsSuperuser,
  authAsLegacyAdmin,
  confirmCollectionAuth,
  createCollection,
  createRecord,
  createPocketBaseClient,
  defaultPocketBaseClient,
  getCollection,
  listCollections,
  pbFetchJson,
  resetPocketbaseTokenCache,
} from "./client.js";
export type {
  PbAuthPayload,
  PbAuthRecordIdentity,
  PbCollectionItem,
  PbListResult,
  PbRecord,
  PocketBaseClient,
  SuperuserKind,
} from "./client.js";