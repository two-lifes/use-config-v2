# Clay

A Google Chrome extension (Manifest V3) that keeps a catalog of websites and
their credentials grouped by topic. Everything stays in the extension's local
storage of your Chrome profile: no server, no account, no network requests.

Requirements and design: [docs/product.md](docs/product.md),
[docs/technical.md](docs/technical.md).

## Requirements

- Node.js 24 and npm (the versions the project is tested with).
- Google Chrome 121 or later.

## Build

```sh
npm install
npm run build
```

The built extension is written to `dist/`. `npm run check` runs all checks
(type check, lint, format check, unit tests, build and end-to-end tests).

## Install in Chrome (Load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/` folder.
4. Optionally pin Clay to the toolbar from the extensions menu (puzzle icon).

Click the toolbar icon to open Clay in a tab; clicking it again focuses that
tab instead of opening another one.

The extension ID is pinned by the `key` in `public/manifest.json` and is always
`eicjdlcomdndfepnpfpgpjloecpnkkpj`, whatever folder you load it from. Your data
belongs to this ID, so do not change or remove `key`.

## Permissions

- **storage** keeps the catalog and the settings in this Chrome profile.
- **favicon** shows website icons from Chrome's own cache.
- **tabs** reads the addresses of open tabs to mark entries whose website is
  already open. Because of it, Chrome shows the warning **"Read your browsing
  history"** when you load or update the extension. Clay only compares the
  tabs' origins (scheme, host and port) with your entries while its tab is
  open; tab addresses are never stored or sent anywhere.

Clay has no host permissions and no content scripts: it cannot read or change
the pages you visit.

## Update

1. Get the new source and run `npm install` and `npm run build`.
2. On `chrome://extensions`, click the reload icon on the Clay card.

Reloading keeps your data. **Removing** the extension deletes it.

## Back up your data

- Data lives only in this Chrome profile on this computer. Removing the
  extension, resetting Chrome or losing the profile deletes it, and nothing is
  synchronized.
- The only backup is an export file: open the menu (⋯) and choose **Export**.
  Export regularly and after important changes. **Import** restores a file and
  replaces all current data.
- All fields, including passwords, are stored and exported as plain text. Keep
  export files somewhere safe and delete old copies you no longer need.
