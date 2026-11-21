import { useEffect, useRef, useState } from 'react';
import type { ImagePayload } from '../../core/types.js';
import { toRgba } from '../pixels.js';

export interface ImageViewerProps {
  payload: ImagePayload;
  formatId: string;
  fileName: string;
}

const frames: Record<string, { className: string; title: (f: string) => string }> = {
  macpaint: { className: 'frame-mac', title: (f) => f },
  pcx: { className: 'frame-dos', title: (f) => `PC Paintbrush - ${f.toUpperCase()}` },
  ilbm: { className: 'frame-amiga', title: (f) => `Deluxe Paint: ${f}` },
};

/** A decoded picture on a pixel-perfect canvas with integer zoom, inside a frame from its era. */
export function ImageViewer({ payload, formatId, fileName }: ImageViewerProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(() => (payload.width <= 400 ? 2 : 1));
  const frame = frames[formatId] ?? { className: 'frame-dos', title: (f: string) => f };

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const rgba = toRgba(payload);
    const data = new ImageData(payload.width, payload.height);
    data.data.set(rgba);
    ctx.putImageData(data, 0, 0);
  }, [payload]);

  const colours = payload.bitsPerPixel === 24 ? '16.7 million colours' : `${payload.palette?.length ?? 2} colours`;

  return (
    <div className="viewer-image">
      <div className="viewer-tools" role="group" aria-label="Zoom">
        {[1, 2, 3, 4].map((z) => (
          <button key={z} type="button" className="btn" aria-pressed={zoom === z} onClick={() => setZoom(z)}>
            {z}&times;
          </button>
        ))}
        <span className="chip">{payload.width} &times; {payload.height}</span>
        <span className="chip">{colours}</span>
      </div>
      <div className={`frame ${frame.className}`}>
        <div className="frame-title" aria-hidden="true">
          <span className="frame-gadget" />
          <span className="frame-name">{frame.title(fileName)}</span>
        </div>
        <div className="frame-body">
          <canvas
            ref={canvas}
            width={payload.width}
            height={payload.height}
            style={{ width: payload.width * zoom, height: payload.height * zoom }}
            role="img"
            aria-label={`${fileName}: ${payload.width} by ${payload.height} pixel picture, ${colours}`}
          />
        </div>
      </div>
      {payload.palette && payload.bitsPerPixel !== 1 && (
        <div className="palette" aria-label="Palette">
          {payload.palette.slice(0, 256).map((c, i) => (
            <span key={i} title={`${i}: rgb(${c[0]}, ${c[1]}, ${c[2]})`} style={{ background: `rgb(${c[0]},${c[1]},${c[2]})` }} />
          ))}
        </div>
      )}
    </div>
  );
}
