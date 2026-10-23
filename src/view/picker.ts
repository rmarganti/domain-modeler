import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { PICKER_INPUT_ID } from "../dom";
import { searchCards } from "../domain/card-search";
import * as Doc from "../domain/document";
import { helpChips, shortcutFor } from "../keymap";
import { Message } from "../message";
import { PickerPurpose, type Model } from "../model";
import * as Palette from "../update/palette";
import { kbd } from "./shared";

// PICKERS
// Find card, Connect to…, and the command palette share this overlay: a query
// input over a listbox of fuzzy matches.

const optionId = (index: number): string => `picker-option-${index}`;

/** One row of the listbox, whatever the purpose. */
type PickerRow = Readonly<{
  id: string;
  label: string;
  indices: ReadonlyArray<number>;
  /** The alias that matched, shown when the label itself didn't. */
  maybeAlias?: string;
  /** The card's kind, or the command's shortcut chip. */
  trailing: Html | string;
  /** A heading shown above the row when it starts a new section. */
  maybeSection?: string;
}>;

type PickerCopy = Readonly<{
  label: string;
  placeholder: string;
  listLabel: string;
  empty: string;
  action: string;
}>;

const highlighted = (
  h: HtmlBuilder<Message>,
  text: string,
  indices: ReadonlyArray<number>,
): ReadonlyArray<Html | string> =>
  text
    .split("")
    .map((character, characterIndex) =>
      indices.includes(characterIndex)
        ? h.mark([h.Class("rounded-sm bg-indigo-200 text-inherit")], [character])
        : character,
    );

const optionView = (
  h: HtmlBuilder<Message>,
  row: PickerRow,
  index: number,
  highlightedIndex: number,
): Html =>
  h.div(
    [
      h.Id(optionId(index)),
      h.Role("option"),
      h.AriaSelected(index === highlightedIndex),
      h.OnClick(Message.PickedOption({ optionId: row.id })),
      h.Class(
        `flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
          index === highlightedIndex
            ? "bg-indigo-50 text-indigo-900"
            : "text-slate-700 hover:bg-slate-50"
        }`,
      ),
    ],
    [
      h.span(
        [h.Class("min-w-0 break-words")],
        [
          h.span([h.Class("font-medium")], highlighted(h, row.label, row.indices)),
          ...(row.maybeAlias === undefined
            ? []
            : [h.span([h.Class("ml-2 text-xs text-slate-400")], [row.maybeAlias])]),
        ],
      ),
      h.span([h.Class("shrink-0 text-xs text-slate-400")], [row.trailing]),
    ],
  );

const sectionHeading = (h: HtmlBuilder<Message>, title: string): Html =>
  h.p(
    [
      h.Role("presentation"),
      h.Class(
        "px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 first:pt-0.5",
      ),
    ],
    [title],
  );

/** The first alternative of a command's keys, as chips. */
const shortcutChips = (h: HtmlBuilder<Message>, shortcutId: string | undefined): Html | string => {
  const chips =
    shortcutId === undefined ? [] : (helpChips({ label: "", ids: [shortcutId] })[0] ?? []);
  return h.span(
    [h.Class("flex items-center gap-1")],
    chips.map((chip) => kbd(h, chip)),
  );
};

const commandRows = (
  h: HtmlBuilder<Message>,
  model: Model,
  query: string,
): ReadonlyArray<PickerRow> => {
  const showSections = query.trim() === "";
  return Palette.options(model, query).map(({ command, indices, maybeAlias, section }) => ({
    id: command.id,
    label: command.label,
    indices,
    ...(maybeAlias === undefined ? {} : { maybeAlias }),
    trailing: shortcutChips(h, command.shortcutId),
    ...(showSections ? { maybeSection: section } : {}),
  }));
};

const cardRows = (model: Model, query: string, onlyEntities: boolean): ReadonlyArray<PickerRow> =>
  searchCards(model.history.present, query, onlyEntities ? "Entity" : undefined).map(
    ({ card, indices }) => ({
      id: card.nodeId,
      label: card.name,
      indices,
      trailing: card.kind,
    }),
  );

const copyFor = (model: Model, purpose: PickerPurpose): PickerCopy =>
  PickerPurpose.match(purpose, {
    Focus: () => ({
      label: "Find card",
      placeholder: "Find an entity or enum…",
      listLabel: "Cards",
      empty: "No cards match",
      action: "focus",
    }),
    Connect: ({ sourceEntityId }) => {
      const label = `Connect ${Option.match(Doc.findEntity(model.history.present, sourceEntityId), {
        onNone: () => "entity",
        onSome: (entity) => entity.name,
      })} to`;
      return {
        label,
        placeholder: `${label}…`,
        listLabel: "Entities",
        empty: "No entities match",
        action: "connect",
      };
    },
    RunCommand: () => ({
      label: "Run a command",
      placeholder: "Run a command…",
      listLabel: "Commands",
      empty: "No commands match",
      action: "run",
    }),
  });

/** Rows interleaved with a heading wherever a new section starts. */
const listView = (
  h: HtmlBuilder<Message>,
  rows: ReadonlyArray<PickerRow>,
  highlightedIndex: number,
): ReadonlyArray<Html> =>
  rows.flatMap((row, index) => [
    ...(row.maybeSection !== undefined && row.maybeSection !== rows[index - 1]?.maybeSection
      ? [sectionHeading(h, row.maybeSection)]
      : []),
    optionView(h, row, index, highlightedIndex),
  ]);

export const pickerView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const editor = model.editor;
  if (editor._tag !== "Picking") {
    return [];
  }
  const copy = copyFor(model, editor.purpose);
  const rows = PickerPurpose.match(editor.purpose, {
    Focus: () => cardRows(model, editor.query, false),
    Connect: () => cardRows(model, editor.query, true),
    RunCommand: () => commandRows(h, model, editor.query),
  });
  return [
    h.div(
      [h.Class("fixed inset-0 z-50 bg-slate-900/10"), h.OnClick(Message.ClickedCancelEdit())],
      [],
    ),
    h.div(
      [
        h.Role("dialog"),
        h.AriaLabel(copy.label),
        h.AriaModal(true),
        h.Class(
          "fixed left-1/2 top-[15vh] z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur",
        ),
      ],
      [
        h.input([
          h.Id(PICKER_INPUT_ID),
          h.Role("combobox"),
          h.AriaLabel(copy.label),
          h.AriaAutocomplete("list"),
          h.AriaExpanded(true),
          h.AriaControls("picker-options"),
          ...(rows[editor.highlighted] === undefined
            ? []
            : [h.AriaActiveDescendant(optionId(editor.highlighted))]),
          h.Type("text"),
          h.Autocomplete("off"),
          h.Placeholder(copy.placeholder),
          h.Value(editor.query),
          h.OnInput((query) => Message.UpdatedPickerQuery({ query })),
          h.Class(
            "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200",
          ),
        ]),
        h.div(
          [
            h.Id("picker-options"),
            h.Role("listbox"),
            h.AriaLabel(copy.listLabel),
            h.Class("mt-2 max-h-[50vh] space-y-1 overflow-y-auto"),
          ],
          listView(h, rows, editor.highlighted),
        ),
        ...(rows.length === 0
          ? [
              h.p(
                [h.Role("status"), h.Class("px-3 py-6 text-center text-sm text-slate-500")],
                [copy.empty],
              ),
            ]
          : []),
        h.p(
          [h.Class("px-3 pb-1 pt-2 text-[11px] text-slate-400")],
          [
            `${shortcutFor("pickNext")} / ${shortcutFor("pickPrevious")} choose · ${shortcutFor("pickCard")} ${copy.action} · ${shortcutFor("escape")} cancel`,
          ],
        ),
      ],
    ),
  ];
};
