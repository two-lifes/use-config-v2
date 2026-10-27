import { KeyRound, Plus } from "lucide-react";
import type { Entry, Topic } from "../lib/model";
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
  onAdd,
}: EntriesPaneProps) {
  return (
    <Pane
      title={topic.name}
      actions={<IconButton label="Add entry" icon={Plus} onClick={onAdd} />}
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
        <ul className="entry-list" onKeyDown={moveFocus(".entry-list__select")}>
          {entries.map((entry) => {
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
                  <EntryIcon
                    key={entry.url}
                    name={entry.name}
                    url={entry.url}
                  />
                  <span className="entry-list__text">
                    <span className="entry-list__name">{entry.name}</span>
                    <span className="entry-list__host">{host(entry.url)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Pane>
  );
}
