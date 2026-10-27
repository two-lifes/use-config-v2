import { Lock } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  checkImportSize,
  exportFileName,
  parseImport,
  serializeExport,
} from "../lib/backup";
import type { StoredCatalog } from "../lib/model";
import type {
  CatalogRepository,
  LoadResult,
  ReplaceError,
} from "../storage/repository";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { useToast } from "./components/Toast";
import { downloadText } from "./download";

type BackupDialog =
  | { kind: "export"; catalog: StoredCatalog }
  | { kind: "import"; catalog: StoredCatalog }
  | { kind: "import-error"; message: string; problems: string[] }
  | { kind: "about" };

export interface BackupActions {
  // Absent while there is no valid catalog to export
  startExport?: () => void;
  startImport: () => void;
  showAbout: () => void;
}

// Export, import and About are reachable from the menu in every loaded state;
// import also from the stored data error state (US-11)
export function useBackup(
  repository: CatalogRepository,
  state: LoadResult | null,
): { actions: BackupActions; element: ReactNode } {
  const inputRef = useRef<HTMLInputElement>(null);
  // A dialog stays mounted while closing so the browser can return focus;
  // a new key per opening resets its state
  const [dialog, setDialog] = useState<{
    value: BackupDialog;
    open: boolean;
    key: number;
  }>();
  const showToast = useToast();

  const open = (value: BackupDialog) =>
    setDialog((current) => ({
      value,
      open: true,
      key: (current?.key ?? 0) + 1,
    }));
  const close = () =>
    setDialog((current) => current && { ...current, open: false });

  async function readFile(file: File) {
    const tooLarge = checkImportSize(file.size);
    if (tooLarge && !tooLarge.ok) {
      open({ kind: "import-error", message: tooLarge.message, problems: [] });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (error) {
      console.error("Failed to read the import file", error);
      open({
        kind: "import-error",
        message: "The file could not be read.",
        problems: [],
      });
      return;
    }
    const result = parseImport(text);
    if (result.ok) open({ kind: "import", catalog: result.catalog });
    else
      open({
        kind: "import-error",
        message: result.message,
        problems: result.problems,
      });
  }

  const catalog = state?.status === "ok" ? state.catalog : undefined;
  const actions: BackupActions = {
    startExport: catalog && (() => open({ kind: "export", catalog })),
    // Opening the file picker needs the user's click, so this runs inside it
    startImport: () => inputRef.current?.click(),
    showAbout: () => open({ kind: "about" }),
  };

  const element = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Choosing the same file again fires another change
          event.target.value = "";
          if (file) void readFile(file);
        }}
      />
      {dialog && (
        <BackupDialogs
          dialog={dialog}
          repository={repository}
          state={state}
          close={close}
          onExported={() => showToast("Catalog exported.")}
          onImported={() => showToast("Catalog imported.")}
        />
      )}
    </>
  );
  return { actions, element };
}

function BackupDialogs({
  dialog,
  repository,
  state,
  close,
  onExported,
  onImported,
}: {
  dialog: { value: BackupDialog; open: boolean; key: number };
  repository: CatalogRepository;
  state: LoadResult | null;
  close: () => void;
  onExported: () => void;
  onImported: () => void;
}) {
  const { value, open, key } = dialog;
  switch (value.kind) {
    case "export":
      return (
        <ExportDialog
          key={key}
          open={open}
          catalog={value.catalog}
          onDone={() => {
            close();
            onExported();
          }}
          onCancel={close}
        />
      );
    case "import":
      return (
        <ImportDialog
          key={key}
          open={open}
          repository={repository}
          imported={value.catalog}
          state={state}
          onDone={() => {
            close();
            onImported();
          }}
          onCancel={close}
        />
      );
    case "import-error":
      return (
        <Dialog
          key={key}
          open={open}
          title="Import failed"
          onCancel={close}
          actions={
            <Button variant="primary" onClick={close}>
              OK
            </Button>
          }
        >
          <p>{value.message} The catalog was not changed.</p>
          {value.problems.length > 0 && (
            <ul className="problem-list">
              {value.problems.map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
          )}
        </Dialog>
      );
    case "about":
      return (
        <Dialog
          key={key}
          open={open}
          title="About Use Config"
          onCancel={close}
          actions={
            <Button variant="primary" onClick={close}>
              Close
            </Button>
          }
        >
          <p>Version {chrome.runtime.getManifest().version}</p>
          <p className="dialog__note">
            <Lock size={16} />
            Your data is stored unencrypted in this browser profile.
          </p>
        </Dialog>
      );
  }
}

function ExportDialog({
  open,
  catalog,
  onDone,
  onCancel,
}: {
  open: boolean;
  catalog: StoredCatalog;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string>();

  function confirm() {
    const now = new Date();
    try {
      downloadText(
        exportFileName(now),
        serializeExport(catalog, now.toISOString()),
      );
    } catch (error) {
      console.error("Failed to export the catalog", error);
      setError("The file could not be created.");
      return;
    }
    onDone();
  }

  return (
    <Dialog
      open={open}
      title="Export catalog"
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={confirm}>
            Export
          </Button>
        </>
      }
    >
      <p>
        The file contains all topics and entries, including passwords, as
        readable text. Keep it somewhere safe.
      </p>
      {error && (
        <p className="dialog__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function contents(catalog: StoredCatalog): string {
  return `${plural(catalog.topics.length, "topic", "topics")} and ${plural(catalog.entries.length, "entry", "entries")}`;
}

function replaceErrorMessage(error: ReplaceError): string {
  return error.kind === "write-failed"
    ? `The catalog could not be saved: ${error.message}`
    : "The file has invalid data, so nothing was saved.";
}

function ImportDialog({
  open,
  repository,
  imported,
  state,
  onDone,
  onCancel,
}: {
  open: boolean;
  repository: CatalogRepository;
  imported: StoredCatalog;
  state: LoadResult | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string>();
  const [replacing, setReplacing] = useState(false);

  async function confirm() {
    if (replacing) return;
    setReplacing(true);
    let message: string | undefined;
    try {
      const result = await repository.replace(imported);
      if (!result.ok) message = replaceErrorMessage(result.error);
    } catch (error) {
      // For example a rejected Web Lock request
      message = `The catalog could not be saved: ${error instanceof Error ? error.message : String(error)}`;
    }
    setReplacing(false);
    if (message === undefined) onDone();
    else setError(message);
  }

  return (
    <Dialog
      open={open}
      title="Replace catalog?"
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" disabled={replacing} onClick={confirm}>
            Replace
          </Button>
        </>
      }
    >
      <p>The file has {contents(imported)}.</p>
      <p>
        {state?.status === "ok"
          ? `The current catalog has ${contents(state.catalog)}. It will be replaced completely.`
          : state?.status === "invalid"
            ? "The stored data is invalid and will be replaced. Download the raw data first to keep a copy."
            : "The stored data could not be read and will be replaced."}
      </p>
      {error && (
        <p className="dialog__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
