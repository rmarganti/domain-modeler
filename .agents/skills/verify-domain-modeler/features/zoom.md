# Zoom and fit

Zoom around the viewport center, fit every card, or focus the selected card or relationship without adding undo history. HUD titles and the shortcut dialog list the same keys.

## Sub-features

- `zoom-keys`: Command/Ctrl zoom in/out/reset, including while typing.
- `fit-all`: Shift+1 fits all entity and enum cards, at most 100%.
- `fit-selection`: Shift+2 centers the selected entity/enum or both relationship ends, at most 400%; no selection is a no-op.
- `zoom-discovery`: platform-specific HUD titles and help entries.

## How to get to it (user POV)

- In Normal mode, press Command/Ctrl+= or Command/Ctrl+Plus to zoom in, Command/Ctrl+- to zoom out, or Command/Ctrl+0 for 100%.
- Press Shift+1 to fit all cards, or select a card/relationship and press Shift+2.
- Click the HUD's Zoom in, Zoom out, Reset view to 100%, or Fit to screen buttons.
- Press ? or click Keyboard shortcuts to discover the keys.

## Driving it with agent-browser

Preconditions: web baseline from the feature index; doctor reports OK. Save evidence under `.verify/latest/evidence/zoom-keys/`.

- **Zoom:** `ab press Meta+=`, `ab press Meta+-`, `ab press Meta+0`. Read `ab get text '[aria-label="View controls"]'`: the percentage increases, decreases, then becomes 100%. `ab press 'Meta+Shift++'` also zooms in (`ab press 'Meta++'` covers unshifted Plus). Save ARIA snapshots and screenshots before and after.
- **Fit all:** `ab press Meta+-` twice, then `ab press Shift+1`. Use `ab get box '[aria-label="Domain model canvas"]'` and boxes for Entity User, Entity Post, Entity Tag, and Enum Role: every card must be inside the canvas. Undo stays disabled.
- **Fit card:** `ab click '[aria-label="Entity Post"] [title="Double-click to rename"]'`, then `ab press Shift+2`. Post's center must be within 20px of the canvas center. Clicking its header also toggles expansion; read the box after the click.
- **No selection:** `ab mouse move 20 100`, `ab mouse down`, `ab mouse up`, then `ab press Shift+2`. The percentage and canvas transform are unchanged.
- **Fit enum:** reload; `ab click '[aria-label="Enum Role"] [title="Double-click to rename"]'`, `ab press Shift+2`. Role is centered.
- **Fit relationship:** reload; `ab click '[aria-label="Relationship writes 1:0..*"]'`, `ab press Shift+2`. User and Post are visible, their combined bounds centered; the inspector and selection remain.
- **Typing:** reload; double-click the Post name to open Entity name, then `ab press Meta+=` and `ab press Meta+0`. The editor stays open and zoom changes/reset works. `ab press 'Shift+!'` and `ab press 'Shift+@'` append !/@ instead of fitting; Escape cancels. Also check Model name, which is editable while the mode stays NORMAL.
- **Discovery:** `ab get attr '[aria-label="Zoom in"]' title` includes ⌘= on macOS (Ctrl+= elsewhere). Open ? and capture the View entries in Canvas and Editing text; fit entries are Canvas-only.
- **Finish:** `ab errors > .verify/latest/evidence/zoom-keys/errors.txt` is empty; run cleanup. Separately launch desktop, run doctor, save its result and launch log, then cleanup.

## Gotchas

- `Mod` resolves to Meta on Apple platforms and Control elsewhere. The commands above assume macOS.
- On US keyboards Shift+1/2 produce !/@. Both character and digit variants are accepted with Shift held; use real key presses, not message dispatch. agent-browser's `Shift+1` sends key `1`, not `!`; also drive `Shift+!` / `Shift+@` to cover physical US-keyboard events. The CLI's `Meta+Shift+Plus` sends an empty key: use `Meta+Shift++` for `+`.
- Fit-all includes Role, not just the three Blog entities. Fit-selection may zoom above 100%; fit-all never does.
- These shortcuts are inactive in Help, the New chooser, and pointer modes. Mod zoom remains active in Text mode; fit does not.
- Reading DOM boxes and transforms with eval is allowed; dispatching events or editing app state with eval is not.
- Desktop doctor proves build/boot, not native-window keyboard behavior. Report ⌘= inside the Tauri window as unverified.
