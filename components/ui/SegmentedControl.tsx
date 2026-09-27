"use client";

interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** A row of mutually exclusive buttons, exposed as a radio group. */
export default function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-[color:var(--border)]">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={`px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md ${
            value === option.id
              ? "bg-[color:var(--accent)] text-white"
              : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
