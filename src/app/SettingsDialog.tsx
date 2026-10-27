import { useId, useState, type FormEvent } from "react";
import {
  OPEN_ALL_THRESHOLD,
  SETTINGS_SCHEMA_VERSION,
  validateOpenAllThreshold,
  type StoredSettings,
} from "../lib/settings";
import type { SettingsRepository } from "../storage/settings";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { TextField } from "./components/TextField";

interface SettingsDialogProps {
  open: boolean;
  repository: SettingsRepository;
  settings: StoredSettings;
  onDone: () => void;
  onCancel: () => void;
}

// Nothing is written until Save, so Cancel changes nothing (US-14)
export function SettingsDialog({
  open,
  repository,
  settings,
  onDone,
  onCancel,
}: SettingsDialogProps) {
  const formId = useId();
  const [threshold, setThreshold] = useState(
    String(settings.openAllConfirmThreshold),
  );
  const [thresholdError, setThresholdError] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const checked = validateOpenAllThreshold(threshold);
    if (!checked.ok) {
      setThresholdError(checked.message);
      return;
    }
    setSaving(true);
    const saved = await repository.save({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      openAllConfirmThreshold: checked.value,
    });
    setSaving(false);
    if (saved.ok) {
      onDone();
    } else {
      console.error("Failed to save the settings", saved.message);
      setError("Could not save the settings.");
    }
  }

  return (
    <Dialog
      open={open}
      title="Settings"
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
            Save
          </Button>
        </>
      }
    >
      <form id={formId} className="dialog__form" onSubmit={submit} noValidate>
        <TextField
          label="Open all confirmation threshold"
          value={threshold}
          error={thresholdError}
          inputMode="numeric"
          autoFocus
          autoComplete="off"
          onChange={(event) => {
            setThreshold(event.target.value);
            setThresholdError(undefined);
            setError(undefined);
          }}
        />
        <p className="dialog__note">
          Open all asks first when a topic has more entries than this. A whole
          number from {OPEN_ALL_THRESHOLD.min} to {OPEN_ALL_THRESHOLD.max}.
        </p>
        {error && (
          <p className="dialog__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
