import { Data, Equal } from "effect";

import type {
  AssociationDefinition,
  AssociationEnd,
  AttributeDefinition,
  DomainModelDocument,
  EndIndex,
  EntityDefinition,
  EnumDefinition,
  EnumValue,
  NodeLayout,
} from "./schema";

// A 3-way merge of an external edit (theirs, read from disk) into the editor's
// document (ours), against the last version read from or written to disk
// (base). Items match by ID, which is opaque here, and properties merge one
// at a time. Where both sides changed the same thing differently, ours wins
// and the merge records a conflict for the UI to report. It never repairs
// references: dangling ones are diagnostics' job, and layout nodes for new or
// deleted cards are `reconcile`'s.

/** What a conflict is about. */
export type ConflictSubject = Data.TaggedEnum<{
  Document: {};
  Entity: { readonly entityId: string };
  Attribute: { readonly entityId: string; readonly attributeId: string };
  Enum: { readonly typeId: string };
  EnumValue: { readonly typeId: string; readonly valueId: string };
  Association: { readonly associationId: string };
  AssociationEnd: { readonly associationId: string; readonly endIndex: EndIndex };
  /** A card's layout, keyed by entity or enum ID. */
  Node: { readonly nodeId: string };
}>;
export const ConflictSubject = Data.taggedEnum<ConflictSubject>();

/** Every conflict resolves to ours. `label` names the subject for a notice,
 *  like `User.email`, `Role.admin` or `User–Post`. */
export type Conflict = Data.TaggedEnum<{
  /** Both sides changed `property` differently; ours was kept. */
  BothChanged: {
    readonly subject: ConflictSubject;
    readonly property: string;
    readonly label: string;
  };
  /** Theirs deleted something ours changed; ours was kept. */
  DeletedInTheirs: { readonly subject: ConflictSubject; readonly label: string };
  /** Ours deleted something theirs changed; it stays deleted. */
  DeletedInOurs: { readonly subject: ConflictSubject; readonly label: string };
}>;
export const Conflict = Data.taggedEnum<Conflict>();

export type MergeResult = Readonly<{
  document: DomainModelDocument;
  conflicts: ReadonlyArray<Conflict>;
}>;

type Report = (conflict: Conflict) => void;

// VALUES

/** One property, 3-way. `conflicted` means both changed it differently. */
const mergeValue = <A>(
  base: A,
  ours: A,
  theirs: A,
): Readonly<{ value: A; conflicted: boolean }> => {
  if (Equal.equals(ours, base)) return { value: theirs, conflicted: false };
  if (Equal.equals(theirs, base) || Equal.equals(ours, theirs)) {
    return { value: ours, conflicted: false };
  }
  return { value: ours, conflicted: true };
};

/** Merges the listed atomic properties. A missing `base` means the item was
 *  added on both sides, so every property starts out absent. An absent
 *  result stays absent rather than becoming an `undefined` key. */
const mergeFields = <A extends object, K extends keyof A & string>(
  base: A | undefined,
  ours: A,
  theirs: A,
  keys: ReadonlyArray<K>,
  onConflict: (property: K) => void,
): Pick<A, K> => {
  const merged: Partial<Pick<A, K>> = {};
  for (const key of keys) {
    const { value, conflicted } = mergeValue(base?.[key], ours[key], theirs[key]);
    if (conflicted) onConflict(key);
    if (value !== undefined) merged[key] = value;
  }
  return merged as Pick<A, K>;
};

// ORDER

const relativeOrder = (
  ids: ReadonlyArray<string>,
  keep: ReadonlySet<string>,
): ReadonlyArray<string> => ids.filter((id) => keep.has(id));

/** Orders `kept` IDs. Theirs is the skeleton unless ours reordered the IDs
 *  all three share, then ours is. Each kept ID only the other side has goes
 *  right after its nearest preceding neighbour (in that side's order) already
 *  placed, or first when none is. */
const mergeOrder = (
  base: ReadonlyArray<string>,
  ours: ReadonlyArray<string>,
  theirs: ReadonlyArray<string>,
  kept: ReadonlySet<string>,
): ReadonlyArray<string> => {
  const inOurs = new Set(ours);
  const inTheirs = new Set(theirs);
  const shared = new Set(base.filter((id) => inOurs.has(id) && inTheirs.has(id)));
  const oursReordered = !Equal.equals(relativeOrder(ours, shared), relativeOrder(base, shared));
  const [skeleton, other] = oursReordered ? [ours, theirs] : [theirs, ours];

  const result = skeleton.filter((id) => kept.has(id));
  const placed = new Set(result);
  other.forEach((id, index) => {
    if (!kept.has(id) || placed.has(id)) return;
    const anchor = other
      .slice(0, index)
      .reverse()
      .find((neighbour) => placed.has(neighbour));
    result.splice(anchor === undefined ? 0 : result.indexOf(anchor) + 1, 0, id);
    placed.add(id);
  });
  return result;
};

// COLLECTIONS

type Deletion = "DeletedInTheirs" | "DeletedInOurs";

/** Merges items by ID. Items on both sides merge with `mergeItem` (with no
 *  base when both added the same ID). An item one side deleted stays deleted
 *  if the other left it as it was; otherwise ours decides and `onDeleted`
 *  hears about it with the surviving side's version. */
const mergeById = <A>(
  base: ReadonlyArray<A>,
  ours: ReadonlyArray<A>,
  theirs: ReadonlyArray<A>,
  idOf: (item: A) => string,
  mergeItem: (base: A | undefined, ours: A, theirs: A) => A,
  onDeleted: (deletion: Deletion, item: A) => void,
): ReadonlyArray<A> => {
  const byId = (items: ReadonlyArray<A>) => new Map(items.map((item) => [idOf(item), item]));
  const [baseById, oursById, theirsById] = [byId(base), byId(ours), byId(theirs)];

  const merged = new Map<string, A>();
  for (const id of new Set([...oursById.keys(), ...theirsById.keys()])) {
    const [b, o, t] = [baseById.get(id), oursById.get(id), theirsById.get(id)];
    if (o !== undefined && t !== undefined) {
      merged.set(id, mergeItem(b, o, t));
    } else if (o !== undefined) {
      // Added by ours, or deleted by theirs.
      if (b === undefined || !Equal.equals(o, b)) merged.set(id, o);
      if (b !== undefined && !Equal.equals(o, b)) onDeleted("DeletedInTheirs", o);
    } else if (t !== undefined) {
      // Added by theirs, or deleted by ours.
      if (b === undefined) merged.set(id, t);
      else if (!Equal.equals(t, b)) onDeleted("DeletedInOurs", t);
    }
  }

  const ids = (items: ReadonlyArray<A>) => items.map(idOf);
  return mergeOrder(ids(base), ids(ours), ids(theirs), new Set(merged.keys())).map((id) =>
    merged.get(id)!,
  );
};

const byOwnId = (item: Readonly<{ id: string }>): string => item.id;

const reportDeletion = (
  report: Report,
  subject: ConflictSubject,
  label: string,
  deletion: Deletion,
): void => report(Conflict[deletion]({ subject, label }));

// DOCUMENT PARTS

/** Looks a name up in the merged entities and types first, so labels match
 *  what the user will see, then in each input. Falls back to the ID. */
type NameOf = (id: string) => string;

const mergeAttribute =
  (entityId: string, entityName: string, report: Report) =>
  (
    base: AttributeDefinition | undefined,
    ours: AttributeDefinition,
    theirs: AttributeDefinition,
  ): AttributeDefinition => {
    const subject = ConflictSubject.Attribute({ entityId, attributeId: ours.id });
    const conflicts: Array<string> = [];
    const merged = mergeFields(
      base,
      ours,
      theirs,
      ["id", "name", "description", "type", "multiplicity", "unique"],
      (property) => conflicts.push(property),
    );
    for (const property of conflicts) {
      report(Conflict.BothChanged({ subject, property, label: `${entityName}.${merged.name}` }));
    }
    return merged;
  };

const mergeEntity =
  (report: Report) =>
  (
    base: EntityDefinition | undefined,
    ours: EntityDefinition,
    theirs: EntityDefinition,
  ): EntityDefinition => {
    const subject = ConflictSubject.Entity({ entityId: ours.id });
    const conflicts: Array<string> = [];
    const fields = mergeFields(base, ours, theirs, ["id", "name", "description"], (property) =>
      conflicts.push(property),
    );
    for (const property of conflicts) {
      report(Conflict.BothChanged({ subject, property, label: fields.name }));
    }
    const attributes = mergeById(
      base?.attributes ?? [],
      ours.attributes,
      theirs.attributes,
      byOwnId,
      mergeAttribute(ours.id, fields.name, report),
      (deletion, attribute) =>
        reportDeletion(
          report,
          ConflictSubject.Attribute({ entityId: ours.id, attributeId: attribute.id }),
          `${fields.name}.${attribute.name}`,
          deletion,
        ),
    );
    return { ...fields, attributes };
  };

const mergeEnumValue =
  (typeId: string, typeName: string, report: Report) =>
  (base: EnumValue | undefined, ours: EnumValue, theirs: EnumValue): EnumValue => {
    const subject = ConflictSubject.EnumValue({ typeId, valueId: ours.id });
    const conflicts: Array<string> = [];
    const merged = mergeFields(base, ours, theirs, ["id", "name", "description"], (property) =>
      conflicts.push(property),
    );
    for (const property of conflicts) {
      report(Conflict.BothChanged({ subject, property, label: `${typeName}.${merged.name}` }));
    }
    return merged;
  };

const mergeEnum =
  (report: Report) =>
  (
    base: EnumDefinition | undefined,
    ours: EnumDefinition,
    theirs: EnumDefinition,
  ): EnumDefinition => {
    const subject = ConflictSubject.Enum({ typeId: ours.id });
    const conflicts: Array<string> = [];
    const fields = mergeFields(
      base,
      ours,
      theirs,
      ["id", "kind", "name", "description"],
      (property) => conflicts.push(property),
    );
    for (const property of conflicts) {
      report(Conflict.BothChanged({ subject, property, label: fields.name }));
    }
    const values = mergeById(
      base?.values ?? [],
      ours.values,
      theirs.values,
      byOwnId,
      mergeEnumValue(ours.id, fields.name, report),
      (deletion, value) =>
        reportDeletion(
          report,
          ConflictSubject.EnumValue({ typeId: ours.id, valueId: value.id }),
          `${fields.name}.${value.name}`,
          deletion,
        ),
    );
    return { ...fields, values };
  };

const associationLabel = (association: AssociationDefinition, nameOf: NameOf): string =>
  `${nameOf(association.ends[0].entityId)}–${nameOf(association.ends[1].entityId)}`;

const mergeAssociation =
  (nameOf: NameOf, report: Report) =>
  (
    base: AssociationDefinition | undefined,
    ours: AssociationDefinition,
    theirs: AssociationDefinition,
  ): AssociationDefinition => {
    const pending: Array<Readonly<{ subject: ConflictSubject; property: string }>> = [];
    const fields = mergeFields(base, ours, theirs, ["id", "name", "description"], (property) =>
      pending.push({ subject: ConflictSubject.Association({ associationId: ours.id }), property }),
    );
    const mergeEnd = (endIndex: EndIndex): AssociationEnd =>
      mergeFields(
        base?.ends[endIndex],
        ours.ends[endIndex],
        theirs.ends[endIndex],
        ["entityId", "role", "multiplicity"],
        (property) =>
          pending.push({
            subject: ConflictSubject.AssociationEnd({ associationId: ours.id, endIndex }),
            property,
          }),
      );
    const merged: AssociationDefinition = { ...fields, ends: [mergeEnd(0), mergeEnd(1)] };
    const label = associationLabel(merged, nameOf);
    for (const { subject, property } of pending) {
      report(Conflict.BothChanged({ subject, property, label }));
    }
    return merged;
  };

type NodeEntry = readonly [string, NodeLayout];

const mergeNode =
  (nameOf: NameOf, report: Report) =>
  (base: NodeEntry | undefined, ours: NodeEntry, theirs: NodeEntry): NodeEntry => {
    const [nodeId] = ours;
    const merged = mergeFields(
      base?.[1],
      ours[1],
      theirs[1],
      ["position", "isExpanded"],
      (property) =>
        report(
          Conflict.BothChanged({
            subject: ConflictSubject.Node({ nodeId }),
            property,
            label: nameOf(nodeId),
          }),
        ),
    );
    return [nodeId, merged];
  };

const nameLookup = (documents: ReadonlyArray<DomainModelDocument>): NameOf => {
  const names = new Map<string, string>();
  for (const document of [...documents].reverse()) {
    for (const node of [...document.entities, ...document.types]) names.set(node.id, node.name);
  }
  return (id) => names.get(id) ?? id;
};

// MERGE

/** Merges `theirs` (the file on disk) into `ours` (the editor's document),
 *  both descended from `base`. The viewport is always ours. */
export const merge = (
  base: DomainModelDocument,
  ours: DomainModelDocument,
  theirs: DomainModelDocument,
): MergeResult => {
  if (Equal.equals(theirs, base)) return { document: ours, conflicts: [] };
  if (Equal.equals(ours, base)) {
    return {
      document: { ...theirs, layout: { ...theirs.layout, viewport: ours.layout.viewport } },
      conflicts: [],
    };
  }

  const conflicts: Array<Conflict> = [];
  const report: Report = (conflict) => conflicts.push(conflict);

  const documentConflicts: Array<string> = [];
  const fields = mergeFields(base, ours, theirs, ["version", "name"], (property) =>
    documentConflicts.push(property),
  );
  for (const property of documentConflicts) {
    report(
      Conflict.BothChanged({ subject: ConflictSubject.Document(), property, label: fields.name }),
    );
  }

  const entities = mergeById(
    base.entities,
    ours.entities,
    theirs.entities,
    byOwnId,
    mergeEntity(report),
    (deletion, entity) =>
      reportDeletion(
        report,
        ConflictSubject.Entity({ entityId: entity.id }),
        entity.name,
        deletion,
      ),
  );
  const types = mergeById(
    base.types,
    ours.types,
    theirs.types,
    byOwnId,
    mergeEnum(report),
    (deletion, definition) =>
      reportDeletion(
        report,
        ConflictSubject.Enum({ typeId: definition.id }),
        definition.name,
        deletion,
      ),
  );

  const nameOf = nameLookup([{ ...ours, entities, types }, ours, theirs, base]);

  const associations = mergeById(
    base.associations,
    ours.associations,
    theirs.associations,
    byOwnId,
    mergeAssociation(nameOf, report),
    (deletion, association) =>
      reportDeletion(
        report,
        ConflictSubject.Association({ associationId: association.id }),
        associationLabel(association, nameOf),
        deletion,
      ),
  );

  // A node follows its card: deleting one is never a conflict of its own (the
  // card's deletion already reports), and a card that survived keeps a node,
  // so `reconcile` doesn't move it somewhere new.
  const mergedNodes = Object.fromEntries(
    mergeById<NodeEntry>(
      Object.entries(base.layout.nodes),
      Object.entries(ours.layout.nodes),
      Object.entries(theirs.layout.nodes),
      ([nodeId]) => nodeId,
      mergeNode(nameOf, report),
      () => {},
    ),
  );
  const nodes = { ...mergedNodes };
  for (const { id } of [...entities, ...types]) {
    const survivor = nodes[id] ?? ours.layout.nodes[id] ?? theirs.layout.nodes[id];
    if (survivor !== undefined) nodes[id] = survivor;
  }

  return {
    document: {
      ...fields,
      entities,
      types,
      associations,
      layout: { nodes, viewport: ours.layout.viewport },
    },
    conflicts,
  };
};
