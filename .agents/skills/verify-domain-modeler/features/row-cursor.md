# Row cursor

Select a card's title or one of its fields/values, navigate with the keyboard, and edit or delete the current row without losing your place.

## Sub-features

- `row-motion` moves with `j`/`ArrowDown` and `k`/`ArrowUp`, stopping at the ends; `g g` jumps to the title and `Shift+g` to the last row.
- `row-selection` clicks a header for Title or a field/value for that row; the current element has `aria-current="true"` and an indigo highlight.
- `row-edit` opens the current row with Enter/`i`, or the row's edit button; commit and cancel keep its cursor.
- `row-delete` deletes a field/value with `d`/Delete/Backspace, keeping the next row current (previous if last; title if empty). On Title, it deletes the card.
- `row-history` preserves row identity across reorder and undo/redo; missing rows fall back to Title, missing cards clear selection.
- `enum-row-cursor` gives enum values the same navigation and editing behavior as fields.

## How to get to it (user POV)

- Click a card header to select its title (the click also toggles expansion).
- Click a field/value row to select it without opening the editor.
- With a card selected, press the motion, edit, or delete keys in Normal mode.

## Driving it with agent-browser

Preconditions:

- Baseline Blog sample and `Mode: NORMAL`; doctor reports OK.
- Evidence directory: `.verify/latest/evidence/row-cursor/`.

- **Title.** `ab click '[aria-label="Entity User"] > div > div:first-child > span:nth-child(2)'`. `ab get text '[aria-label="Entity User"] [aria-current="true"]'` reads `User`; Undo remains disabled. This selects the name without relying on its description-dependent title attribute.
- **First and second rows.** `ab press j` expands User if needed and makes `email` current. `ab press j` makes `displayName` current. Inspect with `ab get text '[aria-label="Entity User"] li[aria-current="true"]'`.
- **Ends and jumps.** `ab press Shift+g` makes `role` current. Another `ab press j` stays there. `ab press g`, then `ab press g` within one second makes the title current. `ab press k` on Title stays there. ArrowDown/ArrowUp are aliases.
- **Edit and cancel.** `ab press j`, `ab press Enter`. Mode is EDITING and `ab eval "document.activeElement.getAttribute('aria-label')"` reads `Field name` with value `email`. Save a screenshot and snapshot. `ab press Escape` returns to NORMAL with `email` still current.
- **Delete and history.** `ab press d` deletes email, not User; `displayName` is now current. `ab press u` restores email and keeps displayName current; `ab press Control+r` removes email again. Undo restores it. Save the row counts and current-row text alongside screenshots.
- **Last row deletion.** `ab press Shift+g`, `ab press Backspace` removes role and puts the cursor on displayName. Undo restores role without moving the surviving cursor.
- **Enum.** Select Role's header with `ab click '[aria-label="Enum Role"] > div > div:first-child > span:nth-child(2)'`. `ab press j` expands it and makes reader current. `ab press Shift+g` makes admin current; `ab press k` makes author current. Enter focuses Value name; Escape preserves author. Delete removes author and selects admin; undo/redo restore/remove the value. `g g` then Enter edits Enum name; Escape returns to Title.
- **Title deletion.** With Role's title current, `ab press d` removes the card and clears all current markers. `ab press u` restores the enum without restoring selection.
- **Creation undo.** From reload, click User's `+ Add field` by scoped snapshot ref. Escape leaves the default field current. `ab press u` removes it and makes User's title current. Redo restores the field but keeps Title current.
- **Discovery and evidence.** `ab press ?` lists Next row, Previous row, Title row, Last row, and row-aware edit/delete. Capture `ab snapshot -c` and `ab screenshot .verify/latest/evidence/row-cursor/<step>.png` for actions/results. Finish with empty `ab errors` and cleanup.

## Gotchas

- A header click toggles expansion. `j` works from a collapsed card; do not add an extra click that changes selection or expansion unexpectedly.
- Header name descriptions vary. Do not assume `span[title="Double-click to rename"]` exists on the sample's User card.
- Click the row's first name span to select it. Clicking its enum type link follows the enum instead; clicking an action performs that action.
- Row clicks no longer edit immediately. Use Enter/`i` or the explicit Edit field/Edit value button.
- Two separate `ab press g` commands must be less than one second apart; Foldkit owns the sequence timeout.
- Motion/selection never enable Undo. Row deletion is one history entry. Editing a changed draft is a separate entry, as before.
- `d` on a field/value deletes only that row. To delete a card, go to its title first or use its footer delete button.
- Escape while editing cancels the draft and keeps the cursor. Escape again in Normal mode clears selection.
- Web verification does not cover native file dialogs, close prompts, or keys inside the Tauri window.
