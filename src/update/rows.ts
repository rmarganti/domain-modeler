import { Option } from "effect";

import * as Doc from "../domain/document";
import { CardRow, EditorState, Selection, type Model } from "../model";
import * as Entities from "./entities";
import * as Enums from "./enums";
import { finishEditing } from "./editing";
import {
  amendDocument,
  commitDocument,
  present,
  reconcile,
  toggleExpanded as toggleNodeExpanded,
  toIdle,
  type UpdateReturn,
} from "./shared";

export type RowMotion = "Next" | "Previous" | "First" | "Last";

type CardCursor = Readonly<{
  nodeId: string;
  row: CardRow;
  rows: ReadonlyArray<CardRow>;
  select: (row: CardRow) => Selection;
}>;

const cardCursor = (model: Model): Option.Option<CardCursor> =>
  Selection.match(model.selection, {
    NoSelection: () => Option.none(),
    SelectedAssociation: () => Option.none(),
    SelectedEntity: ({ entityId, row }) =>
      Option.map(Doc.findEntity(present(model), entityId), (entity) => ({
        nodeId: entityId,
        row,
        rows: [
          CardRow.Title(),
          ...entity.attributes.map(({ id }) => CardRow.Attribute({ attributeId: id })),
        ],
        select: (row: CardRow) => Selection.SelectedEntity({ entityId, row }),
      })),
    SelectedEnum: ({ typeId, row }) =>
      Option.map(Doc.findEnum(present(model), typeId), (definition) => ({
        nodeId: typeId,
        row,
        rows: [
          CardRow.Title(),
          ...definition.values.map(({ id }) => CardRow.Value({ valueId: id })),
        ],
        select: (row: CardRow) => Selection.SelectedEnum({ typeId, row }),
      })),
  });

const sameRow = (a: CardRow, b: CardRow): boolean =>
  CardRow.match(a, {
    Title: () => b._tag === "Title",
    Attribute: ({ attributeId }) => b._tag === "Attribute" && b.attributeId === attributeId,
    Value: ({ valueId }) => b._tag === "Value" && b.valueId === valueId,
  });

export const move = (model: Model, motion: RowMotion): Model =>
  Option.match(cardCursor(model), {
    onNone: () => model,
    onSome: (cursor) => {
      const index = present(model).layout.nodes[cursor.nodeId]?.isExpanded
        ? Math.max(
            0,
            cursor.rows.findIndex((row) => sameRow(cursor.row, row)),
          )
        : 0;
      const target =
        motion === "First"
          ? 0
          : motion === "Last"
            ? cursor.rows.length - 1
            : Math.max(0, Math.min(cursor.rows.length - 1, index + (motion === "Next" ? 1 : -1)));
      const row = cursor.rows[target] ?? CardRow.Title();
      const ready =
        row._tag === "Title"
          ? model
          : amendDocument(model, (document) => Doc.setExpanded(document, cursor.nodeId, true));
      return { ...ready, selection: cursor.select(row) };
    },
  });

export const insert = (model: Model, position: "Above" | "Below"): UpdateReturn =>
  Option.match(cardCursor(model), {
    onNone: () => ({ model }),
    onSome: (cursor) => {
      const rowIndex = cursor.rows.findIndex((row) => sameRow(cursor.row, row));
      const index = Math.max(0, rowIndex - (position === "Above" ? 1 : 0));
      return model.selection._tag === "SelectedEntity"
        ? Entities.addAttribute(model, cursor.nodeId, index)
        : Enums.addValue(model, cursor.nodeId, index);
    },
  });

export const reorder = (model: Model, direction: Doc.MoveDirection): Model =>
  Selection.match(model.selection, {
    NoSelection: () => model,
    SelectedAssociation: () => model,
    SelectedEntity: ({ entityId, row }) =>
      row._tag === "Attribute"
        ? Entities.moveAttribute(model, entityId, row.attributeId, direction)
        : model,
    SelectedEnum: ({ typeId, row }) =>
      row._tag === "Value" ? Enums.moveValue(model, typeId, row.valueId, direction) : model,
  });

/** Toggles the current card. Collapsing hides its rows, so the cursor
 *  returns to the title. */
export const toggleExpanded = (model: Model): Model =>
  Option.match(cardCursor(model), {
    onNone: () => model,
    onSome: (cursor) => {
      const toggled = toggleNodeExpanded(model, cursor.nodeId);
      return present(toggled).layout.nodes[cursor.nodeId]?.isExpanded
        ? toggled
        : { ...toggled, selection: cursor.select(CardRow.Title()) };
    },
  });

export const select = (model: Model, selection: Selection): Model =>
  reconcile({ ...toIdle(finishEditing(model)), selection });

export const edit = (model: Model): UpdateReturn =>
  Selection.match(model.selection, {
    NoSelection: () => ({ model }),
    SelectedAssociation: ({ associationId }) => ({
      model: { ...model, editor: EditorState.EditingAssociation({ associationId }) },
    }),
    SelectedEntity: ({ entityId, row }) =>
      row._tag === "Attribute"
        ? Entities.startEditingAttribute(model, entityId, row.attributeId)
        : Entities.startRenaming(
            amendDocument(model, (document) => Doc.setExpanded(document, entityId, true)),
            entityId,
          ),
    SelectedEnum: ({ typeId, row }) =>
      row._tag === "Value"
        ? Enums.startEditingValue(model, typeId, row.valueId)
        : Enums.startRenaming(
            amendDocument(model, (document) => Doc.setExpanded(document, typeId, true)),
            typeId,
          ),
  });

/**
 * Deletes a row and keeps its next neighbor current, or its previous neighbor
 * at the end. Card and relationship deletion stay in the session module.
 */
export const deleteCurrent = (model: Model): Model =>
  Option.match(cardCursor(model), {
    onNone: () => model,
    onSome: (cursor) => {
      const index = cursor.rows.findIndex((row) => sameRow(cursor.row, row));
      if (index <= 0) return model;
      const next = cursor.rows[index + 1] ?? cursor.rows[index - 1] ?? CardRow.Title();
      const row = cursor.row;
      const deleted = commitDocument(model, (document) =>
        CardRow.match(row, {
          Title: () => document,
          Attribute: ({ attributeId }) => Doc.deleteAttribute(document, cursor.nodeId, attributeId),
          Value: ({ valueId }) => Doc.deleteEnumValue(document, cursor.nodeId, valueId),
        }),
      );
      return reconcile({ ...toIdle(deleted), selection: cursor.select(next) });
    },
  });
