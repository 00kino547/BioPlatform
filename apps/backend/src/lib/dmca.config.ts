// Length caps for DMCA free-text fields. Kept here (not inline in lib/dmca.ts)
// so the route schemas and the admin UI copy agree on the same limits.

/** Report description / allegations length cap. */
export const DMCA_REPORT_MAX = 4000;
/** Account-appeal text length cap. */
export const DMCA_APPEAL_MAX = 2000;
/** Operator note attached to a report decision. */
export const DMCA_NOTE_MAX = 1000;