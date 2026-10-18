# Connect entities

A user drags from an entity's port onto another entity to create a relationship, then names it and sets its cardinality in the inspector.

## Sub-features

- `rel-connect` creates an edge by dragging port to entity.
- `rel-connect-cancel` aborts a drag with `Escape` or by releasing on empty canvas.
- `rel-inspect` opens the inspector by clicking an edge.
- `rel-cardinality` switches between `1:1`, `1:N`, `N:M`.
- `rel-delete` removes the selected edge with `Delete` / `Backspace`.

## How to get to it (user POV)

- Hover a card to show its ports (`Drag to connect`), drag to another card, release.
- Click an edge's midpoint tag (for example `writes 1 ── N`).

## Driving it with agent-browser

Preconditions:

- Baseline `Blog` sample; mode `Mode: NORMAL`.
- `Tag` is collapsed and has no edge to `User`.

- **Measure.** Run `ab get box '[aria-label="Entity User"] [data-port]'` and `ab get box '[aria-label="Entity Tag"]'`. Take the centers as `(px, py)` and `(tx, ty)`.
- **Drag.** Run `ab mouse move px py`, `ab mouse down`, `ab mouse move <midpoint>`. Mode reads `Mode: CONNECTING`.
- **Release on target.** Run `ab mouse move tx ty` and `ab mouse up`. Mode reads `Mode: EDITING`, dialog `Relationship inspector` is open, and radio `1:N` is checked.
- **Configure.** Run `ab fill '[aria-label="Relationship name"]' "follows"` and `ab click '[role="radio"]:has-text("N:M")'` (or the `N:M` radio's ref from `snapshot -i`). The `N:M` radio is checked.
- **Proof.** Run `ab press Escape`, `ab snapshot -c > .verify/latest/evidence/rel-connect/edges.aria.txt`, and `ab screenshot .verify/latest/evidence/rel-connect/edges.png`. The snapshot lists a third edge button after `Relationship writes 1:N` and `Relationship tagged N:M`, with the new name and cardinality.
- **Delete.** Click the new edge button, press `Delete`. Its button is gone and the two sample edges remain.

## Gotchas

- `mouse down` and an immediate `mouse up` without a move in between is a click, not a drag; nothing connects.
- Ports exist only on rendered cards: collapsed cards have fewer. Use `[data-port]` scoped to the card, never hard-coded coordinates.
- A freshly created entity lands at viewport center and can sit on top of another card; release on a point that is inside only the intended target.
- An unnamed edge's button reads `Relationship <cardinality>` with no name.
- The inspector is in `EDITING` mode, so Normal-mode keys (`c`, `u`) are not active until `Escape`.
- Not yet driven end to end: renaming and cardinality change via the inspector, and edge delete. First run should confirm and update these steps.
