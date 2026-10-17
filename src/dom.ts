// Element ids and data attributes shared by the view, Commands, and
// Subscriptions that need to find elements in the rendered DOM.

export const CANVAS_ID = "canvas";
export const ENTITY_NAME_INPUT_ID = "entity-name-input";
export const PROPERTY_NAME_INPUT_ID = "property-name-input";

/** Marks elements that sit on the canvas but handle their own pointer input,
 *  so a press on them is not also treated as a press on empty canvas. */
export const CANVAS_ITEM_ATTRIBUTE = "canvas-item";
export const ENTITY_ID_ATTRIBUTE = "entity-id";
