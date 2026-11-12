import type { StoredDocument } from './documents';

/** Profile form field -> database column. A subset of the application fields (nothing loan-specific). */
export const PROFILE_FIELD_TO_COLUMN = {
  fullName: 'full_name',
  dob: 'date_of_birth',
  idNumber: 'id_number',
  phone: 'phone_number',
  whatsappNumber: 'whatsapp_number',
  address: 'address',
  institution: 'institution',
  income: 'monthly_income',
  kinName: 'kin_full_name',
  kinRelationship: 'kin_relationship',
  kinId: 'kin_id_number',
  kinPhone: 'kin_phone',
  kinAltPhone: 'kin_alt_phone',
  kinAddress: 'kin_address',
} as const satisfies Record<string, string>;

export type ProfileField = keyof typeof PROFILE_FIELD_TO_COLUMN;
export type ProfileColumn = (typeof PROFILE_FIELD_TO_COLUMN)[ProfileField];
export type ProfileValues = Record<ProfileField, string>;
export type ProfileColumns = Record<ProfileColumn, string | number | null>;
export type ProfileInputLike = Partial<Record<ProfileField, string | number | undefined>>;

export const PROFILE_COLUMN_LABELS: Record<ProfileColumn, string> = {
  full_name: 'Full name',
  date_of_birth: 'Date of birth',
  id_number: 'Omang / ID number',
  phone_number: 'Phone number (Pay2Cell)',
  whatsapp_number: 'WhatsApp number',
  address: 'Residential address',
  institution: 'Institution / employer',
  monthly_income: 'Monthly allowance / income',
  kin_full_name: 'Next of kin name',
  kin_relationship: 'Relationship to applicant',
  kin_id_number: 'Next of kin ID / Omang',
  kin_phone: 'Next of kin mobile',
  kin_alt_phone: 'Next of kin alternative number',
  kin_address: 'Next of kin address',
};

export const PROFILE_FIELDS = Object.keys(PROFILE_FIELD_TO_COLUMN) as ProfileField[];
const ENTRIES = Object.entries(PROFILE_FIELD_TO_COLUMN) as [ProfileField, ProfileColumn][];

/** A row of public.profiles as the pages read it. */
export type ProfileRow = Partial<ProfileColumns> & {
  user_id: string;
  email: string | null;
  avatar_path: string | null;
  /** Admin account: monthly income is confidential and never stored. */
  is_staff?: boolean;
  documents: StoredDocument[] | null;
  created_at: string;
  updated_at: string;
  last_edited_at: string | null;
};

/** Validated form data -> database columns (blank becomes null). */
export function profileToRow(data: ProfileInputLike): ProfileColumns {
  const row = {} as ProfileColumns;
  for (const [field, column] of ENTRIES) {
    const v = data[field];
    row[column] = v === undefined || v === '' ? null : v;
  }
  return row;
}

/** Database row -> the string values the profile form uses. */
export function profileRowToValues(row: Partial<ProfileColumns> | null | undefined): ProfileValues {
  const out = {} as ProfileValues;
  for (const [field, column] of ENTRIES) {
    const v = row?.[column];
    out[field] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}

export type ProfileChanges = Partial<Record<ProfileColumn, { from: string | number | null; to: string | number | null }>>;

export function diffProfile(existing: Partial<ProfileColumns>, next: ProfileColumns): ProfileChanges {
  const changes: ProfileChanges = {};
  for (const [, column] of ENTRIES) {
    const from = existing[column] ?? null;
    const to = next[column];
    const equal = column === 'monthly_income' ? (from === null ? to === null : to !== null && Number(from) === Number(to)) : from === to;
    if (!equal) changes[column] = { from, to };
  }
  return changes;
}

/** Fill only the columns that are still blank on the profile (used to seed a profile from a submitted application). */
export function fillBlankColumns(existing: Partial<ProfileColumns> | null, incoming: ProfileColumns): ProfileColumns {
  const out = {} as ProfileColumns;
  for (const [, column] of ENTRIES) {
    const current = existing?.[column];
    out[column] = current === null || current === undefined || current === '' ? incoming[column] : current;
  }
  return out;
}

export const initials = (name: string | null | undefined, fallback = '?'): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};
