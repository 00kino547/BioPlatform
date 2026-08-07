import { refreshDiscordTokens } from "./discord.js";

const DEFAULT_GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

export interface DiscordActivity {
  type: number;
  name: string;
  details: string | null;
  state: string | null;
  applicationId: string | null;
  largeImage: string | null;
  smallImage: string | null;
}

export interface CachedPresence {
  status: "online" | "idle" | "dnd" | "offline";
  activities: DiscordActivity[];
  updatedAt: number;
}

export interface UserSessionTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}

export type TokenRefreshHandler = (discordId: string, tokens: UserSessionTokens) => void;

const presenceCache = new Map<string, CachedPresence>();
const sessions = new Map<string, UserSession>();

interface UserSession {
  discordId: string;
  tokens: UserSessionTokens;
  onTokensRefreshed: TokenRefreshHandler;
  ws: WebSocket | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  heartbeatIntervalMs: number;
  lastSeq: number | null;
  sessionId: string | null;
  resumeGatewayUrl: string | null;
  reconnectDelayMs: number;
  manualClose: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

interface GatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

interface RawActivity {
  type?: number;
  name?: string;
  details?: string | null;
  state?: string | null;
  application_id?: string;
  assets?: { large_image?: string; small_image?: string };
}

interface RawSession {
  session_id?: string;
  status?: string;
  activities?: RawActivity[];
}

const NON_RESUMABLE_CLOSE_CODES = new Set([
  4004, 4010, 4011, 4012, 4013, 4014, 4015, 4016,
]);

export function getCachedPresence(discordId: string): CachedPresence | null {
  return presenceCache.get(discordId) ?? null;
}

export function isSessionActive(discordId: string): boolean {
  const session = sessions.get(discordId);
  return Boolean(session && session.ws && session.ws.readyState === WebSocket.OPEN);
}

export function startUserSession(
  discordId: string,
  tokens: UserSessionTokens,
  onTokensRefreshed: TokenRefreshHandler
): void {
  stopUserSession(discordId);
  const session: UserSession = {
    discordId,
    tokens,
    onTokensRefreshed,
    ws: null,
    heartbeatTimer: null,
    heartbeatIntervalMs: 0,
    lastSeq: null,
    sessionId: null,
    resumeGatewayUrl: null,
    reconnectDelayMs: 1000,
    manualClose: false,
    reconnectTimer: null,
  };
  sessions.set(discordId, session);
  void connectSession(session);
}

export function stopUserSession(discordId: string): void {
  const session = sessions.get(discordId);
  if (!session) return;
  sessions.delete(discordId);
  session.manualClose = true;
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
  stopHeartbeat(session);
  try {
    session.ws?.close(1000, "disconnect");
  } catch {
    // ignore
  }
  session.ws = null;
  presenceCache.delete(discordId);
}

export function stopAllUserSessions(): void {
  for (const discordId of [...sessions.keys()]) {
    stopUserSession(discordId);
  }
}

function stopHeartbeat(session: UserSession): void {
  if (session.heartbeatTimer) {
    clearInterval(session.heartbeatTimer);
    session.heartbeatTimer = null;
  }
}

function startHeartbeat(session: UserSession): void {
  stopHeartbeat(session);
  session.heartbeatTimer = setInterval(() => {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ op: 1, d: session.lastSeq }));
    }
  }, session.heartbeatIntervalMs);
}

function scheduleReconnect(session: UserSession, delay: number): void {
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    if (sessions.has(session.discordId)) void connectSession(session);
  }, delay);
}

async function refreshSessionTokens(session: UserSession): Promise<boolean> {
  try {
    const fresh = await refreshDiscordTokens(session.tokens.refreshToken);
    session.tokens = {
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken,
      tokenExpiresAt: new Date(Date.now() + fresh.expiresIn * 1000),
    };
    session.onTokensRefreshed(session.discordId, session.tokens);
    return true;
  } catch {
    return false;
  }
}

async function getGatewayUrl(): Promise<string> {
  try {
    const res = await fetch("https://discord.com/api/v10/gateway", {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { url?: string };
      if (typeof data.url === "string" && data.url.startsWith("wss://")) {
        return `${data.url}?v=10&encoding=json`;
      }
    }
  } catch {
    // fall through to default URL
  }
  return DEFAULT_GATEWAY_URL;
}

async function connectSession(session: UserSession): Promise<void> {
  if (session.ws && (session.ws.readyState === WebSocket.OPEN || session.ws.readyState === WebSocket.CONNECTING)) return;
  session.manualClose = false;

  if (session.tokens.tokenExpiresAt.getTime() - Date.now() < 60_000) {
    const refreshed = await refreshSessionTokens(session);
    if (!refreshed) {
      scheduleReconnect(session, 60_000);
      return;
    }
  }

  let socket: WebSocket;
  try {
    socket = new WebSocket(await getGatewayUrl());
  } catch {
    scheduleReconnect(session, session.reconnectDelayMs);
    return;
  }
  session.ws = socket;

  socket.onmessage = (event: MessageEvent) => {
    try {
      handleMessage(session, JSON.parse(String(event.data)) as GatewayPayload);
    } catch {
      // ignore malformed frames
    }
  };

  socket.onclose = (event: { code: number }) => {
    handleClose(session, event.code);
  };

  socket.onerror = () => {
    // close event follows
  };
}

function handleMessage(session: UserSession, payload: GatewayPayload): void {
  if (typeof payload.s === "number") session.lastSeq = payload.s;

  switch (payload.op) {
    case 10: {
      const hello = payload.d as { heartbeat_interval?: number } | undefined;
      session.heartbeatIntervalMs = Math.max(hello?.heartbeat_interval ?? 41250, 1000);
      startHeartbeat(session);
      if (session.sessionId && session.resumeGatewayUrl && session.lastSeq !== null) {
        sendResume(session);
      } else {
        sendIdentify(session);
      }
      break;
    }
    case 0:
      handleDispatch(session, payload.t ?? "", payload.d);
      break;
    case 7:
      reconnectSession(session, false);
      break;
    case 9: {
      session.sessionId = null;
      session.resumeGatewayUrl = null;
      if (payload.d === true) {
        reconnectSession(session, true);
      } else {
        sendIdentify(session);
      }
      break;
    }
    default:
      break;
  }
}

function sendIdentify(session: UserSession): void {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
  session.ws.send(
    JSON.stringify({
      op: 2,
      d: {
        token: `Bearer ${session.tokens.accessToken}`,
        intents: 0,
        properties: { os: "linux", browser: "BioPlatform", device: "BioPlatform" },
      },
    })
  );
}

function sendResume(session: UserSession): void {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
  session.ws.send(
    JSON.stringify({
      op: 6,
      d: {
        token: `Bearer ${session.tokens.accessToken}`,
        session_id: session.sessionId,
        seq: session.lastSeq,
      },
    })
  );
}

function sendInvisiblePresence(session: UserSession): void {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
  session.ws.send(
    JSON.stringify({
      op: 3,
      d: { status: "invisible", afk: false, activities: [], since: null },
    })
  );
}

function handleDispatch(session: UserSession, event: string, data: unknown): void {
  switch (event) {
    case "READY": {
      const d = data as { session_id?: string; resume_gateway_url?: string; sessions?: RawSession[] } | undefined;
      session.sessionId = d?.session_id ?? null;
      session.resumeGatewayUrl = d?.resume_gateway_url ?? null;
      session.reconnectDelayMs = 1000;
      setPresenceFromSessions(session.discordId, d?.sessions);
      sendInvisiblePresence(session);
      break;
    }
    case "RESUMED": {
      session.reconnectDelayMs = 1000;
      break;
    }
    case "SESSIONS_REPLACE": {
      setPresenceFromSessions(session.discordId, data as RawSession[] | undefined);
      break;
    }
    default:
      break;
  }
}

function setPresenceFromSessions(discordId: string, rawSessions: RawSession[] | undefined): void {
  if (!Array.isArray(rawSessions) || rawSessions.length === 0) return;
  const overall =
    rawSessions.find((s) => s.session_id === "all") ??
    rawSessions.find((s) => s.status && s.status !== "unknown");

  const rawStatus = overall?.status;
  if (!rawStatus) return;

  const activities = (overall?.activities ?? [])
    .map(normalizeActivity)
    .filter((activity): activity is DiscordActivity => activity !== null);

  presenceCache.set(discordId, {
    status: rawStatus === "online" || rawStatus === "idle" || rawStatus === "dnd" || rawStatus === "offline"
      ? rawStatus
      : "offline",
    activities,
    updatedAt: Date.now(),
  });
}

function normalizeActivity(activity: RawActivity): DiscordActivity | null {
  if (!activity || typeof activity.name !== "string") return null;
  return {
    type: activity.type ?? 0,
    name: activity.name,
    details: activity.details ?? null,
    state: activity.state ?? null,
    applicationId: activity.application_id ?? null,
    largeImage: activity.assets?.large_image ?? null,
    smallImage: activity.assets?.small_image ?? null,
  };
}

function handleClose(session: UserSession, code: number): void {
  stopHeartbeat(session);
  if (session.ws) session.ws = null;
  if (session.manualClose || !sessions.has(session.discordId)) return;

  if (code === 4004) {
    session.sessionId = null;
    session.resumeGatewayUrl = null;
    void refreshSessionTokens(session).then((ok) => {
      scheduleReconnect(session, ok ? 1000 : 60_000);
    });
    return;
  }

  if (code === 4015) {
    scheduleReconnect(session, 60_000);
    return;
  }

  if (NON_RESUMABLE_CLOSE_CODES.has(code)) {
    session.sessionId = null;
    session.resumeGatewayUrl = null;
    scheduleReconnect(session, session.reconnectDelayMs);
    return;
  }

  reconnectSession(session, false);
}

function reconnectSession(session: UserSession, forceNew: boolean): void {
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
  session.manualClose = true;
  stopHeartbeat(session);
  try {
    if (forceNew) {
      session.ws?.close(1000, "restart");
      session.sessionId = null;
      session.resumeGatewayUrl = null;
    } else {
      session.ws?.close();
    }
  } catch {
    // ignore
  }
  session.ws = null;
  session.manualClose = false;
  const delay = session.reconnectDelayMs;
  session.reconnectDelayMs = Math.min(session.reconnectDelayMs * 2, 60_000);
  scheduleReconnect(session, delay);
}

export interface ActivitySummary {
  line: string | null;
  customStatus: string | null;
}

export function describeActivities(activities: DiscordActivity[]): ActivitySummary {
  let customStatus: string | null = null;
  let primary: DiscordActivity | null = null;

  for (const activity of activities) {
    if (activity.type === 4) {
      if (activity.state && !customStatus) customStatus = activity.state;
      continue;
    }
    if (!primary) primary = activity;
  }

  if (!primary) return { line: null, customStatus };

  let line: string;
  switch (primary.type) {
    case 0:
      line = `Playing ${primary.name}`;
      break;
    case 1:
      line = primary.details ? `Streaming ${primary.details}` : `Streaming ${primary.name}`;
      break;
    case 2:
      line = primary.details ? `${primary.details} — ${primary.state || primary.name}` : `Listening to ${primary.name}`;
      break;
    case 3:
      line = `Watching ${primary.name}`;
      break;
    case 5:
      line = `Competing in ${primary.name}`;
      break;
    case 6:
      line = primary.state ? `Hanging out — ${primary.state}` : "Hanging out";
      break;
    default:
      line = primary.name;
      break;
  }

  return { line, customStatus };
}
