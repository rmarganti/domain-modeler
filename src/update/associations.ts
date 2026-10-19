import { Option } from "effect";

import * as Doc from "../domain/document";
import * as Ids from "../domain/ids";
import * as Geometry from "../domain/geometry";
import type { Point } from "../domain/schema";
import { EditorState, Selection, type Model } from "../model";
import { finishEditing } from "./editing";
import { commitDocument, present, toIdle } from "./shared";

/** How far a port drag must travel before releasing on its own entity counts
 *  as a deliberate self reference rather than a stray tap. */
const SELF_REFERENCE_MIN_DRAG = 40;

export const inspect = (model: Model, associationId: string): Model => ({
  ...finishEditing(model),
  editor: EditorState.EditingAssociation({ associationId }),
  selection: Selection.SelectedAssociation({ associationId }),
});

/**
 * Create and inspect an association in one undo step, for either input path.
 */
export const create = (model: Model, fromEntityId: string, toEntityId: string): Model => {
  const document = present(model);
  if (
    Option.isNone(Doc.findEntity(document, fromEntityId)) ||
    Option.isNone(Doc.findEntity(document, toEntityId))
  ) {
    return model;
  }
  const { id: associationId, state: idState } = Ids.nextId(model.idState, document);
  return {
    ...commitDocument({ ...model, idState }, (current) =>
      Doc.addAssociation(current, Doc.newAssociation(associationId, fromEntityId, toEntityId)),
    ),
    editor: EditorState.EditingAssociation({ associationId }),
    selection: Selection.SelectedAssociation({ associationId }),
  };
};

/** Completes a port drag: dropping on an entity creates an association and
 *  opens it in the inspector; dropping anywhere else cancels. */
export const connect = (
  model: Model,
  fromEntityId: string,
  startPos: Point,
  endPos: Point,
  maybeTargetEntityId: Option.Option<string>,
): Model => {
  const maybeValidTarget = Option.filter(
    maybeTargetEntityId,
    (toEntityId) =>
      Option.isSome(Doc.findEntity(present(model), toEntityId)) &&
      (toEntityId !== fromEntityId ||
        Geometry.distance(startPos, endPos) > SELF_REFERENCE_MIN_DRAG),
  );
  return Option.match(maybeValidTarget, {
    onNone: () => toIdle(model),
    onSome: (toEntityId) => create(toIdle(model), fromEntityId, toEntityId),
  });
};
