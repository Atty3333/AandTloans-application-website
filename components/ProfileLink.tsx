'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AvatarImage from '@/components/AvatarImage';
import { useSession } from '@/lib/use-session';

/** Header shortcut to "My profile" showing the user's own picture (or initials). Renders nothing when signed out. */
export default function ProfileLink() {
  const { supabase, session } = useSession();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<{ avatar_path: string | null; full_name: string | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void supabase
      .from('profiles')
      .select('avatar_path, full_name')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setProfile(data as { avatar_path: string | null; full_name: string | null } | null);
      });
    return () => {
      active = false;
    };
  }, [supabase, userId]);

  if (!session) return null;
  return (
    <Link href="/profile" className="btn-secondary !py-1" aria-label="My profile">
      <AvatarImage supabase={supabase} path={profile?.avatar_path} name={profile?.full_name ?? session.user.email} size={22} />
      My profile
    </Link>
  );
}
