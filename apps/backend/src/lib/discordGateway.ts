const DEFAULT_GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

const GUILDS = 1 << 0;
const GUILD_PRESENCES = 1 << 8;
const INTENTS = GUILDS | GUILD_PRESENCES;

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

const presenceCache = new Map<string, CachedPresence>();

interface BotSession {
  token: string;
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

let bot: BotSession | null = null;

const FATAL_CLOSE_CODES = new Set([4004, 4013, 4014]);
const NON_RESUMABLE_CLOSE_CODES = new Set([4010, 4011, 4012, 4015, 4016]);

export function getCachedPresence(discordId: string): CachedPresence | null {
  return presenceCache.get(discordId) ?? null;
}

export function isBotConnected(): boolean {
  return Boolean(bot && bot.ws && bot.ws.readyState === WebSocket.OPEN);
}

export function isSessionActive(): boolean {
  return isBotConnected();
}

export function startBotSession(token: string): void {
  stopBotSession();
  bot = {
    token,
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
  void connectBot(bot);
}

export function stopBotSession(): void {
  if (!bot) return;
  bot.manualClose = true;
  if (bot.reconnectTimer) {
    clearTimeout(bot.reconnectTimer);
    bot.reconnectTimer = null;
  }
  stopHeartbeat(bot);
  try {
    bot.ws?.close(1000, "disconnect");
  } catch {
    // ignore
  }
  bot.ws = null;
  presenceCache.clear();
  bot = null;
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

interface RawPresence {
  user?: { id?: string };
  status?: string;
  activities?: RawActivity[];
}

function stopHeartbeat(session: BotSession): void {
  if (session.heartbeatTimer) {
    clearInterval(session.heartbeatTimer);
    session.heartbeatTimer = null;
  }
}

function startHeartbeat(session: BotSession): void {
  stopHeartbeat(session);
  session.heartbeatTimer = setInterval(() => {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ op: 1, d: session.lastSeq }));
    }
  }, session.heartbeatIntervalMs);
}

function scheduleReconnect(session: BotSession, delay: number): void {
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    if (bot === session) void connectBot(session);
  }, delay);
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

async function connectBot(session: BotSession): Promise<void> {
  if (bot !== session) return;
  if (session.ws && (session.ws.readyState === WebSocket.OPEN || session.ws.readyState === WebSocket.CONNECTING)) return;
  session.manualClose = false;

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

function handleMessage(session: BotSession, payload: GatewayPayload): void {
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
      reconnectBot(session, false);
      break;
    case 9: {
      session.sessionId = null;
      session.resumeGatewayUrl = null;
      if (payload.d === true) {
        reconnectBot(session, true);
      } else {
        sendIdentify(session);
      }
      break;
    }
    default:
      break;
  }
}

function sendIdentify(session: BotSession): void {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
  session.ws.send(
    JSON.stringify({
      op: 2,
      d: {
        token: session.token,
        intents: INTENTS,
        properties: { os: "linux", browser: "BioPlatform", device: "BioPlatform" },
      },
    })
  );
}

function sendResume(session: BotSession): void {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
  session.ws.send(
    JSON.stringify({
      op: 6,
      d: {
        token: session.token,
        session_id: session.sessionId,
        seq: session.lastSeq,
      },
    })
  );
}

function handleDispatch(session: BotSession, event: string, data: unknown): void {
  switch (event) {
    case "READY": {
      const d = data as { session_id?: string; resume_gateway_url?: string } | undefined;
      session.sessionId = d?.session_id ?? null;
      session.resumeGatewayUrl = d?.resume_gateway_url ?? null;
      session.reconnectDelayMs = 1000;
      presenceCache.clear();
      break;
    }
    case "RESUMED": {
      session.reconnectDelayMs = 1000;
      break;
    }
    case "GUILD_CREATE": {
      const d = data as { presences?: RawPresence[] } | undefined;
      if (Array.isArray(d?.presences)) {
        for (const presence of d.presences) {
          setPresence(presence);
        }
      }
      break;
    }
    case "PRESENCE_UPDATE": {
      setPresence(data as RawPresence | undefined);
      break;
    }
    default:
      break;
  }
}

function setPresence(raw: RawPresence | undefined): void {
  if (!raw || !raw.user?.id || typeof raw.status !== "string") return;

  const activities = (raw.activities ?? [])
    .map(normalizeActivity)
    .filter((activity): activity is DiscordActivity => activity !== null);

  const status: CachedPresence["status"] =
    raw.status === "online" || raw.status === "idle" || raw.status === "dnd" || raw.status === "offline"
      ? raw.status
      : "offline";

  presenceCache.set(raw.user.id, { status, activities, updatedAt: Date.now() });
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

function handleClose(session: BotSession, code: number): void {
  stopHeartbeat(session);
  if (session.ws) session.ws = null;
  if (session.manualClose || bot !== session) return;

  if (FATAL_CLOSE_CODES.has(code)) {
    console.error(`Discord presence bot session failed (gateway close code ${code}); disabling presence bot.`);
    stopBotSession();
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

  reconnectBot(session, false);
}

function reconnectBot(session: BotSession, forceNew: boolean): void {
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
