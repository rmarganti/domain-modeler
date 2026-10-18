# Connect entities

A user drags from an entity's port onto another entity to create a relationship, then names it and sets each end's multiplicity and role in the inspector.

## Sub-features

- `rel-connect` creates an edge by dragging port to entity. The new edge starts as `1 ── 0..*`, from the dragged entity to the drop target.
- `rel-connect-cancel` aborts a drag with `Escape` or by releasing on empty canvas.
- `rel-inspect` opens the inspector by clicking an edge.
- `rel-multiplicity` sets an end's multiplicity to `1`, `0..1`, `0..*`, or `1..*`; the edge button and midpoint tag follow.
- `rel-role` names an end's role; a blank role shows the derived default (camelCase entity name, plural for `..*`) as a faded placeholder. Clashing roles on one entity put a `⚠` on every involved edge.
- `rel-delete` removes the selected edge with `Delete` / `Backspace`.

## How to get to it (user POV)

- Hover a card to show its two header ports (`Drag to connect`), drag to another card, release.
- Click an edge's midpoint tag (for example `writes 1 ── 0..*`).

## Driving it with agent-browser

Preconditions:

- Baseline `Blog` sample; mode `Mode: NORMAL`.
- `Tag` is collapsed and has no edge to `User`.

- **Measure.** Run `ab get box '[aria-label="Entity User"] [data-port]'` (the first match is the left header port) and `ab get box '[aria-label="Entity Tag"]'`. Take the centers as `(px, py)` and `(tx, ty)`.
- **Drag.** Run `ab mouse move px py`, `ab mouse down`, `ab mouse move <midpoint>`. Mode reads `Mode: CONNECTING`.
- **Release on target.** Run `ab mouse move tx ty` and `ab mouse up`. Mode reads `Mode: EDITING` and dialog `Relationship inspector` is open with textbox `Relationship name`, textarea `Relationship description`, and one section per end: `Role at User` with radio `1` checked in `Multiplicity at User`, and `Role at Tag` with radio `0..*` checked in `Multiplicity at Tag`. There is no reverse button and no field select: relationships link entities, never fields.
- **Name.** Run `ab fill '[aria-label="Relationship name"]' "follows"` and `ab press Tab`.
- **Multiplicity (`rel-multiplicity`).** Run `ab snapshot -i -s '[aria-label="Multiplicity at User"]'` and `ab click @eN` on radio `0..1`. That radio is checked and the edge button reads `Relationship follows 0..1:0..*`. `Escape`, `u` restores `1:0..*`; `Control+r` reapplies it.
- **Role (`rel-role`).** `ab get attr '[aria-label="Role at Tag"]' placeholder` reads `tags` (and `Role at User` reads `user`). Run `ab fill '[aria-label="Role at Tag"]' "interests"`, `ab press Tab`, close with `[aria-label="Relationship inspector"] [aria-label="Close"]`, click the edge again: `ab get value '[aria-label="Role at Tag"]'` reads `interests`.
- **Role clash.** From the baseline, drag from Post's right port onto `Tag`. Both `Relationship tagged 0..*:0..*` and the new `Relationship 1:0..*` show `⚠` with title `Role “tags” clashes on Post`. Fill `Role at Tag` on the new edge with any other name: both warnings clear.
- **Proof.** Run `ab press Escape`, `ab snapshot -c > .verify/latest/evidence/rel-connect/edges.aria.txt`, and `ab screenshot .verify/latest/evidence/rel-connect/edges.png`. The snapshot lists a third edge button after `Relationship writes 1:0..*` and `Relationship tagged 0..*:0..*`, with the new name and multiplicities.
- **Delete.** Click the new edge button, press `Delete`. Its button is gone and the two sample edges remain.

## Gotchas

- `mouse down` and an immediate `mouse up` without a move in between is a click, not a drag; nothing connects.
- Every card has exactly two ports, on the header, whether collapsed or expanded; there are no field ports. Use `[data-port]` scoped to the card, never hard-coded coordinates.
- A freshly created entity lands at viewport center and can sit on top of another card; release on a point that is inside only the intended target.
- An unnamed edge's button reads `Relationship <end 1>:<end 2>` with no name, for example `Relationship 1:0..*`. The aria-label never includes the `⚠`; read the warning from the button's `[title]` child or the snapshot's `StaticText "⚠"`.
- The multiplicity radios repeat across both ends (and `:has-text` selectors do not resolve here), so click them by ref from a snapshot scoped to `[aria-label="Multiplicity at <Entity>"]`.
- Role, name, and description commit on change: press `Tab` (or click elsewhere) after `ab fill` before closing.
- A self relationship labels its ends `Role at <Entity> (end 1)` / `(end 2)`, likewise for `Multiplicity at`.
- Two relationships between the same pair of cards draw on top of each other, and so do their midpoint tags. Click them by aria-label, not coordinates.
- The inspector is in `EDITING` mode, so Normal-mode keys (`c`, `u`) are not active until `Escape`.
- The first launch after a dependency change can reload the page once while Vite re-optimizes dependencies (`server.log` shows `Re-optimizing dependencies`), which silently resets to the baseline. If edges unexpectedly read the baseline again, check the `runtime connected` count in `server.log`.
