import { Option } from "effect";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vitest";

import { CopyMermaid, ExportMermaid, RememberRecentCommands } from "./command";
import * as Doc from "./domain/document";
import * as History from "./domain/history";
import * as Ids from "./domain/ids";
import { toMermaid } from "./domain/mermaid";
import { Message } from "./message";
import { EditorState, Selection, type Model } from "./model";
import { update } from "./update";
import * as Palette from "./update/palette";

const initial: Model = {
  history: History.init(Doc.sampleDocument),
  idState: Ids.seed([1, 2, 3, 4]),
  editor: EditorState.Idle(),
  selection: Selection.NoSelection(),
  screen: { width: 1200, height: 800 },
  panKey: "Released",
  maybeFilePath: Option.none(),
  maybeSavedDocument: Option.some(Doc.sampleDocument),
  maybePendingDiskDocument: Option.none(),
  maybeDiskIssue: Option.none(),
  maybeNotice: Option.none(),
  recentCommandIds: [],
};
const opened = (m = initial): Model => update(m, Message.PressedCommandPaletteKey()).model;

describe("Mermaid export", () => {
  test("Copy as Mermaid copies a fenced diagram and confirms it", () => {
    story(
      update,
      given(opened()),
      message(Message.PickedOption({ optionId: "copyMermaid" })),
      Command.expectHas(
        CopyMermaid({ text: `\`\`\`mermaid\n${toMermaid(Doc.sampleDocument)}\n\`\`\`` }),
      ),
      Command.resolve(CopyMermaid, Message.SucceededCopyMermaid()),
      Command.resolve(RememberRecentCommands, Message.CompletedRememberRecentCommands()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(m.maybeNotice).toEqual(
          Option.some({ tone: "Info", text: "Copied Mermaid to clipboard" }),
        );
      }),
    );
  });

  test("a failed copy says why", () => {
    story(
      update,
      given(opened()),
      message(Message.PickedOption({ optionId: "copyMermaid" })),
      Command.resolve(CopyMermaid, Message.FailedCopyMermaid({ error: "Couldn't copy: denied" })),
      Command.resolve(RememberRecentCommands, Message.CompletedRememberRecentCommands()),
      model((m) => {
        expect(m.maybeNotice).toEqual(
          Option.some({ tone: "Error", text: "Couldn't copy: denied" }),
        );
      }),
    );
  });

  test("Export Mermaid writes the raw diagram to a file without touching the open one", () => {
    const withFile = opened({ ...initial, maybeFilePath: Option.some("/models/blog.domain.json") });
    story(
      update,
      given(withFile),
      message(Message.PickedOption({ optionId: "exportMermaid" })),
      Command.expectHas(
        ExportMermaid({ text: `${toMermaid(Doc.sampleDocument)}\n`, fileName: "blog.mmd" }),
      ),
      Command.resolve(ExportMermaid, Message.SucceededExportMermaid({ path: "/exports/blog.mmd" })),
      Command.resolve(RememberRecentCommands, Message.CompletedRememberRecentCommands()),
      model((m) => {
        expect(m.maybeNotice).toEqual(Option.some({ tone: "Info", text: "Exported blog.mmd" }));
        expect(m.maybeFilePath).toEqual(withFile.maybeFilePath);
        expect(m.maybeSavedDocument).toEqual(withFile.maybeSavedDocument);
      }),
    );
  });

  test("a failed export says why, and a cancelled one says nothing", () => {
    const exporting = update(opened(), Message.PickedOption({ optionId: "exportMermaid" })).model;
    expect(
      update(exporting, Message.FailedExportMermaid({ error: "Disk full" })).model.maybeNotice,
    ).toEqual(Option.some({ tone: "Error", text: "Disk full" }));
    expect(update(exporting, Message.CancelledFilePicker()).model).toBe(exporting);
  });

  const exportIds = (m: Model, query: string) =>
    Palette.options(m, query)
      .map(({ command }) => command.id)
      .filter((id) => id === "copyMermaid" || id === "exportMermaid");

  test("both commands are found as an ERD or diagram", () => {
    expect(exportIds(initial, "erd")).toEqual(["copyMermaid", "exportMermaid"]);
    expect(exportIds(initial, "diagram")).toEqual(["copyMermaid", "exportMermaid"]);
  });

  test("both commands hide while the model has no entities", () => {
    const empty = { ...initial, history: History.init(Doc.emptyDocument("Blog")) };
    expect(exportIds(empty, "")).toEqual([]);
    expect(exportIds(empty, "mermaid")).toEqual([]);
  });
});
