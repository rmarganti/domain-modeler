# Edit fields

A user adds a field to an entity, names it, picks its type and flags, and commits or cancels the edit inline on the expanded card.

## Sub-features

- `field-add` appends a field from `+ Add field` and opens its inline editor.
- `field-edit` changes name, type, and flags of an existing field.
- `field-cancel` discards an in-progress edit with `Escape` or `Cancel`.
- `field-reorder` moves a field with `Move up` / `Move down`.

## How to get to it (user POV)

- Expand an entity card and click `+ Add field`.
- Click an existing field row (title `Click to edit`) to edit it.
- Hover a row to reveal `Move up`, `Move down`, edit, and delete buttons.

## Driving it with agent-browser

Preconditions:

- Baseline `Blog` sample; mode `Mode: NORMAL`.
- `Post` is expanded (it is in the sample) with fields `title`, `publishedAt`.

- **Add a field.** Click `+ Add field` on `Post`. Run `ab snapshot -i -s '[aria-label="Entity Post"]'`, then `ab click @<ref of "+ Add field">`. Mode becomes `Mode: EDITING` and textbox `Field name` appears with a default name like `field3`. The editor's checkboxes are `Nullable` and `Optional`.
- **Name and type it.** Run `ab fill '[aria-label="Field name"]' "body"` and `ab select '[aria-label="Field type"]' String`.
- **Commit.** Press Enter. Run `ab press Enter`. Mode returns to `Mode: NORMAL`.
- **Proof.** Run `ab mouse move 5 5`, then `ab get text '[aria-label="Entity Post"]' > .verify/latest/evidence/field-add/post.txt` and `ab screenshot .verify/latest/evidence/field-add/post.png`. The text contains `body` followed by `String`, and the field count badge reads `3`.
- **Second view.** Collapse and re-expand. Run `ab click '[aria-label="Entity Post"] [aria-label="Collapse"]'` and `ab click '[aria-label="Entity Post"] [aria-label="Expand"]'`. `body String` is still listed.
- **Cancel.** Add another field, type `scratch`, press `Escape`. Run the add step, `ab fill '[aria-label="Field name"]' "scratch"`, `ab press Escape`. The card text does not contain `scratch`.

## Gotchas

- `+ Add field` has no aria-label and appears once per expanded card. A global `find text "+ Add field" click` adds the field to the first card (`User`), not the one you meant. Always click by scoped ref.
- Hovering a row hides its type and badges, so `get text` while the pointer is over the card drops them. Move the pointer away first.
- Pressing Enter in Normal mode with an entity selected opens that entity for editing; check the mode before pressing Enter.
- Whether cancelling a freshly added field removes the row or leaves the default-named field is not yet recorded here. Observe it and write it down rather than assuming either.
