import * as path from "path";

import { generateProject } from "./generator";
import { parseFile } from "./parser";

export interface BuildOptions {
  inputFile: string;
  outputDir: string;
}

export function buildProject(options: BuildOptions) {
  const resolvedInputFile = path.resolve(options.inputFile);
  const resolvedOutputDir = path.resolve(options.outputDir);

  const parsed = parseFile(resolvedInputFile);
  if (parsed.diagnostics.length > 0) {
    return {
      success: false,
      diagnostics: parsed.diagnostics,
      outputFiles: [],
    };
  }

  const generated = generateProject(resolvedOutputDir, parsed.root);

  return {
    success: true,
    diagnostics: generated.diagnostics,
    outputFiles: generated.outputFiles,
  };
}
