# Enums

A user adds an enum to the canvas as its own card, names it, adds, edits, reorders and deletes its values, moves the card around, and deletes it again, with every change undoable. Enum cards are not relationship targets, and enum names share one namespace with entity names.

## Sub-features

- `enum-baseline` shows the sample's collapsed `Enum Role` card with values `reader`, `author`, `admin`.
- `enum-create` creates an enum with `c`, then `2`, or the `+ Create` toolbar button, then `2`; a new enum shows an `Enum has no values` warning.
- `enum-rename` renames an enum by double-clicking its name, or with `Enter`/`i` on its current title.
- `enum-values` adds values with `+ Add value` and edits a value's name and description inline.
- `enum-reorder` moves a value with its `Move up` / `Move down` row buttons.
- `enum-duplicate-name` flags an entity and an enum with the same name on both cards.
- `enum-drag` moves an enum card by its header.
- `enum-not-a-target` cancels a port drag released over an enum card.
- `enum-used-by` highlights, while an enum card is selected, the field rows typed by it (`data-uses-selected-type`); there are no connector lines.
- `enum-delete` deletes an enum with `d` on its title or its `Delete <Name>` button; `u` and `Control+r` undo and redo it.

## How to get to it (user POV)

- Press `c` in Normal mode, then `2` (or ArrowDown and Enter) to pick Enum; type a name and press Enter.
- Click `+ Create` in the bottom toolbar (title `Create entity or enum (c)`) and pick Enum.
- Expand a card with its `Expand` button (or click its header), then use `+ Add value` in the footer or click a value row to select it and press Enter/`i` to edit (the `Edit value` button opens it directly).
- Double-click an enum's name to rename it; select its title and press Enter to expand and rename.
- Select an enum by clicking its header, then press `d`; or expand it and click its trash button.
- Click an enum-typed field's type (`Go to enum <Name>`) to select its enum.

## Driving it with agent-browser

Preconditions:

- Baseline `Blog` sample; mode `Mode: NORMAL`.
- No card named `Status` exists.

- **Baseline.** Run `ab get count '[aria-label="Enum Role"][data-type-id="t1"]'` (`1`), `ab get count '[aria-label="Enum Role"] [data-port]'` (`0`), then `ab click '[aria-label="Enum Role"] [aria-label="Expand"]'`, `ab mouse move 5 5`, and `ab get text '[aria-label="Enum Role"]'`. The text lists `reader`, `author`, `admin`.
- **Create.** Run `ab press c`; mode is `Mode: NEW` and listbox `Create new` is visible. Run `ab press 2` to pick Enum (or open the chooser with `ab find title "Create entity or enum (c)" click`). Mode is `Mode: CREATING` and textbox `New enum name` has focus. Run `ab keyboard type "Status"` and `ab press Enter`. Mode returns to `Mode: NORMAL`, `ab get count '[aria-label="Enum Status"]'` is `1`, and `ab get attr '[aria-label="Enum Status"] [aria-label^="Warnings:"]' aria-label` is `Warnings: Enum has no values`.
- **Add values.** Run `ab click '[aria-label="Enum Status"] [aria-label="Expand"]'`, then take the `+ Add value` ref from `ab snapshot -i -s '[aria-label="Enum Status"]'` and `ab click @eN`. Mode is `Mode: EDITING`. Run `ab fill '[aria-label="Value name"]' draft` and `ab press Enter`. Repeat with `published`. `ab get text '[aria-label="Enum Status"]'` lists `draft`, `published`, and the card's warning badge is gone (`ab get count '[aria-label="Enum Status"] [aria-label^="Warnings:"]'` is `0`).
- **Reorder.** Run `ab hover '[aria-label="Enum Status"] li:nth-child(2)'` and `ab click '[aria-label="Enum Status"] li:nth-child(2) [aria-label="Move up"]'`. The card text now lists `published` before `draft`.
- **Describe a value.** Run `ab click '[aria-label="Enum Status"] li:nth-child(2)'` (the `draft` row), `ab press Enter`, `ab fill '[aria-label="Value description"]' "Not yet visible"`, and `ab press Enter`. After `ab mouse move 5 5`, the card text shows `draft` followed by `Not yet visible`.
- **Shared namespace.** Run `ab dblclick '[aria-label="Entity Tag"] span[title="Double-click to rename"]'`, `ab fill '[aria-label="Entity name"]' Status`, and `ab press Enter`. Both `ab get attr '[aria-label="Entity Status"] [aria-label^="Warnings:"]' aria-label` and the same on `[aria-label="Enum Status"]` read `Warnings: Duplicate type name “Status”`. `ab press u` restores `Entity Tag` and `ab get count '[aria-label^="Warnings:"]'` is `0`.
- **Drag.** Collapse `Status`, wait for the size transition, and `ab get box '[aria-label="Enum Status"]'`. Then `ab mouse move` to 60px in and 22px down from the box's top-left, `ab mouse down`, two `ab mouse move`s ending 100px right and 80px down, and `ab mouse up`. Mode reads `Mode: MOVING` during the drag, and the new box is offset by `(100, 80)`.
- **Not a relationship target.** Count `ab get count 'button[aria-label^="Relationship"]'` (`2`). From the right port of `User` (`ab get box '[aria-label="Entity User"] [data-port]:last-child'`), `ab mouse down`, move in two steps to the middle of `Enum Role`'s box, and `ab mouse up`. Mode returns to `Mode: NORMAL`, the count is still `2`, and there is no `Relationship inspector`.
- **Used by (`enum-used-by`).** Run `ab click '[aria-label="Entity User"] [aria-label="Go to enum Role"]'`. `Enum Role` gets the selection ring and `ab get text '[aria-label="Entity User"] li[data-uses-selected-type]'` starts with `role`; it is the only such row (`ab get count '[data-uses-selected-type]'` is `1`). `ab press Escape` deselects and the count drops to `0`.
- **Deleting a used enum.** With `Enum Role` selected, `ab press d`. The `role` row on `User` reads `role ⚠ 1 ?` and its warning is `Warnings: Enum “t1” does not exist`. `ab press u` brings back `Role` and the row reads `role Role` with no warnings.
- **Delete, undo, redo.** Click the `Status` header (`ab mouse move` onto it, `ab mouse down`, `ab mouse up`) so it gets the selection ring, then `ab press d`: `ab get count '[aria-label="Enum Status"]'` is `0`. `ab press u` brings it back with its values, and `ab press Control+r` deletes it again.
- **Proof.** Save `ab screenshot` and `ab snapshot -c` after each step under `.verify/latest/evidence/enums/`, then `ab errors > .verify/latest/evidence/enums/errors.txt`, which must be empty.

## Gotchas

- `ab find text "+ Add value" click` hits the first expanded enum card in the DOM (usually `Role`), not the one you mean. Use a ref from a snapshot scoped to the card.
- Card size animates for 200ms after expand or collapse. Read `ab get box` after `ab wait 500`, or pointer gestures land on stale coordinates.
- Clicking a header both selects the card and toggles its expansion. Check the selection ring (`ring-indigo-500` in the card's class) before pressing `d`.
- Hovering a value row hides its description behind the row buttons. Move the mouse off the card (`ab mouse move 5 5`) before `get text`.
- `d` only deletes in Normal mode. If a value editor or name input has focus, `d` types a letter.
