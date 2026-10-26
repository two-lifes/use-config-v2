import { useId, type ReactNode } from "react";

interface PaneProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function Pane({ title, actions, children }: PaneProps) {
  const titleId = useId();
  return (
    <section className="pane" aria-labelledby={titleId}>
      <div className="pane__header">
        <h2 className="pane__title" id={titleId}>
          {title}
        </h2>
        {actions && <div className="pane__actions">{actions}</div>}
      </div>
      <div className="pane__body">{children}</div>
    </section>
  );
}
