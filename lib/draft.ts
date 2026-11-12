/**
 * Draft autosave for the long application form, so a dropped connection or accidental refresh does not lose the applicant's work.
 *
 * Privacy: only low-sensitivity text fields are kept, in this browser's localStorage. Omang / ID numbers, income, next-of-kin
 * IDs, the signature and documents are NEVER stored. The draft is deleted on submit and expires after DRAFT_TTL_MS.
 */
export const DRAFT_KEY = 'aandtee:application-draft:v1';
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const DRAFT_FIELDS = [
  'fullName',
  'phone',
  'whatsappNumber',
  'address',
  'institution',
  'loanAmount',
  'loanPurpose',
  'guarantorName',
  'guarantorPhone',
  'kinName',
  'kinRelationship',
  'kinPhone',
  'kinAltPhone',
  'kinAddress',
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];
export type Draft = Partial<Record<DraftField, string>>;

interface Stored {
  savedAt: number;
  userId: string;
  values: Draft;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const browserStore = (): Store | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** Keeps only whitelisted, non-empty string fields. */
export function pickDraft(values: Record<string, unknown>): Draft {
  const out: Draft = {};
  for (const f of DRAFT_FIELDS) {
    const v = values[f];
    if (typeof v === 'string' && v.trim() !== '') out[f] = v.slice(0, 500);
  }
  return out;
}

export function saveDraft(userId: string, values: Record<string, unknown>, now = Date.now(), store: Store | null = browserStore()): void {
  if (!store) return;
  try {
    const picked = pickDraft(values);
    if (Object.keys(picked).length === 0) store.removeItem(DRAFT_KEY);
    else store.setItem(DRAFT_KEY, JSON.stringify({ savedAt: now, userId, values: picked } satisfies Stored));
  } catch {
    /* storage full or blocked: drafts are best-effort */
  }
}

/** The saved draft for this user, or null when missing, expired, malformed or from another account. */
export function loadDraft(userId: string, now = Date.now(), store: Store | null = browserStore()): { values: Draft; savedAt: number } | null {
  if (!store) return null;
  try {
    const raw = store.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (!parsed || parsed.userId !== userId || typeof parsed.savedAt !== 'number' || now - parsed.savedAt > DRAFT_TTL_MS) {
      store.removeItem(DRAFT_KEY);
      return null;
    }
    const values = pickDraft((parsed.values ?? {}) as Record<string, unknown>);
    return Object.keys(values).length ? { values, savedAt: parsed.savedAt } : null;
  } catch {
    return null;
  }
}

export function clearDraft(store: Store | null = browserStore()): void {
  try {
    store?.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
