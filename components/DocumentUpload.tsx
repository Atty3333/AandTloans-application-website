'use client';

import React, { useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Upload } from 'lucide-react';
import { ALLOWED_DOCUMENT_TYPES, checkDocumentFile, type DocumentSpec } from '@/lib/documents';

export interface UploadedDocument {
  path: string;
  name: string;
  size: number;
  /** True when this is the document saved on the user's profile rather than a fresh upload. */
  fromProfile?: boolean;
}

interface DocumentUploadProps {
  spec: DocumentSpec;
  value: UploadedDocument | undefined;
  error?: string;
  /** Resolves with the storage path once the file is uploaded. */
  onUpload: (file: File) => Promise<string>;
  onChange: (doc: UploadedDocument | undefined) => void;
  onBusyChange: (busy: boolean) => void;
  /** Mark the document as optional (profile page): hides the red asterisk. */
  optional?: boolean;
  /** The document saved on the profile. When it is not the selected value, a "Use saved" button is offered. */
  savedDoc?: UploadedDocument;
  /** Show a View button for the current file. */
  onView?: (path: string) => void;
  /** Show a Remove button (profile page). */
  onClear?: () => void;
}

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function DocumentUpload({ spec, value, error, onUpload, onChange, onBusyChange, optional = false, savedDoc, onView, onClear }: DocumentUploadProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    const problem = checkDocumentFile(file);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setBusy(true);
    onBusyChange(true);
    try {
      const path = await onUpload(file);
      onChange({ path, name: file.name, size: file.size });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
      onBusyChange(false);
      if (input.current) input.current.value = '';
    }
  };

  const shownError = localError ?? error;

  return (
    <div
      id={`field-${spec.kind}`}
      tabIndex={-1}
      className={`rounded-lg border p-3 ${shownError ? 'border-red-400 bg-red-50' : value ? 'border-green-300 bg-green-50/50' : 'border-indigo-200 bg-slate-50'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="label-caps">
            {spec.label} {!optional && <span aria-hidden="true" className="text-red-500">*</span>}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{spec.hint}</p>
          {value && !busy && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate">{value.name}</span>
              <span className="shrink-0 text-slate-500">· {formatSize(value.size)}</span>
              {value.fromProfile && <span className="shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-800">From my profile</span>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {value && onView && (
            <button type="button" onClick={() => onView(value.path)} disabled={busy} className="btn-secondary">
              View
            </button>
          )}
          {savedDoc && value?.path !== savedDoc.path && !busy && (
            <button type="button" onClick={() => onChange({ ...savedDoc, fromProfile: true })} className="btn-secondary">
              Use saved
            </button>
          )}
          {value && onClear && !busy && (
            <button type="button" onClick={onClear} className="btn-secondary">
              Remove
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept={ALLOWED_DOCUMENT_TYPES.join(',')}
            className="sr-only"
            id={`file-${spec.kind}`}
            onChange={(e) => void handleFile(e.target.files?.[0])}
            disabled={busy}
          />
          <label htmlFor={`file-${spec.kind}`} className={`btn-secondary cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden="true" /> {value ? 'Replace' : 'Choose file'}
              </>
            )}
          </label>
        </div>
      </div>
      {shownError && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {shownError}
        </p>
      )}
    </div>
  );
}
