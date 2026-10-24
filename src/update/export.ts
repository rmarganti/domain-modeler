import { CopyMermaid, ExportMermaid } from "../command";
import { toMermaid } from "../domain/mermaid";
import { fileStem } from "../domain/naming";
import { fileNameOf, type Model } from "../model";
import { notify } from "./session";
import { present, type UpdateReturn } from "./shared";

// Exports of the present document to other formats. They never touch the open
// file or its saved state.

/** Fenced, so it renders when pasted into Markdown. */
export const copyMermaid = (model: Model): UpdateReturn => ({
  model,
  commands: [CopyMermaid({ text: `\`\`\`mermaid\n${toMermaid(present(model))}\n\`\`\`` })],
});

/** Raw, as a `.mmd` file is read by Mermaid tools, not as Markdown. */
export const exportMermaid = (model: Model): UpdateReturn => ({
  model,
  commands: [
    ExportMermaid({
      text: `${toMermaid(present(model))}\n`,
      fileName: `${fileStem(present(model).name)}.mmd`,
    }),
  ],
});

export const copied = (model: Model): Model =>
  notify(model, { tone: "Info", text: "Copied Mermaid to clipboard" });

export const exported = (model: Model, path: string): Model =>
  notify(model, { tone: "Info", text: `Exported ${fileNameOf(path)}` });
