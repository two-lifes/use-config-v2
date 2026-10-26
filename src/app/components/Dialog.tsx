import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  // Buttons in display order: Cancel first, then the confirming action
  actions: ReactNode;
  onCancel: () => void;
}

export function Dialog({
  open,
  title,
  children,
  actions,
  onCancel,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  const titleId = useId();

  useEffect(() => {
    openRef.current = open;
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      // Escape closes the native dialog; a close the parent did not request
      // is reported as a cancel so the parent state stays in sync
      onClose={() => {
        if (openRef.current) onCancel();
      }}
    >
      <h2 className="dialog__title" id={titleId}>
        {title}
      </h2>
      {children && <div className="dialog__body">{children}</div>}
      <div className="dialog__actions">{actions}</div>
    </dialog>
  );
}
