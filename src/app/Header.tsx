import { Download, Info, Ellipsis, Search, Upload } from "lucide-react";
import { useEffect, useRef } from "react";
import type { BackupActions } from "./BackupDialogs";
import { Menu } from "./components/Menu";

interface HeaderProps {
  // Without a handler the search field is shown disabled (loading, error and
  // welcome states have nothing to search)
  query?: string;
  onQueryChange?: (query: string) => void;
  // Without actions (while loading) the menu button is shown disabled
  menu?: BackupActions;
}

const shortcut = navigator.userAgent.includes("Mac") ? "⌘F" : "Ctrl+F";

export function Header({ query = "", onQueryChange, menu }: HeaderProps) {
  return (
    <header className="header">
      <div className="header__brand">
        <img className="header__logo" src="icons/icon-48.png" alt="" />
        <h1 className="header__title">Clay</h1>
      </div>
      <SearchField query={query} onQueryChange={onQueryChange} />
      <div className="header__menu">
        <Menu
          label="Menu"
          icon={Ellipsis}
          items={
            menu && [
              {
                label: "Export",
                icon: Download,
                onSelect: () => menu.startExport?.(),
                disabled: !menu.startExport,
              },
              { label: "Import", icon: Upload, onSelect: menu.startImport },
              { label: "About", icon: Info, onSelect: menu.showAbout },
            ]
          }
        />
      </div>
    </header>
  );
}

function SearchField({
  query,
  onQueryChange,
}: Pick<HeaderProps, "query" | "onQueryChange">) {
  const ref = useRef<HTMLInputElement>(null);
  const enabled = onQueryChange !== undefined;

  // Ctrl+F / Cmd+F replaces the browser's find bar while search is available
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);

  return (
    <div className="search">
      <Search size={16} className="search__icon" />
      <input
        ref={ref}
        type="search"
        className="search__input"
        aria-label="Search all entries"
        placeholder="Search all entries…"
        value={query}
        disabled={!enabled}
        onChange={(event) => onQueryChange?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onQueryChange?.("");
          }
        }}
      />
      <kbd className="search__shortcut">{shortcut}</kbd>
    </div>
  );
}
