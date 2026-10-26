import {
  FileText,
  FolderPlus,
  KeyRound,
  Lock,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { countEntries, sortTopics } from "../lib/catalog";
import type { StoredCatalog, Topic } from "../lib/model";
import type { CatalogRepository, LoadResult } from "../storage/repository";
import { Button } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import { ToastProvider } from "./components/Toast";
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

type TopicDialog =
  | { kind: "create" }
  | { kind: "rename"; topic: Topic }
  | { kind: "delete"; topic: Topic };

function Catalog({
  catalog,
  repository,
}: {
  catalog: StoredCatalog;
  repository: CatalogRepository;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  // A dialog stays mounted while closing so the browser can return focus;
  // a new key per opening resets its form
  const [dialog, setDialog] = useState<{
    value: TopicDialog;
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

  const open = (value: TopicDialog) =>
    setDialog((current) => ({
      value,
      open: true,
      key: (current?.key ?? 0) + 1,
    }));
  const close = () =>
    setDialog((current) => current && { ...current, open: false });

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
            onSelect={setSelectedId}
            onCreate={() => open({ kind: "create" })}
            onRename={(topic) => open({ kind: "rename", topic })}
            onDelete={(topic) => open({ kind: "delete", topic })}
          />
          <Pane title="Entries">
            <EmptyState
              icon={KeyRound}
              text="Select a topic to see its entries."
            />
          </Pane>
          <Pane title="Details">
            <EmptyState
              icon={FileText}
              text="Select an entry to see its details."
            />
          </Pane>
        </main>
      )}
      {dialog &&
        (dialog.value.kind === "delete" ? (
          <DeleteTopicDialog
            key={dialog.key}
            open={dialog.open}
            repository={repository}
            topic={dialog.value.topic}
            entryCount={entryCounts.get(dialog.value.topic.id) ?? 0}
            onDone={close}
            onCancel={close}
          />
        ) : (
          <TopicNameDialog
            key={dialog.key}
            open={dialog.open}
            repository={repository}
            topic={
              dialog.value.kind === "rename" ? dialog.value.topic : undefined
            }
            onDone={(topicId) => {
              setSelectedId(topicId);
              close();
            }}
            onCancel={close}
          />
        ))}
    </>
  );
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
