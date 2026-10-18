# Card picker

Find an entity or enum with Command+K on Apple or Ctrl+Shift+K elsewhere, then focus its title at the center of the canvas without changing its size, zoom, or undo history.

## Sub-features

- `open`: the Normal-mode Find card shortcut opens FIND with the search input focused.
- `match`: case-insensitive fuzzy subsequences, ranked exact > prefix > word/camel starts > other, then shorter names and alphabetical order; matched characters highlighted.
- `navigate`: arrows and Control+N/P wrap; query changes reset to the first result; active results scroll into view.
- `focus`: Enter or clicking an option selects Title and centers its card at the current zoom and expansion.
- `cancel`: Escape/outside click preserve the prior cursor and viewport; no-match Enter does nothing.
- `discover`: the shortcut overlay lists Find card and the Card picker context.

## How to get to it (user POV)

- Press Command+K on Apple or Ctrl+Shift+K elsewhere on the canvas, with any selection or the relationship inspector open. Ctrl+K is reserved for spatial-up navigation.
- Type a card name or subsequence. Choose with Enter or click its option.
- Find card is not bound in text, help, chooser, pointer, or picker modes. It searches cards, not commands, fields, or relationships.

## Driving it with agent-browser

Preconditions: the Blog baseline from the feature index, with Undo and Redo disabled. Save the exact driven script and screenshot/ARIA pairs under `.verify/latest/evidence/card-picker/`.

- **Open:** `ab press Meta+k`. `ab get attr '[aria-label^="Mode:"]' aria-label` is `Mode: FIND`. `ab eval 'document.activeElement.getAttribute("aria-label")'` is `Find card`. `ab get text '[role="listbox"][aria-label="Cards"]'` lists Post, Role, Tag, User in that order, with their kinds; Post is selected.
- **Wrap:** `ab press ArrowUp` highlights User; `ab press Control+n` wraps to Post; `ab press Control+p` wraps to User; `ab press ArrowDown` returns to Post. Search input keeps focus.
- **Search:** `ab fill 'input[aria-label="Find card"]' ta`. Tag is first and selected, with `t`/`a` highlighted (`mark`); `ab press Enter` returns to NORMAL. `ab get count '[aria-label="Entity Tag"] [aria-current="true"]'` is 1, and the compact card remains compact.
- **Center:** read the Tag and canvas boxes with `ab get box`. Their center coordinates differ by less than 20px on each axis; HUD percentage is unchanged; `ab is enabled 'button[aria-label="Undo"]'` is false.
- **No match:** `ab press Meta+k`, then `ab fill 'input[aria-label="Find card"]' zzz`. "No cards match" is visible; `ab press Enter` leaves FIND open; `ab press Escape` returns to NORMAL with Tag still current and viewport unchanged.
- **Cancel cursor:** click a User field row, then Mod+K and Escape. The same field remains current. Repeat with an outside click: `ab mouse move 10 100`, `ab mouse down`, `ab mouse up`. Background cards must not receive that click.
- **Enum/mouse:** open, fill `ro`, then `ab click '[role="option"]'`. Role is centered with Title current and remains compact. Its used-by highlight appears on User.role.
- **Expanded card:** pick User using Enter. Its expanded size and zoom stay unchanged; center is within 20px of the canvas center. Undo remains disabled.
- **Typing isolation:** open and fill `coOJK?ud`; these characters stay in the query, with no cards created/deleted or help opened. Clear the query and cancel.
- **Text mode:** select a title and `ab press i` to rename; `ab press Meta+k` must leave EDITING, not FIND. Escape cancels.
- **Discovery:** `ab press ?`, then `ab get text '[role="dialog"][aria-label="Keyboard shortcuts"]'` includes Find card and Card picker. Escape closes help.
- **Finish:** collect `ab errors` (empty), run doctor and cleanup.

## Gotchas

- `Find card` names both the modal and input: scope fill/focus assertions to `input[aria-label="Find card"]`, and list assertions to the Cards listbox.
- Query results include enums (Role in the sample), not only the three entities. Query changes always reset the first result; arrows wrap, unlike row-cursor j/k.
- The pointer is independent: picking does not simulate a header click and never toggles expansion. Use explicit Expand/Collapse buttons to establish a known card size.
- `ab reload` resets camera, selection and history before repeating the full journey. Use Control+Shift+k instead of Meta+k on non-Apple platforms; Control+k selects spatially upward, not Find card.
- Web verification does not prove native Tauri-window keyboard handling or file dialogs.
