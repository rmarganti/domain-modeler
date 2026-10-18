# Keyboard shortcuts

The shortcut reference opens with `?` or the toolbar button, lists bindings in task-based sections, and closes without changing selection or history. Shortcut labels follow the platform: Command on Apple platforms and Ctrl elsewhere.

## Sub-features

- `shortcuts-open`: keyboard and toolbar entry points show the dialog and HELP mode.
- `shortcuts-reference`: Move around, File, Build, View, and Mouse sections plus `While typing` and `In menus` notes list every binding once; toolbar titles match.
- `shortcuts-close`: Escape, `?`, the close button, and outside clicks return to Normal without history changes or lost selection.
- `shortcuts-text`: `?` types normally in inputs; toolbar help abandons an unfinished draft without committing it.

## How to get to it (user POV)

- Press `?` in Normal mode, with or without a selection (including the relationship inspector).
- Click the toolbar button `Keyboard shortcuts` (title `Keyboard shortcuts (?)`).

## Driving it with agent-browser

Preconditions: baseline from the README; doctor reports OK. Save snapshots and screenshots under `.verify/latest/evidence/shortcuts/` before and after each transition.

- **Keyboard open:** `ab press ?`; `ab get attr '[aria-label^="Mode:"]' aria-label` returns `Mode: HELP`. `ab snapshot -c -s '[role="dialog"][aria-label="Keyboard shortcuts"]'` lists regions `Move around`, `File`, `Build`, `View`, `Mouse`, `While typing`, and `In menus`; the Undo row shows chips `u` or `⌘Z` on Apple (`u` or `Ctrl+Z` elsewhere). At desktop size the whole dialog fits without scrolling.
- **Escape:** `ab press Escape`; mode returns to NORMAL, `ab get count '[role="dialog"][aria-label="Keyboard shortcuts"]'` is `0`, and `ab is enabled '[aria-label="Undo"]'` is `false`.
- **Toolbar:** `ab click '[aria-label="Keyboard shortcuts"]'`; the dialog reopens. `ab mouse move 10 10`, `ab mouse down`, `ab mouse up` clicks its backdrop and closes it. Undo remains disabled.
- **Titles:** `ab get attr '[aria-label="Undo"]' title` returns `Undo (u / ⌘Z)` on Apple (`Undo (u / Ctrl+Z)` elsewhere). `ab get attr '[aria-label="Keyboard shortcuts"]' title` returns `Keyboard shortcuts (?)`. Open/Save/New titles use the same platform's modifiers.
- **Question-mark and close-button exits:** `ab press Shift+?` opens HELP, `ab press Shift+?` closes it. `ab press ?`, then `ab click '[aria-label="Close keyboard shortcuts"]'` returns to NORMAL.
- **Selection survives:** `ab click '[aria-label="Go to enum Role"]'`, `ab press ?`, `ab press Escape`; `Enum Role` still has its selection ring, and the `User.role` row still carries `data-uses-selected-type`. No history entry was added.
- **Typing stays text:** `ab click '[aria-label="Model name"]'`, `ab press ?`; `ab get value '[aria-label="Model name"]'` contains `?` and no dialog appears. Reload afterward to restore the baseline.
- **Finish:** `ab errors > .verify/latest/evidence/shortcuts/errors.txt` is empty. Run cleanup.

## Gotchas

- `[aria-label="Keyboard shortcuts"]` matches only the toolbar button when closed, but also the dialog and its Help section when open. Scope the dialog by `[role="dialog"]` and the toolbar button by `button` if needed.
- The background is inert while help is open: its controls cannot be clicked until help closes. Read the mode pill through its DOM attribute; it is omitted from the accessibility tree while inert.
- Normal shortcuts are suppressed in text inputs. The dialog takes focus so `?` can close it even if toolbar help was opened while typing.
- Plain and shifted `?` both work; a raw `Shift+/` command may produce `/` rather than `?` in an automation tool. Use `?` or `Shift+?`.
- Native file dialogs and Tauri-window keyboard behavior are not covered by web verification.
