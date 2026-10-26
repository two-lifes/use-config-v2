# Work Plan

Sources: [product.md](product.md), [user-stories.md](user-stories.md),
[decisions.md](decisions.md), [technical.md](technical.md),
[design.md](design.md).

Status: stage 1 is done (C1 closed). The next task is 2.1.

## Rules

- Tasks are executed one at a time with `/next-task` (the
  [next-task skill](../.claude/skills/next-task/SKILL.md)). It picks the first
  unchecked numbered task in document order.
- Mark `[x]` only after the task is done and its checks pass. Checkpoint rows
  (`C1`…) are closed when all tasks of the stage are done and the stated
  outcome is verified; record the date, environment and checks under the
  checkpoint.
- A task that depends on a **Proposed** decision asks the user first unless the
  decision has been confirmed.
- Each implementation task adds or updates tests for its behavior.

## 1. Foundation

- [x] 1.1. Scaffold the project: `package.json` with pinned versions, TypeScript
  strict config, Vite multi-entry build (tab page and service worker),
  `public/manifest.json` with D-13 permissions, placeholder icons, minimal React
  page showing the product name, and the toolbar icon handler from
  [technical.md](technical.md#toolbar-icon-behavior). Record the commands in
  `CLAUDE.md`.
- [x] 1.2. Linting and formatting (D-14): ESLint with typescript-eslint,
  Prettier, `lint`, `format`, `format:check` scripts. Confirm the TypeScript
  version is supported by typescript-eslint and adjust the pin if not.
- [x] 1.3. Playwright setup: `unit` and `e2e` projects, a fixture that loads
  `dist/` into headless Chromium and resolves the extension ID, a smoke test
  that opens the tab page, and a test of open-or-focus (US-01 except the
  welcome state). Add the `check` script.

- [x] **C1:** the built extension loads in headless Chromium, the tab opens and
  is focused instead of duplicated, and type check, lint, format check and tests
  pass.
  Closed 2026-10-26: Linux (WSL2), Node.js 24.22.1, Playwright 1.64.1 with its
  bundled Chromium 156 (headless); `npm run check` passed (typecheck, lint,
  format check, build, 3 end-to-end tests; no unit tests yet).

## 2. Data

- [ ] 2.1. Model and validation in `src/lib`: types, field rules and limits from
  [data schema v1](technical.md#data-schema-v1), URL rules, topic name
  uniqueness; unit tests.
- [ ] 2.2. Pure catalog operations: create, rename and delete topics (cascade),
  add, edit, delete and move entries, sorting, search (D-10); unit tests.
- [ ] 2.3. Storage repository in `src/storage`: load with validation, empty
  catalog on a missing key, invalid-state detection without overwriting (D-11),
  queued read-modify-write operations, `onChanged` subscription, write error
  results; end-to-end tests through the extension page (US-11 storage part,
  US-12 data part).
- [ ] 2.4. Export file format in `src/lib`: serialization and import parsing
  with complete validation and messages (at most 5 problems), size limit,
  newer-version message; unit tests including an export/import round trip.

- [ ] **C2:** all data rules from [technical.md](technical.md) are covered by
  passing unit tests, and the storage repository works in the built extension.

## 3. Interface

- [ ] 3.1. Design tokens and base components from [design.md](design.md):
  light and dark themes, buttons, inputs, dialog, toast, empty state, icons
  (D-15); app shell with header and three panes; welcome state and plaintext
  note (US-01).
- [ ] 3.2. Topics pane: create, rename, delete with entry count confirmation,
  selection, sorting, validation messages (US-02).
- [ ] 3.3. Entries pane and details: list with favicons and letter avatars,
  details view, add and edit form with validation, delete, move, unsaved
  changes guard (D-09) (US-03, US-04, US-05).
- [ ] 3.4. Search: header field, `Ctrl+F`/`Cmd+F`, `Escape`, results with topic
  names, empty state with Clear search (US-08).
- [ ] 3.5. Actions: open URL and additional URL, Open all with confirmation over
  10, copy username and password with toast, reveal toggle (US-06, US-07).
- [ ] 3.6. Export and import UI: menu, warning, replace confirmation with
  counts, error messages; storage error states in the UI (US-09, US-10,
  US-11).

- [ ] **C3:** every story in [user-stories.md](user-stories.md) is implemented
  and covered by passing end-to-end tests, except the parts marked as manual.

## 4. Finish

- [ ] 4.1. Quality pass: keyboard navigation and focus order, contrast in both
  themes, reduced motion, screenshots of the main states in light and dark
  themes reviewed against [design.md](design.md); fix findings.
- [ ] 4.2. Packaging: pin the extension ID with a manifest `key` (D-12), final
  name and icons (open question 1), version 1.0.0, `README.md` with build and
  "Load unpacked" instructions and the backup advice.
- [ ] 4.3. Manual check by the user in their own Chrome: load `dist/` unpacked,
  go through the main scenarios, the leave-page prompt (US-04) and export/import
  with a real file; record the result.

- [ ] **C4:** the MVP meets the [definition of done](product.md#6-definition-of-done-for-the-mvp).
