# Command palette

Run one-shot commands from a fuzzy-searched list with Command+K on Apple or Ctrl+Shift+K elsewhere. Commands that don't apply right now (selection commands with nothing selected, Undo with nothing to undo, Reload without a file) are hidden. Recently run commands come first and survive reloads.

## Sub-features

- `open`: the Normal-mode shortcut opens COMMAND with `Run a command` focused.
- `list`: an empty query lists Recent, then Selection, Create, View, Edit, File, and Help, each command with its shortcut chip.
- `hide`: Selection commands appear only with a selection; Connect only for an entity; Expand/Collapse card follow the current card.
- `search`: label matches rank above alias matches; an alias match shows the alias beside the label.
- `run`: Enter or an option click closes the palette and runs the command. Connect to… and Find card… hand over to their pickers.
- `recent`: a run command moves to the front of Recent (at most 5), kept in localStorage across reloads.
- `cancel`: Escape or an outside click closes it without running anything, keeping the selection.

## How to get to it (user POV)

- Press Command+K on Apple or Ctrl+Shift+K elsewhere on the canvas, with or without a selection, or with the relationship inspector open.
- Type part of a command or an alias ("actual size", "layout", "relate"). Choose with arrows or Control+N/P, then Enter or click.
- The `?` dialog lists it as Run a command under Move around.

## Driving it with agent-browser

Preconditions: web baseline from the feature index. Clear recents first with `ab eval 'localStorage.clear()'`, then `ab reload`. Save evidence under `.verify/latest/evidence/command-palette/`.

- **Open:** `ab mouse move 5 5`, `ab press Meta+k`. Mode is `Mode: COMMAND`; the focused element's aria-label is `Run a command`. `ab get text '[role="listbox"][aria-label="Commands"]'` starts with CREATE (New entity, New enum) and has no SELECTION, RECENT, Undo, or Redo.
- **Alias:** `ab fill 'input[aria-label="Run a command"]' 'actual size'`. The only option is Reset zoom with `actual size` beside it and `⌘0`.
- **Run:** fill `arr`. Arrange cards is first and selected; `ab press Enter` returns to NORMAL, cards move as in the auto-arrange recipe, and Undo is enabled.
- **Recent:** `ab reload`, `ab press Meta+k`. The list starts with RECENT, Arrange cards, and Arrange cards is not repeated under VIEW. Escape.
- **Selection:** `ab press Meta+p`, fill `user`, Enter. `ab press Meta+k` lists SELECTION first: Zoom to selection, Connect to…, Rename, Collapse card, Delete selection.
- **Hand-over:** fill `relate`, Enter. Mode is `Mode: CONNECT` with `Connect User to` focused; fill `tag`, Enter creates `Relationship 1:0..*` and opens its inspector.
- **Hidden:** Escape twice (inspector, then selection). `ab press Meta+k`, fill `delete`: "No commands match". Escape.
- **Typing isolation:** `ab press Meta+k`, then `c`, `d`, `u`. Mode stays COMMAND and the input reads `cdu`. Escape.
- **Discovery:** `ab press ?`; the Move around section lists Run a command `⌘K` and Find a card `⌘P`. Escape.
- **Finish:** `ab errors > .verify/latest/evidence/command-palette/errors.txt` is empty; run cleanup.

## Gotchas

- Recents persist in localStorage across `ab reload`, unlike the rest of the app. Clear them before a run, or the empty-query list starts with RECENT.
- The listbox text includes section headings (CREATE, VIEW, …) only for an empty query. A query lists ranked commands without headings.
- Shift+A shows as `A` and Shift+1 as `⇧1`, the same as the shortcuts dialog.
- Ctrl+K is spatial-up on non-Apple platforms; use Control+Shift+k there.
