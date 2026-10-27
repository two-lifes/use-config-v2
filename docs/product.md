# Use Config v2 — Product Requirements

Status: agreed with the user on 2026-10-26. This is the primary source of
requirements. Decisions and their status are in [decisions.md](decisions.md);
acceptance criteria are in [user-stories.md](user-stories.md); the technical
design is in [technical.md](technical.md); visual rules are in
[design.md](design.md); the work plan is in [tasks.md](tasks.md).

This project replaces the Windows WPF application in `../use-config` and fully
revises its decisions (D-01). Only the product idea is carried over; no code,
format or data migration from the previous project is planned.

Nothing described here is implemented yet.

## 1. Purpose

Help a user return to a topic without remembering links and credentials. The
user opens a topic such as "My VPS", sees its websites, opens one or all of them
in browser tabs, and copies sign-in details.

## 2. Platform

- A Google Chrome extension, Manifest V3, loaded unpacked (D-02, D-12).
  Other Chromium browsers are not a goal and are not tested.
- The interface is a full browser tab owned by the extension. Clicking the
  toolbar icon opens it, or focuses it if it is already open (D-03).
- The interface language is English. User data is stored as entered, in any
  language.
- No server, account, network requests, telemetry or analytics.

## 3. Data

- Stored in `chrome.storage.local` of the current Chrome profile (D-04). Data
  stays on the computer and is deleted if the extension is removed; the export
  file is the only backup.
- All fields, including passwords, are stored unencrypted (D-05). Masking in the
  interface is not protection. The interface states this once in Settings/About
  and in the export dialog.
- **Topics** form a single level (no nesting) and are sorted by name. A name is
  required and must be unique after trimming whitespace, ignoring case.
- **Entries** belong to exactly one topic and are sorted by name. Fields:
  - Name — required.
  - URL — required, `http://` or `https://` only.
  - Description — optional, multiline; explains the purpose and holds search
    keywords.
  - Username — optional.
  - Password — optional.
  - Additional URL — optional, `http://` or `https://` only.
  - 2FA note — optional, multiline free text. The extension does not generate
    codes.
- One username/password pair per entry. Several accounts for one website are
  separate entries. Duplicate entry names and URLs are allowed.
- Field length limits are defined in [technical.md](technical.md#data-schema-v1).

## 4. Interface and features

**Layout:** a header with the product name, global search and a menu (Export,
Import, About), and three panes: topics, entries of the selected topic, details
of the selected entry. Layout and visual rules are in [design.md](design.md).

**First run:** an empty catalog shows a welcome state with one action: create
the first topic. The plaintext storage note is shown here once.

**Topics:**

- Create, rename, delete.
- Deleting a topic with entries asks for confirmation that shows the number of
  entries to be deleted. Deleting an empty topic asks a simple confirmation.

**Entries:**

- Add, view, edit, delete (with confirmation), move to another topic.
- Selecting an entry shows its details; editing happens in the details pane.
- Leaving a form with unsaved changes (selecting another entry or topic,
  starting a search, closing the tab) asks: Discard changes / Keep editing
  (D-09). Closing the tab uses the browser's standard leave-page prompt.

**Opening websites:**

- Open the URL or the additional URL in a new tab, from the details pane or
  with a list item action.
- "Open all" opens the URLs of every entry in the selected topic in new tabs.
  It is disabled for an empty topic. More than 10 tabs asks for confirmation
  showing the number.
- Opening a tab does not sign in, select an account or check that the site
  loaded.

**Credentials:**

- Copy username and copy password buttons; a short confirmation toast
  appears. There are no timers and no clipboard clearing (D-06).
- The password is masked; a toggle shows and hides it. It is masked again when
  another entry is selected. Nothing hides it automatically by time (D-06).

**Search:**

- One field in the header searches the whole catalog as the user types:
  entry name, URL, additional URL, description and username. It ignores case
  and matches partial text. Passwords and 2FA notes are never matched (D-10).
- `Ctrl+F` (`Cmd+F` on macOS) focuses the search field; `Escape` clears it.
- Results replace the entries pane, each showing its topic. An empty query
  returns to the selected topic. No matches shows an empty state with a Clear
  search action.
- Selecting a result shows its details and keeps the selected topic;
  selecting a topic clears the search.

**Export and import (D-07):**

- Export saves the whole catalog to one JSON file
  (`use-config-YYYY-MM-DD.json`). The dialog warns that the file contains
  readable passwords.
- Import reads such a file, validates it completely and then asks to replace
  the current catalog, showing the numbers of topics and entries in the file
  and in the current catalog. Import replaces; it never merges.
- An invalid, damaged, newer-version or oversized file is rejected with a
  clear message, and the current catalog is not changed.

**Integrity:**

- Each change is saved immediately to storage. A failed save (for example, the
  storage quota is exceeded) keeps the form contents and shows an error; the
  previously saved data remains.
- If stored data cannot be read or fails validation, the extension shows an
  error state and does not overwrite it; it offers to export the raw data for
  diagnostics (D-11).
- Changes made in one open extension tab appear in other open extension tabs.

## 5. Out of scope for the MVP

Autofill, password generation, synchronization between devices, encryption,
master password, locking, sharing, mobile versions, nested topics, tags,
drag-and-drop, merge on import, publication in the Chrome Web Store (D-12),
migration of data from the previous project.

## 6. Definition of done for the MVP

- All stories in [user-stories.md](user-stories.md) pass their acceptance
  criteria in automated end-to-end tests of the built extension in headless
  Chromium, except where a story says manual verification.
- Type checking, linting, formatting and unit tests pass.
- The user has loaded the built extension unpacked in their own Chrome and
  confirmed the main scenarios (task 4.3).
