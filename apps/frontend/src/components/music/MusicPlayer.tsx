import { useState, useEffect, useRef } from "react";
import type { MusicTrack } from "@/lib/api";
import { Play, Music, ExternalLink, Radio, VolumeX, Volume2 } from "lucide-react";

interface YtPlayerInstance {
  playVideo(): void;
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
): void {
  player.playVideo();
  window.setTimeout(() => {
    if (player.getPlayerState() === window.YT?.PlayerState.PLAYING) {
      onUnmuted();
      return;
    }
    player.mute();
    player.playVideo();
    window.setTimeout(() => {
      onMuted();
    }, 300);
  }, 600);
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

function TrackPlayer({ track, accent }: { track: MusicTrack; accent: string }) {
  if (track.provider === "local" && track.filePath) {
    return (
      <audio
        controls
        autoPlay
        playsInline
        preload="auto"
        className="w-full"
        style={{ accentColor: accent }}
        src={track.filePath}
      />
    );
  }

  if (track.provider === "spotify" && track.url) {
    const height = spotifyEmbedHeight(track.url);
    return (
      <div className="flex flex-col gap-2">
        <iframe
          src={withParams(track.url, { autoplay: "true" })}
          width="100%"
          height={height}
          frameBorder="0"
          allow="autoplay; encrypted-media"
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
    return <YouTubePlayer url={track.url} accent={accent} />;
  }

  return null;
}

function YouTubePlayer({ url, accent }: { url: string; accent: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayerInstance | null>(null);
  const [muted, setMuted] = useState(false);

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
          autoplay: "1",
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
            startWithSound(player, () => setMuted(false), () => setMuted(true));
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
      <div className="aspect-video w-full" ref={containerRef} />
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
        <TrackPlayer key={active.id} track={active} accent={accent} />
        <FullVersionPlayer track={active} accent={accent} />
      </div>
    </div>
  );
}
