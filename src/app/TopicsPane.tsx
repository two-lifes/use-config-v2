import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Topic } from "../lib/model";
import { IconButton } from "./components/Button";
import { moveFocus } from "./listKeys";
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
      <ul className="topic-list" onKeyDown={moveFocus(".topic-list__select")}>
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
