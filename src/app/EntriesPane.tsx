import { ExternalLink, KeyRound, Plus, SearchX, User } from "lucide-react";
import type { SearchResult } from "../lib/catalog";
import type { Entry, Topic } from "../lib/model";
import { useCopy } from "./actions";
import { Button, IconButton } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import { EntryIcon } from "./EntryIcon";
import { moveFocus } from "./listKeys";
import { Pane } from "./Pane";

interface EntriesPaneProps {
  topic: Topic;
  // Entries of the topic, sorted by name
  entries: Entry[];
  selectedId: string | undefined;
  onSelect: (entryId: string) => void;
  onOpen: (url: string) => void;
  onOpenAll: () => void;
  onAdd: () => void;
}

// Stored URLs are validated, so parsing does not fail
function host(url: string): string {
  return new URL(url).host;
}

export function EntriesPane({
  topic,
  entries,
  selectedId,
  onSelect,
  onOpen,
  onOpenAll,
  onAdd,
}: EntriesPaneProps) {
  return (
    <Pane
      title={topic.name}
      actions={
        <>
          <Button
            variant="ghost"
            disabled={entries.length === 0}
            onClick={onOpenAll}
          >
            Open all
          </Button>
          <IconButton label="Add entry" icon={Plus} onClick={onAdd} />
        </>
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          text="This topic has no entries yet."
          action={
            <Button variant="primary" icon={Plus} onClick={onAdd}>
              Add entry
            </Button>
          }
        />
      ) : (
        <EntryList
          rows={entries.map((entry) => ({ entry, detail: host(entry.url) }))}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      )}
    </Pane>
  );
}

interface SearchResultsPaneProps {
  // Sorted by entry name, then topic name
  results: SearchResult[];
  selectedId: string | undefined;
  onSelect: (entryId: string) => void;
  onOpen: (url: string) => void;
  onClear: () => void;
}

export function SearchResultsPane({
  results,
  selectedId,
  onSelect,
  onOpen,
  onClear,
}: SearchResultsPaneProps) {
  return (
    <Pane title="Search results">
      {results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          text="No entries match your search."
          action={<Button onClick={onClear}>Clear search</Button>}
        />
      ) : (
        <EntryList
          rows={results.map(({ entry, topic }) => ({
            entry,
            detail: `${topic.name} · ${host(entry.url)}`,
          }))}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      )}
    </Pane>
  );
}

function EntryList({
  rows,
  selectedId,
  onSelect,
  onOpen,
}: {
  rows: { entry: Entry; detail: string }[];
  selectedId: string | undefined;
  onSelect: (entryId: string) => void;
  onOpen: (url: string) => void;
}) {
  const copy = useCopy();
  return (
    <ul className="entry-list" onKeyDown={moveFocus(".entry-list__select")}>
      {rows.map(({ entry, detail }) => {
        const selected = entry.id === selectedId;
        return (
          <li
            key={entry.id}
            className={
              selected
                ? "entry-list__item entry-list__item--selected"
                : "entry-list__item"
            }
          >
            <button
              type="button"
              className="entry-list__select"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(entry.id)}
            >
              <EntryIcon key={entry.url} name={entry.name} url={entry.url} />
              <span className="entry-list__text">
                <span className="entry-list__name">{entry.name}</span>
                <span className="entry-list__host">{detail}</span>
              </span>
            </button>
            {/* Siblings of the select button, so they leave the selection
                and the form alone (US-13) */}
            <span className="entry-list__actions">
              <IconButton
                label="Open URL"
                icon={ExternalLink}
                onClick={() => onOpen(entry.url)}
              />
              <IconButton
                label="Copy username"
                icon={User}
                disabled={!entry.username}
                onClick={() => copy(entry.username, "Username")}
              />
              <IconButton
                label="Copy password"
                icon={KeyRound}
                disabled={!entry.password}
                onClick={() => copy(entry.password, "Password")}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
