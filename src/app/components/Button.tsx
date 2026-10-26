import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: LucideIcon;
}

export function Button({
  variant = "secondary",
  icon: Icon,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={["button", `button--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  // Icon-only buttons need both a tooltip and an accessible name
  label: string;
  icon: LucideIcon;
  variant?: Variant;
}

export function IconButton({
  label,
  icon,
  variant = "ghost",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <Button
      variant={variant}
      icon={icon}
      aria-label={label}
      title={label}
      className={["button--icon", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
