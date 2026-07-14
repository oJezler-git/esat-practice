import { type ReactNode, useState } from "react";
import { formatShortcutKey, normalizeShortcutKey } from "../../types/settings";

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8 border border-subtle rounded-xl bg-soft overflow-hidden">
      <div className="px-4 py-3.5 border-b border-subtle">
        <h2 className="text-sm font-medium text-muted">{title}</h2>
        <p className="text-xs text-muted mt-1">{description}</p>
      </div>
      <div className="divide-y divide-subtle">{children}</div>
    </section>
  );
}

export function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="settings-group-heading text-xs font-semibold uppercase tracking-wider text-muted mt-10 mb-3 first:mt-0">
      {children}
    </h2>
  );
}

export function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div>
        <div className="text-sm text-secondary">{label}</div>
        {description && (
          <div className="text-xs text-muted mt-0.5">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`settings-toggle ${checked ? "settings-toggle--on" : ""}`}
    >
      <span className="settings-toggle__knob" />
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className="text-sm border border-subtle rounded-lg px-3 py-1.5 text-secondary focus:outline-none focus:border-accent"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function ShortcutInput({
  value,
  defaultValue,
  onChange,
  ariaLabel,
}: {
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [listening, setListening] = useState(false);
  const isModified = value !== defaultValue;

  return (
    <div className="shortcut-input-row">
      <button
        type="button"
        aria-label={ariaLabel}
        onFocus={() => setListening(true)}
        onBlur={() => setListening(false)}
        onKeyDown={(event) => {
          event.preventDefault();
          const nextKey = normalizeShortcutKey(event.key);
          if (nextKey) {
            onChange(nextKey);
            event.currentTarget.blur();
          }
        }}
        className={`shortcut-key-btn${listening ? " shortcut-key-btn--listening" : ""}`}
      >
        {listening ? "Press a key…" : <kbd>{formatShortcutKey(value)}</kbd>}
      </button>
      {isModified && (
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          className="shortcut-reset-btn"
          style={{ order: -1 }}
        >
          Reset
        </button>
      )}
    </div>
  );
}
