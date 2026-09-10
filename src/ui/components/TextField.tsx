import { useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
}

export function TextField({ label, error, id, className = '', ...props }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={fieldId}
        className={`rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg
          placeholder:text-fg-muted focus:border-accent focus:outline-none focus:ring-2
          focus:ring-accent/30 ${error !== undefined ? 'border-danger' : ''} ${className}`}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
        {...props}
      />
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
