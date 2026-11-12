'use client';

import { useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import AvatarImage from '@/components/AvatarImage';
import { IMAGE_TYPES, checkDocumentFile, isImageType } from '@/lib/documents';
import { uploadDocument } from '@/lib/upload-client';

interface AvatarUploadProps {
  supabase: SupabaseClient;
  path: string | null;
  name: string | null;
  error?: string;
  onChange: (path: string | null) => void;
  onBusyChange: (busy: boolean) => void;
}

export default function AvatarUpload({ supabase, path, name, error, onChange, onBusyChange }: AvatarUploadProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    const problem = checkDocumentFile(file) ?? (isImageType(file.type) ? null : 'Use a JPG, PNG or WebP image.');
    if (problem) {
      setLocalError(problem);
      return;
    }
    setBusy(true);
    onBusyChange(true);
    try {
      onChange(await uploadDocument(supabase, 'avatar', file));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
      onBusyChange(false);
      if (input.current) input.current.value = '';
    }
  };

  const shown = localError ?? error;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <AvatarImage supabase={supabase} path={path} name={name} size={88} />
      <div className="space-y-2">
        <p className="label-caps">Profile picture</p>
        <div className="flex flex-wrap gap-2">
          <input ref={input} id="file-avatar" type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" disabled={busy} onChange={(e) => void handleFile(e.target.files?.[0])} />
          <label htmlFor="file-avatar" className={`btn-secondary cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Uploading…' : path ? 'Change picture' : 'Add picture'}
          </label>
          {path && !busy && (
            <button type="button" onClick={() => onChange(null)} className="btn-secondary">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">JPG, PNG or WebP, up to 10 MB. Click Save to keep the change.</p>
        {shown && (
          <p role="alert" className="text-xs text-red-600">
            {shown}
          </p>
        )}
      </div>
    </div>
  );
}
