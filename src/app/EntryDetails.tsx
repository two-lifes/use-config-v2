import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FolderInput,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { addEntry, editEntry } from "../lib/catalog";
import type { Entry } from "../lib/model";
import type { EntryInput } from "../lib/validation";
import type { CatalogRepository } from "../storage/repository";
import { copyText } from "./actions";
import { Button } from "./components/Button";
import { TextArea, TextField } from "./components/TextField";
import { useToast } from "./components/Toast";
import { EntryIcon } from "./EntryIcon";
import { outcomeMessage, run } from "./update";

// The mask does not reveal the password length (design.md)
const MASKED_PASSWORD = "••••••••";

interface EntryViewProps {
  entry: Entry;
  canMove: boolean;
  onOpen: (url: string) => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}

function DetailRow({
  label,
  className,
  actions,
  children,
}: {
  label: string;
  className?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="details__row">
      <dt className="details__label">{label}</dt>
      <dd className={["details__value", className].filter(Boolean).join(" ")}>
        {children}
      </dd>
      {actions && <dd className="details__row-actions">{actions}</dd>}
    </div>
  );
}

function NotSet() {
  return <span className="details__not-set">Not set</span>;
}

// Selecting another entry remounts the view, which masks the password again
export function EntryView({
  entry,
  canMove,
  onOpen,
  onEdit,
  onMove,
  onDelete,
}: EntryViewProps) {
  const [revealed, setRevealed] = useState(false);
  const showToast = useToast();

  function copy(text: string, what: "Username" | "Password") {
    copyText(text).then(
      () => showToast(`${what} copied`),
      (error: unknown) => {
        console.error(`Failed to copy the ${what.toLowerCase()}`, error);
        showToast(`Could not copy the ${what.toLowerCase()}.`, "error");
      },
    );
  }

  return (
    <article className="details">
      <div className="details__heading">
        <EntryIcon key={entry.url} name={entry.name} url={entry.url} />
        <h3 className="details__name">{entry.name}</h3>
      </div>
      <dl className="details__fields">
        <DetailRow
          label="URL"
          className="details__value--mono"
          actions={
            <Button
              variant="ghost"
              icon={ExternalLink}
              aria-label="Open URL"
              onClick={() => onOpen(entry.url)}
            >
              Open
            </Button>
          }
        >
          {entry.url}
        </DetailRow>
        <DetailRow
          label="Username"
          actions={
            <Button
              variant="ghost"
              icon={Copy}
              aria-label="Copy username"
              disabled={!entry.username}
              onClick={() => copy(entry.username, "Username")}
            >
              Copy
            </Button>
          }
        >
          {entry.username || <NotSet />}
        </DetailRow>
        <DetailRow
          label="Password"
          className={
            entry.password && revealed ? "details__value--mono" : undefined
          }
          actions={
            <>
              <Button
                variant="ghost"
                icon={revealed ? EyeOff : Eye}
                aria-label={revealed ? "Hide password" : "Show password"}
                disabled={!entry.password}
                onClick={() => setRevealed((value) => !value)}
              >
                {revealed ? "Hide" : "Show"}
              </Button>
              <Button
                variant="ghost"
                icon={Copy}
                aria-label="Copy password"
                disabled={!entry.password}
                onClick={() => copy(entry.password, "Password")}
              >
                Copy
              </Button>
            </>
          }
        >
          {!entry.password ? (
            <NotSet />
          ) : revealed ? (
            entry.password
          ) : (
            MASKED_PASSWORD
          )}
        </DetailRow>
        {entry.extraUrl && (
          <DetailRow
            label="Additional URL"
            className="details__value--mono"
            actions={
              <Button
                variant="ghost"
                icon={ExternalLink}
                aria-label="Open additional URL"
                onClick={() => onOpen(entry.extraUrl)}
              >
                Open
              </Button>
            }
          >
            {entry.extraUrl}
          </DetailRow>
        )}
        {entry.twoFactorNote && (
          <DetailRow label="2FA note" className="details__value--multiline">
            {entry.twoFactorNote}
          </DetailRow>
        )}
        {entry.description && (
          <DetailRow label="Description" className="details__value--multiline">
            {entry.description}
          </DetailRow>
        )}
      </dl>
      <div className="details__actions">
        <Button icon={Pencil} onClick={onEdit}>
          Edit
        </Button>
        <Button
          icon={FolderInput}
          disabled={!canMove}
          title={canMove ? undefined : "There is no other topic to move to"}
          onClick={onMove}
        >
          Move
        </Button>
        <Button icon={Trash2} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </article>
  );
}

const emptyInput: EntryInput = {
  name: "",
  url: "",
  description: "",
  username: "",
  password: "",
  extraUrl: "",
  twoFactorNote: "",
};

function inputOf(entry: Entry | undefined): EntryInput {
  if (!entry) return emptyInput;
  const { name, url, description, username, password, extraUrl } = entry;
  const { twoFactorNote } = entry;
  return {
    name,
    url,
    description,
    username,
    password,
    extraUrl,
    twoFactorNote,
  };
}

function sameInput(a: EntryInput, b: EntryInput): boolean {
  return (Object.keys(a) as (keyof EntryInput)[]).every(
    (field) => a[field] === b[field],
  );
}

interface EntryFormProps {
  repository: CatalogRepository;
  topicId: string;
  // Edits this entry; without it a new entry is added to the topic
  entry?: Entry;
  onSaved: (entryId: string) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function EntryForm({
  repository,
  topicId,
  entry,
  onSaved,
  onCancel,
  onDirtyChange,
}: EntryFormProps) {
  // The saved values are captured once, so a change from another tab does not
  // overwrite the input; the last save wins (US-12)
  const [saved] = useState(() => inputOf(entry));
  const [input, setInput] = useState(saved);
  const [errors, setErrors] = useState<
    Partial<Record<keyof EntryInput, string>>
  >({});
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const dirty = !sameInput(input, saved);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const outcome = await run(repository, (catalog, context) =>
      entry
        ? editEntry(catalog, entry.id, input, context)
        : addEntry(catalog, topicId, input, context),
    );
    setSaving(false);
    if (outcome.ok) {
      // Report a clean form before leaving, so the guard does not ask
      onDirtyChange(false);
      onSaved(outcome.id);
    } else if (outcome.error.kind === "invalid-entry") {
      setErrors(outcome.error.errors);
    } else {
      // The input stays in the form (US-11)
      setError(outcomeMessage(outcome));
    }
  }

  function keyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  function field(name: keyof EntryInput) {
    return {
      value: input[name],
      error: errors[name],
      autoComplete: "off",
      onChange: (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => {
        const { value } = event.target;
        setInput((current) => ({ ...current, [name]: value }));
        setErrors((current) => ({ ...current, [name]: undefined }));
        setError(undefined);
      },
    };
  }

  return (
    <form
      className="entry-form"
      onSubmit={submit}
      onKeyDown={keyDown}
      noValidate
    >
      <h3 className="entry-form__title">
        {entry ? "Edit entry" : "New entry"}
      </h3>
      <TextField label="Name" autoFocus {...field("name")} />
      <TextField label="URL" spellCheck={false} {...field("url")} />
      <TextArea label="Description" {...field("description")} />
      <TextField label="Username" spellCheck={false} {...field("username")} />
      <TextField
        label="Password"
        type="password"
        {...field("password")}
        autoComplete="new-password"
      />
      <TextField
        label="Additional URL"
        spellCheck={false}
        {...field("extraUrl")}
      />
      <TextArea label="2FA note" {...field("twoFactorNote")} />
      {error && (
        <p className="entry-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="entry-form__actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={saving}>
          Save
        </Button>
      </div>
    </form>
  );
}
