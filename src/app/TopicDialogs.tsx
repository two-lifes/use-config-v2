import { useId, useState, type FormEvent } from "react";
import { createTopic, deleteTopic, renameTopic } from "../lib/catalog";
import type { Topic } from "../lib/model";
import type { CatalogRepository } from "../storage/repository";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { TextField } from "./components/TextField";
import { outcomeMessage, run } from "./update";

interface TopicNameDialogProps {
  open: boolean;
  repository: CatalogRepository;
  // Renames this topic; without it a new topic is created
  topic?: Topic;
  onDone: (topicId: string) => void;
  onCancel: () => void;
}

export function TopicNameDialog({
  open,
  repository,
  topic,
  onDone,
  onCancel,
}: TopicNameDialogProps) {
  const formId = useId();
  const [name, setName] = useState(topic?.name ?? "");
  const [nameError, setNameError] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const outcome = await run(repository, (catalog, context) =>
      topic
        ? renameTopic(catalog, topic.id, name, context)
        : createTopic(catalog, name, context),
    );
    setSaving(false);
    if (outcome.ok) {
      onDone(outcome.id);
    } else if (outcome.error.kind === "invalid-name") {
      setNameError(outcome.error.message);
    } else {
      setError(outcomeMessage(outcome));
    }
  }

  return (
    <Dialog
      open={open}
      title={topic ? "Rename topic" : "New topic"}
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={saving}
          >
            {topic ? "Rename" : "Create"}
          </Button>
        </>
      }
    >
      <form id={formId} className="dialog__form" onSubmit={submit} noValidate>
        <TextField
          label="Name"
          value={name}
          error={nameError}
          autoFocus
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
            setError(undefined);
          }}
        />
        {error && (
          <p className="dialog__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

interface DeleteTopicDialogProps {
  open: boolean;
  repository: CatalogRepository;
  topic: Topic;
  entryCount: number;
  onDone: () => void;
  onCancel: () => void;
}

export function DeleteTopicDialog({
  open,
  repository,
  topic,
  entryCount,
  onDone,
  onCancel,
}: DeleteTopicDialogProps) {
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    if (deleting) return;
    setDeleting(true);
    const outcome = await run(repository, (catalog) =>
      deleteTopic(catalog, topic.id),
    );
    setDeleting(false);
    if (outcome.ok) {
      onDone();
    } else {
      setError(outcomeMessage(outcome));
    }
  }

  return (
    <Dialog
      open={open}
      title={`Delete topic “${topic.name}”?`}
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" disabled={deleting} onClick={confirm}>
            Delete
          </Button>
        </>
      }
    >
      <p>
        {entryCount === 0
          ? "This topic has no entries."
          : `Its ${entryCount} ${entryCount === 1 ? "entry" : "entries"} will also be deleted.`}
      </p>
      {error && (
        <p className="dialog__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
