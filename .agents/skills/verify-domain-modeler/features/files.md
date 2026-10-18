# Open and save files

A user opens a `.domain.json` model and saves the current model through native file dialogs; the toolbar shows the file name and a clean/dirty dot. This only works in the desktop app.

## Sub-features

- `file-open` opens a model via the native Open dialog.
- `file-save-as` writes the model to a new path via the native Save dialog.
- `file-save` rewrites the active path without a dialog.
- `file-dirty` flips the status dot between `All changes saved` and `Unsaved changes`.
- `file-close-guard` asks before closing a window with unsaved changes.
- `file-web-refusal` shows an error notice when Open/Save is used outside the desktop app.

## How to get to it (user POV)

- Toolbar buttons `Open`, `Save`, `Save as`.
- Keys `⌘O`, `⌘S`, `⌘⇧S`.
- The window close button (close guard).

## Driving it with agent-browser

Preconditions:

- Web mode, baseline sample.

- **Web refusal.** Click `Open`. Run `agent-browser click '[aria-label="Open"]'`. `agent-browser get text '[role="alert"]'` contains `Files can only be opened and saved in the desktop app.`
- **Dirty marker.** Make any edit (create an entity). The status dot title reads `Unsaved changes`: `agent-browser get attr '[title="Unsaved changes"]' title`.
- **Proof.** Save the alert text and a screenshot to `$VERIFY_EVIDENCE/file-web-refusal/`.

Desktop file paths have no scripted driver. Launch with `verify.sh launch desktop` and prove only that the shell boots (`verify.sh doctor` shows window `Blog — Domain Modeler`). Report `file-open`, `file-save-as`, `file-save`, and `file-close-guard` as **unverified** unless a human drives them.

## Gotchas

- Native dialogs and the close prompt are AppKit windows outside the webview. `agent-browser` cannot see them, and System Events scripting needs Accessibility permission this setup does not have.
- `screencapture -l <window id>` of the desktop window returns a black content area, so desktop screenshots are not evidence.
- Never mark a desktop file path as verified because the web refusal notice appeared; that proves only the refusal.
