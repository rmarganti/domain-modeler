// Element ids and data attributes shared by the view, Commands, and
// Subscriptions that need to find elements in the rendered DOM.

export const CANVAS_ID = "canvas";
export const PICKER_INPUT_ID = "picker-input";
export const ENTITY_NAME_INPUT_ID = "entity-name-input";
export const ATTRIBUTE_NAME_INPUT_ID = "attribute-name-input";
export const ENUM_NAME_INPUT_ID = "enum-name-input";
export const ENUM_VALUE_NAME_INPUT_ID = "enum-value-name-input";

/** Marks elements that sit on the canvas but handle their own pointer input,
 *  so a press on them is not also treated as a press on empty canvas. */
export const CANVAS_ITEM_ATTRIBUTE = "canvas-item";
/** Marks entity cards, which are the only association drop targets. */
export const ENTITY_ID_ATTRIBUTE = "entity-id";
export const TYPE_ID_ATTRIBUTE = "type-id";
