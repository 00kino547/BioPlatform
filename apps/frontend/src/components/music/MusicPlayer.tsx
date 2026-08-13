import { useState, useEffect, useRef } from "react";
import type { MusicTrack } from "@/lib/api";
import { Play, Music, ExternalLink, Radio, VolumeX, Volume2, ChevronDown } from "lucide-react";

interface YtPlayerInstance {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
  getPlayerState(): number;
  getIframe(): HTMLIFrameElement;
}

interface YtApi {
  PlayerState: Record<string, number>;
  Player: new (element: HTMLElement | string, options: unknown) => YtPlayerInstance;
}

declare global {
  interface Window {
    YT?: YtApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
  }
  return youtubeApiPromise;
}

function youtubeVideoId(url: string): string | null {
  const match = url.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
  return match?.[1] ?? null;
}

function startWithSound(
  player: YtPlayerInstance,
  onUnmuted: () => void,
  onMuted: () => void
): number[] {
  const timers: number[] = [];
  player.playVideo();
  timers.push(
    window.setTimeout(() => {
      if (player.getPlayerState() === window.YT?.PlayerState.PLAYING) {
        onUnmuted();
        return;
      }
      player.mute();
      player.playVideo();
      timers.push(
        window.setTimeout(() => {
          onMuted();
        }, 300)
      );
    }, 600)
  );
  return timers;
}

const PROVIDER_PRIORITY: Record<MusicTrack["provider"], number> = {
  youtube: 0,
  spotify: 1,
  local: 2,
};

function withParams(url: string, params: Record<string, string>): string {
  try {
    const u = new URL(url);
    for (const [key, value] of Object.entries(params)) u.searchParams.set(key, value);
    return u.toString();
  } catch {
    return url;
  }
}

function orderTracks(tracks: MusicTrack[]): MusicTrack[] {
  return [...tracks].sort((a, b) => PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider]);
}

function spotifyEmbedHeight(url: string): number {
  const m = url.match(/\/embed\/(track|episode)\//);
  return m ? 80 : 352;
}

function spotifyOpenUrl(embedUrl: string): string {
  return embedUrl.replace("/embed/", "/");
}

function isYoutubeEmbed(url: string): boolean {
  return /youtube(?:-nocookie)?\.com\/embed\//i.test(url);
}

function FullVersionPlayer({ track, accent }: { track: MusicTrack; accent: string }) {
  if (!track.fullUrl) return null;

  const url = track.fullUrl;

  if (isYoutubeEmbed(url)) {
    return (
      <iframe
        src={withParams(url, { rel: "0" })}
        width="100%"
        height="auto"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        title={`${track.title ?? "Track"} (full version)`}
        className="aspect-video w-full rounded-lg bg-black/20"
      />
    );
  }

  if (/\.(mp3|opus|ogg|wav|m4a|flac|aac|webm|oga)(\?.*)?$/i.test(url)) {
    return (
      <audio
        controls
        preload="metadata"
        className="w-full"
        style={{ accentColor: accent }}
        src={url}
      />
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
      style={{
        backgroundColor: `${accent}18`,
        color: accent,
        border: `1px solid ${accent}35`,
      }}
    >
      <Radio className="h-4 w-4" />
      Play full version
    </a>
  );
}

function LocalAudioPlayer({ src, accent, started }: { src: string; accent: string; started: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    if (started) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [started]);

  return (
    <audio
      ref={ref}
      controls
      autoPlay={started}
      playsInline
      preload="auto"
      className="w-full"
      style={{ accentColor: accent }}
      src={src}
    />
  );
}

function TrackPlayer({ track, accent, started }: { track: MusicTrack; accent: string; started: boolean }) {
  if (track.provider === "local" && track.filePath) {
    return <LocalAudioPlayer src={track.filePath} accent={accent} started={started} />;
  }

  if (track.provider === "spotify" && track.url) {
    const height = spotifyEmbedHeight(track.url);
    return (
      <div className="flex flex-col gap-2">
        <iframe
          key={String(started)}
          src={started ? withParams(track.url, { autoplay: "true" }) : track.url}
          width="100%"
          height={height}
          frameBorder="0"
          allow={started ? "autoplay; encrypted-media" : "encrypted-media"}
          allowTransparency
          title={track.title ?? "Spotify track"}
          className="rounded-lg bg-black/20"
        />
        <a
          href={spotifyOpenUrl(track.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: `${accent}18`,
            color: accent,
            border: `1px solid ${accent}35`,
          }}
        >
          <ExternalLink className="h-4 w-4" />
          Open in Spotify
        </a>
      </div>
    );
  }

  if (track.provider === "youtube" && track.url) {
    return <YouTubePlayer url={track.url} accent={accent} started={started} />;
  }

  return null;
}

function YouTubePlayer({ url, accent, started }: { url: string; accent: string; started: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayerInstance | null>(null);
  const startedRef = useRef(started);
  const soundTimersRef = useRef<number[]>([]);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  useEffect(() => {
    return () => {
      soundTimersRef.current.forEach((t) => window.clearTimeout(t));
      soundTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const extractedId = youtubeVideoId(url);
    if (!extractedId || !containerRef.current) return;
    const videoId: string = extractedId;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;

      const player = new window.YT.Player(containerRef.current, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          rel: "0",
          autoplay: startedRef.current ? "1" : "0",
          playsinline: "1",
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            playerRef.current = player;
            const frame = player.getIframe();
            frame.setAttribute(
              "allow",
              "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            );
            frame.style.width = "100%";
            frame.style.height = "100%";
            if (startedRef.current) {
              soundTimersRef.current = startWithSound(player, () => setMuted(false), () => setMuted(true));
            } else {
              player.pauseVideo();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    soundTimersRef.current.forEach((t) => window.clearTimeout(t));
    soundTimersRef.current = [];
    if (started) {
      soundTimersRef.current = startWithSound(player, () => setMuted(false), () => setMuted(true));
    } else {
      player.pauseVideo();
    }
  }, [started]);

  useEffect(() => {
    let wasPlaying = false;
    const onBlur = () => {
      if (!startedRef.current) return;
      const p = playerRef.current;
      wasPlaying = p ? p.getPlayerState() === window.YT?.PlayerState.PLAYING : false;
    };
    const onFocus = () => {
      if (!startedRef.current) return;
      const p = playerRef.current;
      if (!p || !wasPlaying) return;
      if (p.getPlayerState() !== window.YT?.PlayerState.PLAYING) p.playVideo();
      wasPlaying = false;
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (muted) {
      player.unMute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  };

  return (
    <div className="relative w-full rounded-lg bg-black/20 overflow-hidden">
      <div className="mx-auto aspect-video w-full max-w-[34rem]" ref={containerRef} />
      <button
        onClick={toggleMute}
        title={muted ? "Unmute" : "Mute"}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium backdrop-blur transition-colors"
        style={{
          backgroundColor: `${accent}cc`,
          color: "#fff",
          boxShadow: "0 1px 6px rgba(0,0,0,0.35)",
        }}
      >
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        {muted && "Tap to unmute"}
      </button>
    </div>
  );
}

export function MusicPlayer({
  tracks,
  accent,
  textColor,
}: {
  tracks: MusicTrack[];
  accent: string;
  textColor: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= tracks.length) setActiveIndex(0);
  }, [tracks.length, activeIndex]);

  if (tracks.length === 0) return null;

  const ordered = orderTracks(tracks);
  const active = ordered[Math.min(activeIndex, ordered.length - 1)];
  const muted = `${textColor}88`;

  return (
    <div className="w-full text-left">
      {ordered.length > 1 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {ordered.map((track, i) => (
            <button
              key={track.id}
              onClick={() => setActiveIndex(i)}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-all duration-200"
              style={{
                backgroundColor: i === activeIndex ? `${accent}18` : `${accent}08`,
                color: i === activeIndex ? accent : textColor,
                border: `1px solid ${i === activeIndex ? `${accent}40` : `${accent}12`}`,
              }}
            >
              <Play className="h-3.5 w-3.5 flex-shrink-0" style={{ color: i === activeIndex ? accent : muted }} />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium truncate">
                  {track.title ?? (track.provider === "local" ? "Local track" : track.provider)}
                </span>
                {track.artist && (
                  <span className="text-[11px] opacity-60 truncate">{track.artist}</span>
                )}
              </div>
              {track.fullUrl && <Radio className="h-3 w-3 flex-shrink-0" style={{ color: i === activeIndex ? accent : muted }} />}
            </button>
          ))}
        </div>
      )}

      <div
        className="rounded-xl p-3"
        style={{ backgroundColor: `${accent}0d`, border: `1px solid ${accent}20` }}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider opacity-70">
            <Music className="h-3 w-3" />
            {active.provider === "local" ? "Local" : active.provider}
          </span>
          <span className="text-[11px] truncate max-w-[60%]" style={{ color: muted }}>
            {active.artist ? `${active.title ? `${active.title} — ` : ""}${active.artist}` : active.title}
          </span>
        </div>
        <TrackPlayer key={active.id} track={active} accent={accent} started />
        <FullVersionPlayer track={active} accent={accent} />
      </div>
    </div>
  );
}

export function FloatingMusicPlayer({
  tracks,
  accent,
  textColor,
  started,
}: {
  tracks: MusicTrack[];
  accent: string;
  textColor: string;
  started: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= tracks.length) setActiveIndex(0);
  }, [tracks.length, activeIndex]);

  if (tracks.length === 0) return null;

  const ordered = orderTracks(tracks);
  const active = ordered[Math.min(activeIndex, ordered.length - 1)];
  const muted = `${textColor}88`;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div
          className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl p-3 shadow-2xl"
          style={{
            backgroundColor: "rgba(18,18,22,0.96)",
            border: `1px solid ${accent}30`,
            color: textColor,
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider" style={{ color: accent }}>
              <Music className="h-3.5 w-3.5" />
              Music
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] truncate max-w-[9rem]" style={{ color: muted }}>
                {active.artist ? `${active.title ?? ""}${active.title ? " — " : ""}${active.artist}` : active.title}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex-shrink-0"
                title="Minimize"
                aria-label="Minimize music player"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {ordered.length > 1 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {ordered.map((track, i) => (
                <button
                  key={track.id}
                  onClick={() => setActiveIndex(i)}
                  className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-left transition-all duration-200"
                  style={{
                    backgroundColor: i === activeIndex ? `${accent}18` : `${accent}08`,
                    color: i === activeIndex ? accent : textColor,
                    border: `1px solid ${i === activeIndex ? `${accent}40` : `${accent}12`}`,
                  }}
                >
                  <Play className="h-3 w-3 flex-shrink-0" style={{ color: i === activeIndex ? accent : muted }} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-medium truncate">
                      {track.title ?? (track.provider === "local" ? "Local track" : track.provider)}
                    </span>
                    {track.artist && (
                      <span className="text-[10px] opacity-60 truncate">{track.artist}</span>
                    )}
                  </div>
                  {track.fullUrl && <Radio className="h-3 w-3 flex-shrink-0" style={{ color: i === activeIndex ? accent : muted }} />}
                </button>
              ))}
            </div>
          )}

          <TrackPlayer key={active.id} track={active} accent={accent} started={started} />
          <FullVersionPlayer track={active} accent={accent} />
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="relative h-14 w-14 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95"
          style={{
            backgroundColor: accent,
            color: "#fff",
            boxShadow: `0 8px 28px -8px ${accent}aa`,
          }}
          title="Open music player"
          aria-label="Open music player"
        >
          <Music className="h-6 w-6" />
          <span className="absolute top-0.5 right-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
        </button>
      )}
    </div>
  );
}
