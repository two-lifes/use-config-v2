import { type LucideIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { IconButton } from "./Button";

export interface MenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
}

interface MenuProps {
  label: string;
  icon: LucideIcon;
  // Without items the menu button is shown disabled
  items?: MenuItem[];
}

// A native popover gives the top layer, light dismiss and Escape; focus
// returns to the button when the menu closes
export function Menu({ label, icon, items }: MenuProps) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);

  const enabledItems = () =>
    Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>(
        "[role=menuitem]:not(:disabled)",
      ) ?? [],
    );

  const onToggle = (open: boolean) => {
    setExpanded(open);
    const menu = ref.current;
    const button = buttonRef.current;
    if (!open || !menu || !button) return;
    // Anchor positioning needs Chrome 125, above the minimum version (D-02)
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
    enabledItems()[0]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const list = enabledItems();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = {
      ArrowDown: (index + 1) % list.length,
      ArrowUp: (index - 1 + list.length) % list.length,
      Home: 0,
      End: list.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    list[next]?.focus();
  };

  return (
    <>
      <IconButton
        ref={buttonRef}
        label={label}
        icon={icon}
        disabled={!items}
        popoverTarget={id}
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-controls={id}
      />
      {items && (
        <div
          ref={ref}
          id={id}
          popover="auto"
          role="menu"
          aria-label={label}
          className="menu"
          onToggle={(event) => onToggle(event.newState === "open")}
          onKeyDown={onKeyDown}
          // Tabbing out closes the menu like a click outside it
          onBlur={(event) => {
            if (!ref.current?.contains(event.relatedTarget as Node | null))
              ref.current?.hidePopover();
          }}
        >
          {items.map(({ label, icon: Icon, onSelect, disabled }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className="menu__item"
              disabled={disabled}
              onClick={() => {
                ref.current?.hidePopover();
                onSelect();
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
