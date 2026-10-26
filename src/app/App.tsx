import {
  FileText,
  FolderPlus,
  Folders,
  KeyRound,
  Lock,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CatalogRepository, LoadResult } from "../storage/repository";
import { Button } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import { ToastProvider } from "./components/Toast";
import { Header } from "./Header";
import { Pane } from "./Pane";

interface AppProps {
  repository: CatalogRepository;
  // Creating topics arrives with the topics pane (task 3.2)
  onCreateTopic?: () => void;
}

export function App({ repository, onCreateTopic }: AppProps) {
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
        <Workspace state={state} onCreateTopic={onCreateTopic} />
      </div>
    </ToastProvider>
  );
}

function Workspace({
  state,
  onCreateTopic,
}: {
  state: LoadResult | null;
  onCreateTopic?: () => void;
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

  if (state.catalog.topics.length === 0) {
    return (
      <main className="workspace workspace--single">
        <Welcome onCreateTopic={onCreateTopic} />
      </main>
    );
  }

  return (
    <main className="workspace">
      <Pane title="Topics">
        <EmptyState icon={Folders} text="Topics will appear here." />
      </Pane>
      <Pane title="Entries">
        <EmptyState icon={KeyRound} text="Select a topic to see its entries." />
      </Pane>
      <Pane title="Details">
        <EmptyState
          icon={FileText}
          text="Select an entry to see its details."
        />
      </Pane>
    </main>
  );
}

function Welcome({ onCreateTopic }: { onCreateTopic?: () => void }) {
  return (
    <section className="empty-state" aria-labelledby="welcome-title">
      <FolderPlus size={32} />
      <h2 className="welcome__title" id="welcome-title">
        Welcome to Use Config
      </h2>
      <p className="empty-state__text">
        Group the websites you use into topics, with their sign-in details.
      </p>
      <Button
        variant="primary"
        icon={FolderPlus}
        disabled={!onCreateTopic}
        onClick={onCreateTopic}
      >
        Create topic
      </Button>
      <p className="welcome__note">
        <Lock size={16} />
        Your data is stored unencrypted in this browser profile.
      </p>
    </section>
  );
}
