import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, ZoomIn, ZoomOut } from "lucide-react";

interface ImageCropperProps {
  file: File;
  aspectRatio?: number;
  targetSize?: number;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
}

export function ImageCropper({
  file,
  aspectRatio = 1,
  targetSize = 256,
  onConfirm,
  onCancel,
}: ImageCropperProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const VIEWPORT = 280;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const vh = VIEWPORT / aspectRatio;
      const base = Math.max(VIEWPORT / img.naturalWidth, vh / img.naturalHeight);
      const w = img.naturalWidth * base;
      const h = img.naturalHeight * base;
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      setImageUrl(url);
      setZoom(1);
      setOffset({ x: (VIEWPORT - w) / 2, y: (vh - h) / 2 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, aspectRatio]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(5, Math.max(1, z - e.deltaY * 0.001)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const { width, height } = naturalSize;

  const viewportHeight = VIEWPORT / aspectRatio;

  const baseScale =
    width > 0 && height > 0
      ? Math.max(VIEWPORT / width, viewportHeight / height)
      : 1;

  const scale = baseScale * zoom;
  const displayWidth = width * scale;
  const displayHeight = height * scale;

  const minOffsetX = VIEWPORT - displayWidth;
  const minOffsetY = viewportHeight - displayHeight;
  const maxOffsetX = 0;
  const maxOffsetY = 0;

  const clampOffset = (x: number, y: number) => ({
    x: Math.min(maxOffsetX, Math.max(minOffsetX, x)),
    y: Math.min(maxOffsetY, Math.max(minOffsetY, y)),
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setOffset(clampOffset(drag.startOffsetX + dx, drag.startOffsetY + dy));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const cropToFile = (): Promise<File> =>
    new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const target = Math.round(targetSize);
      canvas.width = target;
      canvas.height = Math.round(target / aspectRatio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      const img = containerRef.current?.querySelector("img") as HTMLImageElement | null;
      if (!img) return reject(new Error("Image not loaded"));
      const srcX = -offset.x / scale;
      const srcY = -offset.y / scale;
      const srcW = VIEWPORT / scale;
      const srcH = viewportHeight / scale;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
      const name = file.name.replace(/\.[^/.]+$/, "") || "avatar";
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(new File([blob], `${name}-crop.png`, { type: "image/png" }));
          else reject(new Error("Could not encode image"));
        },
        "image/png"
      );
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Position your image</h2>
          <button
            onClick={onCancel}
            className="text-zinc-400 hover:text-white transition-colors"
            aria-label="Cancel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-zinc-400 mb-4">
          Drag to move and scroll to zoom. Pick the part you want to show.
        </p>

        <div className="flex items-center justify-center mb-4">
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-lg bg-black/40 touch-none select-none"
            style={{ width: VIEWPORT, height: viewportHeight }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Crop preview"
                draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{
                  width: displayWidth,
                  height: displayHeight,
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500">
                Loading...
              </div>
            )}
            <div className="absolute inset-0 shadow-[inset_0_0_0_2px_rgba(124,58,237,0.6)] pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <ZoomOut className="h-4 w-4 text-zinc-500 flex-shrink-0" />
          <input
            type="range"
            min={1}
            max={5}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-violet-500"
          />
          <ZoomIn className="h-4 w-4 text-zinc-500 flex-shrink-0" />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button className="flex-1" onClick={async () => onConfirm(await cropToFile())}>
            <Check className="h-4 w-4" />
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
