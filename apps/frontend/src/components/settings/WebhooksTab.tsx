import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Webhook, type WebhookEvent, type WebhookDelivery, WEBHOOK_EVENTS } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Send, KeyRound, RefreshCw, Copy, CheckCircle, XCircle, ChevronDown, ChevronUp, History, Pencil } from "lucide-react";

const EVENT_LABELS: Record<WebhookEvent, string> = {
  "profile.viewed": "Profile viewed",
  "link.clicked": "Link clicked",
  "profile.updated": "Profile updated",
};

const EVENT_DESCS: Record<WebhookEvent, string> = {
  "profile.viewed": "Fires when someone visits your public profile.",
  "link.clicked": "Fires when someone clicks one of your social links.",
  "profile.updated": "Fires when you update your profile.",
};

export function WebhooksTab() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["profile.viewed"]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editEvents, setEditEvents] = useState<WebhookEvent[]>([]);

  const [testState, setTestState] = useState<Record<string, "sending" | "ok" | "err">>({});
  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const secretTimeout = useRef<number | null>(null);

  const load = useCallback(async () => {
    const res = await api.getWebhooks();
    if (res.success && res.data) {
      setWebhooks(res.data);
    } else {
      setError(res.error ?? "Could not load webhooks");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (secretTimeout.current) window.clearTimeout(secretTimeout.current);
    };
  }, [load]);

  const clearSecretLater = (id: string) => {
    if (secretTimeout.current) window.clearTimeout(secretTimeout.current);
    secretTimeout.current = window.setTimeout(() => {
      setRevealedSecret((prev) => (prev?.id === id ? null : prev));
    }, 60000);
  };

  const toggleEvent = (e: WebhookEvent) => {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  };

  const toggleEditEvent = (e: WebhookEvent) => {
    setEditEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  };

  const handleCreate = async () => {
    setError("");
    setSuccess("");
    if (!name.trim()) return setError("Give the webhook a name.");
    if (!url.trim()) return setError("Enter a destination URL.");
    if (events.length === 0) return setError("Select at least one event.");
    setBusy(true);
    try {
      const res = await api.createWebhook({ name: name.trim(), url: url.trim(), events, active });
      if (res.success && res.data) {
        setRevealedSecret({ id: res.data.id, secret: res.data.secret });
        clearSecretLater(res.data.id);
        setCreating(false);
        setName("");
        setUrl("");
        setEvents(["profile.viewed"]);
        setActive(true);
        await load();
        setSuccess("Webhook created. Copy your signing secret now — it is shown only once.");
      } else {
        setError(res.error ?? "Could not create webhook");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (w: Webhook) => {
    const res = await api.updateWebhook(w.id, { active: !w.active });
    if (res.success) {
      setWebhooks((prev) => prev.map((x) => (x.id === w.id ? { ...x, active: !w.active } : x)));
    } else {
      setError(res.error ?? "Could not update webhook");
    }
  };

  const startEdit = (w: Webhook) => {
    setEditingId(w.id);
    setEditName(w.name);
    setEditUrl(w.url);
    setEditEvents(w.events as WebhookEvent[]);
    setError("");
    setSuccess("");
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    if (!editName.trim()) return setError("Name is required.");
    if (!editUrl.trim()) return setError("URL is required.");
    if (editEvents.length === 0) return setError("Select at least one event.");
    const res = await api.updateWebhook(editingId, {
      name: editName.trim(),
      url: editUrl.trim(),
      events: editEvents,
    });
    if (res.success) {
      setEditingId(null);
      await load();
      setSuccess("Webhook updated.");
    } else {
      setError(res.error ?? "Could not update webhook");
    }
  };

  const handleRotate = async (id: string) => {
    setError("");
    const res = await api.rotateWebhookSecret(id);
    if (res.success && res.data) {
      setRevealedSecret({ id, secret: res.data.secret });
      clearSecretLater(id);
      setSuccess("Secret rotated. Copy it now — it is shown only once.");
    } else {
      setError(res.error ?? "Could not rotate secret");
    }
  };

  const handleTest = async (id: string) => {
    setTestState((prev) => ({ ...prev, [id]: "sending" }));
    const res = await api.testWebhook(id);
    setTestState((prev) => ({ ...prev, [id]: res.success ? "ok" : "err" }));
    if (res.success) {
      setSuccess("Test delivery sent. Check your endpoint and the delivery log.");
    } else {
      setError(res.error ?? "Test delivery failed");
    }
  };

  const toggleDeliveries = async (id: string) => {
    if (deliveriesFor === id) {
      setDeliveriesFor(null);
      return;
    }
    setDeliveriesFor(id);
    setDeliveriesLoading(true);
    const res = await api.getWebhookDeliveries(id);
    if (res.success && res.data) {
      setDeliveries(res.data);
    } else {
      setDeliveries([]);
    }
    setDeliveriesLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this webhook? Its delivery history will be removed.")) return;
    const res = await api.deleteWebhook(id);
    if (res.success) {
      setWebhooks((prev) => prev.filter((x) => x.id !== id));
      setSuccess("Webhook deleted.");
    } else {
      setError(res.error ?? "Could not delete webhook");
    }
  };

  const deliveryStatusBadge = (status: string) =>
    status === "success" ? (
      <span className="text-emerald-400 text-xs flex items-center gap-1">
        <CheckCircle className="h-3.5 w-3.5" /> Success
      </span>
    ) : status === "failed" ? (
      <span className="text-red-400 text-xs flex items-center gap-1">
        <XCircle className="h-3.5 w-3.5" /> Failed
      </span>
    ) : (
      <span className="text-amber-400 text-xs flex items-center gap-1">
        <RefreshCw className="h-3.5 w-3.5" /> Pending
      </span>
    );

  const copySecret = (id: string, secret: string) => {
    void navigator.clipboard?.writeText(secret).then(() => {
      setSuccess("Secret copied to clipboard.");
    });
    clearSecretLater(id);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle className="h-4 w-4" /> {success}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h4 className="text-sm font-medium text-white">About webhooks</h4>
        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
          BioPlatform posts JSON to your endpoint whenever an event you subscribe to fires. Each request
          includes a signature in the <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">X-BioPlatform-Signature</code>{" "}
          header (HMAC-SHA256 of the raw body using your signing secret) so you can verify it came from us.
          Failed deliveries are retried up to 5 times with increasing backoff. Max 10 webhooks per account.
        </p>
      </div>

      {revealedSecret && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-5">
          <div className="flex items-start gap-3">
            <KeyRound className="h-5 w-5 text-violet-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-violet-300">Signing secret</h4>
              <p className="text-xs text-violet-300/70 mt-1">
                This secret is shown only once. Store it in your endpoint's config. We cannot recover it later.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="bg-zinc-900/80 border border-violet-500/30 rounded-lg px-3 py-2 text-xs text-violet-200 break-all">
                  {revealedSecret.secret}
                </code>
                <Button variant="secondary" size="sm" onClick={() => copySecret(revealedSecret.id, revealedSecret.secret)}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!creating ? (
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New Webhook
        </Button>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
          <h4 className="text-sm font-medium text-white">Create webhook</h4>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Discord bot"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Endpoint URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/hooks/bioplatform"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Events</label>
            {WEBHOOK_EVENTS.map((e) => (
              <label key={e} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors">
                <input
                  type="checkbox"
                  checked={events.includes(e)}
                  onChange={() => toggleEvent(e)}
                  className="mt-0.5 h-4 w-4 accent-violet-500"
                />
                <div>
                  <p className="text-sm text-white">{EVENT_LABELS[e]}</p>
                  <p className="text-xs text-zinc-500">{EVENT_DESCS[e]}</p>
                </div>
              </label>
            ))}
          </div>
          <label className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div>
              <p className="text-sm text-white">Active</p>
              <p className="text-xs text-zinc-500">Deliver immediately after creation.</p>
            </div>
            <button
              onClick={() => setActive(!active)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${active ? "bg-violet-600" : "bg-zinc-700"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${active ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </label>
          <div className="flex gap-3">
            <Button onClick={handleCreate} disabled={busy}>
              <Plus className="h-4 w-4" /> {busy ? "Creating..." : "Create"}
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading webhooks...</p>
      ) : webhooks.length === 0 ? (
        <p className="text-sm text-zinc-500">No webhooks yet. Create one to start receiving events.</p>
      ) : (
        <div className="space-y-4">
          {webhooks.map((w) => (
            <div key={w.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
              {editingId === w.id ? (
                <div className="p-5 space-y-4">
                  <h4 className="text-sm font-medium text-white">Edit webhook</h4>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                  <input
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                  <div className="space-y-2">
                    {WEBHOOK_EVENTS.map((e) => (
                      <label key={e} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 cursor-pointer hover:border-zinc-700 transition-colors">
                        <input
                          type="checkbox"
                          checked={editEvents.includes(e)}
                          onChange={() => toggleEditEvent(e)}
                          className="h-4 w-4 accent-violet-500"
                        />
                        <span className="text-sm text-white">{EVENT_LABELS[e]}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <Button onClick={handleSaveEdit}>Save</Button>
                    <Button variant="secondary" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white">{w.name}</p>
                          {w.lastDelivery && deliveryStatusBadge(w.lastDelivery.status)}
                        </div>
                        <p className="text-xs text-zinc-500 truncate mt-0.5">{w.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggleActive(w)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${w.active ? "bg-violet-600" : "bg-zinc-700"}`}
                        title={w.active ? "Active" : "Paused"}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${w.active ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                      <button
                        onClick={() => startEdit(w)}
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleRotate(w.id)}
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Rotate signing secret"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleTest(w.id)}
                        disabled={testState[w.id] === "sending"}
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        title="Send test delivery"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(w.id)}
                        className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    {w.events.map((e) => (
                      <span key={e} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-300">
                        {EVENT_LABELS[e as WebhookEvent] ?? e}
                      </span>
                    ))}
                    <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-500">
                      secret: {w.secretPrefix}...
                    </span>
                  </div>

                  <div className="mt-4 border-t border-zinc-800 pt-3">
                    <button
                      onClick={() => toggleDeliveries(w.id)}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      <History className="h-3.5 w-3.5" />
                      Delivery history
                      {deliveriesFor === w.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>

                    {deliveriesFor === w.id && (
                      <div className="mt-3">
                        {deliveriesLoading ? (
                          <p className="text-xs text-zinc-500">Loading deliveries...</p>
                        ) : deliveries.length === 0 ? (
                          <p className="text-xs text-zinc-500">No deliveries yet.</p>
                        ) : (
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {deliveries.map((d) => (
                              <div key={d.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-2.5 text-xs">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-zinc-300 font-medium">{EVENT_LABELS[d.event as WebhookEvent] ?? d.event}</span>
                                  {deliveryStatusBadge(d.status)}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-zinc-500">
                                  <span>{new Date(d.createdAt).toLocaleString()}</span>
                                  <span>{d.attempts} attempt{d.attempts === 1 ? "" : "s"}</span>
                                  {d.lastStatusCode != null && <span>HTTP {d.lastStatusCode}</span>}
                                </div>
                                {d.lastError && <p className="mt-1 text-red-400/80 break-words">{d.lastError}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
