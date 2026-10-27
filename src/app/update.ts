import type {
  CatalogOperation,
  CatalogRepository,
  UpdateError,
} from "../storage/repository";

// The full storage error states arrive with task 3.6 (US-11); until then the
// form or dialog stays open and says why nothing was saved
function updateErrorMessage(error: UpdateError): string {
  switch (error.kind) {
    case "not-found":
      return `This ${error.target} no longer exists.`;
    case "invalid-name":
      return error.message;
    case "invalid-entry":
    case "invalid-state":
    case "invalid-result":
      return "Stored data is invalid, so nothing was saved.";
    case "read-failed":
    case "write-failed":
      return `Changes could not be saved: ${error.message}`;
  }
}

export type Outcome =
  | { ok: true; id: string }
  | { ok: false; error: UpdateError | { kind: "failed"; message: string } };

export async function run(
  repository: CatalogRepository,
  operation: CatalogOperation,
): Promise<Outcome> {
  try {
    return await repository.update(operation);
  } catch (error) {
    // For example a rejected Web Lock request
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: "failed", message } };
  }
}

export function outcomeMessage(outcome: Outcome & { ok: false }): string {
  return outcome.error.kind === "failed"
    ? `Changes could not be saved: ${outcome.error.message}`
    : updateErrorMessage(outcome.error);
}
