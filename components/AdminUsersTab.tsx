'use client';

import { shortRef } from '@/lib/status';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronDown, FileText, Loader2, Pencil, Search, X } from 'lucide-react';
import AdminApplicationPanel from '@/components/AdminApplicationPanel';
import AvatarImage from '@/components/AvatarImage';
import ProfileFields from '@/components/ProfileFields';
import StatusBadge from '@/components/StatusBadge';
import { formatDateTime, type LoanRow } from '@/lib/applications';
import { accessToken, openPrivateFile } from '@/lib/client-files';
import { CONFIDENTIAL_LABEL, formatBwp, type LoanStatus } from '@/lib/config';
import { DOCUMENT_LABELS } from '@/lib/documents';
import { parseProofs } from '@/lib/proofs';
import {
  PROFILE_COLUMN_LABELS,
  PROFILE_FIELD_TO_COLUMN,
  profileRowToValues,
  type ProfileColumn,
  type ProfileField,
  type ProfileRow,
  type ProfileValues,
} from '@/lib/profile';
import { fieldErrors, profileDetailsSchema } from '@/lib/validation';

interface Props {
  supabase: SupabaseClient;
  onMessage: (message: string | null) => void;
  /** Same confirm + update as the Applications tab; resolves with the updated row, or null when cancelled / failed. */
  onStatusChange: (row: LoanRow, status: LoanStatus) => Promise<LoanRow | null>;
}

interface UserGroup {
  key: string;
  userId: string | null;
  profile: ProfileRow | null;
  apps: LoanRow[];
  name: string;
  email: string;
  phone: string;
  lastActivity: string;
}

interface ProfileEdit {
  id: string;
  edited_at: string;
  edited_by_email: string | null;
  changes: Partial<Record<ProfileColumn, { from: unknown; to: unknown }>>;
}

const SEARCH_COLUMNS = ['full_name', 'id_number', 'phone_number', 'whatsapp_number', 'email'] as const;
const MAX_USERS = 40;

/** Keep letters, digits, spaces and the characters found in names, emails and phone numbers. Everything else could break the filter. */
const sanitize = (q: string): string => q.replace(/[^\p{L}\p{N} @.+_-]/gu, '').trim().slice(0, 60);

async function searchUsers(supabase: SupabaseClient, rawTerm: string): Promise<UserGroup[]> {
  const term = sanitize(rawTerm);
  const pattern = `"%${term}%"`;
  const orFilter = SEARCH_COLUMNS.map((c) => `${c}.ilike.${pattern}`).join(',');

  let profilesQ = supabase.from('profiles').select('*').order('updated_at', { ascending: false }).limit(MAX_USERS);
  let appsQ = supabase.from('loan_applications').select('*').order('created_at', { ascending: false }).limit(MAX_USERS);
  if (term) {
    profilesQ = profilesQ.or(orFilter);
    appsQ = appsQ.or(orFilter);
  }
  const refPrefix = /^[0-9a-f]{8}$/i.test(term) ? term.toLowerCase() : null;
  const refQ = refPrefix
    ? supabase
        .from('loan_applications')
        .select('*')
        .gte('id', `${refPrefix}-0000-0000-0000-000000000000`)
        .lte('id', `${refPrefix}-ffff-ffff-ffff-ffffffffffff`)
        .limit(10)
    : null;

  const [profilesRes, appsRes, refRes] = await Promise.all([profilesQ, appsQ, refQ ?? Promise.resolve({ data: [], error: null })]);
  if (profilesRes.error) throw profilesRes.error;
  if (appsRes.error) throw appsRes.error;
  if (refRes.error) throw refRes.error;

  const firstApps = [...((appsRes.data ?? []) as LoanRow[]), ...((refRes.data ?? []) as LoanRow[])];
  const ids = [...new Set([...(profilesRes.data ?? []).map((p: ProfileRow) => p.user_id), ...firstApps.map((a) => a.user_id).filter((v): v is string => !!v)])].slice(0, MAX_USERS);

  // Everything we know about each matched person: all their applications and their profile.
  const [allApps, allProfiles] = ids.length
    ? await Promise.all([
        supabase.from('loan_applications').select('*').in('user_id', ids).order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').in('user_id', ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (allApps.error) throw allApps.error;
  if (allProfiles.error) throw allProfiles.error;

  const profiles = new Map((allProfiles.data as ProfileRow[]).map((p) => [p.user_id, p]));
  const groups = new Map<string, UserGroup>();
  const touch = (key: string, userId: string | null): UserGroup => {
    let g = groups.get(key);
    if (!g) {
      g = { key, userId, profile: userId ? (profiles.get(userId) ?? null) : null, apps: [], name: '', email: '', phone: '', lastActivity: '' };
      groups.set(key, g);
    }
    return g;
  };
  for (const id of ids) touch(id, id);
  for (const a of allApps.data as LoanRow[]) touch(a.user_id ?? `omang:${a.id_number}`, a.user_id).apps.push(a);
  // Applications whose account no longer exists: group by Omang so they are still findable.
  for (const a of firstApps.filter((x) => !x.user_id)) {
    const g = touch(`omang:${a.id_number}`, null);
    if (!g.apps.some((x) => x.id === a.id)) g.apps.push(a);
  }

  const out = [...groups.values()].map((g) => {
    const latest = g.apps[0];
    g.name = String(g.profile?.full_name || latest?.full_name || g.profile?.email || 'Unnamed user');
    g.email = String(g.profile?.email || latest?.email || '');
    g.phone = String(g.profile?.phone_number || latest?.phone_number || '');
    g.lastActivity = [g.profile?.updated_at ?? '', latest?.created_at ?? ''].sort().pop() ?? '';
    return g;
  });
  return out.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)).slice(0, MAX_USERS);
}

export default function AdminUsersTab({ supabase, onMessage, onStatusChange }: Props) {
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<UserGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = useCallback(
    async (term: string) => {
      setBusy(true);
      setError(null);
      try {
        setGroups(await searchUsers(supabase, term));
      } catch (err) {
        console.error('[admin] user search failed', err);
        setError('Search failed. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    void run('');
  }, [run]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setOpen(null);
    void run(query);
  };

  const patchGroup = (key: string, change: (g: UserGroup) => UserGroup) => setGroups((prev) => prev?.map((g) => (g.key === key ? change(g) : g)) ?? prev);

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap gap-2" role="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a person: name, Omang, phone, WhatsApp, email or application reference"
          className="input-box !mt-0 min-w-[220px] flex-1"
          aria-label="Search users"
        />
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />} Search
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {groups && !busy && groups.length === 0 && <p className="text-sm text-slate-500">No users found.</p>}
      {groups && groups.length >= MAX_USERS && <p className="text-xs text-slate-500">Showing the {MAX_USERS} most recent matches. Narrow the search to see others.</p>}

      <ul className="space-y-2">
        {groups?.map((g) => (
          <li key={g.key} className="paper">
            <button onClick={() => setOpen(open === g.key ? null : g.key)} aria-expanded={open === g.key} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left">
              <span className="flex items-center gap-3">
                <AvatarImage supabase={supabase} path={g.profile?.avatar_path} name={g.name} size={40} />
                <span>
                  <span className="block font-semibold text-slate-900">{g.name}</span>
                  <span className="block text-xs text-slate-500">
                    {[g.email, g.phone].filter(Boolean).join(' · ') || 'No contact details'}
                    {!g.userId && ' · account removed'}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-600">
                {g.apps.length} application{g.apps.length === 1 ? '' : 's'}
                {g.apps[0] && <StatusBadge status={g.apps[0].status} plain />}
                <ChevronDown className={`h-4 w-4 transition ${open === g.key ? 'rotate-180' : ''}`} aria-hidden="true" />
              </span>
            </button>
            {open === g.key && (
              <UserDetail
                group={g}
                supabase={supabase}
                onMessage={onMessage}
                onProfileChange={(profile) => patchGroup(g.key, (x) => ({ ...x, profile }))}
                onAppChange={(next) => patchGroup(g.key, (x) => ({ ...x, apps: x.apps.map((a) => (a.id === next.id ? next : a)) }))}
                onStatusChange={onStatusChange}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserDetail({
  group,
  supabase,
  onMessage,
  onProfileChange,
  onAppChange,
  onStatusChange,
}: {
  group: UserGroup;
  supabase: SupabaseClient;
  onMessage: (m: string | null) => void;
  onProfileChange: (p: ProfileRow) => void;
  onAppChange: (row: LoanRow) => void;
  onStatusChange: Props['onStatusChange'];
}) {
  const { profile } = group;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<ProfileValues>(() => profileRowToValues(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openApp, setOpenApp] = useState<string | null>(null);
  const [edits, setEdits] = useState<ProfileEdit[]>([]);

  const loadEdits = useCallback(async () => {
    if (!group.userId) return;
    const { data } = await supabase.from('profile_edits').select('id, edited_at, edited_by_email, changes').eq('user_id', group.userId).order('edited_at', { ascending: false }).limit(10);
    setEdits((data ?? []) as ProfileEdit[]);
  }, [supabase, group.userId]);

  useEffect(() => {
    void loadEdits();
  }, [loadEdits]);

  const viewValues = useMemo(() => profileRowToValues(profile), [profile]);

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !group.userId) return;
    setFormError(null);
    const parsed = profileDetailsSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFormError('Please correct the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const token = await accessToken(supabase);
      if (!token) {
        setFormError('Your session has expired. Please sign in again.');
        return;
      }
      const res = await fetch(`/api/admin/profiles/${group.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; changed?: boolean; profile?: ProfileRow; error?: string; fieldErrors?: Record<string, string> };
      if (!res.ok || !json.success) {
        if (json.fieldErrors) setErrors(json.fieldErrors);
        setFormError(json.error ?? 'Could not save the changes. Please try again.');
        return;
      }
      if (json.profile) onProfileChange(json.profile);
      onMessage(json.changed ? 'Profile changes saved.' : 'No changes to save.');
      setEditing(false);
      void loadEdits();
    } catch {
      setFormError('Network error. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const view = async (path: string) => {
    const problem = await openPrivateFile(supabase, path);
    if (problem) onMessage(`Could not open the file: ${problem}`);
  };

  const rows = (Object.entries(PROFILE_FIELD_TO_COLUMN) as [ProfileField, ProfileColumn][]).map(
    ([field, column]): [string, string] => [PROFILE_COLUMN_LABELS[column], column === 'monthly_income' && profile?.is_staff ? CONFIDENTIAL_LABEL : viewValues[field] || '—'],
  );

  return (
    <div className="space-y-6 border-t border-brand-100 p-4 text-sm">
      {/* ---------- Profile ---------- */}
      <section className="space-y-3">
        <h3 className="section-title !mb-0">Profile</h3>
        {!profile ? (
          <p className="text-slate-500">This person has not opened or filled in their profile yet. Their application details are below.</p>
        ) : editing ? (
          <form onSubmit={save} noValidate className="space-y-4">
            <p className="notice">Editing personal details. Saved loan documents and the profile picture can only be changed by the user. Every edit is recorded.</p>
            <ProfileFields values={values} errors={errors} onChange={handleChange} confidentialIncome={Boolean(profile.is_staff)} />
            {formError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" onClick={() => setEditing(false)} disabled={saving} className="btn-secondary">
                <X className="h-4 w-4" aria-hidden="true" /> Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="label-caps">Email</dt>
                <dd className="break-words text-slate-900">{profile.email ?? '—'}</dd>
              </div>
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="label-caps">{label}</dt>
                  <dd className="break-words text-slate-900">{value}</dd>
                </div>
              ))}
              {profile.last_edited_at && (
                <div>
                  <dt className="label-caps">Last edited by an admin</dt>
                  <dd className="text-slate-900">{formatDateTime(profile.last_edited_at)}</dd>
                </div>
              )}
            </dl>
            <button
              type="button"
              onClick={() => {
                setValues(profileRowToValues(profile));
                setErrors({});
                setFormError(null);
                setEditing(true);
              }}
              className="btn-secondary"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit personal details
            </button>
          </>
        )}
      </section>

      {/* ---------- Saved documents (view only) ---------- */}
      {profile && (
        <section className="space-y-2">
          <h3 className="section-title">Saved loan documents</h3>
          {(profile.documents ?? []).length === 0 ? (
            <p className="text-slate-500">No documents saved on the profile.</p>
          ) : (
            <ul className="space-y-2">
              {(profile.documents ?? []).map((d) => (
                <li key={d.kind} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-slate-50 px-3 py-2">
                  <span className="font-medium text-slate-900">{DOCUMENT_LABELS[d.kind] ?? d.kind}</span>
                  <button type="button" onClick={() => void view(d.path)} className="btn-secondary !py-1">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" /> View
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------- Application history ---------- */}
      <section className="space-y-2">
        <h3 className="section-title">Loan application history</h3>
        {group.apps.length === 0 ? (
          <p className="text-slate-500">No loan applications.</p>
        ) : (
          <ul className="space-y-2">
            {group.apps.map((a) => (
              <li key={a.id} className="rounded-lg border border-brand-100">
                <button onClick={() => setOpenApp(openApp === a.id ? null : a.id)} aria-expanded={openApp === a.id} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left">
                  <span>
                    <span className="font-semibold text-slate-900">{formatBwp(Number(a.loan_amount_requested))}</span>
                    <span className="text-slate-500"> · {a.loan_purpose}</span>
                    <span className="block text-xs text-slate-500">
                      {shortRef(a.id)} · {formatDateTime(a.created_at)}
                      {a.status === 'APPROVED' ? ` · ${parseProofs(a.proof_of_payments).length} proof(s)` : ''}
                    </span>
                  </span>
                  <StatusBadge status={a.status} plain />
                </button>
                {openApp === a.id && (
                  <AdminApplicationPanel
                    row={a}
                    supabase={supabase}
                    onRowChange={onAppChange}
                    onStatusChange={async (row, status) => {
                      const next = await onStatusChange(row, status);
                      if (next) onAppChange(next);
                    }}
                    onMessage={onMessage}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Profile edit history ---------- */}
      {edits.length > 0 && (
        <section className="space-y-2">
          <h3 className="section-title">Profile edit history</h3>
          <ul className="space-y-2 text-xs text-slate-700">
            {edits.map((h) => (
              <li key={h.id} className="rounded-lg border border-brand-100 bg-white p-2">
                <p className="font-semibold text-brand-900">
                  {formatDateTime(h.edited_at)} · {h.edited_by_email ?? 'admin'}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {(Object.entries(h.changes) as [ProfileColumn, { from: unknown; to: unknown }][]).map(([column, c]) => (
                    <li key={column}>
                      {PROFILE_COLUMN_LABELS[column] ?? column}: <span className="text-slate-500 line-through">{String(c.from ?? '—')}</span> →{' '}
                      <span className="font-medium">{String(c.to ?? '—')}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
