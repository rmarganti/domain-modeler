import { Option } from "effect";

import { RememberRecentCommands } from "../command";
import { fuzzyMatch } from "../domain/fuzzy";
import { ZOOM_STEP } from "../domain/geometry";
import * as History from "../domain/history";
import { PickerPurpose, type Model } from "../model";
import * as Canvas from "./canvas";
import * as Disk from "./disk";
import * as Entities from "./entities";
import * as Enums from "./enums";
import * as Export from "./export";
import * as Rows from "./rows";
import * as Session from "./session";
import { openPicker, present, showShortcuts, toIdle, type UpdateReturn } from "./shared";

// COMMAND PALETTE
// One-shot commands, run from a fuzzy-searched list. Selection commands hide
// when nothing they act on is selected. Commands that a key also triggers name
// that keymap entry, so the palette shows the same shortcut.

export const PALETTE_GROUPS = ["Selection", "Create", "View", "Edit", "File", "Help"] as const;
export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

export type PaletteCommand = Readonly<{
  /** Stable, and persisted in the recent list. */
  id: string;
  label: string;
  group: PaletteGroup;
  /** The keymap entry whose keys are shown beside the label. */
  shortcutId?: string;
  /** Other words people search for. They rank below label matches. */
  aliases?: ReadonlyArray<string>;
  /** Hidden from the palette when false. */
  isAvailable?: (model: Model) => boolean;
  /** Runs with the palette already closed. */
  run: (model: Model) => UpdateReturn;
}>;

export const MAX_RECENT_COMMANDS = 5;

const modelOnly =
  (f: (model: Model) => Model) =>
  (model: Model): UpdateReturn => ({ model: f(model) });

const hasSelection = (model: Model): boolean => model.selection._tag !== "NoSelection";
const hasCards = (model: Model): boolean =>
  present(model).entities.length + present(model).types.length > 0;
const hasEntities = (model: Model): boolean => present(model).entities.length > 0;
const anyCardExpanded = (model: Model, isExpanded: boolean): boolean =>
  Object.values(present(model).layout.nodes).some((node) => node.isExpanded === isExpanded);
const isCurrentCard = (model: Model, isExpanded: boolean): boolean =>
  Option.contains(Rows.isCurrentCardExpanded(model), isExpanded);

export const PALETTE_COMMANDS: ReadonlyArray<PaletteCommand> = [
  // Selection
  {
    id: "zoomToSelection",
    label: "Zoom to selection",
    group: "Selection",
    shortcutId: "zoomToSelection",
    aliases: ["fit selection", "focus selection"],
    isAvailable: hasSelection,
    run: modelOnly(Canvas.zoomToSelection),
  },
  {
    id: "connect",
    label: "Connect to…",
    group: "Selection",
    shortcutId: "connect",
    aliases: ["relate", "relationship", "association", "link"],
    isAvailable: (model) => model.selection._tag === "SelectedEntity",
    run: (model) =>
      model.selection._tag === "SelectedEntity"
        ? openPicker(model, PickerPurpose.Connect({ sourceEntityId: model.selection.entityId }))
        : { model },
  },
  {
    id: "rename",
    label: "Rename",
    group: "Selection",
    aliases: ["edit name"],
    isAvailable: (model) =>
      model.selection._tag === "SelectedEntity" || model.selection._tag === "SelectedEnum",
    run: (model) =>
      model.selection._tag === "SelectedEntity"
        ? Entities.startRenaming(model, model.selection.entityId)
        : model.selection._tag === "SelectedEnum"
          ? Enums.startRenaming(model, model.selection.typeId)
          : { model },
  },
  {
    id: "expandCard",
    label: "Expand card",
    group: "Selection",
    shortcutId: "toggleExpand",
    aliases: ["open card", "unfold", "show fields"],
    isAvailable: (model) => isCurrentCard(model, false),
    run: modelOnly(Rows.toggleExpanded),
  },
  {
    id: "collapseCard",
    label: "Collapse card",
    group: "Selection",
    shortcutId: "toggleExpand",
    aliases: ["close card", "fold", "hide fields"],
    isAvailable: (model) => isCurrentCard(model, true),
    run: modelOnly(Rows.toggleExpanded),
  },
  {
    id: "delete",
    label: "Delete selection",
    group: "Selection",
    shortcutId: "delete",
    aliases: ["remove"],
    isAvailable: hasSelection,
    run: modelOnly(Session.deleteSelection),
  },
  // Create
  {
    id: "newEntity",
    label: "New entity",
    group: "Create",
    aliases: ["add entity", "add table", "add class"],
    run: Entities.startCreating,
  },
  {
    id: "newEnum",
    label: "New enum",
    group: "Create",
    aliases: ["add enum", "enumeration", "choices"],
    run: Enums.startCreating,
  },
  // View
  {
    id: "autoArrange",
    label: "Arrange cards",
    group: "View",
    shortcutId: "autoArrange",
    aliases: ["auto layout", "layout", "tidy", "organize"],
    isAvailable: hasCards,
    run: modelOnly(Canvas.autoArrange),
  },
  {
    id: "fitToScreen",
    label: "Fit to screen",
    group: "View",
    shortcutId: "fitToScreen",
    aliases: ["fit all", "show all", "zoom to fit"],
    run: modelOnly(Canvas.fitToScreen),
  },
  {
    id: "resetView",
    label: "Reset zoom",
    group: "View",
    shortcutId: "resetView",
    aliases: ["actual size", "100%", "zoom reset"],
    run: modelOnly(Canvas.resetView),
  },
  {
    id: "zoomIn",
    label: "Zoom in",
    group: "View",
    shortcutId: "zoomIn",
    aliases: ["magnify", "bigger"],
    run: modelOnly((model) => Canvas.zoomBy(model, ZOOM_STEP)),
  },
  {
    id: "zoomOut",
    label: "Zoom out",
    group: "View",
    shortcutId: "zoomOut",
    aliases: ["smaller"],
    run: modelOnly((model) => Canvas.zoomBy(model, 1 / ZOOM_STEP)),
  },
  {
    id: "expandAll",
    label: "Expand all cards",
    group: "View",
    aliases: ["open all", "unfold all", "show all fields"],
    isAvailable: (model) => anyCardExpanded(model, false),
    run: modelOnly((model) => Rows.setAllExpanded(model, true)),
  },
  {
    id: "collapseAll",
    label: "Collapse all cards",
    group: "View",
    aliases: ["close all", "fold all", "hide all fields"],
    isAvailable: (model) => anyCardExpanded(model, true),
    run: modelOnly((model) => Rows.setAllExpanded(model, false)),
  },
  // Edit
  {
    id: "undo",
    label: "Undo",
    group: "Edit",
    shortcutId: "undo",
    isAvailable: (model) => History.canUndo(model.history),
    run: modelOnly(Session.undo),
  },
  {
    id: "redo",
    label: "Redo",
    group: "Edit",
    shortcutId: "redo",
    isAvailable: (model) => History.canRedo(model.history),
    run: modelOnly(Session.redo),
  },
  // File
  {
    id: "save",
    label: "Save",
    group: "File",
    shortcutId: "save",
    run: Session.save,
  },
  {
    id: "saveAs",
    label: "Save as…",
    group: "File",
    shortcutId: "saveAs",
    aliases: ["save copy"],
    run: Session.saveAs,
  },
  {
    id: "open",
    label: "Open…",
    group: "File",
    shortcutId: "open",
    aliases: ["open file", "load"],
    run: Session.open,
  },
  {
    id: "newDocument",
    label: "New model",
    group: "File",
    shortcutId: "newDocument",
    aliases: ["new file", "blank model"],
    run: modelOnly(Session.newDocument),
  },
  {
    id: "reloadFromDisk",
    label: "Reload from disk",
    group: "File",
    shortcutId: "reloadFromDisk",
    aliases: ["revert", "discard changes"],
    isAvailable: (model) => Option.isSome(model.maybeFilePath),
    run: Disk.reload,
  },
  {
    id: "copyMermaid",
    label: "Copy as Mermaid",
    group: "File",
    aliases: ["export", "erd", "diagram", "clipboard"],
    isAvailable: hasEntities,
    run: Export.copyMermaid,
  },
  {
    id: "exportMermaid",
    label: "Export Mermaid…",
    group: "File",
    aliases: ["erd", "diagram", "mmd"],
    isAvailable: hasEntities,
    run: Export.exportMermaid,
  },
  // Help
  {
    id: "findCard",
    label: "Find card…",
    group: "Help",
    shortcutId: "findCard",
    aliases: ["go to", "search", "jump"],
    run: (model) => openPicker(model, PickerPurpose.Focus()),
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    group: "Help",
    shortcutId: "shortcuts",
    aliases: ["help", "keys", "hotkeys", "keybindings"],
    run: showShortcuts,
  },
];

const isKnown = (id: string): boolean => PALETTE_COMMANDS.some((command) => command.id === id);

/** Drops unknown ids (renamed or removed commands) and duplicates, and caps the list. */
export const cleanRecentIds = (ids: ReadonlyArray<string>): ReadonlyArray<string> =>
  ids.filter((id, index) => isKnown(id) && ids.indexOf(id) === index).slice(0, MAX_RECENT_COMMANDS);

const available = (model: Model): ReadonlyArray<PaletteCommand> =>
  PALETTE_COMMANDS.filter((command) => command.isAvailable?.(model) ?? true);

export type PaletteOption = Readonly<{
  command: PaletteCommand;
  indices: ReadonlyArray<number>;
  maybeAlias?: string;
  /** "Recent" or the command's group. Headings show only for an empty query. */
  section: PaletteGroup | "Recent";
}>;

/**
 * The palette's options in display order. An empty query lists recent
 * commands first, then every other command by group. A query ranks every
 * available command by its label, then its aliases.
 */
export const options = (model: Model, query: string): ReadonlyArray<PaletteOption> => {
  const commands = available(model);
  if (query.trim() === "") {
    const recent = model.recentCommandIds.flatMap((id) =>
      commands.filter((command) => command.id === id),
    );
    return [
      ...recent.map((command) => ({ command, indices: [], section: "Recent" as const })),
      ...PALETTE_GROUPS.flatMap((group) =>
        commands
          .filter((command) => command.group === group && !recent.includes(command))
          .map((command) => ({ command, indices: [], section: group })),
      ),
    ];
  }
  return fuzzyMatch(
    commands,
    query,
    (command) => command.label,
    (command) => command.aliases ?? [],
  ).map(({ item, indices, maybeAlias }) => ({
    command: item,
    indices,
    ...(maybeAlias === undefined ? {} : { maybeAlias }),
    section: item.group,
  }));
};

/** Closes the palette, runs the command if it's still available, and moves it
 *  to the front of the recent list. */
export const run = (model: Model, commandId: string): UpdateReturn => {
  const command = available(model).find(({ id }) => id === commandId);
  if (command === undefined) {
    return { model };
  }
  const recentCommandIds = cleanRecentIds([command.id, ...model.recentCommandIds]);
  const result = command.run({ ...toIdle(model), recentCommandIds });
  return {
    ...result,
    commands: [...(result.commands ?? []), RememberRecentCommands({ ids: recentCommandIds })],
  };
};
