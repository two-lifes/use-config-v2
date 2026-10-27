# User Stories

Requirements: [product.md](product.md). Each story is verified by automated
end-to-end tests of the built extension unless it says otherwise. "Tab" means
the extension's own interface tab.

## US-01. Open the extension

As a user, I click the toolbar icon to get to my catalog.

- Clicking the icon opens the extension tab when none is open.
- Clicking it again focuses the existing tab and its window instead of opening
  a second one.
- On first run the tab shows a welcome state with a Create topic action and the
  note that data is stored unencrypted in this browser profile.

## US-02. Manage topics

As a user, I group websites into topics.

- I can create a topic; it appears in the list sorted by name and becomes
  selected.
- An empty name, or one that matches an existing topic after trimming and
  ignoring case, is rejected with an inline message; nothing is saved.
- I can rename a topic under the same rules.
- Deleting a topic with N entries asks for confirmation that states N; after
  confirmation the topic and its entries are gone. Cancel changes nothing.
- Topics and their order persist after the tab is reloaded.

## US-03. Add and edit an entry

As a user, I save a website with its sign-in details.

- In a selected topic I can add an entry with the fields from
  [product.md](product.md#3-data).
- Name and URL are required. A URL or additional URL without `http://` or
  `https://` is rejected with an inline message. Text longer than the limits is
  rejected.
- Saving shows the entry in the list, sorted by name, and selects it. The data
  persists after reload.
- I can edit any field and save; Cancel restores the saved values.
- Multiline description and 2FA note keep line breaks; non-Latin text is kept
  as entered.

## US-04. Unsaved changes

As a user, I do not lose edits by accident.

- With unsaved changes, selecting another entry or topic, starting a search or
  adding a new entry asks Discard changes / Keep editing.
- Discard leaves the saved entry unchanged and continues the action; Keep
  editing returns to the form with my input.
- Closing or reloading the tab with unsaved changes triggers the browser's
  leave-page prompt. (Checked manually; the automated test only verifies that
  the `beforeunload` handler is active.)

## US-05. Delete and move entries

- Deleting an entry asks for confirmation; Cancel changes nothing.
- Moving an entry to another topic removes it from the current list and shows
  it in the target topic; the data persists after reload.

## US-06. Open websites

As a user, I open my websites in tabs.

- Open URL and Open additional URL each open one new tab with that address.
- Open all is disabled for an empty topic.
- Open all with 10 or fewer entries opens one tab per entry without asking.
- Open all with more than 10 entries asks for confirmation that states the
  number; Cancel opens nothing.

## US-07. Copy and reveal credentials

- Copy username and Copy password put the exact text in the clipboard and show
  a confirmation toast. The buttons are disabled when the field is empty.
- The password is masked by default. The toggle shows and hides it. Selecting
  another entry masks it again.
- Nothing changes the clipboard or the mask by itself after a delay.

## US-08. Search

As a user, I find an entry without remembering its topic.

- Typing in the search field shows matching entries from all topics, each with
  its topic name, updating as I type.
- Matching ignores case and accepts partial text in name, URL, additional URL,
  description and username.
- Text that occurs only in a password or a 2FA note does not match.
- `Ctrl+F` focuses the search field; `Escape` in the field clears it.
- An empty query shows the selected topic again. No matches shows an empty
  state with Clear search.
- Selecting a result shows its details; all entry actions work from there.

## US-09. Export

- Export downloads `clay-YYYY-MM-DD.json` containing all topics and
  entries, including passwords, in the format from
  [technical.md](technical.md#export-file-format).
- The dialog warns that the file contains readable passwords.

## US-10. Import

- Importing a valid file asks to replace the catalog and shows the numbers of
  topics and entries in the file and in the current catalog.
- Confirming replaces the catalog completely; Cancel changes nothing.
- An invalid JSON file, a file of another format, a newer format version, a
  file with broken references or invalid fields, or a file larger than the
  limit is rejected with a clear message, and the catalog is unchanged.
- Export followed by import into an empty catalog restores identical data.

## US-11. Storage errors

- If a save fails, the form keeps my input and an error message is shown; the
  previously saved data remains.
- If stored data is invalid, the tab shows an error state, does not overwrite
  the data, and offers to download the raw stored data.
- From the error state I can import a backup file; it replaces the stored data
  only after I confirm.

## US-12. Several extension tabs

- A change made in one extension tab appears in another open extension tab
  without reloading.
- Changes to different entries made in two tabs are both kept. For the same
  entry, the last save wins.
