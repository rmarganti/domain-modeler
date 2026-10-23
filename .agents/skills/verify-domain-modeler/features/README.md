# Domain Modeler verification map

This directory is the maintained source for verifying the user-facing behavior of Domain Modeler. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `.agents/skills/verify-domain-modeler/scripts/verify.sh launch` (web mode unless the feature says otherwise).
- `.agents/skills/verify-domain-modeler/scripts/verify.sh doctor` reports `doctor: OK`.
- The canvas shows the `Blog` sample: entities `User`, `Post`, `Tag`; a collapsed enum card `Enum Role` (values `reader`, `author`, `admin`) below `User`, which types `User.role`; edges `Relationship writes 1:0..*` and `Relationship tagged 0..*:0..*`; `Undo` and `Redo` disabled.
- `ab …` in every recipe means `.agents/skills/verify-domain-modeler/scripts/verify.sh ab …`, which aims `agent-browser` at the latest run's session.
- Never drive an instance this run did not launch (in particular nothing on port 1420).

## Driving conventions

- Start every recipe from the baseline. `ab reload` restores it. The only state kept across reloads is the command palette's recent list (`localStorage`).
- Assert the mode pill after every step that changes mode: `ab get attr '[aria-label^="Mode:"]' aria-label`.
- Prefer aria labels and roles. For unlabeled or repeated buttons, take a ref from `ab snapshot -i -s '<card selector>'`.
- Treat every command as literal apart from expanding `ab`. Keep quoted names unchanged.
- Move the mouse off the canvas items (`ab mouse move 5 5`) before `get text` on a card: hovering a field row hides its type and badges.

## Proof and skip reporting

- Save artifacts to `.verify/latest/evidence/<feature-id>/`. Run `mkdir -p .verify/latest/evidence/<feature-id>` first; `ab screenshot` creates it, but a shell `>` redirect does not.
- UI proof is an ARIA snapshot (`snapshot -c`) plus a screenshot, for both the action and the resulting state.
- Mutation proof includes a second view: re-expand, undo/redo, or a different element that reflects the change.
- Finish with `ab errors > .verify/latest/evidence/<feature-id>/errors.txt`; it must be empty.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point (for example, a desktop-only path) as verified through a different one.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with agent-browser` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Spatial navigation](./spatial-nav.md) covers Ctrl+h/j/k/l directional selection, viewport-center fallback, minimal reveal pan, and expansion/history preservation.
- [Command palette](./command-palette.md) covers Command+K (Ctrl+Shift+K elsewhere) fuzzy command search, aliases, hidden selection commands, running commands, and recents kept across reloads.
- [Card picker](./card-picker.md) covers Command+P (Ctrl+P elsewhere) fuzzy entity/enum search, ranking/highlights, keyboard/mouse picking, centering without resize/zoom, and cancellation.
- [Row cursor](./row-cursor.md) covers title/field/value selection, j/k and gg/G motion, row-aware edit/delete, o/O insertion, J/K reorder, and undo/redo safety.
- [Zoom and fit](./zoom.md) covers keyboard/HUD zoom, fit-all, fit-selection, text-mode behavior, and history preservation.
- [Auto-arrange](./auto-arrange.md) covers the HUD button and Shift+A column layout, fitting afterwards, and one-step undo.
- [Keyboard shortcuts](./shortcuts.md) covers the `?` overlay, task-based sections, toolbar titles, cancellation, and selection/history preservation.
- [New chooser](./new-chooser.md) covers `c`, Entity/Enum selection, cancellation, text input, and `Meta+n` for a new model.
- [Create an entity](./create-entity.md) covers keyboard and toolbar creation, cancel, delete, and undo.
- [Edit fields](./edit-fields.md) covers adding, editing, and cancelling fields on an entity, including typing a field by an enum and "New enum…".
- [Enums](./enums.md) covers enum cards: create, rename, values, reorder, drag, delete, undo, and "used by" highlighting.
- [Connect entities](./connect-entities.md) covers `r` and the entity-only connection picker, cancellation/self relationships/history, port-drag creation, and the relationship inspector.
- [Undo and redo](./undo-redo.md) covers toolbar and keyboard history across discrete edits.
- [Open and save files](./files.md) covers native file dialogs. Desktop only; web mode can only prove the refusal notice.
