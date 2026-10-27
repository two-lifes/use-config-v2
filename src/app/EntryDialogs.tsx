import { useId, useState, type FormEvent } from "react";
import { deleteEntry, moveEntry } from "../lib/catalog";
import type { Entry, Topic } from "../lib/model";
import type { CatalogRepository } from "../storage/repository";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { outcomeMessage, run } from "./update";

interface DeleteEntryDialogProps {
  open: boolean;
  repository: CatalogRepository;
  entry: Entry;
  onDone: () => void;
  onCancel: () => void;
}

export function DeleteEntryDialog({
  open,
  repository,
  entry,
  onDone,
  onCancel,
}: DeleteEntryDialogProps) {
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    if (deleting) return;
    setDeleting(true);
    const outcome = await run(repository, (catalog) =>
      deleteEntry(catalog, entry.id),
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
      title={`Delete entry “${entry.name}”?`}
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
      <p>Its URL and sign-in details will be deleted.</p>
      {error && (
        <p className="dialog__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

interface MoveEntryDialogProps {
  open: boolean;
  repository: CatalogRepository;
  entry: Entry;
  // Sorted by name, without the entry's current topic; never empty
  targets: Topic[];
  onDone: () => void;
  onCancel: () => void;
}

export function MoveEntryDialog({
  open,
  repository,
  entry,
  targets,
  onDone,
  onCancel,
}: MoveEntryDialogProps) {
  const formId = useId();
  const selectId = useId();
  const [topicId, setTopicId] = useState(targets[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [moving, setMoving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (moving) return;
    setMoving(true);
    const outcome = await run(repository, (catalog, context) =>
      moveEntry(catalog, entry.id, topicId, context),
    );
    setMoving(false);
    if (outcome.ok) {
      onDone();
    } else {
      setError(outcomeMessage(outcome));
    }
  }

  return (
    <Dialog
      open={open}
      title={`Move entry “${entry.name}”`}
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={moving}
          >
            Move
          </Button>
        </>
      }
    >
      <form id={formId} className="dialog__form" onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor={selectId}>
            Topic
          </label>
          <select
            id={selectId}
            className="field__control"
            value={topicId}
            autoFocus
            onChange={(event) => {
              setTopicId(event.target.value);
              setError(undefined);
            }}
          >
            {targets.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p className="dialog__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

interface DiscardChangesDialogProps {
  open: boolean;
  onDiscard: () => void;
  onKeepEditing: () => void;
}

// Asked before an action that would leave a form with unsaved changes (D-09)
export function DiscardChangesDialog({
  open,
  onDiscard,
  onKeepEditing,
}: DiscardChangesDialogProps) {
  return (
    <Dialog
      open={open}
      title="Discard unsaved changes?"
      onCancel={onKeepEditing}
      actions={
        <>
          <Button onClick={onKeepEditing}>Keep editing</Button>
          <Button variant="danger" onClick={onDiscard}>
            Discard changes
          </Button>
        </>
      }
    >
      <p>Your changes to this entry have not been saved.</p>
    </Dialog>
  );
}
