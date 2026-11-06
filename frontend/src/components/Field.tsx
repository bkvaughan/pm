type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  hint?: string;
};

export const Field = ({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  minLength,
  maxLength,
  hint,
}: FieldProps) => (
  <div>
    <label
      htmlFor={id}
      className="mb-2 block text-sm font-semibold text-[var(--navy-dark)]"
    >
      {label}
    </label>
    <input
      id={id}
      type={type}
      autoComplete={autoComplete}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      minLength={minLength}
      maxLength={maxLength}
      aria-describedby={hint ? `${id}-hint` : undefined}
      className="w-full rounded-xl border border-[var(--stroke)] px-4 py-3 text-sm outline-none focus:border-[var(--primary-blue)]"
      required
    />
    {hint && (
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-[var(--gray-text)]">
        {hint}
      </p>
    )}
  </div>
);
