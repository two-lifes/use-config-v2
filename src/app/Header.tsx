import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

interface HeaderProps {
  // Without a handler the search field is shown disabled (loading, error and
  // welcome states have nothing to search)
  query?: string;
  onQueryChange?: (query: string) => void;
}

const shortcut = navigator.userAgent.includes("Mac") ? "⌘F" : "Ctrl+F";

export function Header({ query = "", onQueryChange }: HeaderProps) {
  return (
    <header className="header">
      <h1 className="header__title">Use Config</h1>
      <SearchField query={query} onQueryChange={onQueryChange} />
    </header>
  );
}

function SearchField({ query, onQueryChange }: HeaderProps) {
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
