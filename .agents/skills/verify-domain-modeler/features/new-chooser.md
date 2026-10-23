# New chooser

A user presses `c` to choose Entity or Enum, then names the new card. The toolbar still starts either kind directly, and `Meta+n` creates a new model rather than opening the chooser.

## Sub-features

- `new-chooser` covers opening, wrapping the highlight, picking by key or click, cancelling without history, typing `c`, and New Document.

## How to get to it (user POV)

- Press `c` in Normal mode, including while the relationship inspector is open but no text input has focus.
- In the chooser, use ArrowDown/ArrowUp, then Enter; press `1` for Entity or `2` for Enum; or click an option.
- Press Escape or click outside to cancel.
- Click `+ Create` in the toolbar; it opens the same chooser as `c`.
- Press `Meta+n` on macOS (`Control+n` elsewhere), including while typing, or click `New model`.

## Driving it with agent-browser

Preconditions:

- Baseline `Blog` sample; mode `Mode: NORMAL`; Undo disabled.
- Save snapshots and screenshots under `.verify/latest/evidence/new-chooser/` after each action and result.

- **Open.** Run `ab press c`. Mode is `Mode: NEW`, `ab get count '[role="listbox"][aria-label="Create new"]'` is `1`, and `ab get attr '[role="option"]:nth-child(2)' aria-selected` is `true`.
- **Wrap.** Run `ab press ArrowDown`; Enum is selected. Run it again; Entity is selected. `ab press ArrowUp` wraps back to Enum.
- **Cancel.** Run `ab press Escape`. Mode is `Mode: NORMAL`, the listbox is gone, and `ab is enabled '[aria-label="Undo"]'` is `false`. Repeat opening, then `ab mouse move 10 10`, `ab mouse down`, and `ab mouse up` to cancel outside the chooser; Undo remains disabled.
- **Entity.** Run `ab press c`, then `ab press Enter`. Mode is `Mode: CREATING`; `ab eval 'document.activeElement?.getAttribute("aria-label")'` reads `New entity name`. Run `ab keyboard type Comment` and `ab press Enter`; `ab get count '[aria-label="Entity Comment"]'` is `1`.
- **Enum.** Run `ab press c`, then `ab press 2`. The focused input is `New enum name`. Run `ab keyboard type Priority` and `ab press Enter`; `ab get count '[aria-label="Enum Priority"]'` is `1`.
- **Second view.** Run `ab press Escape`, `ab press u`; Priority disappears. Run `ab press Control+r`; it returns. Repeat undo twice and redo twice to check both new cards.
- **Click option.** Run `ab press c`, then `ab click '[role="option"]:last-child'`. The enum draft has focus; `ab press Escape` cancels it. Repeat with Entity, or pick Entity with `ab press 1`.
- **Typing.** Start an entity draft with `ab press c` and `ab press Enter`, then `ab press c`. `ab get value '[aria-label="New entity name"]'` is `c`, and no chooser opens.
- **New Document while typing.** With that draft still focused, run `ab press Meta+n`. Mode returns to `Mode: NORMAL`, `ab get value '[aria-label="Model name"]'` is `Untitled`, and both `ab get count '[data-entity-id]'` and `ab get count '[data-type-id]'` are `0`. No new confirmation is expected.
- **Errors.** Run `ab errors > .verify/latest/evidence/new-chooser/errors.txt`; the file must be empty. Run `cleanup`.

## Gotchas

- `c` is not an entity-name input shortcut anymore: pick Entity or Enum before typing a name.
- `Meta+n` is New Document, never the chooser. Native Tauri-window key handling remains unverified by web mode; use a desktop launch plus `doctor` only as a build/boot smoke check, then clean up.
- Creation uses the canvas point captured when the chooser opened; the popover itself stays at screen center.
- The toolbar titles are `Create entity or enum (c)` and `New model (⌘N)`; clicking `+ Create` opens the chooser just like `c`.
