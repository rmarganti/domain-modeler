# Auto-arrange

Lay every card out in left-to-right columns at its current size, in one undoable step, then fit the cards on screen. An association's one end comes before its many end, and an enum comes after the entities that use it.

## Sub-features

- `arrange-hud`: the HUD's Auto-arrange cards button arranges and fits.
- `arrange-key`: Shift+A does the same in Normal mode.
- `arrange-undo`: one undo restores every card's previous position.

## How to get to it (user POV)

- Click `Arrange` in the view controls, top right.
- Press Shift+A with no text field focused.
- Press ? or click Keyboard shortcuts to find it under View.

## Driving it with agent-browser

Preconditions: web baseline from the feature index; doctor reports OK. Save evidence under `.verify/latest/evidence/auto-arrange/`.

- **Before:** record `ab get box` for Entity User, Entity Post, Entity Tag, and Enum Role, and take a screenshot.
- **HUD:** `ab click '[aria-label="Auto-arrange cards"]'`. User's box is left of Post's and Role's, Tag's is right of Post's, and Post's and Tag's tops match. Mode stays NORMAL and Undo is enabled.
- **Undo:** `ab click '[aria-label="Undo"]'`. Each card's offset from User matches the before boxes. The camera may differ, since undo keeps the current view.
- **Key:** `ab mouse move 5 5`, `ab press Escape`, `ab press Shift+A`. The boxes match the HUD result. `ab press u` restores them again.
- **Discovery:** `ab get attr '[aria-label="Auto-arrange cards"]' title` names the key.
- **Finish:** `ab errors > .verify/latest/evidence/auto-arrange/errors.txt` is empty; run cleanup.

## Gotchas

- Arranging fits the view afterwards, so compare boxes relative to one card, not as absolute screen positions.
- Shift+A is Normal-mode only. In a text input it types `A`.
- Collapsed cards are arranged at their collapsed size. Expanding one afterwards can make it overlap the card below.
