import { Pencil, Plus, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { Topic } from "../lib/model";
import { IconButton } from "./components/Button";
import { Pane } from "./Pane";

interface TopicsPaneProps {
  // Sorted by name and never empty: an empty catalog shows the welcome state
  topics: Topic[];
  entryCounts: ReadonlyMap<string, number>;
  selectedId: string | undefined;
  onSelect: (topicId: string) => void;
  onCreate: () => void;
  onRename: (topic: Topic) => void;
  onDelete: (topic: Topic) => void;
}

export function TopicsPane({
  topics,
  entryCounts,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: TopicsPaneProps) {
  return (
    <Pane
      title="Topics"
      actions={<IconButton label="New topic" icon={Plus} onClick={onCreate} />}
    >
      <ul className="topic-list" onKeyDown={moveFocus}>
        {topics.map((topic) => {
          const selected = topic.id === selectedId;
          return (
            <li
              key={topic.id}
              className={
                selected
                  ? "topic-list__item topic-list__item--selected"
                  : "topic-list__item"
              }
            >
              <button
                type="button"
                className="topic-list__select"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(topic.id)}
              >
                <span className="topic-list__name">{topic.name}</span>
                {!selected && (
                  <span className="topic-list__count">
                    {entryCounts.get(topic.id) ?? 0}
                  </span>
                )}
              </button>
              {selected && (
                <span className="topic-list__actions">
                  <IconButton
                    label="Rename topic"
                    icon={Pencil}
                    onClick={() => onRename(topic)}
                  />
                  <IconButton
                    label="Delete topic"
                    icon={Trash2}
                    onClick={() => onDelete(topic)}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Pane>
  );
}

// Arrow keys move focus between topics; Enter or Space then selects one
function moveFocus(event: KeyboardEvent<HTMLUListElement>) {
  const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  if (step === 0 || !(event.target instanceof HTMLElement)) return;
  const item = event.target.closest("li");
  const sibling =
    step > 0 ? item?.nextElementSibling : item?.previousElementSibling;
  const button = sibling?.querySelector<HTMLButtonElement>(
    ".topic-list__select",
  );
  if (!button) return;
  event.preventDefault();
  button.focus();
}
