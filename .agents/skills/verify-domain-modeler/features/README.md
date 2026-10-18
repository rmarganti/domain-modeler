# Domain Modeler verification map

This directory is the maintained source for verifying the user-facing behavior of Domain Modeler. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `eval "$(.agents/skills/verify-domain-modeler/scripts/verify.sh launch)"` (web mode unless the feature says otherwise).
- `verify.sh doctor` reports `doctor: OK`.
- The canvas shows the `Blog` sample: entities `User`, `Post`, `Tag`; edges `Relationship writes 1:N` and `Relationship tagged N:M`; `Undo` and `Redo` disabled.
- `AGENT_BROWSER_SESSION` is set by launch, so bare `agent-browser` commands hit this run.
- Never drive an instance this run did not launch (in particular nothing on port 1420).

## Driving conventions

- Start every recipe from the baseline. `agent-browser reload` restores it (the app keeps no state across reloads).
- Assert the mode pill after every step that changes mode: `agent-browser get attr '[aria-label^="Mode:"]' aria-label`.
- Prefer aria labels and roles. For unlabeled or repeated buttons, take a ref from `agent-browser snapshot -i -s '<card selector>'`.
- Treat every command as literal. Keep quoted names unchanged.
- Move the mouse off the canvas items (`agent-browser mouse move 5 5`) before `get text` on a card: hovering a field row hides its type and badges.

## Proof and skip reporting

- Save artifacts to `$VERIFY_EVIDENCE/<feature-id>/`.
- UI proof is an ARIA snapshot (`snapshot -c`) plus a screenshot, for both the action and the resulting state.
- Mutation proof includes a second view: re-expand, undo/redo, or a different element that reflects the change.
- Finish with `agent-browser errors > $VERIFY_EVIDENCE/<feature-id>/errors.txt`; it must be empty.
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

- [Create an entity](./create-entity.md) covers keyboard and toolbar creation, cancel, delete, and undo.
- [Edit fields](./edit-fields.md) covers adding, editing, and cancelling fields on an entity.
- [Connect entities](./connect-entities.md) covers port-drag relationship creation and the relationship inspector.
- [Undo and redo](./undo-redo.md) covers toolbar and keyboard history across discrete edits.
- [Open and save files](./files.md) covers native file dialogs. Desktop only; web mode can only prove the refusal notice.
