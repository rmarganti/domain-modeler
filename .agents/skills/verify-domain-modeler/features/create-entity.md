# Create an entity

A user adds a named entity to the canvas from the keyboard or the toolbar, can cancel before naming it, and can delete it again.

## Sub-features

- `entity-create-key` creates an entity with `c` in Normal mode.
- `entity-create-button` creates an entity with the `+ Entity` toolbar button.
- `entity-create-cancel` discards an unnamed draft with `Escape`.
- `entity-delete` removes an entity with its `Delete <Name>` button.

## How to get to it (user POV)

- Press `c` with the canvas focused and nothing being edited.
- Click `+ Entity` in the bottom toolbar.
- Delete: expand the card and click its trash button, or select it and press `d`.

## Driving it with agent-browser

Preconditions:

- Baseline `Blog` sample; mode `Mode: NORMAL`.
- No entity named `Comment` exists.

- **Open draft by key.** Press `c`. Run `agent-browser press c`. Mode becomes `Mode: CREATING` and `agent-browser snapshot -i` shows textbox `New entity name`.
- **Name and commit.** Type `Comment` and press Enter. Run `agent-browser keyboard type "Comment"` and `agent-browser press Enter`. Mode returns to `Mode: NORMAL`, a group `Entity Comment` exists, and `Undo` is enabled.
- **Proof.** Run `agent-browser screenshot $VERIFY_EVIDENCE/entity-create-key/created.png` and `agent-browser snapshot -c > $VERIFY_EVIDENCE/entity-create-key/created.aria.txt`. The snapshot lists `group "Entity Comment"` beside `User`, `Post`, `Tag`.
- **Cancel draft.** Click `+ Entity`. Run `agent-browser find title "Create entity (c)" click`, then `agent-browser keyboard type "Discard"` and `agent-browser press Escape`. Mode returns to `Mode: NORMAL` and `agent-browser get count '[aria-label="Entity Discard"]'` is `0`.
- **Delete.** Expand and delete `Comment`. Run `agent-browser click '[aria-label="Entity Comment"] [aria-label="Expand"]'` and `agent-browser click '[aria-label="Delete Comment"]'`. `agent-browser get count '[aria-label="Entity Comment"]'` is `0`; pressing `u` brings it back.

## Gotchas

- `c` only creates in Normal mode. If a text input has focus, `c` types a letter instead.
- The new entity appears at the viewport center and can overlap existing cards; measure boxes before pointer gestures.
- `Delete <Name>` only exists while the card is expanded. A collapsed card shows only `Expand`.
- On 2026-10-17, one run's `Delete Comment` click (right after `Expand`) left the entity in place; four replays could not reproduce it. Assert the count after every delete. If it happens again, capture `agent-browser screenshot` and the card's box before the click, and report it as a failure rather than retrying until it passes.
- `+ Entity` has no aria-label; match it by its title `Create entity (c)`, not by a CSS aria selector.
