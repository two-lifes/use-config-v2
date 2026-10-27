import {
  Download,
  FileText,
  FolderPlus,
  Lock,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { rawExportFileName, serializeRaw } from "../lib/backup";
import {
  countEntries,
  entriesOfTopic,
  searchEntries,
  sortTopics,
} from "../lib/catalog";
import type { Entry, StoredCatalog, Topic } from "../lib/model";
import {
  DEFAULT_SETTINGS,
  needsOpenAllConfirmation,
  type StoredSettings,
} from "../lib/settings";
import { countOpen } from "../lib/tabs";
import type { CatalogRepository, LoadResult } from "../storage/repository";
import type { SettingsRepository } from "../storage/settings";
import { openUrl, openUrls } from "./actions";
import { useBackup } from "./BackupDialogs";
import { Button } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import { ToastProvider, useToast } from "./components/Toast";
import { downloadText } from "./download";
import { EntriesPane, SearchResultsPane } from "./EntriesPane";
import {
  DeleteEntryDialog,
  DiscardChangesDialog,
  MoveEntryDialog,
  OpenAllDialog,
} from "./EntryDialogs";
import { EntryForm, EntryView } from "./EntryDetails";
import { Header, type MenuActions } from "./Header";
import { useOpenOrigins } from "./openTabs";
import { Pane } from "./Pane";
import { SettingsDialog } from "./SettingsDialog";
import { DeleteTopicDialog, TopicNameDialog } from "./TopicDialogs";
import { TopicsPane } from "./TopicsPane";

interface AppProps {
  repository: CatalogRepository;
  settingsRepository: SettingsRepository;
}

export function App({ repository, settingsRepository }: AppProps) {
  const [state, setState] = useState<LoadResult | null>(null);
  const [settings, setSettings] = useState<StoredSettings | null>(null);

  useEffect(() => {
    let active = true;
    let changed = false;
    const unsubscribe = repository.subscribe((result) => {
      changed = true;
      setState(result);
    });
    // A change that arrives first is newer than the initial load
    repository.load().then((result) => {
      if (active && !changed) setState(result);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  // Saved in another tab, the settings apply here at once (US-14)
  useEffect(() => {
    let active = true;
    let changed = false;
    const unsubscribe = settingsRepository.subscribe((result) => {
      changed = true;
      setSettings(result);
    });
    settingsRepository.load().then((result) => {
      if (active && !changed) setSettings(result);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [settingsRepository]);

  return (
    <ToastProvider>
      <div className="app">
        <Workspace
          // Open all must not use the defaults before the stored settings
          // arrive, so the tab stays in the loading state until then
          state={settings ? state : null}
          repository={repository}
          settings={settings ?? DEFAULT_SETTINGS}
          settingsRepository={settingsRepository}
        />
      </div>
    </ToastProvider>
  );
}

function Workspace({
  state,
  repository,
  settings,
  settingsRepository,
}: {
  state: LoadResult | null;
  repository: CatalogRepository;
  settings: StoredSettings;
  settingsRepository: SettingsRepository;
}) {
  // The dialogs stay mounted when an import moves the tab out of the error state
  const backup = useBackup(repository, state);
  // Stays mounted while closing so the browser can return focus; a new key per
  // opening resets the form to the current settings
  const [settingsDialog, setSettingsDialog] = useState<{
    open: boolean;
    key: number;
  }>();
  const closeSettings = () =>
    setSettingsDialog((current) => current && { ...current, open: false });

  return (
    <>
      <WorkspaceContent
        state={state}
        repository={repository}
        settings={settings}
        menu={{
          ...backup.actions,
          showSettings: () =>
            setSettingsDialog((current) => ({
              open: true,
              key: (current?.key ?? 0) + 1,
            })),
        }}
      />
      {backup.element}
      {settingsDialog && (
        <SettingsDialog
          key={settingsDialog.key}
          open={settingsDialog.open}
          repository={settingsRepository}
          settings={settings}
          onDone={closeSettings}
          onCancel={closeSettings}
        />
      )}
    </>
  );
}

function WorkspaceContent({
  state,
  repository,
  settings,
  menu,
}: {
  state: LoadResult | null;
  repository: CatalogRepository;
  settings: StoredSettings;
  menu: MenuActions;
}) {
  // Nothing is shown while loading so the welcome state does not flash
  if (!state)
    return (
      <>
        <Header />
        <main className="workspace workspace--single" />
      </>
    );

  if (state.status !== "ok") {
    return (
      <>
        <Header menu={menu} />
        <main className="workspace workspace--single">
          <StoredDataError state={state} onImport={menu.startImport} />
        </main>
      </>
    );
  }

  return (
    <Catalog
      catalog={state.catalog}
      repository={repository}
      settings={settings}
      menu={menu}
    />
  );
}

// Shown problems, like the import message (technical.md)
const MAX_SHOWN_PROBLEMS = 5;

// The stored value is never overwritten automatically (D-11); the user can keep
// a copy and replace it with a backup
function StoredDataError({
  state,
  onImport,
}: {
  state: LoadResult & { status: "invalid" | "error" };
  onImport: () => void;
}) {
  const showToast = useToast();
  const downloadRaw = (raw: unknown) => {
    try {
      downloadText(rawExportFileName(new Date()), serializeRaw(raw));
    } catch (error) {
      console.error("Failed to download the raw data", error);
      showToast("Could not download the raw data.", "error");
    }
  };

  return (
    <section className="empty-state" aria-labelledby="storage-error-title">
      <TriangleAlert size={32} className="storage-error__icon" />
      <h2 className="welcome__title" id="storage-error-title">
        {state.status === "invalid"
          ? "Stored data is invalid"
          : "Stored data could not be read"}
      </h2>
      {state.status === "invalid" ? (
        <>
          <p className="empty-state__text">
            It has not been changed. Download the raw data to keep a copy, or
            replace it with a backup file.
          </p>
          <ul className="problem-list">
            {state.problems
              .slice(0, MAX_SHOWN_PROBLEMS)
              .map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
          </ul>
        </>
      ) : (
        <p className="empty-state__text">
          {state.message} Reload the tab to try again, or replace the data with
          a backup file.
        </p>
      )}
      <div className="storage-error__actions">
        {state.status === "invalid" && (
          <Button
            variant="primary"
            icon={Download}
            onClick={() => downloadRaw(state.raw)}
          >
            Download raw data
          </Button>
        )}
        <Button icon={Upload} onClick={onImport}>
          Import backup
        </Button>
      </div>
    </section>
  );
}

type CatalogDialog =
  | { kind: "create" }
  | { kind: "rename"; topic: Topic }
  | { kind: "delete"; topic: Topic }
  | { kind: "delete-entry"; entry: Entry }
  | { kind: "move-entry"; entry: Entry }
  | { kind: "discard"; proceed: () => void }
  | { kind: "open-all"; topic: Topic; urls: string[] };

type DetailsMode = "view" | "add" | "edit";

function Catalog({
  catalog,
  repository,
  settings,
  menu,
}: {
  catalog: StoredCatalog;
  repository: CatalogRepository;
  settings: StoredSettings;
  menu: MenuActions;
}) {
  const openOrigins = useOpenOrigins();
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedEntryId, setSelectedEntryId] = useState<string>();
  const [mode, setMode] = useState<DetailsMode>("view");
  const [query, setQuery] = useState("");
  // A new key per opened form resets its input
  const [formKey, setFormKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  // A dialog stays mounted while closing so the browser can return focus;
  // a new key per opening resets its form
  const [dialog, setDialog] = useState<{
    value: CatalogDialog;
    open: boolean;
    key: number;
  }>();
  const showToast = useToast();

  const topics = useMemo(() => sortTopics(catalog.topics), [catalog.topics]);
  const entryCounts = useMemo(
    () =>
      new Map(
        topics.map((topic) => [topic.id, countEntries(catalog, topic.id)]),
      ),
    [catalog, topics],
  );
  const openCounts = useMemo(
    () =>
      new Map(
        topics.map((topic) => [
          topic.id,
          countOpen(
            catalog.entries.filter((entry) => entry.topicId === topic.id),
            openOrigins,
          ),
        ]),
      ),
    [catalog, topics, openOrigins],
  );
  // A topic deleted here or in another tab falls back to the first one
  const selected = topics.find((topic) => topic.id === selectedId) ?? topics[0];
  const entries = useMemo(
    () => (selected ? entriesOfTopic(catalog, selected.id) : []),
    [catalog, selected],
  );
  const results = useMemo(
    () => searchEntries(catalog, query),
    [catalog, query],
  );
  // Results replace the entries of the selected topic while the query is set
  const searching = query.trim() !== "";
  // An entry deleted or moved away here or in another tab is deselected; so is
  // a result from another topic when the search is cleared
  const selectedEntry = (
    searching ? results.map((result) => result.entry) : entries
  ).find((entry) => entry.id === selectedEntryId);
  const shownMode = mode === "edit" && !selectedEntry ? "view" : mode;

  // The browser asks before closing or reloading the tab (US-04)
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const open = (value: CatalogDialog) =>
    setDialog((current) => ({
      value,
      open: true,
      key: (current?.key ?? 0) + 1,
    }));
  const close = () =>
    setDialog((current) => current && { ...current, open: false });

  // Runs an action that leaves the entry form, asking first when it has
  // unsaved changes (D-09)
  const leaveForm = (action: () => void) => {
    if (dirty) open({ kind: "discard", proceed: action });
    else action();
  };
  const showEntry = (entryId: string | undefined) => {
    setSelectedEntryId(entryId);
    setMode("view");
  };
  // Selecting a topic, even the selected one, ends the search
  const selectTopic = (topicId: string) => {
    if (topicId === selected?.id && !searching) return;
    leaveForm(() => {
      setQuery("");
      setMode("view");
      if (topicId === selected?.id) return;
      setSelectedId(topicId);
      setSelectedEntryId(undefined);
    });
  };
  // Starting or changing a search leaves the entry form (D-09)
  const changeQuery = (next: string) => {
    if (shownMode === "view") setQuery(next);
    else
      leaveForm(() => {
        setQuery(next);
        setMode("view");
      });
  };
  const selectEntry = (entryId: string) => {
    if (entryId === selectedEntry?.id && shownMode === "view") return;
    leaveForm(() => showEntry(entryId));
  };
  const addEntry = () =>
    leaveForm(() => {
      setMode("add");
      setFormKey((key) => key + 1);
    });
  const onDirtyChange = useCallback((value: boolean) => setDirty(value), []);

  // A single site opens in front, like following a link
  const openOne = (url: string) => {
    openUrl(url, true).catch((error: unknown) => {
      console.error("Failed to open the URL", error);
      showToast("Could not open the URL.", "error");
    });
  };
  const openMany = (urls: string[]) => {
    openUrls(urls).catch((error: unknown) => {
      console.error("Failed to open the URLs", error);
      showToast("Could not open all URLs.", "error");
    });
  };
  const openAll = (topic: Topic) => {
    const urls = entries.map((entry) => entry.url);
    if (needsOpenAllConfirmation(urls.length, settings))
      open({ kind: "open-all", topic, urls });
    else openMany(urls);
  };

  // An import replaces the entry being edited, so it asks first (D-09)
  const catalogMenu: MenuActions = {
    ...menu,
    startImport: () => leaveForm(menu.startImport),
  };

  return (
    <>
      {topics.length === 0 ? (
        <Header menu={catalogMenu} />
      ) : (
        <Header query={query} onQueryChange={changeQuery} menu={catalogMenu} />
      )}
      {topics.length === 0 ? (
        <main className="workspace workspace--single">
          <Welcome onCreateTopic={() => open({ kind: "create" })} />
        </main>
      ) : (
        <main className="workspace">
          <TopicsPane
            topics={topics}
            entryCounts={entryCounts}
            openCounts={openCounts}
            selectedId={selected?.id}
            onSelect={selectTopic}
            // A new topic is selected after creation, which leaves the form
            onCreate={() => leaveForm(() => open({ kind: "create" }))}
            onRename={(topic) => open({ kind: "rename", topic })}
            onDelete={(topic) => open({ kind: "delete", topic })}
          />
          {searching ? (
            <SearchResultsPane
              results={results}
              openOrigins={openOrigins}
              selectedId={selectedEntry?.id}
              onSelect={selectEntry}
              onOpen={openOne}
              onClear={() => changeQuery("")}
            />
          ) : (
            selected && (
              <EntriesPane
                topic={selected}
                entries={entries}
                openOrigins={openOrigins}
                selectedId={shownMode === "add" ? undefined : selectedEntry?.id}
                onSelect={selectEntry}
                onOpen={openOne}
                onOpenAll={() => openAll(selected)}
                onAdd={addEntry}
              />
            )
          )}
          <Pane title="Details">
            {selected && shownMode !== "view" ? (
              <EntryForm
                key={formKey}
                repository={repository}
                topicId={selected.id}
                entry={shownMode === "edit" ? selectedEntry : undefined}
                onSaved={showEntry}
                onCancel={() => setMode("view")}
                onDirtyChange={onDirtyChange}
              />
            ) : selectedEntry ? (
              <EntryView
                key={selectedEntry.id}
                entry={selectedEntry}
                canMove={topics.length > 1}
                onOpen={openOne}
                onEdit={() => {
                  setMode("edit");
                  setFormKey((key) => key + 1);
                }}
                onMove={() =>
                  open({ kind: "move-entry", entry: selectedEntry })
                }
                onDelete={() =>
                  open({ kind: "delete-entry", entry: selectedEntry })
                }
              />
            ) : (
              <EmptyState
                icon={FileText}
                text="Select an entry to see its details."
              />
            )}
          </Pane>
        </main>
      )}
      {dialog && (
        <CatalogDialogs
          dialog={dialog}
          repository={repository}
          topics={topics}
          entryCounts={entryCounts}
          onTopicCreated={(topicId) => {
            setSelectedId(topicId);
            showEntry(undefined);
          }}
          onEntryRemoved={() => showEntry(undefined)}
          // A moved entry stays among the search results
          onEntryMoved={() => {
            if (!searching) showEntry(undefined);
          }}
          onDiscard={(proceed) => {
            setDirty(false);
            setMode("view");
            proceed();
          }}
          onOpenAll={openMany}
          close={close}
        />
      )}
    </>
  );
}

function CatalogDialogs({
  dialog,
  repository,
  topics,
  entryCounts,
  onTopicCreated,
  onEntryRemoved,
  onEntryMoved,
  onDiscard,
  onOpenAll,
  close,
}: {
  dialog: { value: CatalogDialog; open: boolean; key: number };
  repository: CatalogRepository;
  topics: Topic[];
  entryCounts: ReadonlyMap<string, number>;
  onTopicCreated: (topicId: string) => void;
  onEntryRemoved: () => void;
  onEntryMoved: () => void;
  onDiscard: (proceed: () => void) => void;
  onOpenAll: (urls: string[]) => void;
  close: () => void;
}) {
  const { value, open, key } = dialog;
  switch (value.kind) {
    case "create":
    case "rename":
      return (
        <TopicNameDialog
          key={key}
          open={open}
          repository={repository}
          topic={value.kind === "rename" ? value.topic : undefined}
          onDone={(topicId) => {
            if (value.kind === "create") onTopicCreated(topicId);
            close();
          }}
          onCancel={close}
        />
      );
    case "delete":
      return (
        <DeleteTopicDialog
          key={key}
          open={open}
          repository={repository}
          topic={value.topic}
          entryCount={entryCounts.get(value.topic.id) ?? 0}
          onDone={close}
          onCancel={close}
        />
      );
    case "delete-entry":
      return (
        <DeleteEntryDialog
          key={key}
          open={open}
          repository={repository}
          entry={value.entry}
          onDone={() => {
            onEntryRemoved();
            close();
          }}
          onCancel={close}
        />
      );
    case "move-entry":
      return (
        <MoveEntryDialog
          key={key}
          open={open}
          repository={repository}
          entry={value.entry}
          currentTopic={topics.find(
            (topic) => topic.id === value.entry.topicId,
          )}
          targets={topics.filter((topic) => topic.id !== value.entry.topicId)}
          onDone={() => {
            onEntryMoved();
            close();
          }}
          onCancel={close}
        />
      );
    case "discard":
      return (
        <DiscardChangesDialog
          key={key}
          open={open}
          onDiscard={() => {
            close();
            onDiscard(value.proceed);
          }}
          onKeepEditing={close}
        />
      );
    case "open-all":
      return (
        <OpenAllDialog
          key={key}
          open={open}
          topic={value.topic}
          count={value.urls.length}
          onOpenAll={() => {
            close();
            onOpenAll(value.urls);
          }}
          onCancel={close}
        />
      );
  }
}

function Welcome({ onCreateTopic }: { onCreateTopic: () => void }) {
  return (
    <section className="empty-state" aria-labelledby="welcome-title">
      <FolderPlus size={32} />
      <h2 className="welcome__title" id="welcome-title">
        Welcome to Clay
      </h2>
      <p className="empty-state__text">
        Group the websites you use into topics, with their sign-in details.
      </p>
      <Button variant="primary" icon={FolderPlus} onClick={onCreateTopic}>
        Create topic
      </Button>
      <p className="welcome__note">
        <Lock size={16} />
        Your data is stored unencrypted in this browser profile.
      </p>
    </section>
  );
}
