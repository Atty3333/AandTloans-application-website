import React from 'react';

interface FieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (name: string, value: string) => void;
  error?: string;
  hint?: string;
  type?: 'text' | 'date' | 'email' | 'tel' | 'number';
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  placeholder?: string;
  min?: number | string;
  max?: number | string;
  maxLength?: number;
  wide?: boolean;
}

export default function Field({
  name,
  label,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  required = true,
  autoComplete,
  inputMode,
  placeholder,
  min,
  max,
  maxLength,
  wide = false,
}: FieldProps) {
  const id = `field-${name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label htmlFor={id} className="label-caps">
        {label} {required && <span aria-hidden="true" className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        min={min}
        max={max}
        maxLength={maxLength}
        step={type === 'number' ? '0.01' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`input-box ${error ? '!border-red-500 !bg-red-50' : ''}`}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-gray-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
