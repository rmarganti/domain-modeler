# Connect entities

A user presses `r` on a selected entity and picks a target, or drags from its port onto an entity, to create a relationship. Both paths open the inspector with the same defaults so the user can set multiplicity and role.

## Sub-features

- `keyboard-connect` opens an entity-only fuzzy picker from any selected entity row. Enter or an option click creates a relationship in one undo step; Escape/outside click preserves the source cursor and expansion. The source is available for self relationships.
- `rel-connect` creates an edge by dragging port to entity. The new edge starts as `1 ── 0..*`, from the dragged entity to the drop target.
- `rel-connect-cancel` aborts a drag with `Escape` or by releasing on empty canvas.
- `rel-inspect` opens the inspector by clicking an edge.
- `rel-multiplicity` sets an end's multiplicity to `1`, `0..1`, `0..*`, or `1..*`; the edge button and midpoint tag follow.
- `rel-role` names an end's role; a blank role shows the derived default (camelCase entity name, plural for `..*`) as a faded placeholder. Clashing roles on one entity put a `⚠` on every involved edge.
- `rel-delete` removes the selected edge with `Delete` / `Backspace`.

## How to get to it (user POV)

- Select an entity (title or field), press `r`, search for a target, and press Enter or click its option. The mode is `CONNECT`.
- Hover a card to show its two header ports (`Drag to connect`), drag to another card, release.
- Click an edge's midpoint tag (for example `writes 1 ── 0..*`).

## Driving it with agent-browser

Preconditions:

- Baseline `Blog` sample; mode `Mode: NORMAL`.
- `Tag` is collapsed and has no edge to `User`.

- **Keyboard open (`keyboard-connect`).** Run `ab click '[aria-label="Entity User"] .cursor-grab'`, then `ab press r`. Mode reads `Mode: CONNECT`. `ab get attr '[role="combobox"][aria-label="Connect User to"]' placeholder` reads `Connect User to…`; the input has focus. `ab get text '[role="listbox"][aria-label="Entities"]'` lists Post, Tag, User, with no Role/Enum. The background is inert. Save screenshot and ARIA proof before picking.
- **Keyboard pick.** Run `ab fill '[role="combobox"][aria-label="Connect User to"]' tag`, then `ab press Enter`. Mode reads `Mode: EDITING`; button `Relationship 1:0..*` appears and `Relationship inspector` opens with User at `1` and Tag at `0..*`. Undo is enabled. Read card boxes before opening and after picking: no pan, zoom or expansion changes.
- **Keyboard history.** With no inspector input focused, `ab press u` removes the new edge and returns to NORMAL in one step; `ab press Control+r` restores it. Click the restored edge to reopen its inspector. If an input is focused, press Escape before undo so u doesn't type into it.
- **Keyboard cancel.** Return to baseline with `ab reload`. Select User, press `j` to make its first field current, then `r`, type `tag`, and Escape. Mode is NORMAL, the same field remains `[aria-current="true"]`, the card box/viewport are unchanged, only the two sample edges remain, and Undo is disabled. Repeat with outside click (`ab mouse move 20 20`, `ab mouse down`, `ab mouse up`).
- **Filtering / empty.** Open Connect, fill `role`; the list has no options and the status says `No entities match`. Enter does nothing and stays in CONNECT. Clear the query; ArrowUp/Down and Control+p/n wrap through exactly three entities. Clicking Tag's option has the same result as Enter.
- **Self / eligibility.** From baseline, select User, `r`, fill `user`, Enter. The inspector has `Role at User (end 1)` and `(end 2)`; undo removes that edge. From baseline with nothing selected, or with Role or a sample relationship selected, `ab press r` does not open a picker. `r` types normally in Model name, card/field editors and inspector inputs.
- **Discovery / regression.** `ab press ?` lists `Connect selected entity to…` with `r` under Create. Command+P (Ctrl+P elsewhere) still opens Find card and includes Role. `Control+r` still redoes rather than opening Connect. Save evidence under `.verify/latest/evidence/keyboard-connect/`, check `ab errors` is empty, and clean up.
- **Measure (pointer path).** Run `ab get box '[aria-label="Entity User"] [data-port]'` (the first match is the left header port) and `ab get box '[aria-label="Entity Tag"]'`. Take the centers as `(px, py)` and `(tx, ty)`.
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
- The inspector pill says `EDITING` but uses Normal keybindings. `u` immediately undoes creation when focus is outside inputs. While an inspector input has focus, letters type normally; Escape closes it before a canvas shortcut. Connect uses the Picking key mode, so ordinary letters search instead of triggering canvas commands.
- Card headers are divs with `.cursor-grab`, not HTML `header` elements. Multiplicity options are `[role="radio"][aria-checked="true"]` buttons, not `input:checked`.
- Connect input and dialog share their aria-label: scope the input with `[role="combobox"]` and the dialog with `[role="dialog"]` to avoid ambiguous selectors.
- Card size transitions take 200ms. Before exact compact-box comparisons, use `ab wait --fn 'document.querySelector("[aria-label=\"Entity User\"]").getBoundingClientRect().height === 44'`; a box read immediately after Collapse can capture an intermediate size.
- Header clicks currently toggle expansion; do not assume selecting User expands it. `j` explicitly expands a compact entity and moves to its first field. Measure layout after selection, before opening Connect.
- Pointer self relationships require a deliberate drag of more than 40 world units; keyboard self selection is already deliberate and has no distance threshold.
- The first launch after a dependency change can reload the page once while Vite re-optimizes dependencies (`server.log` shows `Re-optimizing dependencies`), which silently resets to the baseline. If edges unexpectedly read the baseline again, check the `runtime connected` count in `server.log`.
