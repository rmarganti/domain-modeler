# Spatial navigation

Move between entity and enum cards with Ctrl+h/j/k/l, selecting the title without resizing or zooming and panning only enough to reveal the target.

## Sub-features

- `direction`: Ctrl+h/j/k/l select left/down/up/right within a 90° cone, minimizing axis distance + twice perpendicular distance; score ties use card ID.
- `fallback`: with no selection or a relationship selected, choose the nearest card to the viewport center, regardless of direction.
- `reveal`: visible targets do not pan; offscreen targets pan minimally with a 24px margin, preserving zoom.
- `preserve`: expansion, fields/values, dirty status and undo/redo history stay unchanged. The new cursor is Title.
- `isolation`: plain h/l stay unbound, plain j/k move rows, Ctrl+r stays redo, and spatial keys are not active while typing or in other modes.
- `discover`: all four directions appear as the Nearby card row in the shortcut overlay's Move around section.

## How to get to it (user POV)

- Select any entity or enum, then hold Control and press h, j, k, or l. Control is literal on every platform, not Command.
- With nothing selected, or a relationship selected and its inspector open, use any of the four keys to select the nearest card to the viewport center.
- The command palette is Command+K on Apple; elsewhere it is Ctrl+Shift+K because Ctrl+K means spatial-up. Find card is Command+P (Ctrl+P elsewhere).

## Driving it with agent-browser

Preconditions: the Blog baseline from the feature index. Store the exact journey, box observations, and screenshot/ARIA pairs in `.verify/latest/evidence/spatial-nav/`.

- **Read positions first:** `ab get box '[aria-label="Entity User"]'`, then Post, Tag, and Enum Role; also read the canvas box. Derive expected neighbors from their centers, not label order. User and Post begin expanded; Tag and Role compact. A header click currently toggles expansion, so read boxes again after selecting User.
- **Right/left:** `ab click '[aria-label="Entity User"] > div > div:first-child'`, then `ab press Control+l`. Post's title is current. `ab press Control+h` returns to User. Check `[aria-current="true"]` is on a title, not `li`, and each card's size stays unchanged across keyboard navigation.
- **Down/up and enum:** from User, `ab press Control+j` selects Role without expanding it; `ab press Control+k` returns to User. Its used-by field highlight appears when Role is selected and the User card is expanded. From Post, `ab press Control+l` selects Tag. Tag has no right neighbor: another Control+l leaves its selection and camera unchanged.
- **Row cursor boundary:** select a User field using `ab press j`, then Control+l followed by Control+h. User returns with Title current, not the old field, and its expanded size is unchanged. Plain h/l leave the cursor and camera alone.
- **Offscreen reveal:** use `ab keydown ' '`, mouse move/down/move/up on empty canvas, then `ab keyup ' '` to pan User offscreen to the left. Select visible Post, read both boxes, then `ab press Control+h`. User's box must be fully inside the canvas with a 24px margin, and pan displacement must equal the minimum correction; HUD zoom stays the same. Do not use the picker to set up this assertion: it centers the source card.
- **Fallback:** `ab press Escape`, read card/canvas centers, then `ab press Control+j`. The closest card to the canvas center becomes current. Click `Relationship writes 1:0..*`, then any spatial key; the same nearest-center rule applies and the inspector closes. Typing in an inspector input does not navigate.
- **History:** navigation from the clean sample leaves Undo disabled. Add a row with o, Escape, then undo; use spatial keys, then Control+r. The row returns and Redo clears: navigation did not destroy the redo stack.
- **Text isolation:** Enter/i on a title enters EDITING; Control+h/j/k/l must not select another card or exit editing. Native text-control behavior may affect the draft; cancel with Escape. The toolbar's Model name is also an editable target even when the mode says NORMAL.
- **Discovery:** `ab press ?`; `ab get text '[role="dialog"][aria-label="Keyboard shortcuts"]'` lists Select card to the left/below/above/to the right with Control shortcuts. On non-Apple, Run a command must show Ctrl+Shift+K. Escape closes help.
- **Finish:** `ab errors` is empty; run doctor and cleanup.

## Gotchas

- To hold Space with this CLI, use `ab keydown ' '` / `ab keyup ' '` (a literal space); `keydown Space` sends a key that does not activate panning. Confirm the canvas has `cursor-grab` before dragging.
- Use `ab press Control+k`, not Meta+k, for spatial-up. Meta+k opens the command palette on Apple. Ctrl+k is not the palette on non-Apple platforms.
- Compact and expanded cards have different centers. Re-read boxes after any pointer header click or explicit size change; these can change the expected cone/score.
- An oversized card cannot fit fully at unchanged zoom. It aligns the nearest edge or stays put if already spanning the viewport; verify this separately from ordinary full-visibility assertions.
- Visible-card navigation intentionally does not center the target. A missing directional candidate does not reset a field/value cursor to Title.
- Keys are ignored on editable targets and outside Normal mode. Move focus back to the canvas before testing navigation.
- Browser verification does not prove native WKWebView keyboard behavior, file dialogs, or close prompts.
