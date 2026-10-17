import { Option } from "effect";

import * as Doc from "../domain/document";
import * as Geometry from "../domain/geometry";
import type { Point } from "../domain/schema";
import { EditorState, Selection, type Model } from "../model";
import { finishEditing } from "./editing";
import { commitDocument, present, toIdle } from "./shared";

/** How far a port drag must travel before releasing on its own entity counts
 *  as a deliberate self reference rather than a stray tap. */
const SELF_REFERENCE_MIN_DRAG = 40;

export const inspect = (model: Model, relationshipId: string): Model => ({
  ...finishEditing(model),
  editor: EditorState.EditingRelationship({ relationshipId }),
  selection: Selection.SelectedRelationship({ relationshipId }),
});

/** Completes a port drag: dropping on an entity creates a relationship and
 *  opens it in the inspector; dropping anywhere else cancels. */
export const connect = (
  model: Model,
  sourceEntityId: string,
  maybeSourcePropertyId: Option.Option<string>,
  startPos: Point,
  endPos: Point,
  maybeTargetEntityId: Option.Option<string>,
): Model => {
  const maybeValidTarget = Option.filter(
    maybeTargetEntityId,
    (targetEntityId) =>
      Option.isSome(Doc.findEntity(present(model), targetEntityId)) &&
      (targetEntityId !== sourceEntityId ||
        Geometry.distance(startPos, endPos) > SELF_REFERENCE_MIN_DRAG),
  );
  return Option.match(maybeValidTarget, {
    onNone: () => toIdle(model),
    onSome: (targetEntityId) => {
      const relationshipId = Doc.nextId(present(model), "r");
      return {
        ...commitDocument(model, (document) =>
          Doc.addRelationship(
            document,
            Doc.newRelationship(
              relationshipId,
              sourceEntityId,
              targetEntityId,
              maybeSourcePropertyId,
            ),
          ),
        ),
        editor: EditorState.EditingRelationship({ relationshipId }),
        selection: Selection.SelectedRelationship({ relationshipId }),
      };
    },
  });
};
