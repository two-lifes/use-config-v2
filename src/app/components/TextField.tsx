import {
  useId,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

const MAX_TEXTAREA_LINES = 12;

interface FieldProps {
  label: string;
  error?: string;
}

function Field({
  id,
  label,
  error,
  errorId,
  children,
}: FieldProps & { id: string; errorId: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  error,
  className,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <Field id={id} label={label} error={error} errorId={errorId}>
      <input
        id={id}
        className={["field__control", className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
    </Field>
  );
}

export function TextArea({
  label,
  error,
  className,
  value,
  ...rest
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  const ref = useRef<HTMLTextAreaElement>(null);

  // Chrome 120 (D-02) has no `field-sizing: content`, so the height follows
  // the content here, up to the line limit from design.md
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight);
    const padding =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const border =
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    textarea.style.height = "auto";
    const maxHeight = lineHeight * MAX_TEXTAREA_LINES + padding + border;
    textarea.style.height = `${Math.min(textarea.scrollHeight + border, maxHeight)}px`;
  }, [value]);

  return (
    <Field id={id} label={label} error={error} errorId={errorId}>
      <textarea
        ref={ref}
        id={id}
        rows={1}
        value={value}
        className={["field__control", className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
    </Field>
  );
}
