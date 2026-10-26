# Technical Design

Requirements: [product.md](product.md). Decisions: [decisions.md](decisions.md).
This document describes the intended design.
Library APIs must be checked against current documentation (Context7) when
implementing, not taken from this document or from memory.

## Stack

- TypeScript (strict), React, Vite (builds with Rolldown; multi-entry input is
  configured with `build.rolldownOptions`).
- Plain CSS with custom properties for design tokens; no CSS framework.
- Playwright: unit tests of pure logic (no browser) and end-to-end tests of the
  built extension.
- ESLint with typescript-eslint and Prettier (D-14). TypeScript is pinned to
  6.0.x because typescript-eslint 8.72 supports `typescript <6.1.0`
  (checked 2026-10-26); TypeScript 7 is not supported yet.
- Node.js and npm. Exact dependency versions are pinned in `package.json`
  (no `^` ranges) and `package-lock.json` is committed.
- New dependencies require a stated reason why existing ones are not enough.

## Project layout

```text
public/manifest.json      Manifest V3 (copied to dist/ as is)
public/icons/             Toolbar and extension icons
index.html                Extension tab page
src/background.ts         Service worker: toolbar icon handler
src/app/                  React UI (components, hooks, styles)
src/lib/                  Pure logic: model, validation, catalog operations,
                          search, export/import format. No chrome.* or DOM.
src/storage/              chrome.storage.local repository
tests/unit/               Playwright unit tests for src/lib
tests/e2e/                Playwright tests of the built extension
docs/                     Project documentation
```

`src/lib` stays free of `chrome.*`, React and DOM APIs so that it can be tested
without a browser. The UI talks to storage only through `src/storage`.

## Manifest and permissions

- `manifest_version: 3`, `minimum_chrome_version: "120"` (D-02).
- `background.service_worker: "background.js"`, `type: "module"`.
- `action` without `default_popup`; `action.onClicked` opens or focuses the tab.
- `permissions: ["storage", "favicon"]` (D-13). No host permissions, no `tabs`,
  no content scripts.
- `key`: a fixed public key so that the unpacked extension keeps the same ID
  when its folder moves (D-12). Generate the key pair once at task 4.2; only
  the public key goes into the manifest, and the private key is not committed.

### Toolbar icon behavior

The service worker finds an open extension tab with
`chrome.runtime.getContexts({ contextTypes: ["TAB"] })` (Chrome 116+; needs no
`tabs` permission) and focuses it with `chrome.tabs.update` and
`chrome.windows.update`; otherwise it calls `chrome.tabs.create` with
`chrome.runtime.getURL("index.html")`.

### Opening websites

`chrome.tabs.create({ url, active })` from the extension tab. The first tab of
"Open all" is not activated, so the extension tab stays in front (adjust if the
user prefers otherwise). Only `http:` and `https:` URLs are passed; the URL is
validated again right before opening.

### Favicons

`chrome.runtime.getURL("/_favicon/")` with `pageUrl` and `size` parameters
(the `favicon` permission). If the image fails to load, a letter avatar is
shown instead.

### Clipboard

`navigator.clipboard.writeText` called from a click handler in the extension
tab. No clipboard reading and no `clipboardRead` permission.

## Data schema v1

Stored under one key, `catalog`, in `chrome.storage.local`:

```ts
interface StoredCatalog {
  schemaVersion: 1;
  topics: Topic[];
  entries: Entry[];
}

interface Topic {
  id: string;          // crypto.randomUUID()
  name: string;
  createdAt: string;   // ISO 8601, UTC
  updatedAt: string;
}

interface Entry {
  id: string;
  topicId: string;     // must reference an existing topic
  name: string;
  url: string;
  description: string; // optional fields are stored as "" when empty
  username: string;
  password: string;
  extraUrl: string;
  twoFactorNote: string;
  createdAt: string;
  updatedAt: string;
}
```

Validation rules (shared by loading, saving and import):

| Field | Rule |
|---|---|
| Topic name | Required after trimming; at most 100 characters; unique ignoring case. Stored trimmed. |
| Entry name | Required after trimming; at most 200 characters. Stored trimmed. |
| URL, additional URL | URL required, additional URL optional; at most 2048 characters; parsed with `URL`; protocol `http:` or `https:`. Stored trimmed. |
| Username, password | At most 1000 characters. Stored exactly as entered (no trimming). |
| Description, 2FA note | At most 10,000 characters. Line breaks kept. |
| IDs | Non-empty strings, unique within their collection. |

Lengths are counted in Unicode code points, so an emoji counts as one
character. Loading and import require stored values to be in their stored form
already (for example, a name with surrounding spaces is a problem, not trimmed
silently); unknown properties are ignored and dropped. Implemented in
`src/lib/model.ts` and `src/lib/validation.ts`.

Catalog operations, sorting and search are pure functions in
`src/lib/catalog.ts`; they receive new IDs and the current time from the caller.
Topics and entries are sorted by name with a fixed `en` collation that ignores
case and orders numbers naturally ("Item 2" before "Item 10"), then by ID.
Search trims the query; an empty query matches nothing. Results are sorted by
entry name, then topic name.

A missing `catalog` key means an empty catalog. Any other value that fails
validation is an invalid state (D-11): it is not overwritten, and the UI offers
a raw export of the stored value.

When the schema changes, `schemaVersion` increases and a pure migration
function in `src/lib` converts the previous version on load; until then only
version 1 exists and no migration code is written.

## Storage repository

Implemented in `src/storage/repository.ts`.

- `load()` reads and validates the catalog. The result is `ok` with the
  catalog (an empty one when the key is missing), `invalid` with the raw stored
  value and the problems found (D-11), or `error` when reading fails.
- `update(operation)` applies one pure operation from `src/lib` as
  read-modify-write: read the latest stored catalog, apply the operation,
  validate, write. This keeps unrelated changes from other tabs; for the same
  entry the last write wins (US-12). Updates run under one Web Lock
  (`navigator.locks`), which all pages of the extension share, so changes from
  the same tab and from different tabs are applied one after another.
- An invalid stored catalog is never written over: `update` returns an
  `invalid-state` error and leaves the stored value as it is (D-11).
- `subscribe()` uses `chrome.storage.local.onChanged` to refresh the UI when
  another tab changes data; the listener receives the same result as `load()`.
- Write errors (for example, the 10 MB `chrome.storage.local` quota, which
  counts the JSON of every value) are returned to the UI as a failed result
  (`write-failed`); the stored catalog and the in-memory state are not
  changed.
- No `unlimitedStorage` permission: the catalog is expected to be far below
  10 MB.

## Export file format

```json
{
  "format": "use-config-export",
  "schemaVersion": 1,
  "exportedAt": "2026-10-26T12:00:00.000Z",
  "topics": [],
  "entries": []
}
```

- `topics` and `entries` follow data schema v1.
- File name: `use-config-YYYY-MM-DD.json` (local date), UTF-8, indented with two
  spaces. Downloaded through a `Blob` and an `<a download>` link; no
  `downloads` permission.
- Import limit: 10 MB file size (10 × 1024 × 1024 bytes, like the
  `chrome.storage.local` quota). The UI checks the file size before reading it;
  the parser also checks the UTF-8 size of the text.
- Import rejects the whole file when: it is larger than the limit; it is not
  JSON; `format` differs; `schemaVersion` is not 1 (an integer above 1 gets a
  separate newer-version message); `exportedAt` is not an ISO 8601 UTC
  timestamp; any field fails validation; IDs repeat; an entry references a
  missing topic; topic names repeat. These checks run in this order, and each
  of the first four stops the import with its own message. Validation problems
  are counted, and the message names the first problems found (at most 5).
- A valid import replaces the stored catalog in one write.
- Serialization, the file name and import parsing are pure functions in
  `src/lib/backup.ts`; the caller passes the export time.

## Testing

- **Unit (`tests/unit`)**: model validation, catalog operations, sorting,
  search, export serialization and import validation. Runs without a browser
  using the Playwright test runner.
- **End-to-end (`tests/e2e`)**: builds `dist/`, launches Playwright's bundled
  Chromium with `chromium.launchPersistentContext` on the `chromium` channel
  (headless works with extensions only there) and the arguments
  `--disable-extensions-except` and `--load-extension`. The extension ID is
  taken from the service worker URL. Tests open
  `chrome-extension://<id>/index.html` and cover every story in
  [user-stories.md](user-stories.md).
- The tab page exposes the storage repository and the catalog operations as
  `globalThis.useConfigTest`; storage tests call them through `page.evaluate`.
- The toolbar click cannot be simulated directly; the service worker exposes its
  open-or-focus function, and the test calls it through `serviceWorker.evaluate`.
- Clipboard tests grant `clipboard-read` and `clipboard-write` to the test
  context and read the text back.
- Each test uses a fresh profile directory, so storage starts empty.

## Commands

Recorded in the root `CLAUDE.md`.

| Command | Purpose |
|---|---|
| `npm run build` | Type check and build the extension into `dist/` |
| `npm run typecheck` | `tsc --noEmit` for `src` and for the tests (`tests/tsconfig.json`) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write (Markdown is excluded) |
| `npm run format:check` | Prettier check |
| `npm run test:unit` | Unit tests (passes while `tests/unit` is empty) |
| `npm run test:e2e` | Build, then end-to-end tests |
| `npm run check` | All of the above |

## Environment

Development and verification run in Linux (WSL2) with Node.js 24 and
Playwright's bundled Chromium. Google Chrome itself is not installed there; the
final manual check happens in the user's own Chrome (task 4.3).
