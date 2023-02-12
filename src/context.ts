import ts from "typescript";
import { ResolvedOptions } from "./options";

export interface DtsPluginContext {
  /**
   * There exists one Program object per entry point, except when all entry points are ".d.ts" modules.
   */
  programs: ts.Program[];
  resolvedOptions: ResolvedOptions;
}
