import { Array, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { ENTITY_ID_ATTRIBUTE, ENTITY_NAME_INPUT_ID, PROPERTY_NAME_INPUT_ID } from "../constant";
import * as Diagnostics from "../domain/diagnostics";
import * as Geometry from "../domain/geometry";
import {
  PROPERTY_TYPES,
  type EntityDefinition,
  type NodeLayout,
  type Point,
  type PropertyDefinition,
} from "../domain/schema";
import { Message } from "../message";
import type { EditorState, PropertyDraft } from "../model";
import { canvasItem, iconButton, onPress, px, warningBadge } from "./shared";

export type NodeContext = Readonly<{
  editor: EditorState;
  isSelected: boolean;
  diagnostics: ReadonlyArray<Diagnostics.Diagnostic>;
  maybeEditingPropertyId: Option.Option<string>;
}>;

const IGNORE_HEADER_PRESS = "button, input, select, [data-port]";

const TYPE_COLORS: Record<PropertyDefinition["type"], string> = {
  String: "text-emerald-700",
  Number: "text-sky-700",
  Boolean: "text-violet-700",
  Date: "text-orange-700",
  UUID: "text-indigo-700",
  Literal: "text-pink-700",
  Json: "text-slate-700",
};

// PORTS

const port = (
  h: HtmlBuilder<Message>,
  entityId: string,
  maybePropertyId: Option.Option<string>,
  side: Geometry.Side,
  offsetY: number,
): Html =>
  h.div(
    [
      h.DataAttribute("port", ""),
      h.Title("Drag to connect"),
      h.Class(
        "absolute z-10 rounded-full border-2 border-white bg-indigo-400 shadow-sm opacity-60 transition hover:scale-125 hover:bg-indigo-600 hover:opacity-100 group-hover:opacity-100 cursor-crosshair",
      ),
      h.Style({
        width: px(Geometry.PORT_RADIUS * 2),
        height: px(Geometry.PORT_RADIUS * 2),
        top: px(offsetY - Geometry.PORT_RADIUS),
        [side]: px(-Geometry.PORT_RADIUS),
        touchAction: "none",
      }),
      onPress(h, Option.none(), ({ button, clientX, clientY }) =>
        Message.PressedPort({ entityId, maybePropertyId, button, clientX, clientY }),
      ),
    ],
    [],
  );

// HEADER

const nameView = (h: HtmlBuilder<Message>, entity: EntityDefinition, editor: EditorState): Html =>
  editor._tag === "RenamingEntity" && editor.entityId === entity.id
    ? h.input([
        h.Id(ENTITY_NAME_INPUT_ID),
        h.Value(editor.draftName),
        h.AriaLabel("Entity name"),
        h.Autocomplete("off"),
        h.Spellcheck(false),
        h.OnInput((name) => Message.UpdatedEntityDraftName({ name })),
        h.Class(
          "min-w-0 flex-1 rounded-md border border-indigo-300 bg-white px-1.5 py-0.5 text-sm font-semibold text-slate-900 outline-none ring-2 ring-indigo-200",
        ),
      ])
    : h.span(
        [
          h.Class("min-w-0 flex-1 truncate text-sm font-semibold text-slate-900"),
          h.Title(entity.description ?? "Double-click to rename"),
          h.OnDoubleClick(Message.DoubleClickedEntityName({ entityId: entity.id })),
        ],
        [entity.name],
      );

const headerView = (
  h: HtmlBuilder<Message>,
  entity: EntityDefinition,
  layout: NodeLayout,
  context: NodeContext,
): Html => {
  const entityWarnings = Array.map(
    Diagnostics.forEntity(context.diagnostics, entity.id),
    Diagnostics.describe,
  );
  return h.div(
    [
      h.Class("flex cursor-grab items-center gap-2 px-3 active:cursor-grabbing select-none"),
      h.Style({ height: px(Geometry.NODE_HEADER_HEIGHT), touchAction: "none" }),
      onPress(h, Option.some(IGNORE_HEADER_PRESS), ({ button, clientX, clientY }) =>
        Message.PressedNodeHeader({ entityId: entity.id, button, clientX, clientY }),
      ),
    ],
    [
      h.span([h.Class("text-indigo-500"), h.AriaHidden(true)], ["▣"]),
      nameView(h, entity, context.editor),
      ...(Array.isReadonlyArrayNonEmpty(entityWarnings) ? [warningBadge(h, entityWarnings)] : []),
      h.span(
        [
          h.Class(
            "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600",
          ),
          h.Title(`${entity.properties.length} fields`),
        ],
        [String(entity.properties.length)],
      ),
      iconButton(h, {
        label: layout.isExpanded ? "Collapse" : "Expand",
        icon: layout.isExpanded ? "▾" : "▸",
        onClick: Message.ClickedToggleExpand({ entityId: entity.id }),
      }),
    ],
  );
};

// PROPERTY ROWS

const badge = (h: HtmlBuilder<Message>, label: string, title: string, className: string): Html =>
  h.span(
    [h.Class(`rounded px-1 text-[10px] font-bold tracking-wide ${className}`), h.Title(title)],
    [label],
  );

const constraintBadges = (
  h: HtmlBuilder<Message>,
  property: PropertyDefinition,
): ReadonlyArray<Html> => [
  ...(property.isId ? [badge(h, "PK", "Identifier", "bg-amber-100 text-amber-800")] : []),
  ...(property.isNullable ? [badge(h, "NULL", "Nullable", "bg-slate-100 text-slate-600")] : []),
  ...(property.isOptional ? [badge(h, "OPT", "Optional", "bg-slate-100 text-slate-600")] : []),
];

const typeLabel = (property: PropertyDefinition): string =>
  property.type === "Literal" && property.literalOptions !== undefined
    ? property.literalOptions.map((option) => `'${option}'`).join(" | ") || "Literal"
    : property.type;

const propertyRow = (
  h: HtmlBuilder<Message>,
  entity: EntityDefinition,
  property: PropertyDefinition,
  index: number,
  context: NodeContext,
): Html => {
  const warnings = Array.map(
    Diagnostics.forProperty(context.diagnostics, property.id),
    Diagnostics.describe,
  );
  const entityId = entity.id;
  const propertyId = property.id;
  return h.keyed("li")(
    property.id,
    [
      h.Class(
        "group/row flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 text-xs hover:bg-indigo-50/60",
      ),
      h.Style({ height: px(Geometry.PROPERTY_ROW_HEIGHT) }),
      h.OnClick(Message.ClickedEditProperty({ entityId, propertyId })),
      h.Title(property.description ?? "Click to edit"),
    ],
    [
      h.span(
        [
          h.Class(
            `min-w-0 truncate font-mono ${property.isId ? "font-semibold text-slate-900" : "text-slate-800"}`,
          ),
        ],
        [`${property.name}${property.isOptional ? "?" : ""}`],
      ),
      ...(Array.isReadonlyArrayNonEmpty(warnings) ? [warningBadge(h, warnings)] : []),
      h.span(
        [
          h.Class(
            `ml-auto min-w-0 truncate font-mono ${TYPE_COLORS[property.type]} group-hover/row:hidden`,
          ),
          h.Title(typeLabel(property)),
        ],
        [typeLabel(property)],
      ),
      h.span(
        [h.Class("flex shrink-0 gap-1 group-hover/row:hidden")],
        constraintBadges(h, property),
      ),
      h.span(
        [h.Class("ml-auto hidden shrink-0 items-center gap-0.5 group-hover/row:flex")],
        [
          iconButton(h, {
            label: "Move up",
            icon: "↑",
            isDisabled: index === 0,
            onClick: Message.ClickedMoveProperty({ entityId, propertyId, direction: "Up" }),
          }),
          iconButton(h, {
            label: "Move down",
            icon: "↓",
            isDisabled: index === entity.properties.length - 1,
            onClick: Message.ClickedMoveProperty({ entityId, propertyId, direction: "Down" }),
          }),
          iconButton(h, {
            label: "Edit field",
            icon: "✎",
            onClick: Message.ClickedEditProperty({ entityId, propertyId }),
          }),
          iconButton(h, {
            label: "Delete field",
            icon: "✕",
            className: "h-6 w-6 text-xs hover:!bg-rose-50 hover:!text-rose-600",
            onClick: Message.ClickedDeleteProperty({ entityId, propertyId }),
          }),
        ],
      ),
    ],
  );
};

const flagToggle = (
  h: HtmlBuilder<Message>,
  label: string,
  isChecked: boolean,
  flag: "isId" | "isOptional" | "isNullable",
): Html =>
  h.label(
    [h.Class("flex cursor-pointer items-center gap-1 text-[11px] text-slate-700")],
    [
      h.input([
        h.Type("checkbox"),
        h.Checked(isChecked),
        h.OnChange(() => Message.ToggledPropertyDraftFlag({ flag })),
        h.Class("h-3.5 w-3.5 accent-indigo-600"),
      ]),
      label,
    ],
  );

const propertyEditor = (h: HtmlBuilder<Message>, propertyId: string, draft: PropertyDraft): Html =>
  h.keyed("li")(
    propertyId,
    [
      h.Class("flex flex-col gap-1.5 border-y border-indigo-200 bg-indigo-50/70 px-3 py-2"),
      h.Style({ height: px(Geometry.PROPERTY_EDITOR_HEIGHT) }),
    ],
    [
      h.div(
        [h.Class("flex gap-1.5")],
        [
          h.input([
            h.Id(PROPERTY_NAME_INPUT_ID),
            h.Value(draft.name),
            h.AriaLabel("Field name"),
            h.Placeholder("fieldName"),
            h.Autocomplete("off"),
            h.Spellcheck(false),
            h.OnInput((name) => Message.UpdatedPropertyDraftName({ name })),
            h.Class(
              "min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200",
            ),
          ]),
          h.select(
            [
              h.AriaLabel("Field type"),
              h.OnChange((value) =>
                Message.SelectedPropertyDraftType({
                  type: Option.getOrElse(
                    Array.findFirst(PROPERTY_TYPES, (type) => type === value),
                    () => draft.type,
                  ),
                }),
              ),
              h.Class(
                "rounded border border-slate-300 bg-white px-1 py-0.5 text-xs outline-none focus:border-indigo-400",
              ),
            ],
            Array.map(PROPERTY_TYPES, (type) =>
              h.option([h.Value(type), h.Selected(type === draft.type)], [type]),
            ),
          ),
        ],
      ),
      h.div(
        [h.Class("flex gap-3")],
        [
          flagToggle(h, "Primary key", draft.isId, "isId"),
          flagToggle(h, "Nullable", draft.isNullable, "isNullable"),
          flagToggle(h, "Optional", draft.isOptional, "isOptional"),
        ],
      ),
      h.input([
        h.Value(draft.literalOptions),
        h.AriaLabel("Literal options"),
        h.Placeholder(
          draft.type === "Literal" ? "option-a, option-b" : "Literal options (Literal type only)",
        ),
        h.Disabled(draft.type !== "Literal"),
        h.OnInput((text) => Message.UpdatedPropertyDraftLiteralOptions({ text })),
        h.Class(
          "rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] outline-none focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-400",
        ),
      ]),
      h.div(
        [h.Class("flex items-center justify-end gap-1.5")],
        [
          h.span(
            [h.Class("mr-auto text-[10px] text-slate-500")],
            ["Enter to save · Esc to cancel"],
          ),
          h.button(
            [
              h.Type("button"),
              h.OnClick(Message.ClickedCancelEdit()),
              h.Class("rounded px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200"),
            ],
            ["Cancel"],
          ),
          h.button(
            [
              h.Type("button"),
              h.OnClick(Message.ClickedSaveProperty()),
              h.Class(
                "rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-700",
              ),
            ],
            ["Save"],
          ),
        ],
      ),
    ],
  );

const footerView = (h: HtmlBuilder<Message>, entity: EntityDefinition): Html =>
  h.div(
    [
      h.Class("flex items-center justify-between border-t border-slate-100 px-2"),
      h.Style({ height: px(Geometry.NODE_FOOTER_HEIGHT) }),
    ],
    [
      h.button(
        [
          h.Type("button"),
          h.OnClick(Message.ClickedAddProperty({ entityId: entity.id })),
          h.Class("rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"),
        ],
        ["+ Add field"],
      ),
      iconButton(h, {
        label: `Delete ${entity.name}`,
        icon: "🗑",
        className: "h-7 w-7 text-xs hover:!bg-rose-50 hover:!text-rose-600",
        onClick: Message.ClickedDeleteEntity({ entityId: entity.id }),
      }),
    ],
  );

// NODE

const nodePosition = (entity: EntityDefinition, layout: NodeLayout, editor: EditorState): Point =>
  editor._tag === "DraggingNode" && editor.entityId === entity.id
    ? editor.position
    : layout.position;

export const nodeView = (
  h: HtmlBuilder<Message>,
  entity: EntityDefinition,
  layout: NodeLayout,
  context: NodeContext,
): Html => {
  const position = nodePosition(entity, layout, context.editor);
  const rect = Geometry.nodeRect(entity, layout, context.maybeEditingPropertyId);
  const isDragging =
    context.editor._tag === "DraggingNode" && context.editor.entityId === entity.id;
  const hasWarnings = Array.isReadonlyArrayNonEmpty(
    Diagnostics.forEntity(context.diagnostics, entity.id),
  );
  const ring = context.isSelected
    ? "ring-2 ring-indigo-500"
    : hasWarnings
      ? "ring-2 ring-amber-300"
      : "ring-1 ring-slate-200";

  const idPropertyPorts = layout.isExpanded
    ? Array.filter(entity.properties, (property) => property.isId)
    : [];

  return h.keyed("div")(
    entity.id,
    [
      canvasItem(h),
      h.DataAttribute(ENTITY_ID_ATTRIBUTE, entity.id),
      h.Role("group"),
      h.AriaLabel(`Entity ${entity.name}`),
      h.Class(
        `group absolute rounded-xl bg-white transition-[width,height,box-shadow] duration-200 ease-out ${ring} ${isDragging ? "z-20 shadow-xl" : "shadow-md"}`,
      ),
      h.Style({
        left: px(position.x),
        top: px(position.y),
        width: px(rect.width),
        height: px(rect.height),
      }),
    ],
    [
      h.div(
        [h.Class("h-full overflow-hidden rounded-xl")],
        [
          headerView(h, entity, layout, context),
          ...(layout.isExpanded
            ? [
                h.ul(
                  [],
                  Array.map(entity.properties, (property, index) =>
                    context.editor._tag === "EditingProperty" &&
                    context.editor.propertyId === property.id
                      ? propertyEditor(h, property.id, context.editor.draft)
                      : propertyRow(h, entity, property, index, context),
                  ),
                ),
                footerView(h, entity),
              ]
            : []),
        ],
      ),
      port(h, entity.id, Option.none(), "left", Geometry.NODE_HEADER_HEIGHT / 2),
      port(h, entity.id, Option.none(), "right", Geometry.NODE_HEADER_HEIGHT / 2),
      ...Array.map(idPropertyPorts, (property) =>
        port(
          h,
          entity.id,
          Option.some(property.id),
          "right",
          Geometry.propertyAnchorOffset(
            entity,
            layout,
            Option.some(property.id),
            context.maybeEditingPropertyId,
          ),
        ),
      ),
    ],
  );
};

/** The placeholder card shown while naming a new entity. */
export const creatingNodeView = (
  h: HtmlBuilder<Message>,
  position: Point,
  draftName: string,
): Html =>
  h.div(
    [
      canvasItem(h),
      h.Class(
        "absolute flex items-center gap-2 rounded-xl bg-white px-3 shadow-lg ring-2 ring-indigo-400",
      ),
      h.Style({
        left: px(position.x),
        top: px(position.y),
        width: px(Geometry.COLLAPSED_NODE_WIDTH),
        height: px(Geometry.NODE_HEADER_HEIGHT),
      }),
    ],
    [
      h.span([h.Class("text-indigo-500"), h.AriaHidden(true)], ["▣"]),
      h.input([
        h.Id(ENTITY_NAME_INPUT_ID),
        h.Value(draftName),
        h.AriaLabel("New entity name"),
        h.Placeholder("EntityName"),
        h.Autocomplete("off"),
        h.Spellcheck(false),
        h.OnInput((name) => Message.UpdatedEntityDraftName({ name })),
        h.Class("min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none"),
      ]),
    ],
  );
