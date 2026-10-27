# Decision Log

Statuses:

- **Agreed** — explicitly confirmed by the user.
- **Delegated** — the user left the choice to the agent; the agent's choice is
  recorded and may be revisited by the user at any time.
- **Proposed** — suggested by the agent and not yet confirmed; must not be
  treated as agreed. Ask the user before implementing behavior that depends on
  it, unless the task says otherwise.
- **Superseded** — replaced by a later decision.

D-01–D-18 were made on 2026-10-26; D-19–D-24 on 2026-10-27 for the
improvements of stage 5 ([tasks.md](tasks.md#5-improvements)).

| ID | Decision | Status |
|---|---|---|
| D-01 | Start a new project from scratch in `use-config-v2`, fully revising the decisions of the Windows WPF project (`../use-config`). The old repository is kept unchanged; no code, format or data is migrated. | Agreed |
| D-02 | Platform: Google Chrome extension, Manifest V3. Minimum Chrome version 120 (`runtime.getContexts` needs 116+); raised to 121 by D-24. | Agreed |
| D-03 | The interface is a full extension tab, not a popup or side panel. The toolbar icon opens it or focuses the already open tab. | Agreed |
| D-04 | Storage: `chrome.storage.local`. Manual editing of data files is not needed; no files on disk. | Agreed |
| D-05 | Data, including passwords, is stored unencrypted. No master password or locking. | Agreed |
| D-06 | No timed mechanics: the password reveal is a plain toggle, copying does not clear the clipboard later. | Agreed |
| D-07 | Backup is one JSON export file; import validates and replaces the catalog after confirmation. JSON instead of ZIP avoids an archive dependency. | Agreed (plan approved by the user) |
| D-08 | Stack: TypeScript, React, Vite, plain CSS with design tokens; Playwright for unit and end-to-end tests. | Agreed (TypeScript, tab UI); Delegated (React: chosen for growth and a modern UI) |
| D-09 | Unsaved form changes: ask Discard changes / Keep editing. No persistent drafts. | Agreed |
| D-10 | Search matches name, URL, additional URL, description and username; never passwords or 2FA notes. | Agreed |
| D-11 | Unreadable or invalid stored data is never overwritten automatically; the extension shows an error state and offers a raw data export. | Agreed |
| D-12 | Distribution: loaded unpacked from `dist/`; Chrome Web Store publication is out of scope. The extension ID is pinned with a manifest `key`, because an unpacked extension's ID otherwise depends on its folder path and a new ID means empty storage. | Agreed |
| D-13 | Permissions: `storage` and `favicon` only. No host permissions, no `tabs`, no content scripts. Favicons are shown next to entries. | Superseded by D-19 |
| D-14 | Linting and formatting: ESLint with typescript-eslint and Prettier. The TypeScript version must be one that typescript-eslint supports; check at scaffold time. | Agreed |
| D-15 | Icons: `lucide-react` (ISC license) instead of hand-drawn SVG. | Agreed |
| D-16 | Documentation in `docs/` is in English; communication with the user is in Russian; interface text is English. | Agreed (carried over from the old project's rules) |
| D-17 | The work plan is executed one task at a time with the `/next-task` command; completion marks, commits and pushes are proposed after verification. | Agreed |
| D-18 | Visual design: the system in `design.md` (neutral surfaces, one indigo accent, system fonts, light and dark themes). | Delegated |
| D-19 | Permissions: `storage`, `favicon` and `tabs`. `tabs` lets the extension read the URLs of open tabs for the open-tab indicator (D-22); Chrome shows the warning "Read your browsing history" when the extension is loaded. Still no host permissions and no content scripts. | Agreed |
| D-20 | Settings: a Settings dialog opened from the header menu. Settings are stored under a separate `settings` key in `chrome.storage.local` and are not part of the export file, so export format v1 does not change. | Agreed (Settings section); Delegated (storage key, not exported) |
| D-21 | Open all asks for confirmation when the topic has more than N entries. N is a setting, default 10, an integer from 1 to 500. After confirmation every tab is opened; there is no hard cap. | Agreed (configurable confirmation); Delegated (default and range) |
| D-22 | An entry counts as open when some browser tab has the same origin (scheme, host and port) as the entry's URL. The additional URL is not considered. The indicator updates in real time from tab events, without reloading. | Agreed |
| D-23 | Quick actions in each entry row of the entries pane: Open URL, Copy username, Copy password. They appear when the pointer hovers the row and when keyboard focus is inside the row; otherwise they are hidden. | Agreed |
| D-24 | Custom scrollbars with the standard `scrollbar-width` and `scrollbar-color` properties and theme tokens, no `::-webkit-scrollbar` rules. These need Chrome 121, so `minimum_chrome_version` becomes `"121"`. | Delegated |

## Open questions

These do not block the start of work; resolve them before the task that depends
on them.

1. ~~Final product name and toolbar icon (task 4.2).~~ Resolved 2026-10-27 by
   the user: the product name is **Clay**; the icon is the white `KeyRound`
   glyph from `lucide-react` on a rounded square in the accent color
   (`#4f46e5`). Export files are named `clay-…`; the `format` marker
   `use-config-export` of schema v1 is unchanged.

D-02 and D-09–D-15 were confirmed by the user on 2026-10-26 after being
proposed by the agent. The agreed parts of D-19–D-23 were answered by the user
on 2026-10-27.
