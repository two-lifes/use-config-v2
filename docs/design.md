# Design System

Status: delegated — the user asked for a modern, good-looking interface and left
the details to the agent (D-08, D-18). The user may change any of it; ask before
large visual changes not described here.

## Principles

- Calm and dense enough for daily use: content first, little decoration.
- One accent color, neutral surfaces, clear hierarchy through type weight and
  spacing rather than borders and boxes.
- Every action is reachable by keyboard and has a visible focus state.
- Light and dark themes follow `prefers-color-scheme`.
- Text in the interface is English, short, sentence case ("Add entry", not
  "Add Entry").

## Tokens

Defined once as CSS custom properties on `:root`, overridden for dark mode.
Components use only tokens, never raw colors.

### Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f7f8` | `#111113` | Page background |
| `--surface` | `#ffffff` | `#1a1a1d` | Panes, cards, dialogs |
| `--surface-hover` | `#f1f1f3` | `#232327` | Hovered list items |
| `--surface-selected` | `#eef0ff` | `#262a4a` | Selected list item |
| `--border` | `#e4e4e8` | `#2c2c31` | Dividers, pane and dialog outlines |
| `--border-input` | `#8a8a94` | `#6c6c76` | Input and secondary button outlines (3:1 for UI components) |
| `--text` | `#18181b` | `#ededf0` | Primary text |
| `--text-muted` | `#63636e` | `#a0a0ab` | Secondary text, labels |
| `--accent` | `#4f46e5` | `#8b85ff` | Primary buttons, links, focus |
| `--accent-text` | `#ffffff` | `#111113` | Text on accent |
| `--danger` | `#dc2626` | `#f87171` | Destructive actions, errors |
| `--success` | `#16a34a` | `#4ade80` | Confirmation toasts |

All text and interactive element colors must meet WCAG 2.2 AA contrast
(4.5:1 for text, 3:1 for UI components) in both themes; verify when
implementing and adjust the values if needed.

### Typography

- Font: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; monospace for
  revealed passwords and URLs in details: `ui-monospace, "Cascadia Code",
  Menlo, monospace`. No web fonts (no network).
- Sizes: 12 (captions), 13 (secondary), 14 (body, default), 16 (pane titles),
  20 (entry name in details). Weights 400, 500, 600.
- Line height 1.45 for body text.

### Spacing, shape, elevation

- Spacing scale (px): 4, 8, 12, 16, 24, 32.
- Radius: 6 (inputs, buttons, list items), 10 (panes, dialogs), 999 (pills,
  avatars).
- Shadows only for floating layers (dialogs, menus, toasts):
  `0 8px 24px rgb(0 0 0 / 0.12)`; dark: `0 8px 24px rgb(0 0 0 / 0.5)`.
- Motion: 120–160 ms ease-out for hover, dialogs and toasts; none when
  `prefers-reduced-motion: reduce`.

## Layout

```text
┌──────────────────────────────────────────────────────────────────┐
│ [◆] Clay  [ Search all entries…   Ctrl+F ]                  ⋯    │  header 56px
├──────────────┬────────────────────────┬──────────────────────────┤
│ Topics    +  │ My VPS       Open all + │ [icon] Hetzner Console   │
│              │                        │ https://console…   Open  │
│ ▸ My VPS   4 │ [icon]•Hetzner  ↗ ⧉ ⧉  │                          │
│   Banking  2 │ [icon] Proxmox         │ Username  root      Copy │
│   Work     7 │ [icon] Grafana         │ Password  ••••  Show Copy│
│              │                        │ 2FA note  …              │
│              │                        │ Description …            │
│              │                        │            Edit  Delete  │
└──────────────┴────────────────────────┴──────────────────────────┘
   240px           320–400px               remaining width
```

- Header: the logo (the toolbar icon, `KeyRound` on an accent rounded square,
  24 px) and the name "Clay" on the left, then the search field right after
  the name with a fixed width of 360 px, then free space, and the menu `⋯` at
  the right edge. The search field is not centered.
- In the entries pane, `•` marks an entry that is open in a tab and `↗ ⧉ ⧉`
  are the row quick actions shown on hover or keyboard focus.
- Panes scroll independently; the header stays fixed.
- Supported viewport: 1024 × 640 px and larger. Below 1024 px the layout may
  scroll horizontally; narrower layouts are not a goal for the MVP.
- Each pane has a title row (16 px, weight 600) with its actions on the right.

## Components

- **Buttons**: primary (accent fill), secondary (surface with border), ghost
  (text only, for row and toolbar actions), danger (danger text or fill in
  confirmations). Height 32 px; icon buttons 32 × 32 px with a tooltip
  (`title`) and an `aria-label`.
- **Inputs**: height 34 px, border `--border-input`, focus ring 2 px `--accent`.
  Labels above fields; inline error text below in `--danger`. Textareas grow
  with content up to 12 lines. The entry form in the details pane is a single
  left-aligned column at most 560 px wide; fields do not stretch to the pane
  width.
- **List items**: 40 px rows (topics) and 48 px rows (entries with name and
  host on two lines); favicon or letter avatar 20 px; selected state uses
  `--surface-selected` and a 3 px accent bar on the left.
- **Entry row quick actions** (D-23): ghost icon buttons 28 × 28 px at the
  right of the row, in this order: Open URL (`ExternalLink`), Copy username
  (`User`), Copy password (`KeyRound`), each with a tooltip and an
  `aria-label`. Hidden by default; shown on `:hover` of the row and on
  `:focus-within` when focus came from the keyboard (`:focus-visible`). Showing
  them does not change the row height or shift the text; the name and host
  are truncated with an ellipsis instead.
- **Open tab indicator** (D-22): an 8 px dot in `--success` with a 2 px
  `--surface` ring at the bottom right of the favicon or letter avatar; tooltip
  and accessible name "Open in a tab".
- **Details**: entry name 20 px weight 600; fields as label/value rows with
  actions aligned right; masked password shown as 8 dots regardless of length.
- **Dialogs**: native `<dialog>` with a focus trap provided by the browser;
  title, one or two lines of text, actions right-aligned (Cancel left of the
  confirming action). `Escape` cancels. Moving an entry uses a dialog with
  a topic select (other topics only) and Cancel / Move. The current topic is
  shown above the select as a read-only label/value row, not as an input-like
  box; its text is aligned with the select's text (same left padding and
  vertical centering).
- **Toasts**: bottom center, auto-hide after 2.5 s, one at a time, announced
  with `role="status"`.
- **Empty states**: an icon, one sentence and at most one action, centered in
  the pane.
- **Menu** (header `⋯`): Settings, Export, Import, About. Settings is a
  dialog with labeled fields and Cancel / Save (D-20). About shows the version and the
  plaintext storage note.
- **Icons**: `lucide-react` (D-15), 16 px in buttons, stroke width 2.
- **Scrollbars** (D-24): `scrollbar-width: thin` and `scrollbar-color` with the
  thumb in `--border-input` and the track `transparent`, in both themes, for
  the panes, dialogs and textareas.

## Keyboard

- `Ctrl+F` / `Cmd+F`: focus search. `Escape` in search: clear.
- `Tab` order: header, topics, entries, details.
- `Enter` on a list item selects it; arrow keys move within a list.
- `Ctrl+S` / `Cmd+S` in an entry form: save.
- `Escape` in a dialog: cancel.
