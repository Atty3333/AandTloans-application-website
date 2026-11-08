'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import Script from 'next/script';

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string | null) => void;
  /** Increment to force a fresh challenge (tokens are single-use). */
  resetKey: number;
}

export default function TurnstileWidget({ siteKey, onToken, resetKey }: TurnstileWidgetProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  const mount = useCallback(() => {
    if (!container.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      callback: (token) => onToken(token),
      'expired-callback': () => onToken(null),
      'error-callback': () => onToken(null),
    });
  }, [siteKey, onToken]);

  useEffect(() => {
    mount(); // script may already be loaded
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [mount]);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current && window.turnstile) {
      onToken(null);
      window.turnstile.reset(widgetId.current);
    }
  }, [resetKey, onToken]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={mount}
      />
      <div ref={container} />
    </>
  );
}
