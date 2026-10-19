import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { AlertCircle } from 'lucide-react';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/** Enveloppe accessible : label, indice et message d'erreur reliés au champ. */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      {label ? (
        <label className="field__label" htmlFor={id}>
          {label}
          {required ? <span aria-hidden="true" style={{ color: 'var(--ed-danger)' }}> *</span> : null}
        </label>
      ) : null}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error ? <span className="field__hint" id={hintId}>{hint}</span> : null}
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </span>
      ) : null}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  large?: boolean;
  icon?: ReactNode;
}

export function TextInput({ invalid, large, icon, className = '', ...rest }: TextInputProps) {
  const classes = ['input', invalid ? 'input--error' : '', large ? 'input--lg' : '', className].filter(Boolean).join(' ');
  if (icon) {
    return (
      <span className="input-group">
        <span className="input-group__icon" aria-hidden="true">
          {icon}
        </span>
        <input className={classes} aria-invalid={invalid || undefined} {...rest} />
      </span>
    );
  }
  return <input className={classes} aria-invalid={invalid || undefined} {...rest} />;
}

export function TextArea({ invalid, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const classes = ['textarea', invalid ? 'input--error' : '', className].filter(Boolean).join(' ');
  return <textarea className={classes} aria-invalid={invalid || undefined} {...rest} />;
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`select ${className}`} {...rest}>
      {children}
    </select>
  );
}

interface Option {
  value: string;
  label: string;
}

export function SelectFromOptions({ options, placeholder, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; placeholder?: string }) {
  return (
    <Select {...rest}>
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

/** Interrupteur accessible. */
export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <label className="switch" htmlFor={id} style={{ alignItems: 'flex-start' }}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{label}</span>
        {description ? (
          <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ed-text-mute)' }}>{description}</span>
        ) : null}
      </span>
    </label>
  );
}

/** Groupe de boutons segmentés (choix exclusif). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="btn-group" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={value === option.value ? 'is-active' : ''}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Pastille de sélection multiple (matières, préférences…). */
export function Pill({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  color?: string;
}) {
  return (
    <button
      type="button"
      className="pill"
      aria-pressed={active}
      onClick={onClick}
      style={color ? ({ ['--pill-color' as string]: color } as React.CSSProperties) : undefined}
    >
      {children}
    </button>
  );
}
