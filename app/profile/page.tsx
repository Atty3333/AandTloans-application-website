'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, LogOut, Save, ShieldCheck } from 'lucide-react';
import AvatarUpload from '@/components/AvatarUpload';
import { DocFooter, DocHeader, SiteHeader } from '@/components/BrandHeader';
import DocumentUpload, { type UploadedDocument } from '@/components/DocumentUpload';
import ProfileFields from '@/components/ProfileFields';
import { accessToken, openPrivateFile } from '@/lib/client-files';
import { DOCUMENT_KINDS, DOCUMENT_SPECS, fileNameFromPath, type DocumentKind } from '@/lib/documents';
import { profileRowToValues, type ProfileRow, type ProfileValues } from '@/lib/profile';
import { uploadDocument } from '@/lib/upload-client';
import { useSession } from '@/lib/use-session';
import { profileUpdateSchema, fieldErrors } from '@/lib/validation';

type Errors = Record<string, string>;
type DocState = Partial<Record<DocumentKind, UploadedDocument | null>>;

const docsFromRow = (row: ProfileRow): DocState =>
  Object.fromEntries((row.documents ?? []).map((d) => [d.kind, { path: d.path, name: fileNameFromPath(d.path), size: d.size }])) as DocState;

/** My profile: personal details, picture, and the loan documents saved once and reused on every application. */
export default function ProfilePage() {
  const router = useRouter();
  const { supabase, session, ready, isAdmin } = useSession();
  const [values, setValues] = useState<ProfileValues | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocState>({});
  const [saved, setSaved] = useState<{ avatar: string | null; docs: DocState }>({ avatar: null, docs: {} });
  const [errors, setErrors] = useState<Errors>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploads, setUploads] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ready && !session) router.replace('/');
  }, [ready, session, router]);

  const apply = useCallback((row: ProfileRow) => {
    setValues(profileRowToValues(row));
    setAvatar(row.avatar_path);
    const d = docsFromRow(row);
    setDocs(d);
    setSaved({ avatar: row.avatar_path, docs: d });
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void (async () => {
      const token = await accessToken(supabase);
      if (!token) return;
      try {
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } });
        const json = (await res.json().catch(() => ({}))) as { profile?: ProfileRow; error?: string };
        if (!active) return;
        if (!res.ok || !json.profile) setLoadError(json.error ?? 'Could not load your profile.');
        else apply(json.profile);
      } catch {
        if (active) setLoadError('Network error. Check your connection and refresh the page.');
      }
    })();
    return () => {
      active = false;
    };
  }, [session, supabase, apply]);

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => (prev ? { ...prev, [name]: value } : prev));
    setNotice(null);
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const view = async (path: string) => {
    const problem = await openPrivateFile(supabase, path);
    if (problem) setFormError(problem);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !values) return;
    setFormError(null);
    setNotice(null);
    if (uploads > 0) {
      setFormError('Please wait for your uploads to finish.');
      return;
    }

    // Only send what changed: null clears a file, a path sets it, an omitted key leaves it alone.
    const documents: Partial<Record<DocumentKind, string | null>> = {};
    if (!isAdmin) {
      for (const kind of DOCUMENT_KINDS) {
        const now = docs[kind]?.path ?? null;
        if (now !== (saved.docs[kind]?.path ?? null)) documents[kind] = now;
      }
    }
    // Admin accounts: income is confidential and never sent or stored.
    const { income: _income, ...valuesWithoutIncome } = values;
    const payload = { ...(isAdmin ? valuesWithoutIncome : values), ...(avatar !== saved.avatar ? { avatarPath: avatar } : {}), ...(Object.keys(documents).length ? { documents } : {}) };

    const parsed = profileUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFormError('Please correct the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      const token = await accessToken(supabase);
      if (!token) {
        setFormError('Your session has expired. Please sign out and sign in again.');
        return;
      }
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { profile?: ProfileRow; error?: string; fieldErrors?: Errors };
      if (!res.ok || !json.profile) {
        if (json.fieldErrors) setErrors(json.fieldErrors);
        setFormError(json.error ?? 'Could not save your profile. Please try again.');
        return;
      }
      setErrors({});
      apply(json.profile);
      setNotice('Profile saved.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setFormError('Network error. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!ready || !session) {
    return (
      <main className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </main>
    );
  }

  return (
    <main id="main" className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <SiteHeader subtitle={session.user.email ?? undefined} href={isAdmin ? '/admin' : '/dashboard'}>
          <Link href={isAdmin ? '/admin' : '/dashboard'} className="btn-secondary">
            {isAdmin ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />} {isAdmin ? 'Admin' : 'My applications'}
          </Link>
          <button onClick={() => void supabase.auth.signOut()} className="btn-secondary">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
          </button>
        </SiteHeader>

        <form onSubmit={save} noValidate className="space-y-6">
          <section className="paper p-5 sm:p-7" aria-labelledby="profile-title">
            <DocHeader lines={['MY PROFILE']} />
            <h1 id="profile-title" className="sr-only">
              My profile
            </h1>

            {loadError && (
              <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {loadError}
              </p>
            )}
            {!values && !loadError ? (
              <div className="flex justify-center py-8" role="status" aria-label="Loading">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : (
              values && (
                <div className="space-y-6">
                  {isAdmin ? (
                    <p className="notice">
                      <span className="font-bold text-brand-900">Admin profile.</span> You can keep your own details up to date here. Your monthly allowance / income is
                      confidential and is not collected.
                    </p>
                  ) : (
                    <p className="notice">
                      <span className="font-bold text-brand-900">Save once, apply faster.</span> Your details and documents are stored privately and offered
                      automatically when you apply for a loan. You can still upload different files on any application.
                    </p>
                  )}
                  <div>
                    <p className="label-caps mb-1">Email</p>
                    <p className="text-sm text-slate-800">{session.user.email}</p>
                  </div>
                  <AvatarUpload
                    supabase={supabase}
                    path={avatar}
                    name={values.fullName || session.user.email || null}
                    error={errors.avatarPath}
                    onChange={(p) => {
                      setAvatar(p);
                      setNotice(null);
                    }}
                    onBusyChange={(busy) => setUploads((n) => Math.max(0, n + (busy ? 1 : -1)))}
                  />
                  <ProfileFields values={values} errors={errors} onChange={handleChange} confidentialIncome={isAdmin} />
                </div>
              )
            )}
            <DocFooter label="My Profile" page={1} pages={isAdmin ? 1 : 2} />
          </section>

          {!isAdmin && values && (
            <section className="paper p-5 sm:p-7" aria-labelledby="profile-docs">
              <DocHeader lines={['MY LOAN DOCUMENTS']} />
              <h2 id="profile-docs" className="sr-only">
                My loan documents
              </h2>
              <p className="notice mb-5">
                <span className="font-bold text-brand-900">Notice:</span> These are the five documents every loan application needs. Upload them here once
                (JPG, PNG, WebP or PDF, up to 10 MB each) and click Save. Admins can see them but cannot change them.
              </p>
              <div className="space-y-3">
                {DOCUMENT_SPECS.map((spec) => (
                  <DocumentUpload
                    key={spec.kind}
                    spec={spec}
                    optional
                    value={docs[spec.kind] ?? undefined}
                    error={errors[spec.kind]}
                    onUpload={(file) => uploadDocument(supabase, spec.kind, file)}
                    onChange={(doc) => {
                      setDocs((prev) => ({ ...prev, [spec.kind]: doc ?? null }));
                      setNotice(null);
                    }}
                    onClear={() => setDocs((prev) => ({ ...prev, [spec.kind]: null }))}
                    onView={(path) => void view(path)}
                    onBusyChange={(busy) => setUploads((n) => Math.max(0, n + (busy ? 1 : -1)))}
                  />
                ))}
              </div>
              <DocFooter label="My Loan Documents" page={2} pages={2} />
            </section>
          )}

          {formError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </p>
          )}
          {notice && (
            <p role="status" className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {notice}
            </p>
          )}
          <button type="submit" disabled={saving || uploads > 0 || !values} className="btn-primary w-full py-3 sm:w-auto">
            {saving || uploads > 0 ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {saving ? 'Saving…' : uploads > 0 ? 'Uploading…' : 'Save profile'}
          </button>
        </form>
      </div>
    </main>
  );
}
