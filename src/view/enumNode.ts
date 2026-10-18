import { Array, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { ENUM_NAME_INPUT_ID, ENUM_VALUE_NAME_INPUT_ID, TYPE_ID_ATTRIBUTE } from "../dom";
import * as Diagnostics from "../domain/diagnostics";
import * as Geometry from "../domain/geometry";
import type { EnumDefinition, EnumValue, NodeLayout, Point } from "../domain/schema";
import { Message } from "../message";
import type { EditorState, EnumValueDraft } from "../model";
import {
  cardFooter,
  cardFrame,
  cardHeader,
  cardName,
  countBadge,
  creatingCardView,
  editorActions,
  rowActions,
} from "./card";
import { px, warningBadge } from "./shared";

// Enum cards carry `data-type-id`, never `data-entity-id`, and have no ports,
// so a relationship can neither start nor end on one.

export type EnumNodeContext = Readonly<{
  editor: EditorState;
  isSelected: boolean;
  diagnostics: ReadonlyArray<Diagnostics.Diagnostic>;
  maybeEditingValueId: Option.Option<string>;
}>;

const enumIcon = (h: HtmlBuilder<Message>): Html =>
  h.span([h.Class("text-violet-500"), h.AriaHidden(true)], ["◇"]);

// HEADER

const headerView = (
  h: HtmlBuilder<Message>,
  definition: EnumDefinition,
  layout: NodeLayout,
  context: EnumNodeContext,
): Html =>
  cardHeader(h, {
    nodeId: definition.id,
    layout,
    icon: enumIcon(h),
    name: cardName(h, {
      name: definition.name,
      maybeDescription: Option.fromNullishOr(definition.description),
      maybeDraftName:
        context.editor._tag === "RenamingEnum" && context.editor.typeId === definition.id
          ? Option.some(context.editor.draftName)
          : Option.none(),
      inputId: ENUM_NAME_INPUT_ID,
      inputLabel: "Enum name",
      onInput: (name) => Message.UpdatedEnumDraftName({ name }),
      onDoubleClick: Message.DoubleClickedEnumName({ typeId: definition.id }),
    }),
    warnings: Array.map(
      Diagnostics.forEnum(context.diagnostics, definition.id),
      Diagnostics.describe,
    ),
    badges: [
      h.span(
        [
          h.Class("rounded bg-violet-50 px-1 text-[10px] font-bold tracking-wide text-violet-700"),
          h.Title("Enumeration"),
        ],
        ["enum"],
      ),
      countBadge(h, definition.values.length, `${definition.values.length} values`),
    ],
    onPress: ({ button, clientX, clientY }) =>
      Message.PressedEnumHeader({ typeId: definition.id, button, clientX, clientY }),
  });

// VALUE ROWS

const valueRow = (
  h: HtmlBuilder<Message>,
  definition: EnumDefinition,
  value: EnumValue,
  index: number,
  context: EnumNodeContext,
): Html => {
  const warnings = Array.map(
    Diagnostics.forEnumValue(context.diagnostics, value.id),
    Diagnostics.describe,
  );
  const typeId = definition.id;
  const valueId = value.id;
  return h.keyed("li")(
    value.id,
    [
      h.Class(
        "group/row flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 text-xs hover:bg-violet-50/60",
      ),
      h.Style({ height: px(Geometry.ATTRIBUTE_ROW_HEIGHT) }),
      h.OnClick(Message.ClickedEditEnumValue({ typeId, valueId })),
      h.Title(value.description ?? "Click to edit"),
    ],
    [
      h.span([h.Class("shrink-0 font-mono text-slate-800")], [value.name]),
      ...(Array.isReadonlyArrayNonEmpty(warnings) ? [warningBadge(h, warnings)] : []),
      h.span(
        [h.Class("min-w-0 flex-1 truncate text-slate-500 group-hover/row:hidden")],
        [value.description ?? ""],
      ),
      rowActions(h, {
        noun: "value",
        isFirst: index === 0,
        isLast: index === definition.values.length - 1,
        onMoveUp: Message.ClickedMoveEnumValue({ typeId, valueId, direction: "Up" }),
        onMoveDown: Message.ClickedMoveEnumValue({ typeId, valueId, direction: "Down" }),
        onEdit: Message.ClickedEditEnumValue({ typeId, valueId }),
        onDelete: Message.ClickedDeleteEnumValue({ typeId, valueId }),
      }),
    ],
  );
};

const valueEditor = (h: HtmlBuilder<Message>, valueId: string, draft: EnumValueDraft): Html =>
  h.keyed("li")(
    valueId,
    [
      h.Class("flex flex-col gap-1.5 border-y border-indigo-200 bg-indigo-50/70 px-3 py-2"),
      h.Style({ height: px(Geometry.ENUM_VALUE_EDITOR_HEIGHT) }),
    ],
    [
      h.input([
        h.Id(ENUM_VALUE_NAME_INPUT_ID),
        h.Value(draft.name),
        h.AriaLabel("Value name"),
        h.Placeholder("value"),
        h.Autocomplete("off"),
        h.Spellcheck(false),
        h.OnInput((name) => Message.UpdatedEnumValueDraftName({ name })),
        h.Class(
          "rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200",
        ),
      ]),
      h.input([
        h.Value(draft.description),
        h.AriaLabel("Value description"),
        h.Placeholder("Description (optional)"),
        h.Autocomplete("off"),
        h.OnInput((description) => Message.UpdatedEnumValueDraftDescription({ description })),
        h.Class(
          "rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] outline-none focus:border-indigo-400",
        ),
      ]),
      editorActions(h, Message.ClickedSaveEnumValue()),
    ],
  );

// NODE

export const enumNodeView = (
  h: HtmlBuilder<Message>,
  definition: EnumDefinition,
  layout: NodeLayout,
  context: EnumNodeContext,
): Html =>
  cardFrame(
    h,
    {
      nodeId: definition.id,
      dataAttribute: { name: TYPE_ID_ATTRIBUTE, value: definition.id },
      ariaLabel: `Enum ${definition.name}`,
      layout,
      rect: Geometry.enumRect(definition, layout, context.maybeEditingValueId),
      editor: context.editor,
      isSelected: context.isSelected,
      hasWarnings: Array.isReadonlyArrayNonEmpty(
        Diagnostics.forEnum(context.diagnostics, definition.id),
      ),
    },
    [
      headerView(h, definition, layout, context),
      ...(layout.isExpanded
        ? [
            h.ul(
              [],
              Array.map(definition.values, (value, index) =>
                context.editor._tag === "EditingEnumValue" && context.editor.valueId === value.id
                  ? valueEditor(h, value.id, context.editor.draft)
                  : valueRow(h, definition, value, index, context),
              ),
            ),
            cardFooter(h, {
              addLabel: "+ Add value",
              onAdd: Message.ClickedAddEnumValue({ typeId: definition.id }),
              name: definition.name,
              onDelete: Message.ClickedDeleteEnum({ typeId: definition.id }),
            }),
          ]
        : []),
    ],
    [],
  );

/** The placeholder card shown while naming a new enum. */
export const creatingEnumView = (
  h: HtmlBuilder<Message>,
  position: Point,
  draftName: string,
): Html =>
  creatingCardView(h, {
    position,
    draftName,
    icon: enumIcon(h),
    inputId: ENUM_NAME_INPUT_ID,
    inputLabel: "New enum name",
    placeholder: "EnumName",
    onInput: (name) => Message.UpdatedEnumDraftName({ name }),
  });
