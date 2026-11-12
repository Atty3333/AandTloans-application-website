'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENTS_BUCKET } from '@/lib/config';
import { initials } from '@/lib/profile';

interface AvatarImageProps {
  supabase: SupabaseClient;
  path: string | null | undefined;
  name?: string | null;
  size?: number;
  className?: string;
}

/** Round profile picture from the private bucket (signed link), with initials as the fallback. */
export default function AvatarImage({ supabase, path, name, size = 40, className = '' }: AvatarImageProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    if (!path) return;
    void supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [supabase, path]);

  const style = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name ? `${name} profile picture` : 'Profile picture'} style={style} className={`shrink-0 rounded-full object-cover ${className}`} onError={() => setUrl(null)} />
    );
  }
  return (
    <span
      style={{ ...style, fontSize: Math.max(11, size / 2.6) }}
      className={`inline-grid shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-800 ${className}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
