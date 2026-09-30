import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { getEnv } from "@/config/env";

const API_URL = getEnv("VITE_API_URL") ?? "/api";

interface ApiResponse<T = unknown, M = unknown> {
  success: boolean;
  data?: T;
  meta?: M;
  error?: string;
  fieldErrors?: Record<string, string>;
  unlockRequired?: boolean;
  updateRequired?: boolean;
  verifyEmailRequired?: boolean;
}

let _token: string | null = localStorage.getItem("token");

export function getToken() {
  return _token;
}

export function setToken(token: string | null) {
  _token = token;
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
}

async function request<T, M = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T, M>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (_token) {
    headers["Authorization"] = `Bearer ${_token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  return res.json();
}

export interface Role {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  inviteBatchLimit: number;
  inviteOutstandingLimit: number;
  inviteCooldownMinutes: number;
  inviteDefaultExpiryDays: number;
  inviteMinExpiryDays: number;
  inviteMaxExpiryDays: number;
  _count?: { users: number };
}

export interface InviteMeta {
  banned: boolean;
  generationEnabled: boolean;
  canGenerate: boolean;
  allowance: number;
  allowanceExpiresAt: string | null;
  allowanceActive: boolean;
  outstanding: number;
  cooldownRemainingSeconds: number;
  seat: {
    limited: boolean;
    limit: number;
    used: number;
    remaining: number;
  } | null;
  role: {
    slug: string;
    canGenerate: boolean;
    batchLimit: number;
    outstandingLimit: number;
    cooldownMinutes: number;
    defaultExpiryDays: number;
    minExpiryDays: number;
    maxExpiryDays: number;
  };
}

export interface AffiliateRewardInfo {
  kind: "discount" | "allowance" | "badge";
  value: string;
  level: number;
  createdAt: string;
}

export interface AffiliateLevelInfo {
  level: number;
  value: string;
}

export interface AffiliateStatus {
  referralCount: number;
  discountPercent: number;
  discountExpiresAt: string | null;
  referredBy: { id: string; username: string } | null;
  nextMilestone: AffiliateLevelInfo | null;
  rewards: AffiliateRewardInfo[];
  config: {
    inviteeDiscountPercent: number;
    discountDurationDays: number;
    discountLevels: AffiliateLevelInfo[];
    allowanceLevels: AffiliateLevelInfo[];
    badgeLevels: AffiliateLevelInfo[];
    abuseAction: "reject" | "skip" | "warn";
    abuseScope: "referrals" | "invites" | "both";
  };
}

export interface AffiliateOverview {
  leaderboard: {
    id: string;
    username: string;
    tier: string;
    discountPercent: number;
    discountExpiresAt: string | null;
    referralCount: number;
  }[];
  totalReferrals: number;
  distinctReferrers: number;
  configSource: "env" | "db";
  config: {
    inviteeDiscountPercent: number;
    discountDurationDays: number;
    discountLevels: AffiliateLevelInfo[];
    allowanceLevels: AffiliateLevelInfo[];
    badgeLevels: AffiliateLevelInfo[];
    abuseAction: "reject" | "skip" | "warn";
    abuseScope: "referrals" | "invites" | "both";
  };
}

export interface AffiliateMilestoneConfig {
  discountLevels: AffiliateLevelInfo[];
  allowanceLevels: AffiliateLevelInfo[];
  badgeLevels: AffiliateLevelInfo[];
  inviteeDiscountPercent?: number | null;
  discountDurationDays?: number | null;
}

export interface OrderInfo {
  id: string;
  plan: string;
  planLabel: string;
  method: string;
  status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED";
  currency: string;
  basePriceCents: number;
  discountPercent: number;
  finalPriceCents: number;
  adminNote: string | null;
  gatewayTransactionId: string | null;
  gatewayStatus: string | null;
  gatewayCheckoutUrl: string | null;
  cryptoCoin: string | null;
  cryptoAmount: string | null;
  cryptoRateUsd: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutInfo {
  url: string;
  provider: string;
  coin?: string;
  coinAmount?: string;
  rateUsd?: string;
}

export interface CreateOrderResponse extends ApiResponse<OrderInfo> {
  checkout?: CheckoutInfo;
}

export interface OrderPlanPrice {
  plan: "PRO" | "ENTERPRISE";
  label: string;
  priceCents: number;
}

export interface OrderGateways {
  stripe: boolean;
  paypal: boolean;
  crypto: { enabled: boolean; providers: string[]; coins: string[] };
}

export interface OrderConfig {
  billingMode: "one-time" | "subscription" | "fixed-term";
  currency: string;
  plans: OrderPlanPrice[];
  gateways: OrderGateways;
  contact: { method: string; value: string };
}

export interface MyOrders {
  currentTier: string;
  discountPercent: number;
  billing: Omit<OrderConfig, "contact">;
  orders: OrderInfo[];
}

export interface AdminOrderListItem extends OrderInfo {
  user: { id: string; username: string; email: string; tier: string };
}

export interface InviteGrantEvent {
  id: string;
  count: number;
  expiryDays: number;
  createdById: string | null;
  createdBy: { id: string; username: string } | null;
  createdAt: string;
}

export interface Badge {
  id: string;
  slug: string;
  label: string;
  color: string;
  icon: string;
  isSystem: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: Role | null;
  permissions: string[];
  isAdmin: boolean;
  tier: "FREE" | "PRO" | "ENTERPRISE";
  apiLevel: "basic" | "advanced" | "enterprise";
  trackLimit: number | null;
  profileLimit: number | null;
  aliasLimit: number | null;
  badges: string[];
  totpEnabled: boolean;
  newsletterSenderWhitelisted?: boolean;
  newsletterOptIn?: boolean;
}

export interface LoginMethods {
  password: boolean;
  passkey: boolean;
  totp: boolean;
}

export interface TwoFactorRequired {
  requiresTwoFactor: true;
  methods: { totp: boolean; passkey: boolean };
  twoFactorToken: string;
}

// A3b — a successful registration whose email could not be provider-verified.
// The account exists but is dead until a signed link proves mailbox control;
// no session is issued. `warning` is present when invite/referral abuse
// detection skipped the referral edge.
export interface EmailVerificationRequired {
  status: "verification_required";
  emailSent: boolean;
  warning?: string;
}

export type RegistrationResult = AuthResponse | EmailVerificationRequired;

export type OAuthProvider = "google" | "github" | "discord" | "pocketbase";

// Public config for the operator-controlled PocketBase OAuth bridge. The SPA
// never talks to PocketBase directly — it posts credentials through the
// same-origin proxy (clientUrl) and hands the resulting token to our backend.
export interface PocketBaseAuthConfig {
  enabled: boolean;
  clientUrl?: string;
  authCollection?: string;
  signupRequiresInvite?: boolean;
  twoFactorBypassAllowed?: boolean;
}

export interface OAuthConfig {
  providers: OAuthProvider[];
  signupRequiresInvite: boolean;
  twoFactorBypassAllowed: boolean;
}

export interface OAuthSetupInfo {
  status: "needs_setup";
  signupToken: string;
  provider: OAuthProvider;
  name: string | null;
  avatar: string | null;
  email: string | null;
  requiresEmail: boolean;
  requiresInvite: boolean;
  suggestedUsername: string;
}

export type OAuthExchangeResult =
  | { status: "logged_in"; token: string; user: AuthUser }
  | {
      status: "needs_two_factor";
      methods: { totp: boolean; passkey: boolean };
      twoFactorToken: string;
    }
  | OAuthSetupInfo;

export interface OAuthAccountInfo {
  id: string;
  provider: OAuthProvider;
  providerAccountId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface OAuthAccountsData {
  accounts: OAuthAccountInfo[];
  oauthBypass2fa: boolean;
  twoFactorBypassAllowed: boolean;
  authMethods: {
    password: boolean;
    oauth: number;
    passkeys: number;
  };
}

export interface EnterpriseSsoPublicConfig {
  id: string;
  displayName: string;
  logoUrl: string | null;
  issuerHost: string | null;
}

export interface EnterpriseSsoConfig {
  id: string;
  issuerUrl: string;
  clientId: string;
  clientSecretMasked: string;
  scopes: string;
  displayName: string;
  logoUrl: string | null;
  allowedDomains: string;
  enforced: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  identityCount: number;
}

export interface EnterpriseSsoIdentity {
  id: string;
  email: string;
  createdAt: string;
  sso: { id: string; displayName: string; logoUrl: string | null; enforced: boolean };
}

export type EnterpriseSsoExchangeResult =
  | { status: "logged_in"; token: string; user: AuthUser }
  | {
      status: "needs_two_factor";
      methods: { totp: boolean; passkey: boolean };
      twoFactorToken: string;
    };

export interface Passkey {
  id: string;
  name: string;
  credentialId: string;
  residentKey: boolean;
  authenticatorAttachment: string | null;
  credentialDeviceType: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface TotpSetupData {
  secret: string;
  otpauthUrl: string;
}

export type MusicProvider = "local" | "spotify" | "youtube";

export interface MusicTrack {
  id: string;
  profileId: string;
  provider: MusicProvider;
  title: string | null;
  artist: string | null;
  url: string | null;
  filePath: string | null;
  fullUrl: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface MusicSettings {
  tracks: MusicTrack[];
  limit: number;
  tier: "FREE" | "PRO" | "ENTERPRISE";
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ProfileAlias {
  id: string;
  profileId: string;
  slug: string;
  createdAt: string;
}

export interface SocialLink {
  platform: string;
  url: string;
  label?: string;
  heading?: string;
  icon?: string;
  image?: string;
  showQr?: boolean;
}

export interface TerminalCommand {
  command: string;
  output: string;
  description?: string;
  url?: string;
}

export interface ProfileTheme {
  bg?: string;
  cardBg?: string;
  text?: string;
  accent?: string;
  fontFamily?: string;
  seasonalDecorations?: boolean;
  alwaysAllowChristmas?: boolean;
  animatedFx?: boolean;
  effect?: string;
  backgroundImage?: string | null;
  layout?: string | null;
}

export const FX_EFFECTS = ["none", "snow", "pumpkins", "hearts", "leaves", "stars", "confetti", "sparkle"] as const;
export type FxEffectName = (typeof FX_EFFECTS)[number];

export const LAYOUTS = ["default", "grid", "compact", "wide", "glassmorphism", "minimal", "sidebar", "editorial", "hero", "bento", "terminal", "polaroid", "topbar"] as const;
export type LayoutName = (typeof LAYOUTS)[number];

export const BACKGROUND_PRESETS = [
  { id: "none", label: "None", value: "" },
  { id: "midnight", label: "Midnight", value: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #27272a 100%)" },
  { id: "ocean", label: "Ocean", value: "linear-gradient(135deg, #0c1222 0%, #164e63 50%, #0ea5e9 100%)" },
  { id: "sunset", label: "Sunset", value: "linear-gradient(135deg, #1a0a0a 0%, #7c2d12 45%, #f97316 100%)" },
  { id: "forest", label: "Forest", value: "linear-gradient(135deg, #0a1a0f 0%, #14532d 50%, #22c55e 100%)" },
  { id: "aurora", label: "Aurora", value: "linear-gradient(135deg, #071426 0%, #155e75 45%, #a5f3fc 100%)" },
  { id: "royal", label: "Royal", value: "linear-gradient(135deg, #0b0712 0%, #5b21b6 50%, #a78bfa 100%)" },
  { id: "mint", label: "Mint", value: "linear-gradient(135deg, #022c22 0%, #065f46 50%, #6ee7b7 100%)" },
  { id: "candy", label: "Candy", value: "linear-gradient(135deg, #2e1065 0%, #9d174d 45%, #f9a8d4 100%)" },
  { id: "ember", label: "Ember", value: "linear-gradient(135deg, #1c1917 0%, #7c2d12 50%, #fb923c 100%)" },
  { id: "ice", label: "Ice", value: "linear-gradient(135deg, #0f172a 0%, #334155 50%, #e0f2fe 100%)" },
] as const;

export type BackgroundPresetId = (typeof BACKGROUND_PRESETS)[number]["id"];

export interface SeasonalThemeResolved {
  slug: string;
  label: string;
  emoji: string | null;
  kind: string;
  config: {
    bg?: string | null;
    cardBg?: string | null;
    text?: string | null;
    accent?: string | null;
    fontFamily?: string | null;
    layout?: string | null;
    backgroundImage?: string | null;
    effect?: string | null;
  };
}

export interface SeasonalResolvedResult {
  theme: SeasonalThemeResolved | null;
  source: "override" | "schedule" | "christmas-always" | "none";
}

export interface Profile {
  id: string;
  slug: string;
  requestedSlug: string;
  isPrimary: boolean;
  badges: string[];
  aliases?: ProfileAlias[];
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  location: string | null;
  website: string | null;
  socialLinks: SocialLink[] | null;
  presenceStatus?: "online" | "idle" | "offline" | null;
  countdown?: { label?: string; targetDate: string } | null;
  newsletterEnabled?: boolean;
  newsletterVisible?: boolean;
  newsletterHeading?: string | null;
  tipsEnabled?: boolean;
  tipsHeading?: string | null;
  tipsBtcAddress?: string | null;
  tipsLtcAddress?: string | null;
  shopDiscountPercent?: number | null;
  theme: ProfileTheme | null;
  terminalCommands?: TerminalCommand[] | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  musicTracks?: MusicTrack[];
  _count?: { musicTracks: number };
}

export interface MyProfiles {
  profiles: Profile[];
  limits: { profiles: number; aliases: number };
  primaryId: string | null;
  aliasCount: number;
  ownedBadges: string[];
}

export interface InviteReferrer {
  username: string;
  slug: string;
  avatar: string | null;
  displayName: string | null;
}

export interface InviteInfo {
  code: string;
  status: "valid";
  inviteeDiscountPercent: number;
  discountDurationDays: number;
  referrer: InviteReferrer | null;
}

export interface PublicProfile {
  username: string;
  slug: string;
  requestedSlug: string;
  isPrimary: boolean;
  badges: string[];
  createdAt: string;
  id: string;
  userId: string;
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  location: string | null;
  website: string | null;
  socialLinks: SocialLink[] | null;
  presenceStatus?: "online" | "idle" | "offline" | null;
  countdown?: { label?: string; targetDate: string } | null;
  newsletterVisible?: boolean;
  newsletterHeading?: string | null;
  tipsEnabled?: boolean;
  tipsHeading?: string | null;
  tipsBtcAddress?: string | null;
  tipsLtcAddress?: string | null;
  shopDiscountPercent?: number | null;
  products?: ShopProductPublic[];
  theme: ProfileTheme | null;
  terminalCommands?: TerminalCommand[] | null;
  seasonal?: SeasonalResolvedResult | null;
  isPublic: boolean;
  musicTracks?: MusicTrack[];
  discord?: {
    username: string;
    globalName: string | null;
    avatar: string | null;
    presence: DiscordPresence | null;
  } | null;
}

export type DiscordPresenceStatus = "online" | "idle" | "dnd" | "offline";

export interface DiscordActivity {
  type: number;
  name: string;
  details: string | null;
  state: string | null;
  applicationId: string | null;
  largeImage: string | null;
  smallImage: string | null;
  largeUrl: string | null;
  smallUrl: string | null;
  largeText: string | null;
  smallText: string | null;
  buttons: string[] | null;
  platform: string | null;
  syncId: string | null;
  detailsUrl: string | null;
  stateUrl: string | null;
  timestamps: { start: number | null; end: number | null } | null;
}

export interface DiscordPresence {
  status: DiscordPresenceStatus;
  statusLabel: string;
  activities: DiscordActivity[];
  line: string | null;
  customStatus: string | null;
  updatedAt: number | null;
}

export interface DiscordAccount {
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export interface DiscordStatus {
  configured: boolean;
  connected: boolean;
  botConfigured: boolean;
  botInviteUrl: string | null;
  presenceHubInvite: string | null;
  sessionActive: boolean;
  discord: DiscordAccount | null;
  settings: {
    showDiscordPresence: boolean;
    showDiscordActivity: boolean;
  };
  webhookConfigured: boolean;
  presence: DiscordPresence | null;
}

export type CustomDomainStatus = "PENDING_VERIFICATION" | "VERIFIED" | "ACTIVE" | "REJECTED";
export type TlsStatus = "NONE" | "PENDING" | "ISSUED" | "FAILED";

export interface ProfileDomain {
  id: string;
  profileId: string;
  domain: string;
  status: CustomDomainStatus;
  verificationToken: string;
  verifiedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rootTarget: string | null;
  tlsStatus: TlsStatus;
  tlsIssuedAt: string | null;
  tlsExpiresAt: string | null;
  tlsError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsData {
  total: { views: number; uniqueViews: number; clicks: number; uniqueClicks: number };
  last30d: { views: number; uniqueViews: number; clicks: number; uniqueClicks: number };
  last7d: { views: number; uniqueViews: number; clicks: number; uniqueClicks: number };
  last24h: { views: number; uniqueViews: number; clicks: number; uniqueClicks: number };
  viewsByDay: { date: string; count: number }[];
  uniqueViewsByDay: { date: string; count: number }[];
  clicksByDay: { date: string; count: number }[];
  uniqueClicksByDay: { date: string; count: number }[];
  viewsByHour: { hour: string; count: number }[];
  uniqueViewsByHour: { hour: string; count: number }[];
  clicksByHour: { hour: string; count: number }[];
  uniqueClicksByHour: { hour: string; count: number }[];
  clicksByPlatform: { platform: string; count: number }[];
  uniqueClicksByPlatform: { platform: string; count: number }[];
  clicksByLink: { platform: string; slug: string; count: number; lastClickedAt: string | null }[];
  uniqueClicksByLink: { platform: string; slug: string; uniqueCount: number }[];
  topReferrers: { referer: string; count: number }[];
}

export interface EmailSettings {
  enabled: boolean;
  provider: "gmail" | "custom";
  gmailUser?: string;
  gmailAppPassword?: string;
  customHost?: string;
  customPort?: number;
  customUser?: string;
  customPassword?: string;
  customSecure?: boolean;
}

export interface EmailNotificationSettings {
  smtpConfigured: boolean;
  fromEmail: string | null;
  notifyOnView: boolean;
  notifyOnClick: boolean;
}

export const WEBHOOK_EVENTS = [
  "profile.viewed",
  "link.clicked",
  "profile.updated",
  "profile.created",
  "profile.deleted",
  "user.registered",
  "user.updated",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: unknown;
  status: "pending" | "success" | "failed";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secretPrefix: string;
  active: boolean;
  events: string[];
  template?: string | null;
  createdAt: string;
  updatedAt: string;
  lastDelivery?: {
    status: string;
    lastStatusCode: number | null;
    lastError: string | null;
    updatedAt: string;
  } | null;
}

export interface WebhookWithSecret {
  id: string;
  name: string;
  url: string;
  secret: string;
  active: boolean;
  events: string[];
  template?: string | null;
  createdAt: string;
}

export interface ProfileUpdate {
  slug?: string;
  displayName?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  socialLinks?: SocialLink[] | null;
  presenceStatus?: "online" | "idle" | "offline" | null;
  countdown?: { label?: string; targetDate: string } | null;
  newsletterEnabled?: boolean;
  newsletterVisible?: boolean;
  newsletterHeading?: string | null;
  tipsEnabled?: boolean;
  tipsHeading?: string | null;
  tipsBtcAddress?: string | null;
  tipsLtcAddress?: string | null;
  shopDiscountPercent?: number | null;
  theme?: Profile["theme"];
  terminalCommands?: TerminalCommand[] | null;
  isPublic?: boolean;
}

export interface ChangelogSection {
  heading: string;
  items: string[];
}

export interface ChangelogVersion {
  version: string;
  date?: string;
  sections: ChangelogSection[];
}

export type UpdateSeverity = "none" | "update" | "security" | "critical";

export interface VersionCheckData {
  enabled: boolean;
  installed: string;
  latest: string | null;
  outdated: boolean;
  severity: UpdateSeverity;
  skippedVersions: ChangelogVersion[];
  skippedCount: number;
  prereleaseAvailable: boolean;
  prereleaseCount: number;
  prereleaseLatest: string | null;
  releaseUrl: string;
  releasesUrl: string;
  changelogUrl: string;
  checkedAt: string;
  source: string;
  error?: string;
}

export type CaptchaProvider = "none" | "turnstile" | "recaptcha" | "hcaptcha";

export interface CaptchaConfig {
  provider: CaptchaProvider;
  siteKey: string;
  enabled: boolean;
}

export interface ExternalAnalyticsConfig {
  provider: "none" | "matomo";
  enabled: boolean;
  matomoUrl: string;
  matomoSiteId: number;
  /** PocketBase-backed analytics (loader pushes events into PB collections). */
  pocketbase: {
    enabled: boolean;
    clientUrl: string;
    pageviewsCollection: string;
    clicksCollection: string;
  };
}

export interface FeatureFlags {
  linksSections: boolean;
  linksCustomIcons: boolean;
  linksQr: boolean;
  pocketbaseAnalytics: boolean;
  pocketbaseOauth: boolean;
  pocketbaseStorage: boolean;
  pocketbaseContent: boolean;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  subscribedAt: string;
  agreedAt: string;
  tosVersion: string;
  privacyVersion: string;
  unsubscribedAt: string | null;
}

export interface NewsletterSendRecord {
  id: string;
  profileId: string;
  subject: string;
  recipientCount: number;
  successCount: number;
  sentAt: string;
}

export interface NewsletterTierConfig {
  FREE: { sendLimit: number; windowHours: number };
  PRO: { sendLimit: number; windowHours: number };
  ENTERPRISE: { sendLimit: number; windowHours: number };
}

export interface NewsletterConfig {
  configSource: "env" | "db";
  config: NewsletterTierConfig;
}

export interface NewsletterSendResult {
  recipientCount: number;
  successCount: number;
  failedCount: number;
  sendId: string | null;
}

export interface NewsletterSenderSettings {
  id: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasPassword: boolean;
  verificationRecord: string | null;
  verificationToken: string | null;
  verifiedAt: string | null;
  testedAt: string | null;
}

export interface NewsletterSenderPayload {
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPassword?: string;
}

export interface NewsletterWhitelistUser {
  id: string;
  username: string;
  email: string;
  tier: "FREE" | "PRO" | "ENTERPRISE";
  whitelisted: boolean;
  createdAt: string;
  profiles: { id: string; displayName: string | null; slug: string | null }[];
}

export type TipCoin = "BTC" | "LTC";

export interface TipRecord {
  id: string;
  coin: TipCoin;
  amount: string;
  name?: string | null;
  message?: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  paidAt?: string | null;
  createdAt: string;
}

export interface TipPaymentResult {
  mode: "address" | "btcpay";
  address?: string;
  uri?: string;
  invoiceId?: string;
  url?: string;
}

export interface TipCreateResult {
  tip: TipRecord;
  payment: TipPaymentResult;
}

export interface TipCoinTotals {
  confirmedAmount: string;
  recordedAmount: string;
  confirmedCount: number;
  recordedCount: number;
}

export interface TipsOverview {
  mode: "btcpay" | "address";
  totals: Record<TipCoin, TipCoinTotals>;
  recent: TipRecord[];
}

export interface ShopAvailability {
  stripe: boolean;
  paypal: boolean;
  crypto: boolean;
  cryptoProviders: string[];
  coins: string[];
  currency: string;
  fileMaxMb: number;
}

export interface ShopProductPublic {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  type: "DOWNLOAD" | "REQUEST";
  previewImage: string | null;
  createdAt: string;
}

export interface ShopProduct extends ShopProductPublic {
  enabled: boolean;
  fileName: string;
  fileSize: number;
  purchases?: number;
  updatedAt: string;
}

export interface ShopOverview {
  profileId: string;
  slug: string;
  tier: string;
  limit: number | null;
  discountPercent: number;
  totalSold: number;
  revenueCents: number;
  currency: string;
  products: ShopProduct[];
}

export type PurchaseStatus = "PENDING" | "PAID" | "REFUNDED" | "CANCELLED";
export type PurchaseMethod = "STRIPE" | "PAYPAL" | "CRYPTO" | "FREE";

export interface Purchase {
  id: string;
  productId: string;
  title: string;
  fileName: string;
  fileSize: number;
  method: PurchaseMethod;
  status: PurchaseStatus;
  currency: string;
  basePriceCents: number;
  discountPercent: number;
  finalPriceCents: number;
  cryptoCoin: string | null;
  cryptoAmount: string | null;
  cryptoRateUsd: string | null;
  gatewayCheckoutUrl: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  requestText: string | null;
  productType?: "DOWNLOAD" | "REQUEST";
  createdAt: string;
}

export interface Sale extends Purchase {
  product: { id: string; title: string; type: "DOWNLOAD" | "REQUEST" };
  buyerEmail: string | null;
  buyerUserId: string | null;
  isGuest: boolean;
}

export interface ShopBuyParams {
  productId: string;
  method?: "STRIPE" | "PAYPAL" | "CRYPTO";
  email?: string;
  provider?: string;
  coin?: string;
  requestText?: string;
}

export interface ShopBuyResult {
  success?: boolean;
  error?: string;
  data?: Purchase;
  checkout?: { url: string; provider: string; coin?: string; coinAmount?: string; rateUsd?: string };
  clientToken?: string;
  status: "PAID" | "PENDING";
  downloadUrl?: string | null;
}

export interface PurchaseStatusResult {
  success?: boolean;
  error?: string;
  data?: PurchaseStatusInfo;
  downloadUrl?: string | null;
}

export interface PurchaseStatusInfo {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  finalPriceCents: number;
  method: PurchaseMethod;
  status: PurchaseStatus;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string;
}

export const api = {
  getCaptchaConfig: () => request<CaptchaConfig>("/captcha/config"),
  getExternalAnalyticsConfig: () => request<ExternalAnalyticsConfig>("/analytics/config"),
  getFeatures: () => request<FeatureFlags>("/features"),

  register: (data: {
    username: string;
    email: string;
    password: string;
    inviteCode: string;
    captchaToken?: string;
    acceptedPolicies: boolean;
    newsletterOptIn?: boolean;
  }) => request<RegistrationResult>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  }),

  login: (data: { identifier: string; password: string; captchaToken?: string }) =>
    request<AuthResponse | TwoFactorRequired>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  loginStart: (identifier: string) =>
    request<{ found: boolean; methods?: LoginMethods }>("/auth/login/start", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  loginPasskeyOptions: (identifier: string) =>
    request<{ options: PublicKeyCredentialRequestOptionsJSON; identifier: string }>("/auth/login/passkey/options", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  loginPasskeyVerify: (identifier: string, response: unknown) =>
    request<AuthResponse | TwoFactorRequired>("/auth/login/passkey/verify", {
      method: "POST",
      body: JSON.stringify({ identifier, response }),
    }),

  loginPasskeyDiscoverableOptions: () =>
    request<{ options: PublicKeyCredentialRequestOptionsJSON }>("/auth/login/passkey/discoverable/options", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  loginPasskeyDiscoverableVerify: (response: unknown) =>
    request<AuthResponse | TwoFactorRequired>("/auth/login/passkey/discoverable/verify", {
      method: "POST",
      body: JSON.stringify({ response }),
    }),

  verifyTotp: (token: string, code: string) =>
    request<AuthResponse>("/auth/2fa/totp", {
      method: "POST",
      body: JSON.stringify({ token, code }),
    }),

  twoFactorPasskeyOptions: (token: string) =>
    request<{ options: PublicKeyCredentialRequestOptionsJSON }>("/auth/2fa/passkey/options", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  twoFactorPasskeyVerify: (token: string, response: unknown) =>
    request<AuthResponse>("/auth/2fa/passkey/verify", {
      method: "POST",
      body: JSON.stringify({ token, response }),
    }),

  registerPasskeyOptions: (residentKey: "resident" | "nonResident") =>
    request<PublicKeyCredentialCreationOptionsJSON>("/auth/passkeys/options", {
      method: "POST",
      body: JSON.stringify({ residentKey }),
    }),

  registerPasskey: (response: unknown, name: string, residentKey: "resident" | "nonResident") =>
    request<{ passkey: Passkey }>("/auth/passkeys/register", {
      method: "POST",
      body: JSON.stringify({ response, name, residentKey }),
    }),

  getPasskeys: () => request<Passkey[]>("/auth/passkeys"),

  deletePasskey: (id: string) =>
    request(`/auth/passkeys/${id}`, { method: "DELETE" }),

  setupTotp: () => request<TotpSetupData>("/auth/totp/setup", { method: "POST" }),

  enableTotp: (code: string) =>
    request<{ totpEnabled: boolean }>("/auth/totp/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  disableTotp: (code: string) =>
    request<{ totpEnabled: boolean }>("/auth/totp/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  me: () => request<AuthUser>("/auth/me"),

  getActiveSeasonalTheme: () => request<SeasonalResolvedResult>("/theming/active"),

  ssoConfig: () => request<OAuthConfig>("/auth/oauth/config"),

  ssoStart: (provider: OAuthProvider, mode: "login" | "signup" | "link", invite?: string) =>
    request<{ redirectUrl: string }>("/auth/oauth/start", {
      method: "POST",
      body: JSON.stringify(invite ? { provider, mode, invite } : { provider, mode }),
    }),

  oauthExchange: (code: string) =>
    request<OAuthExchangeResult>("/auth/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  oauthSignup: (data: {
    signupToken: string;
    username: string;
    email?: string;
    inviteCode?: string;
  }) =>
    request<RegistrationResult>("/auth/oauth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  oauthAccounts: () => request<OAuthAccountsData>("/auth/oauth/accounts"),

  oauthUnlink: (provider: OAuthProvider, providerAccountId: string) =>
    request<{ removed: true }>(`/auth/oauth/accounts/${provider}/${providerAccountId}`, {
      method: "DELETE",
    }),

  oauthSetSettings: (oauthBypass2fa: boolean) =>
    request<{ oauthBypass2fa: boolean }>("/auth/oauth/settings", {
      method: "PUT",
      body: JSON.stringify({ oauthBypass2fa }),
    }),

  pocketbaseConfig: () => request<PocketBaseAuthConfig>("/auth/oauth/pocketbase/config"),

  // Exchange a PocketBase auth token (produced by the SPA posting credentials
  // to the same-origin /api/pb-speed proxy) for a platform session.
  pocketbaseExchange: (data: { token: string; invite?: string }) =>
    request<OAuthExchangeResult>("/auth/oauth/pocketbase/exchange", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Attach a verified PocketBase identity to the currently signed-in account.
  pocketbaseLink: (data: { token: string }) =>
    request<{ linked: boolean; alreadyLinked: boolean }>("/auth/oauth/pocketbase/link", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  ssoEnterpriseConfig: () => request<EnterpriseSsoConfig | null>("/auth/sso/config"),

  ssoEnterpriseSave: (data: {
    issuerUrl: string;
    clientId: string;
    clientSecret?: string;
    scopes?: string;
    displayName: string;
    logoUrl?: string;
    allowedDomains?: string;
    enforced: boolean;
    enabled: boolean;
  }) =>
    request<{ id: string; saved: boolean }>("/auth/sso/config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  ssoEnterpriseDelete: () => request<{ removed: true }>("/auth/sso/config", { method: "DELETE" }),

  ssoEnterpriseConfigs: () => request<EnterpriseSsoPublicConfig[]>("/auth/sso/configs"),

  ssoEnterpriseStart: (configId: string, mode: "login" | "link") =>
    request<{ redirectUrl: string }>("/auth/sso/start", {
      method: "POST",
      body: JSON.stringify({ configId, mode }),
    }),

  ssoEnterpriseExchange: (code: string) =>
    request<EnterpriseSsoExchangeResult>("/auth/sso/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  ssoEnterpriseIdentities: () => request<EnterpriseSsoIdentity[]>("/auth/sso/identities"),

  ssoEnterpriseIdentityDelete: (id: string) =>
    request<{ removed: true }>(`/auth/sso/identities/${id}`, { method: "DELETE" }),

  requestUnlock: (identifier: string) =>
    request<{ sent: boolean }>("/auth/unlock", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  verifyUnlock: (token: string) =>
    request("/auth/unlock/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  verifyEmail: (token: string) =>
    request<{ status: "verified"; alreadyVerified?: boolean }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  resendVerificationEmail: (identifier: string) =>
    request<{ sent: boolean }>("/auth/verify-email/send", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  getMyProfiles: () => request<MyProfiles>("/profiles/me"),

  checkUsernameAvailability: (username: string) =>
    request<{ available: boolean; reason: "reserved" | "taken" | "current" | "available" }>(
      `/profiles/me/username/availability?username=${encodeURIComponent(username)}`
    ),

  changeUsername: (username: string) =>
    request<{ username: string; slug: string; lastUsernameChangeAt: string }>("/profiles/me/username", {
      method: "PATCH",
      body: JSON.stringify({ username }),
    }),

  createProfile: (data: { slug: string } & ProfileUpdate) =>
    request<Profile>("/profiles/me", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getProfile: (profileId: string) =>
    request<Profile>(`/profiles/me/${profileId}`),

  updateProfile: (data: ProfileUpdate, profileId?: string) =>
    profileId
      ? request<Profile>(`/profiles/me/${profileId}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        })
      : request<Profile>("/profiles/me", {
          method: "PUT",
          body: JSON.stringify(data),
        }),

  deleteProfile: (profileId: string) =>
    request(`/profiles/me/${profileId}`, { method: "DELETE" }),

  setPrimaryProfile: (profileId: string) =>
    request(`/profiles/me/${profileId}/primary`, { method: "POST" }),

  getAliases: (profileId: string) =>
    request<ProfileAlias[]>(`/profiles/me/${profileId}/aliases`),

  createAlias: (profileId: string, slug: string) =>
    request<ProfileAlias>(`/profiles/me/${profileId}/aliases`, {
      method: "POST",
      body: JSON.stringify({ slug }),
    }),

  deleteAlias: (profileId: string, aliasId: string) =>
    request(`/profiles/me/${profileId}/aliases/${aliasId}`, { method: "DELETE" }),

  toggleProfileBadge: (profileId: string, badgeId: string, enabled: boolean) =>
    request<{ badges: string[] }>(`/profiles/me/${profileId}/badges`, {
      method: "POST",
      body: JSON.stringify({ badge: badgeId, enabled }),
    }),

  reorderProfileBadges: (profileId: string, order: string[]) =>
    request<{ badges: string[] }>(`/profiles/me/${profileId}/badges/order`, {
      method: "PUT",
      body: JSON.stringify({ order }),
    }),

  getBadges: () => request<Badge[]>("/badges"),

  uploadAvatar: async (file: File, profileId?: string) => {
    const form = new FormData();
    form.append("avatar", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/profiles/me/avatar${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      }
    );
    return res.json() as Promise<{ success: boolean; data?: { avatar: string }; error?: string }>;
  },

  uploadLinkIcon: async (file: File) => {
    const form = new FormData();
    form.append("linkIcon", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/profiles/me/link-icon`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    return res.json() as Promise<{ success: boolean; data?: { image: string }; error?: string }>;
  },

  uploadBanner: async (file: File, profileId?: string) => {
    const form = new FormData();
    form.append("banner", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/profiles/me/banner${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      }
    );
    return res.json() as Promise<{ success: boolean; data?: { banner: string }; error?: string }>;
  },

  removeAvatar: (profileId?: string) =>
    request(`/profiles/me/avatar${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, { method: "DELETE" }),

  removeBanner: (profileId?: string) =>
    request(`/profiles/me/banner${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, { method: "DELETE" }),

  uploadThemeBackground: async (themeId: string, file: File) => {
    const form = new FormData();
    form.append("background", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/admin/themes/${themeId}/background`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    return res.json() as Promise<{ success: boolean; data?: { backgroundImage: string }; error?: string }>;
  },

  removeThemeBackground: (themeId: string) =>
    request(`/admin/themes/${themeId}/background`, { method: "DELETE" }),

  uploadProfileBackground: async (file: File, profileId?: string) => {
    const form = new FormData();
    form.append("background", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/profiles/me/background${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      }
    );
    return res.json() as Promise<{ success: boolean; data?: { backgroundImage: string }; error?: string }>;
  },

  removeProfileBackground: (profileId?: string) =>
    request(`/profiles/me/background${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
      method: "DELETE",
    }),

  getPublicProfile: async (username: string) => {
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/profiles/${username}`, { headers, credentials: "include" });
    return res.json() as Promise<{ success: boolean; data?: PublicProfile; error?: string }>;
  },

  getInvite: async (code: string) => {
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/invites/${code}`, { headers, credentials: "include" });
    return res.json() as Promise<{ success: boolean; data?: InviteInfo; error?: string }>;
  },

  getDomainInfo: async () => {
    const res = await fetch(`${API_URL}/domain`, { credentials: "include" });
    return res.json() as Promise<{
      success: boolean;
      data?: { active: boolean; host: string; slug: string | null; canonical: string | null };
      error?: string;
    }>;
  },

  getProfileDomain: (profileId: string) => request<ProfileDomain | null>(`/profiles/me/${profileId}/domain`),

  requestProfileDomain: (profileId: string, domain: string) =>
    request<ProfileDomain>(`/profiles/me/${profileId}/domain`, { method: "POST", body: JSON.stringify({ domain }) }),

  verifyProfileDomain: (profileId: string) =>
    request<ProfileDomain>(`/profiles/me/${profileId}/domain/verify`, { method: "POST" }),

  setProfileDomainRoot: (profileId: string, rootTarget: string | null) =>
    request<ProfileDomain>(`/profiles/me/${profileId}/domain`, { method: "PUT", body: JSON.stringify({ rootTarget }) }),

  removeProfileDomain: (profileId: string) =>
    request<ProfileDomain | null>(`/profiles/me/${profileId}/domain`, { method: "DELETE" }),

  getProfilePresence: async (username: string) => {
    const res = await fetch(`${API_URL}/profiles/${username}/presence`, { credentials: "include" });
    return res.json() as Promise<{ success: boolean; data?: DiscordPresence | null; error?: string }>;
  },

  trackClick: (profileId: string, platform: string, slug?: string) =>
    request("/profiles/click", {
      method: "POST",
      body: JSON.stringify({ profileId, platform, ...(slug ? { slug } : {}) }),
    }),

  resetAnalytics: (profileId?: string, slug?: string) =>
    request<{ deleted: number; slug: string | null }>(
      `/analytics/me?${new URLSearchParams({
        ...(profileId ? { profileId } : {}),
        ...(slug ? { slug } : {}),
      })}`,
      { method: "DELETE" }
    ),

  getAnalytics: (profileId?: string) =>
    request<AnalyticsData>(`/analytics/me${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  getEmailSettings: (profileId?: string) =>
    request<EmailNotificationSettings>(`/email/settings${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  updateEmailSettings: (data: { notifyOnView: boolean; notifyOnClick: boolean }, profileId?: string) =>
    request(`/email/settings${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  testEmail: (profileId?: string) =>
    request(`/email/test${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, { method: "POST" }),

  getWebhooks: () => request<Webhook[]>("/webhooks"),

  createWebhook: (data: { name: string; url: string; events: WebhookEvent[]; active: boolean; template?: string | null }) =>
    request<WebhookWithSecret>("/webhooks", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateWebhook: (id: string, data: { name?: string; url?: string; events?: WebhookEvent[]; active?: boolean; template?: string | null }) =>
    request<Webhook>(`/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  rotateWebhookSecret: (id: string) =>
    request<{ secret: string; secretPrefix: string }>(`/webhooks/${id}/rotate-secret`, {
      method: "POST",
    }),

  testWebhook: (id: string) =>
    request(`/webhooks/${id}/test`, { method: "POST" }),

  getWebhookDeliveries: (id: string, limit = 20) =>
    request<WebhookDelivery[]>(`/webhooks/${id}/deliveries?limit=${limit}`),

  deleteWebhook: (id: string) =>
    request(`/webhooks/${id}`, { method: "DELETE" }),

  exportProfile: async (format: "xlsx" | "ods", profileId?: string) => {
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/profiles/me/export?format=${format}${profileId ? `&profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        headers,
        credentials: "include",
      }
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Export failed");
    }
    return res.blob();
  },

  importProfile: async (file: File, profileId?: string) => {
    const form = new FormData();
    form.append("file", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/profiles/me/import${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      }
    );
    return res.json() as Promise<{
      success: boolean;
      data?: { applied: string[]; warnings: string[] };
      error?: string;
      warnings?: string[];
    }>;
  },

  getMusic: (profileId?: string) =>
    request<MusicSettings>(`/music/me${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  addMusicTrack: (data: {
    provider: MusicProvider;
    title?: string;
    artist?: string;
    url?: string;
    fullUrl?: string;
  }, profileId?: string) => request<MusicTrack>(`/music/me${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
    method: "POST",
    body: JSON.stringify(data),
  }),

  uploadMusicTrack: async (file: File, title?: string, artist?: string, fullUrl?: string, profileId?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    if (artist) form.append("artist", artist);
    if (fullUrl) form.append("fullUrl", fullUrl);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/music/me/upload${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      }
    );
    return res.json() as Promise<{ success: boolean; data?: MusicTrack; error?: string }>;
  },

  updateMusicTrack: (id: string, data: { title?: string; artist?: string; position?: number; fullUrl?: string | null }) =>
    request<MusicTrack>(`/music/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  reorderMusicTracks: (ids: string[]) =>
    request("/music/reorder", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  deleteMusicTrack: (id: string) =>
    request(`/music/${id}`, { method: "DELETE" }),

  getDiscordStatus: (profileId?: string) =>
    request<DiscordStatus>(`/discord${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  getDiscordConnectUrl: () => request<{ url: string }>("/discord/connect"),

  disconnectDiscord: (profileId?: string) =>
    request(`/discord/disconnect${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, { method: "POST" }),

  updateDiscordSettings: (data: {
    showDiscordPresence?: boolean;
    showDiscordActivity?: boolean;
    webhookUrl?: string;
  }, profileId?: string) => request(`/discord/settings${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),

  postToDiscord: (url?: string, profileId?: string) =>
    request<{ messageId: string | null; mode: "created" | "updated" | "none" }>(`/discord/post${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
      method: "POST",
      body: JSON.stringify(url ? { url } : {}),
    }),

  getInvites: () => request<InviteCodeInfo[], InviteMeta>("/invites"),

  generateInvites: (body: { count: number; expiresInDays?: number }) =>
    request<InviteCodeInfo[], InviteMeta>("/invites", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  revokeInvite: (id: string) =>
    request(`/invites/${id}`, { method: "DELETE" }),
  setInviteNote: (id: string, note: string | null) =>
    request<InviteCodeInfo>(`/invites/${id}/note`, {
      method: "PATCH",
      body: JSON.stringify({ note }),
    }),

  getAffiliateStatus: () => request<AffiliateStatus>("/affiliate/me"),

  getAffiliateOverview: () => request<AffiliateOverview>("/affiliate/admin/overview"),

  saveAffiliateMilestones: (data: AffiliateMilestoneConfig) =>
    request<AffiliateOverview>("/affiliate/admin/config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  resetAffiliateMilestones: () =>
    request<AffiliateOverview>("/affiliate/admin/config", { method: "DELETE" }),

  getOrderConfig: () => request<OrderConfig>("/orders/config"),

  getMyOrders: () => request<MyOrders>("/orders/me"),

  createOrder: (data: { plan: "PRO" | "ENTERPRISE"; method?: "MANUAL" | "STRIPE" | "PAYPAL" | "CRYPTO"; note?: string; coin?: string; provider?: string }) =>
    request<OrderInfo>(`/orders/me`, {
      method: "POST",
      body: JSON.stringify({
        plan: data.plan,
        method: data.method ?? "MANUAL",
        note: data.note ?? "",
        coin: data.coin,
        provider: data.provider,
      }),
    }) as Promise<CreateOrderResponse>,

  // Self-service downgrade to a strictly lower tier. Entitlements are
  // soft-disabled server-side (nothing is deleted); pending orders are cancelled.
  downgradeTier: (tier: "PRO" | "FREE") =>
    request<{ tier: string; previousTier: string; cancelledOrders: number }>("/orders/downgrade", {
      method: "POST",
      body: JSON.stringify({ tier }),
    }),

  getAdminOrders: async (params?: { status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/admin/orders${query ? `?${query}` : ""}`, { headers, credentials: "include" });
    const body = (await res.json()) as ApiResponse<AdminOrderListItem[], { total: number; limit: number; offset: number }> & {
      pagination?: { total: number; limit: number; offset: number };
    };
    if (body.pagination && !body.meta) body.meta = body.pagination;
    return body;
  },

  updateAdminOrder: (id: string, data: { status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED"; adminNote?: string }) =>
    request<OrderInfo>(`/admin/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  getOrdersConfig: () => request<{ method: string; value: string }>("/admin/orders-config"),

  updateOrdersConfig: (data: { method: string; value: string }) =>
    request<{ method: string; value: string }>("/admin/orders-config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getInviteSettings: () =>
    request<{ userGenerationEnabled: boolean; eligibleUserCount: number }>("/admin/invite-settings"),

  updateInviteSettings: (body: { userGenerationEnabled: boolean }) =>
    request<{ userGenerationEnabled: boolean }>("/admin/invite-settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  createInviteEvent: (body: { count: number; expiryDays: number }) =>
    request<{ grantedUsers: number; event: InviteGrantEvent; allowanceExpiresAt: string }>("/admin/invite-events", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getInviteEvents: () =>
    request<InviteGrantEvent[]>("/admin/invite-events"),

  getVersionCheck: (force = false) => request<VersionCheckData>(`/version${force ? "?force=1" : ""}`),

  fetchLandingConfig: () => request<{ featuredProfileUsername: string | null }>("/landing/config"),

  getLandingConfig: () => request<{ featuredProfileUsername: string | null }>("/admin/landing-config"),

  setLandingConfig: (featuredProfileUsername: string) =>
    request<{ featuredProfileUsername: string | null }>("/admin/landing-config", {
      method: "PUT",
      body: JSON.stringify({ featuredProfileUsername }),
    }),

  subscribeNewsletter: async (profileId: string, email: string) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/newsletter/subscribe`, {
      method: "POST",
      headers,
      body: JSON.stringify({ profileId, email, agreePrivacy: true }),
      credentials: "include",
    });
    return res.json() as Promise<ApiResponse<{ status: string }>>;
  },

  newsletterUnsubscribe: (token: string) =>
    request<{ unsubscribed: boolean }>("/newsletter/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  optInNewsletter: (enabled: boolean) =>
    request<{ enabled: boolean }>("/newsletter/optin", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),

  getNewsletterSubscribers: (profileId?: string) =>
    request<{
      subscribers: NewsletterSubscriber[];
      counts: { total: number; active: number; unsubscribed: number };
    }>(`/newsletter/subscribers${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  sendNewsletter: (data: { subject: string; body: string }, profileId?: string) =>
    request<NewsletterSendResult>(`/newsletter/send${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getNewsletterSends: (profileId?: string) =>
    request<{ sends: NewsletterSendRecord[] }>(`/newsletter/sends${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  getNewsletterSender: (profileId?: string) =>
    request<{ sender: NewsletterSenderSettings | null; platformEnabled: boolean }>(`/newsletter/sender${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  setNewsletterSender: (data: NewsletterSenderPayload, profileId?: string) =>
    request<{ sender: NewsletterSenderSettings }>(`/newsletter/sender${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteNewsletterSender: (profileId?: string) =>
    request<{ sender: null }>(`/newsletter/sender${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, { method: "DELETE" }),

  verifyNewsletterSender: (profileId?: string) =>
    request<{ verified: boolean; verificationRecord?: string | null; verificationToken?: string }>(
      `/newsletter/sender/verify${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      { method: "POST" }
    ),

  testNewsletterSender: (profileId?: string) =>
    request<{ tested: boolean }>(`/newsletter/sender/test${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, { method: "POST" }),

  getNewsletterSenderWhitelist: async (q?: string, params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/admin/newsletter/sender-whitelist${query ? `?${query}` : ""}`, { headers, credentials: "include" });
    const body = (await res.json()) as ApiResponse<{ users: NewsletterWhitelistUser[] }, { total: number; limit: number; offset: number }> & {
      pagination?: { total: number; limit: number; offset: number };
    };
    if (body.pagination && !body.meta) body.meta = body.pagination;
    return body;
  },

  setNewsletterSenderWhitelist: (userId: string, whitelisted: boolean) =>
    request<{ userId: string; username: string; email: string; whitelisted: boolean }>(
      `/admin/newsletter/sender-whitelist/${userId}`,
      { method: "PUT", body: JSON.stringify({ whitelisted }) }
    ),

  deleteNewsletterSubscriber: (id: string, profileId?: string) =>
    request<{ deleted: number }>(
      `/newsletter/subscribers/${id}${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      { method: "DELETE" }
    ),

  getNewsletterConfig: () => request<NewsletterConfig>("/admin/newsletter/config"),

  updateNewsletterConfig: (config: NewsletterTierConfig) =>
    request<NewsletterConfig>("/admin/newsletter/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  resetNewsletterConfig: () =>
    request<NewsletterConfig>("/admin/newsletter/config", { method: "DELETE" }),

  searchNewsletterConsent: (email: string) =>
    request<{
      email: string;
      account: {
        exists: boolean;
        username?: string;
        announcementsOptIn?: boolean;
        announcementsOptInAt?: string | null;
        announcementsUnsubscribedAt?: string | null;
        acceptedPoliciesAt?: string | null;
      };
      consentEvents: { at: string; ip: string; userAgent: string; profileId: string }[];
      subscriptions: (NewsletterSubscriber & { profileId: string; status: "subscribed" | "unsubscribed" })[];
    }>(`/admin/newsletter/consent-search?email=${encodeURIComponent(email)}`),

  getNewsletterBroadcastAudience: () => request<{ count: number }>("/admin/newsletter/broadcast-audience"),

  sendNewsletterBroadcast: (data: { subject: string; body: string }) =>
    request<{
      broadcast: { id: string; subject: string; recipientCount: number; successCount: number; sentAt: string };
      recipientCount: number;
      successCount: number;
      failedCount: number;
    }>("/admin/newsletter/broadcast", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getNewsletterBroadcasts: () =>
    request<{
      broadcasts: { id: string; subject: string; recipientCount: number; successCount: number; sentAt: string }[];
    }>("/admin/newsletter/broadcasts"),

  createTip: async (data: { profileId: string; coin: TipCoin; amount: string; name?: string; message?: string }) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/tips`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      credentials: "include",
    });
    return res.json() as Promise<ApiResponse<TipCreateResult>>;
  },

  getTipsOverview: (profileId?: string) =>
    request<TipsOverview>(`/tips/overview${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  deleteTip: (id: string, profileId?: string) =>
    request<{ deleted: number }>(
      `/tips/${id}${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      { method: "DELETE" },
    ),

  getShopAvailability: () => request<ShopAvailability>("/shop/availability"),

  getShopOverview: (profileId?: string) =>
    request<ShopOverview>(`/shop/overview${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  createProduct: (data: { file?: File; title: string; description?: string; priceCents: number; type?: "DOWNLOAD" | "REQUEST" }, profileId?: string): Promise<ApiResponse<ShopProduct>> => {
    const form = new FormData();
    if (data.file) form.append("file", data.file);
    form.append("title", data.title);
    if (data.description) form.append("description", data.description);
    form.append("priceCents", String(data.priceCents));
    if (data.type) form.append("type", data.type);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    return fetch(`${API_URL}/shop/products${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
      method: "POST",
      headers,
      credentials: "include",
      body: form,
    }).then((r) => r.json() as Promise<ApiResponse<ShopProduct>>);
  },

  updateProduct: (id: string, data: { title?: string; description?: string | null; priceCents?: number; enabled?: boolean; previewImage?: string | null; type?: "DOWNLOAD" | "REQUEST" }) =>
    request<ShopProduct>(`/shop/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  uploadProductPreview: (id: string, image: File): Promise<ApiResponse<{ previewImage: string }>> => {
    const form = new FormData();
    form.append("image", image);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    return fetch(`${API_URL}/shop/products/${id}/preview`, {
      method: "POST",
      headers,
      credentials: "include",
      body: form,
    }).then((r) => r.json() as Promise<ApiResponse<{ previewImage: string }>>);
  },

  deleteProduct: (id: string) =>
    request<{ success: boolean }>(`/shop/products/${id}`, { method: "DELETE" }),

  getSales: (profileId?: string, productId?: string) => {
    const params = new URLSearchParams();
    if (profileId) params.set("profileId", profileId);
    if (productId) params.set("productId", productId);
    const qs = params.toString();
    return request<Sale[]>(`/shop/sales${qs ? `?${qs}` : ""}`);
  },

  refundSale: (purchaseId: string) =>
    request<Purchase>(`/shop/sales/${purchaseId}/refund`, { method: "POST" }),

  getMyPurchases: () => request<Purchase[]>("/shop/purchases"),

  buyProduct: (data: ShopBuyParams): Promise<ShopBuyResult> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    return fetch(`${API_URL}/shop/buy`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(data),
    }).then((r) => r.json() as Promise<ShopBuyResult>);
  },

  getPurchaseStatus: (purchaseId: string, token?: string): Promise<PurchaseStatusResult> => {
    const q = token ? `?token=${encodeURIComponent(token)}` : "";
    return request<PurchaseStatusInfo>(`/shop/status/${purchaseId}${q}`) as Promise<PurchaseStatusResult>;
  },

  downloadPurchase: async (purchaseId: string): Promise<{ blob: Blob; fileName: string }> => {
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/shop/download/${purchaseId}`, { headers, credentials: "include" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "Download failed");
    }
    const disposition = res.headers.get("content-disposition") ?? "";
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
    const fileName = match ? decodeURIComponent(match[1]) : "download";
    return { blob: await res.blob(), fileName };
  },
};

export interface InviteCodeInfo {
  id: string;
  code: string;
  usedById: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  fromAllowance: boolean;
  note: string | null;
}
