'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import ReactSignatureCanvas from 'react-signature-canvas';
import { Eraser } from 'lucide-react';

interface SignatureCanvasProps {
  onSignatureChange: (dataUrl: string | null) => void;
  error?: string;
}

const HEIGHT = 160;

/** Crop transparent padding so the signature fills its slot in the PDF. */
function trimToDataUrl(source: HTMLCanvasElement): string | null {
  const ctx = source.getContext('2d');
  if (!ctx) return null;
  const { width, height } = source;
  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')?.drawImage(source, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

export default function SignatureCanvas({ onSignatureChange, error }: SignatureCanvasProps) {
  const sig = useRef<ReactSignatureCanvas | null>(null);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const lastWidth = useRef(0);

  const emit = useCallback(() => {
    const pad = sig.current;
    if (!pad || pad.isEmpty()) {
      onSignatureChange(null);
      return;
    }
    onSignatureChange(trimToDataUrl(pad.getCanvas()));
  }, [onSignatureChange]);

  // Keep the backing bitmap in sync with CSS size and device pixel ratio so strokes land under the pointer.
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;

    const resize = () => {
      const pad = sig.current;
      const canvas = pad?.getCanvas();
      if (!pad || !canvas) return;
      const width = Math.floor(el.clientWidth);
      if (width === 0 || width === lastWidth.current) return;
      lastWidth.current = width;

      const saved = pad.isEmpty() ? null : pad.toData();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = width * ratio;
      canvas.height = HEIGHT * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${HEIGHT}px`;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
      if (saved) {
        pad.fromData(saved);
        emit();
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [emit]);

  const handleClear = () => {
    sig.current?.clear();
    onSignatureChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span id="signature-label" className="label-caps">
          Applicant digital signature <span className="text-red-500">*</span>
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center text-xs text-red-600 hover:text-red-800 font-medium"
        >
          <Eraser className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
          Clear signature
        </button>
      </div>

      <div
        ref={wrapper}
        id="field-signatureDataUrl"
        tabIndex={-1}
        aria-labelledby="signature-label"
        className={`overflow-hidden rounded-lg border-2 border-dashed bg-white ${
          error ? 'border-red-500' : 'border-brand-200'
        }`}
      >
        <ReactSignatureCanvas
          ref={sig}
          canvasProps={{ className: 'cursor-crosshair touch-none block', style: { height: HEIGHT } }}
          onEnd={emit}
          penColor="#2e1065"
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : (
        <p className="text-xs text-gray-500">Draw your signature above using your finger, mouse or stylus.</p>
      )}
    </div>
  );
}
