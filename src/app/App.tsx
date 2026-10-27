import { FileText, FolderPlus, Lock, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { countEntries, entriesOfTopic, sortTopics } from "../lib/catalog";
import type { Entry, StoredCatalog, Topic } from "../lib/model";
import type { CatalogRepository, LoadResult } from "../storage/repository";
import { Button } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import { ToastProvider } from "./components/Toast";
import { EntriesPane } from "./EntriesPane";
import {
  DeleteEntryDialog,
  DiscardChangesDialog,
  MoveEntryDialog,
} from "./EntryDialogs";
import { EntryForm, EntryView } from "./EntryDetails";
import { Header } from "./Header";
import { Pane } from "./Pane";
import { DeleteTopicDialog, TopicNameDialog } from "./TopicDialogs";
import { TopicsPane } from "./TopicsPane";

interface AppProps {
  repository: CatalogRepository;
}

export function App({ repository }: AppProps) {
  const [state, setState] = useState<LoadResult | null>(null);

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

  return (
    <ToastProvider>
      <div className="app">
        <Header />
        <Workspace state={state} repository={repository} />
      </div>
    </ToastProvider>
  );
}

function Workspace({
  state,
  repository,
}: {
  state: LoadResult | null;
  repository: CatalogRepository;
}) {
  // Nothing is shown while loading so the welcome state does not flash
  if (!state) return <main className="workspace workspace--single" />;

  if (state.status !== "ok") {
    // The full error state with the raw data export is task 3.6 (US-11)
    return (
      <main className="workspace workspace--single">
        <EmptyState
          icon={TriangleAlert}
          text="Stored data could not be loaded."
        />
      </main>
    );
  }

  return <Catalog catalog={state.catalog} repository={repository} />;
}

type CatalogDialog =
  | { kind: "create" }
  | { kind: "rename"; topic: Topic }
  | { kind: "delete"; topic: Topic }
  | { kind: "delete-entry"; entry: Entry }
  | { kind: "move-entry"; entry: Entry }
  | { kind: "discard"; proceed: () => void };

type DetailsMode = "view" | "add" | "edit";

function Catalog({
  catalog,
  repository,
}: {
  catalog: StoredCatalog;
  repository: CatalogRepository;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedEntryId, setSelectedEntryId] = useState<string>();
  const [mode, setMode] = useState<DetailsMode>("view");
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

  const topics = useMemo(() => sortTopics(catalog.topics), [catalog.topics]);
  const entryCounts = useMemo(
    () =>
      new Map(
        topics.map((topic) => [topic.id, countEntries(catalog, topic.id)]),
      ),
    [catalog, topics],
  );
  // A topic deleted here or in another tab falls back to the first one
  const selected = topics.find((topic) => topic.id === selectedId) ?? topics[0];
  const entries = useMemo(
    () => (selected ? entriesOfTopic(catalog, selected.id) : []),
    [catalog, selected],
  );
  // An entry deleted or moved away here or in another tab is deselected
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
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
  const selectTopic = (topicId: string) => {
    if (topicId === selected?.id) return;
    leaveForm(() => {
      setSelectedId(topicId);
      showEntry(undefined);
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

  return (
    <>
      {topics.length === 0 ? (
        <main className="workspace workspace--single">
          <Welcome onCreateTopic={() => open({ kind: "create" })} />
        </main>
      ) : (
        <main className="workspace">
          <TopicsPane
            topics={topics}
            entryCounts={entryCounts}
            selectedId={selected?.id}
            onSelect={selectTopic}
            // A new topic is selected after creation, which leaves the form
            onCreate={() => leaveForm(() => open({ kind: "create" }))}
            onRename={(topic) => open({ kind: "rename", topic })}
            onDelete={(topic) => open({ kind: "delete", topic })}
          />
          {selected && (
            <EntriesPane
              topic={selected}
              entries={entries}
              selectedId={shownMode === "add" ? undefined : selectedEntry?.id}
              onSelect={selectEntry}
              onAdd={addEntry}
            />
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
                entry={selectedEntry}
                canMove={topics.length > 1}
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
          onDiscard={(proceed) => {
            setDirty(false);
            setMode("view");
            proceed();
          }}
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
  onDiscard,
  close,
}: {
  dialog: { value: CatalogDialog; open: boolean; key: number };
  repository: CatalogRepository;
  topics: Topic[];
  entryCounts: ReadonlyMap<string, number>;
  onTopicCreated: (topicId: string) => void;
  onEntryRemoved: () => void;
  onDiscard: (proceed: () => void) => void;
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
          targets={topics.filter((topic) => topic.id !== value.entry.topicId)}
          onDone={() => {
            onEntryRemoved();
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
  }
}

function Welcome({ onCreateTopic }: { onCreateTopic: () => void }) {
  return (
    <section className="empty-state" aria-labelledby="welcome-title">
      <FolderPlus size={32} />
      <h2 className="welcome__title" id="welcome-title">
        Welcome to Use Config
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
