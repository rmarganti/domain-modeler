# Edit fields

A user adds a field to an entity, names it, picks its type (a primitive or an enum, or a brand-new enum), multiplicity, and whether it is unique, and commits or cancels the edit inline on the expanded card.

## Sub-features

- `field-add` appends a field from `+ Add field` and opens its inline editor.
- `field-edit` changes name, type, multiplicity, and unique of an existing field.
- `attribute-multiplicity` picks `1`, `0..1`, `0..*`, or `1..*` in `Field multiplicity`; the row shows the label as a badge unless it is `1`.
- `attribute-unique` ticks `Unique`; the row shows a `UQ` badge. List multiplicities (`0..*`, `1..*`) disable `Unique` and clear it.
- `field-enum-type` picks an existing enum from the `Enums` group of `Field type`; the row shows the enum's name as a `Go to enum <Name>` button that selects the enum card.
- `field-new-enum` picks `New enum…`: in one undo step a PascalCase-named enum (`status` → `Status`, blank → `NewEnum`) appears expanded right of the entity with focus in `Value name` on its blank first value, and the field is typed by it.
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
- `User` is expanded with `email` (`UQ`), `displayName` (`0..1`), `role` (typed by the `Role` enum).

- **Add a field.** Click `+ Add field` on `Post`. Run `ab snapshot -i -s '[aria-label="Entity Post"]'`, then `ab click @<ref of "+ Add field">`. Mode becomes `Mode: EDITING` and textbox `Field name` appears with a default name like `field3`. The editor also has select `Field multiplicity` (default `1`) and checkbox `Unique` (unticked).
- **Name and type it.** Run `ab fill '[aria-label="Field name"]' "body"` and `ab select '[aria-label="Field type"]' String`.
- **Commit.** Press Enter. Run `ab press Enter`. Mode returns to `Mode: NORMAL`.
- **Proof.** Run `ab mouse move 5 5`, then `ab get text '[aria-label="Entity Post"]' > .verify/latest/evidence/field-add/post.txt` and `ab screenshot .verify/latest/evidence/field-add/post.png`. The text contains `body` followed by `String`, and the field count badge reads `3`.
- **Second view.** Collapse and re-expand. Run `ab click '[aria-label="Entity Post"] [aria-label="Collapse"]'` and `ab click '[aria-label="Entity Post"] [aria-label="Expand"]'`. `body String` is still listed.
- **List multiplicity.** Add a field on `User`, `ab fill '[aria-label="Field name"]' "tags"`, `ab select '[aria-label="Field multiplicity"]' "0..*"`. Then `ab is enabled '[aria-label="Entity User"] li input[type="checkbox"]'` prints `false`. Press Enter; the `tags` row reads `tags String 0..*`.
- **Unique.** Click the `displayName` row, `ab check '[aria-label="Entity User"] li input[type="checkbox"]'`, press Enter. The row reads `displayName String 0..1 UQ`. `u` removes `UQ`; `Control+r` restores it.
- **Type list.** While an editor is open, `ab eval "[...document.querySelectorAll('[aria-label=\"Field type\"] optgroup')].map(g => g.label + ': ' + [...g.querySelectorAll('option')].map(o => o.textContent).join(', ')).join(' | ')"` prints `Primitives: String, Integer, Decimal, Boolean, Date, DateTime, Json | Enums: Role` (plus any other enums), and the select's last option is `New enum…`.
- **Existing enum (`field-enum-type`).** Click the `title` row on `Post`, `ab select '[aria-label="Field type"]' Role`, `ab press Enter`. After `ab mouse move 5 5`, the row reads `title Role` and `ab get count '[aria-label="Entity Post"] [aria-label="Go to enum Role"]'` is `1`. `ab click` on that button selects `Enum Role` (`ring-indigo-500` in its class) and the mode stays `Mode: NORMAL`.
- **New enum (`field-new-enum`).** Click `+ Add field` on `Post` by scoped ref, `ab fill '[aria-label="Field name"]' status`, then `ab select '[aria-label="Field type"]' "New enum…"`. The field editor closes, `Enum Status` appears expanded to the right of `Post`, the mode is `Mode: EDITING`, and `ab eval "document.activeElement.getAttribute('aria-label')"` prints `Value name`. `ab keyboard type draft`, `ab press Enter`: the `Post` row reads `status Status` and the enum lists `draft`. One `ab press u` removes `Enum Status` and the row is back to `field3 String`; `ab press Control+r` restores both.
- **Cancel.** Add another field, type `scratch`, press `Escape`. Run the add step, `ab fill '[aria-label="Field name"]' "scratch"`, `ab press Escape`. The card text does not contain `scratch`.

## Gotchas

- The `Go to enum <Name>` button stays visible on hover; primitive types hide behind the row buttons. Click the link by its aria-label, never by coordinates taken before hovering.
- After `New enum…`, `Escape` in `Value name` leaves the blank first value in place (an empty row). That is expected, not a failed save.

- `+ Add field` has no aria-label and appears once per expanded card. A global `find text "+ Add field" click` adds the field to the first card (`User`), not the one you meant. Always click by scoped ref.
- Hovering a row hides its type and badges, so `get text` while the pointer is over the card drops them. Move the pointer away first.
- `Unique` is disabled while `Field multiplicity` is `0..*` or `1..*` (a list can't be unique), and choosing one of those clears a ticked `Unique`. Pick `1` or `0..1` before ticking it.
- The `Unique` checkbox has a visible label but no aria-label; scope it to the editing card (`'[aria-label="Entity User"] li input[type="checkbox"]'`) or take a ref from a scoped snapshot.
- Pressing Enter in Normal mode with an entity selected opens that entity for editing; check the mode before pressing Enter.
- Whether cancelling a freshly added field removes the row or leaves the default-named field is not yet recorded here. Observe it and write it down rather than assuming either.
