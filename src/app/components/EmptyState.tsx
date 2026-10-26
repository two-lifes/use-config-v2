import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  text: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, text, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Icon size={24} />
      <p className="empty-state__text">{text}</p>
      {action}
    </div>
  );
}
