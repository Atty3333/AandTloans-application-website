import Field from '@/components/Field';
import { CONFIDENTIAL_LABEL } from '@/lib/config';
import type { ProfileField, ProfileValues } from '@/lib/profile';

interface ProfileFieldsProps {
  values: ProfileValues;
  errors: Record<string, string>;
  onChange: (name: string, value: string) => void;
  /** Admin accounts: monthly income is shown as "Confidential", is read-only and is never stored. */
  confidentialIncome?: boolean;
}

/** The personal-details form shared by "My profile" and the admin's edit-user form. All fields are optional (filled in over time). */
export default function ProfileFields({ values, errors, onChange, confidentialIncome = false }: ProfileFieldsProps) {
  const f = (name: ProfileField) => ({ name, value: values[name], onChange, error: errors[name], required: false });

  return (
    <div className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="section-title w-full">Personal details</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field {...f('fullName')} label="Full name" autoComplete="name" maxLength={120} wide />
          <Field {...f('dob')} label="Date of birth" type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} />
          <Field {...f('idNumber')} label="Omang / ID number" inputMode="numeric" maxLength={9} hint="9 digits" />
          <Field {...f('phone')} label="Phone number (Pay2Cell)" type="tel" inputMode="tel" placeholder="71234567" />
          <Field {...f('whatsappNumber')} label="WhatsApp number" type="tel" inputMode="tel" placeholder="71234567" hint="Used to message you on WhatsApp. Can be the same as your phone number." />
          <Field {...f('address')} label="Residential address" autoComplete="street-address" wide />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="section-title w-full">Employment &amp; financial details</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field {...f('institution')} label="Institution / employer" autoComplete="organization" />
          {confidentialIncome ? (
            <Field
              name="income"
              label="Monthly allowance / income"
              value={CONFIDENTIAL_LABEL}
              onChange={() => undefined}
              readOnly
              required={false}
              hint="Confidential. This is not collected or stored for admin accounts."
            />
          ) : (
            <Field {...f('income')} label="Monthly allowance / income (BWP)" type="number" inputMode="decimal" min={0} />
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="section-title w-full">Next of kin</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field {...f('kinName')} label="Full name" wide />
          <Field {...f('kinRelationship')} label="Relationship to applicant" placeholder="e.g. Mother" />
          <Field {...f('kinId')} label="National ID / Omang number" maxLength={20} />
          <Field {...f('kinPhone')} label="Mobile number" type="tel" inputMode="tel" placeholder="71234567" />
          <Field {...f('kinAltPhone')} label="Alternative number" type="tel" inputMode="tel" />
          <Field {...f('kinAddress')} label="Residential address" wide />
        </div>
      </fieldset>
    </div>
  );
}
