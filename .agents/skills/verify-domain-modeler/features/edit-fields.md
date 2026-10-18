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
- `Post` is expanded (it is in the sample) with fields `id`, `authorId`, `title`, `publishedAt`.

- **Add a field.** Click `+ Add field` on `Post`. Run `agent-browser snapshot -i -s '[aria-label="Entity Post"]'`, then `agent-browser click @<ref of "+ Add field">`. Mode becomes `Mode: EDITING` and textbox `Field name` appears with a default name like `field5`.
- **Name and type it.** Run `agent-browser fill '[aria-label="Field name"]' "body"` and `agent-browser select '[aria-label="Field type"]' String`.
- **Commit.** Press Enter. Run `agent-browser press Enter`. Mode returns to `Mode: NORMAL`.
- **Proof.** Run `agent-browser mouse move 5 5`, then `agent-browser get text '[aria-label="Entity Post"]' > $VERIFY_EVIDENCE/field-add/post.txt` and `agent-browser screenshot $VERIFY_EVIDENCE/field-add/post.png`. The text contains `body` followed by `String`, and the field count badge reads `5`.
- **Second view.** Collapse and re-expand. Run `agent-browser click '[aria-label="Entity Post"] [aria-label="Collapse"]'` and `agent-browser click '[aria-label="Entity Post"] [aria-label="Expand"]'`. `body String` is still listed.
- **Cancel.** Add another field, type `scratch`, press `Escape`. Run the add step, `agent-browser fill '[aria-label="Field name"]' "scratch"`, `agent-browser press Escape`. The card text does not contain `scratch`.

## Gotchas

- `+ Add field` has no aria-label and appears once per expanded card. A global `find text "+ Add field" click` adds the field to the first card (`User`), not the one you meant. Always click by scoped ref.
- Hovering a row hides its type and badges, so `get text` while the pointer is over the card drops them. Move the pointer away first.
- Pressing Enter in Normal mode with an entity selected opens that entity for editing; check the mode before pressing Enter.
- Whether cancelling a freshly added field removes the row or leaves the default-named field is not yet recorded here. Observe it and write it down rather than assuming either.
