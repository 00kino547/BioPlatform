// Email-sending tests are OPT-IN (manual), never opt-out (automatic). A plain
// `pnpm test` run forces SMTP off (see tests/setup-env.ts), so no real mail is
// ever sent as a side effect of running the suite. To exercise the actual
// delivery paths, an operator opts in with two env vars:
//
//   RUN_LIVE_EMAIL_TESTS=1     opts the suite into exercising real sends
//   TEST_EMAIL_TO=<address>    a REAL destination the operator controls
//
// When opted in, every email a test causes to be sent must land on that real
// destination (or a unique local-part on the same real domain) — never on
// fabricated .test/.local/everywhere.test addresses. These helpers centralize
// that rule so every test file uses the same opt-in gate and destination
// derivation.

export const liveEmailTests = process.env.RUN_LIVE_EMAIL_TESTS === "1";
export const testEmailTo = process.env.TEST_EMAIL_TO ?? "";

/**
 * Truthy when fully opted in for LIVE sends: the operator set
 * RUN_LIVE_EMAIL_TESTS=1, supplied a real TEST_EMAIL_TO destination, and SMTP
 * is actually enabled (setup-env.ts leaves `.env`'s SMTP_ENABLED untouched when
 * opted in; it only forces it off on a default run). If the operator opts in
 * but SMTP is misconfigured, live assertions stay off rather than fail.
 */
export const liveSendDest =
  liveEmailTests && testEmailTo && process.env.SMTP_ENABLED !== "false" ? testEmailTo : null;

/**
 * Real, operator-controlled destination for a given test user. When live email
 * is opted in we derive unique local-parts on the same real domain so actual
 * sends never target addresses nobody reads; when it is not, SMTP is off and
 * the fabricated `@ev.test`-style identifiers are never delivered anywhere.
 */
export function destEmail(username: string): string {
  if (liveSendDest) {
    const at = testEmailTo.indexOf("@");
    if (at !== -1) {
      const domain = testEmailTo.slice(at + 1);
      if (domain) return `${username}@${domain}`;
    }
    return testEmailTo;
  }
  return `${username}@ev.test`;
}