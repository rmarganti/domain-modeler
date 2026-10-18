import { Array, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { ENTITY_ID_ATTRIBUTE, ENTITY_NAME_INPUT_ID, ATTRIBUTE_NAME_INPUT_ID } from "../dom";
import * as Diagnostics from "../domain/diagnostics";
import * as Geometry from "../domain/geometry";
import {
  PRIMITIVES,
  type EntityDefinition,
  type NodeLayout,
  type Point,
  type AttributeDefinition,
} from "../domain/schema";
import { MULTIPLICITIES, multiplicityEquals, multiplicityLabel } from "../domain/multiplicity";
import { Message } from "../message";
import type { EditorState, AttributeDraft } from "../model";
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
import { onPress, px, warningBadge } from "./shared";

export type NodeContext = Readonly<{
  editor: EditorState;
  isSelected: boolean;
  diagnostics: ReadonlyArray<Diagnostics.Diagnostic>;
  maybeEditingAttributeId: Option.Option<string>;
}>;

const TYPE_COLORS: Record<AttributeDefinition["type"], string> = {
  String: "text-emerald-700",
  Integer: "text-sky-700",
  Decimal: "text-cyan-700",
  Boolean: "text-violet-700",
  Date: "text-orange-700",
  DateTime: "text-amber-700",
  Json: "text-slate-700",
  Literal: "text-pink-700",
};

// PORTS

const port = (h: HtmlBuilder<Message>, entityId: string, side: Geometry.Side): Html =>
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
        top: px(Geometry.HEADER_ANCHOR_OFFSET - Geometry.PORT_RADIUS),
        [side]: px(-Geometry.PORT_RADIUS),
        touchAction: "none",
      }),
      onPress(h, Option.none(), ({ button, clientX, clientY }) =>
        Message.PressedPort({ entityId, button, clientX, clientY }),
      ),
    ],
    [],
  );

// HEADER

const headerView = (
  h: HtmlBuilder<Message>,
  entity: EntityDefinition,
  layout: NodeLayout,
  context: NodeContext,
): Html =>
  cardHeader(h, {
    nodeId: entity.id,
    layout,
    icon: h.span([h.Class("text-indigo-500"), h.AriaHidden(true)], ["▣"]),
    name: cardName(h, {
      name: entity.name,
      maybeDescription: Option.fromNullishOr(entity.description),
      maybeDraftName:
        context.editor._tag === "RenamingEntity" && context.editor.entityId === entity.id
          ? Option.some(context.editor.draftName)
          : Option.none(),
      inputId: ENTITY_NAME_INPUT_ID,
      inputLabel: "Entity name",
      onInput: (name) => Message.UpdatedEntityDraftName({ name }),
      onDoubleClick: Message.DoubleClickedEntityName({ entityId: entity.id }),
    }),
    warnings: Array.map(
      Diagnostics.forEntity(context.diagnostics, entity.id),
      Diagnostics.describe,
    ),
    badges: [countBadge(h, entity.attributes.length, `${entity.attributes.length} fields`)],
    onPress: ({ button, clientX, clientY }) =>
      Message.PressedNodeHeader({ entityId: entity.id, button, clientX, clientY }),
  });

// ATTRIBUTE ROWS

const badge = (h: HtmlBuilder<Message>, label: string, title: string, className: string): Html =>
  h.span(
    [h.Class(`rounded px-1 text-[10px] font-bold tracking-wide ${className}`), h.Title(title)],
    [label],
  );

const constraintBadges = (
  h: HtmlBuilder<Message>,
  attribute: AttributeDefinition,
): ReadonlyArray<Html> => {
  const label = multiplicityLabel(attribute.multiplicity);
  return [
    ...(label === "1"
      ? []
      : [badge(h, label, `Multiplicity ${label}`, "bg-slate-100 text-slate-600")]),
    ...(attribute.unique ? [badge(h, "UQ", "Unique", "bg-indigo-50 text-indigo-700")] : []),
  ];
};

const typeLabel = (attribute: AttributeDefinition): string =>
  attribute.type === "Literal" && attribute.literalOptions !== undefined
    ? attribute.literalOptions.map((option) => `'${option}'`).join(" | ") || "Literal"
    : attribute.type;

const attributeRow = (
  h: HtmlBuilder<Message>,
  entity: EntityDefinition,
  attribute: AttributeDefinition,
  index: number,
  context: NodeContext,
): Html => {
  const warnings = Array.map(
    Diagnostics.forAttribute(context.diagnostics, attribute.id),
    Diagnostics.describe,
  );
  const entityId = entity.id;
  const attributeId = attribute.id;
  return h.keyed("li")(
    attribute.id,
    [
      h.Class(
        "group/row flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 text-xs hover:bg-indigo-50/60",
      ),
      h.Style({ height: px(Geometry.ATTRIBUTE_ROW_HEIGHT) }),
      h.OnClick(Message.ClickedEditAttribute({ entityId, attributeId })),
      h.Title(attribute.description ?? "Click to edit"),
    ],
    [
      h.span([h.Class("min-w-0 truncate font-mono text-slate-800")], [attribute.name]),
      ...(Array.isReadonlyArrayNonEmpty(warnings) ? [warningBadge(h, warnings)] : []),
      h.span(
        [
          h.Class(
            `ml-auto min-w-0 truncate font-mono ${TYPE_COLORS[attribute.type]} group-hover/row:hidden`,
          ),
          h.Title(typeLabel(attribute)),
        ],
        [typeLabel(attribute)],
      ),
      h.span(
        [h.Class("flex shrink-0 gap-1 group-hover/row:hidden")],
        constraintBadges(h, attribute),
      ),
      rowActions(h, {
        noun: "field",
        isFirst: index === 0,
        isLast: index === entity.attributes.length - 1,
        onMoveUp: Message.ClickedMoveAttribute({ entityId, attributeId, direction: "Up" }),
        onMoveDown: Message.ClickedMoveAttribute({ entityId, attributeId, direction: "Down" }),
        onEdit: Message.ClickedEditAttribute({ entityId, attributeId }),
        onDelete: Message.ClickedDeleteAttribute({ entityId, attributeId }),
      }),
    ],
  );
};

const multiplicitySelect = (h: HtmlBuilder<Message>, draft: AttributeDraft): Html =>
  h.select(
    [
      h.AriaLabel("Field multiplicity"),
      h.OnChange((value) =>
        Message.SelectedAttributeDraftMultiplicity({
          multiplicity: Option.match(
            Array.findFirst(MULTIPLICITIES, ({ label }) => label === value),
            { onNone: () => draft.multiplicity, onSome: ({ multiplicity }) => multiplicity },
          ),
        }),
      ),
      h.Class(
        "rounded border border-slate-300 bg-white px-1 py-0.5 font-mono text-[11px] outline-none focus:border-indigo-400",
      ),
    ],
    Array.map(MULTIPLICITIES, ({ multiplicity, label }) =>
      h.option(
        [h.Value(label), h.Selected(multiplicityEquals(multiplicity, draft.multiplicity))],
        [label],
      ),
    ),
  );

const uniqueToggle = (h: HtmlBuilder<Message>, draft: AttributeDraft): Html => {
  const isList = draft.multiplicity.max === "many";
  return h.label(
    [
      h.Class(
        `flex items-center gap-1 text-[11px] ${isList ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700"}`,
      ),
      h.Title(isList ? "A list field can't be unique" : "Unique"),
    ],
    [
      h.input([
        h.Type("checkbox"),
        h.Checked(draft.unique),
        h.Disabled(isList),
        h.OnChange(() => Message.ToggledAttributeDraftUnique()),
        h.Class("h-3.5 w-3.5 accent-indigo-600"),
      ]),
      "Unique",
    ],
  );
};

const attributeEditor = (
  h: HtmlBuilder<Message>,
  attributeId: string,
  draft: AttributeDraft,
): Html =>
  h.keyed("li")(
    attributeId,
    [
      h.Class("flex flex-col gap-1.5 border-y border-indigo-200 bg-indigo-50/70 px-3 py-2"),
      h.Style({ height: px(Geometry.ATTRIBUTE_EDITOR_HEIGHT) }),
    ],
    [
      h.div(
        [h.Class("flex gap-1.5")],
        [
          h.input([
            h.Id(ATTRIBUTE_NAME_INPUT_ID),
            h.Value(draft.name),
            h.AriaLabel("Field name"),
            h.Placeholder("fieldName"),
            h.Autocomplete("off"),
            h.Spellcheck(false),
            h.OnInput((name) => Message.UpdatedAttributeDraftName({ name })),
            h.Class(
              "min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200",
            ),
          ]),
          h.select(
            [
              h.AriaLabel("Field type"),
              h.OnChange((value) =>
                Message.SelectedAttributeDraftType({
                  type: Option.getOrElse(
                    Array.findFirst(PRIMITIVES, (type) => type === value),
                    () => draft.type,
                  ),
                }),
              ),
              h.Class(
                "rounded border border-slate-300 bg-white px-1 py-0.5 text-xs outline-none focus:border-indigo-400",
              ),
            ],
            Array.map(PRIMITIVES, (type) =>
              h.option([h.Value(type), h.Selected(type === draft.type)], [type]),
            ),
          ),
        ],
      ),
      h.div(
        [h.Class("flex items-center gap-3")],
        [multiplicitySelect(h, draft), uniqueToggle(h, draft)],
      ),
      h.input([
        h.Value(draft.literalOptions),
        h.AriaLabel("Literal options"),
        h.Placeholder(
          draft.type === "Literal" ? "option-a, option-b" : "Literal options (Literal type only)",
        ),
        h.Disabled(draft.type !== "Literal"),
        h.OnInput((text) => Message.UpdatedAttributeDraftLiteralOptions({ text })),
        h.Class(
          "rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] outline-none focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-400",
        ),
      ]),
      editorActions(h, Message.ClickedSaveAttribute()),
    ],
  );

const footerView = (h: HtmlBuilder<Message>, entity: EntityDefinition): Html =>
  cardFooter(h, {
    addLabel: "+ Add field",
    onAdd: Message.ClickedAddAttribute({ entityId: entity.id }),
    name: entity.name,
    onDelete: Message.ClickedDeleteEntity({ entityId: entity.id }),
  });

// NODE

export const nodeView = (
  h: HtmlBuilder<Message>,
  entity: EntityDefinition,
  layout: NodeLayout,
  context: NodeContext,
): Html =>
  cardFrame(
    h,
    {
      nodeId: entity.id,
      dataAttribute: { name: ENTITY_ID_ATTRIBUTE, value: entity.id },
      ariaLabel: `Entity ${entity.name}`,
      layout,
      rect: Geometry.nodeRect(entity, layout, context.maybeEditingAttributeId),
      editor: context.editor,
      isSelected: context.isSelected,
      hasWarnings: Array.isReadonlyArrayNonEmpty(
        Diagnostics.forEntity(context.diagnostics, entity.id),
      ),
    },
    [
      headerView(h, entity, layout, context),
      ...(layout.isExpanded
        ? [
            h.ul(
              [],
              Array.map(entity.attributes, (attribute, index) =>
                context.editor._tag === "EditingAttribute" &&
                context.editor.attributeId === attribute.id
                  ? attributeEditor(h, attribute.id, context.editor.draft)
                  : attributeRow(h, entity, attribute, index, context),
              ),
            ),
            footerView(h, entity),
          ]
        : []),
    ],
    [port(h, entity.id, "left"), port(h, entity.id, "right")],
  );

/** The placeholder card shown while naming a new entity. */
export const creatingNodeView = (
  h: HtmlBuilder<Message>,
  position: Point,
  draftName: string,
): Html =>
  creatingCardView(h, {
    position,
    draftName,
    icon: h.span([h.Class("text-indigo-500"), h.AriaHidden(true)], ["▣"]),
    inputId: ENTITY_NAME_INPUT_ID,
    inputLabel: "New entity name",
    placeholder: "EntityName",
    onInput: (name) => Message.UpdatedEntityDraftName({ name }),
  });
