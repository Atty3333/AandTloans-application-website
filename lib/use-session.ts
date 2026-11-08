'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase-browser';

export interface SessionState {
  supabase: SupabaseClient;
  session: Session | null;
  /** False until the stored session has been read, so pages don't flash/redirect too early. */
  ready: boolean;
  isAdmin: boolean;
}

export function useSession(): SessionState {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return { supabase, session, ready, isAdmin: session?.user.app_metadata?.role === 'admin' };
}
