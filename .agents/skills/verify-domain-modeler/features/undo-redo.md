# Undo and redo

A user steps backward and forward through discrete model edits with toolbar buttons or keys; in-progress drags and pans do not create history entries.

## Sub-features

- `history-undo-key` undoes with `u` or `Meta+z`.
- `history-redo-key` redoes with `Control+r` or `Meta+Shift+z`.
- `history-buttons` uses the toolbar `Undo` / `Redo` buttons and their disabled states.
- `history-new-edit-clears-redo` drops the redo stack after a fresh edit.

## How to get to it (user POV)

- Press `u` / `⌘Z` and `⌃r` / `⌘⇧Z` in Normal mode.
- Click `↶ Undo` / `↷ Redo` in the bottom toolbar.

## Driving it with agent-browser

Preconditions:

- Baseline `Blog` sample; mode `Mode: NORMAL`; `Undo` and `Redo` disabled (`agent-browser is enabled '[aria-label="Undo"]'` prints false).

- **Make an edit.** Create entity `Comment` (see [create-entity](./create-entity.md)). `Undo` becomes enabled.
- **Undo by key.** Run `agent-browser press u`. `agent-browser get count '[aria-label="Entity Comment"]'` is `0`; `Redo` is enabled.
- **Redo by key.** Run `agent-browser press Control+r`. The count is `1` again.
- **Undo by button.** Run `agent-browser click '[aria-label="Undo"]'`. The count is `0`.
- **Redo by button.** Run `agent-browser click '[aria-label="Redo"]'`. The count is `1`.
- **New edit clears redo.** Run `agent-browser press u`, then create entity `Other`. `Redo` is disabled.
- **Proof.** Save `agent-browser snapshot -c` after each step to `$VERIFY_EVIDENCE/history/<step>.aria.txt`, plus a final screenshot.

## Gotchas

- Keys only work in Normal mode. After creating or editing, confirm `Mode: NORMAL` before pressing `u`.
- History holds at most 50 snapshots; older edits drop off silently.
- Undo restores the document but not selection or expansion state you did not change, so a re-created entity may render collapsed.
- `Control+r` in some browsers reloads the page if the app does not swallow it, which resets everything to the sample. If the canvas resets, that is a failure to report.
