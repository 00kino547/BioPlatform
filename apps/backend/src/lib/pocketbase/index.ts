// PocketBase integration — everything the backend needs to talk to an optional
// PocketBase instance. Modules opt in individually (analytics / oauth / storage /
// content); nothing runs unless the operator sets POCKETBASE_URL plus a module
// flag, so the feature is invisible on a stock deploy.
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
export {
  POCKETBASE_COLLECTIONS,
  bootstrapPocketbaseCollections,
} from "./bootstrap.js";
export type { BootstrapResult } from "./bootstrap.js";