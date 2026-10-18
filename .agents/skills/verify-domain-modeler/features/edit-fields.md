# Edit fields

A user adds a field to an entity, names it, picks its type, multiplicity, and whether it is unique, and commits or cancels the edit inline on the expanded card.

## Sub-features

- `field-add` appends a field from `+ Add field` and opens its inline editor.
- `field-edit` changes name, type, multiplicity, and unique of an existing field.
- `attribute-multiplicity` picks `1`, `0..1`, `0..*`, or `1..*` in `Field multiplicity`; the row shows the label as a badge unless it is `1`.
- `attribute-unique` ticks `Unique`; the row shows a `UQ` badge. List multiplicities (`0..*`, `1..*`) disable `Unique` and clear it.
- `field-cancel` discards an in-progress edit with `Escape` or `Cancel`.
- `field-reorder` moves a field with `Move up` / `Move down`.

## How to get to it (user POV)

- Expand an entity card and click `+ Add field`.
- Click an existing field row (title `Click to edit`) to edit it.
- Hover a row to reveal `Move up`, `Move down`, edit, and delete buttons.

## Driving it with agent-browser

Preconditions:

- Baseline `Blog` sample; mode `Mode: NORMAL`.
- `Post` is expanded (it is in the sample) with fields `title`, `publishedAt` (`0..1`).
- `User` is expanded with `email` (`UQ`), `displayName` (`0..1`), `role`.

- **Add a field.** Click `+ Add field` on `Post`. Run `ab snapshot -i -s '[aria-label="Entity Post"]'`, then `ab click @<ref of "+ Add field">`. Mode becomes `Mode: EDITING` and textbox `Field name` appears with a default name like `field3`. The editor also has select `Field multiplicity` (default `1`) and checkbox `Unique` (unticked).
- **Name and type it.** Run `ab fill '[aria-label="Field name"]' "body"` and `ab select '[aria-label="Field type"]' String`.
- **Commit.** Press Enter. Run `ab press Enter`. Mode returns to `Mode: NORMAL`.
- **Proof.** Run `ab mouse move 5 5`, then `ab get text '[aria-label="Entity Post"]' > .verify/latest/evidence/field-add/post.txt` and `ab screenshot .verify/latest/evidence/field-add/post.png`. The text contains `body` followed by `String`, and the field count badge reads `3`.
- **Second view.** Collapse and re-expand. Run `ab click '[aria-label="Entity Post"] [aria-label="Collapse"]'` and `ab click '[aria-label="Entity Post"] [aria-label="Expand"]'`. `body String` is still listed.
- **List multiplicity.** Add a field on `User`, `ab fill '[aria-label="Field name"]' "tags"`, `ab select '[aria-label="Field multiplicity"]' "0..*"`. Then `ab is enabled '[aria-label="Entity User"] li input[type="checkbox"]'` prints `false`. Press Enter; the `tags` row reads `tags String 0..*`.
- **Unique.** Click the `displayName` row, `ab check '[aria-label="Entity User"] li input[type="checkbox"]'`, press Enter. The row reads `displayName String 0..1 UQ`. `u` removes `UQ`; `Control+r` restores it.
- **Type list.** `ab eval "[...document.querySelectorAll('[aria-label=\"Field type\"] option')].map(o => o.value).join(', ')"` while an editor is open prints `String, Integer, Decimal, Boolean, Date, DateTime, Json, Literal`.
- **Cancel.** Add another field, type `scratch`, press `Escape`. Run the add step, `ab fill '[aria-label="Field name"]' "scratch"`, `ab press Escape`. The card text does not contain `scratch`.

## Gotchas

- `+ Add field` has no aria-label and appears once per expanded card. A global `find text "+ Add field" click` adds the field to the first card (`User`), not the one you meant. Always click by scoped ref.
- Hovering a row hides its type and badges, so `get text` while the pointer is over the card drops them. Move the pointer away first.
- `Unique` is disabled while `Field multiplicity` is `0..*` or `1..*` (a list can't be unique), and choosing one of those clears a ticked `Unique`. Pick `1` or `0..1` before ticking it.
- The `Unique` checkbox has a visible label but no aria-label; scope it to the editing card (`'[aria-label="Entity User"] li input[type="checkbox"]'`) or take a ref from a scoped snapshot.
- Pressing Enter in Normal mode with an entity selected opens that entity for editing; check the mode before pressing Enter.
- Whether cancelling a freshly added field removes the row or leaves the default-named field is not yet recorded here. Observe it and write it down rather than assuming either.
