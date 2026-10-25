import { CopyExport, SaveExport } from "../command";
import { toEffectSchema } from "../domain/effect-schema";
import { toMermaid } from "../domain/mermaid";
import { fileStem } from "../domain/naming";
import type { ExportFormat } from "../message";
import { fileNameOf, type Model } from "../model";
import { notify } from "./session";
import { present, type UpdateReturn } from "./shared";

// Exports of the present document to other formats. They never touch the open
// file or its saved state.

const LABELS: Record<ExportFormat, string> = { Mermaid: "Mermaid", EffectSchema: "Effect Schema" };

/** Fenced, so it renders when pasted into Markdown. */
export const copyMermaid = (model: Model): UpdateReturn => ({
  model,
  commands: [
    CopyExport({
      text: `\`\`\`mermaid\n${toMermaid(present(model))}\n\`\`\``,
      format: "Mermaid",
    }),
  ],
});

/** Raw, as a `.mmd` file is read by Mermaid tools, not as Markdown. */
export const exportMermaid = (model: Model): UpdateReturn => ({
  model,
  commands: [
    SaveExport({
      text: `${toMermaid(present(model))}\n`,
      fileName: `${fileStem(present(model).name)}.mmd`,
      format: "Mermaid",
    }),
  ],
});

/** Raw, since it is pasted into an editor rather than Markdown. */
export const copyEffectSchema = (model: Model): UpdateReturn => ({
  model,
  commands: [CopyExport({ text: toEffectSchema(present(model)), format: "EffectSchema" })],
});

export const exportEffectSchema = (model: Model): UpdateReturn => ({
  model,
  commands: [
    SaveExport({
      text: `${toEffectSchema(present(model))}\n`,
      fileName: `${fileStem(present(model).name)}.schema.ts`,
      format: "EffectSchema",
    }),
  ],
});

export const copied = (model: Model, format: ExportFormat): Model =>
  notify(model, { tone: "Info", text: `Copied ${LABELS[format]} to clipboard` });

export const exported = (model: Model, path: string): Model =>
  notify(model, { tone: "Info", text: `Exported ${fileNameOf(path)}` });
