import * as path from "node:path";
import ts from "typescript";
import MagicString from "magic-string";
import type { RenderedChunk } from "rollup";
import { parse } from "../helpers.js";

const RESOLVED_MODULE_PREFIX = "dts-resolved:";
const RESOLVED_MODULE_COMMENT = new RegExp(`\\/\\*${RESOLVED_MODULE_PREFIX}(.+?)\\*\\/`);

/** Encode a resolved absolute path as a marker comment for later chunk resolution. */
export function encodeResolvedModule(absolutePath: string) {
  return `/*${RESOLVED_MODULE_PREFIX}${absolutePath}*/`;
}

/** Decode a resolved module marker comment from text. Returns the absolute path, or null if not found. */
function decodeResolvedModule(text: string) {
  return text.match(RESOLVED_MODULE_COMMENT)?.[1] ?? null;
}

/** Strip the resolved module marker comment. */
function stripResolvedModuleComment(text: string) {
  return text.replace(RESOLVED_MODULE_COMMENT, "");
}

/** Normalize paths for comparison (handle Windows backslashes) */
function normalizePath(p: string) {
  return p.split("\\").join("/");
}

export class ModuleDeclarationFixer {
  private code: MagicString;
  private sourcemap: boolean;
  private source: ts.SourceFile;
  private chunkFileName: string;
  private moduleToChunk: Map<string, string>;
  private warn: (message: string) => void;

  constructor(
    chunk: RenderedChunk,
    code: MagicString,
    sourcemap: boolean,
    moduleToChunk: Map<string, string>,
    warn: (message: string) => void,
  ) {
    this.code = code;
    this.sourcemap = sourcemap;
    this.source = parse(chunk.fileName, code.toString());
    this.chunkFileName = chunk.fileName;
    this.moduleToChunk = moduleToChunk;
    this.warn = warn;
  }

  fix() {
    let modified = false;

    for (const node of this.source.statements) {
      if (!ts.isModuleDeclaration(node) || !node.body || !ts.isModuleBlock(node.body)) {
        continue;
      }

      const sourceText = this.source.getFullText();
      const textBetween = sourceText.slice(node.name.getEnd(), node.body.getStart());
      const absolutePath = decodeResolvedModule(textBetween);

      if (!absolutePath) {
        continue;
      }

      const targetChunkName = this.getTargetChunkName(absolutePath);

      const quote =
        node.name.kind === ts.SyntaxKind.StringLiteral && "singleQuote" in node.name && node.name.singleQuote
          ? "'"
          : '"';

      const cleanedBetween = stripResolvedModuleComment(textBetween);

      this.code.overwrite(
        node.name.getStart(),
        node.body.getStart(),
        `${quote}${targetChunkName}${quote}${cleanedBetween}`,
      );
      modified = true;
    }

    return {
      code: this.code.toString(),
      map: modified && this.sourcemap ? this.code.generateMap() : null,
    };
  }

  /**
   * Get the output chunk name for an absolute module path.
   */
  private getTargetChunkName(absolutePath: string): string {
    // Detect JS extension from the resolved path (present when the source uses ESM-style specifiers)
    const jsExtMatch = absolutePath.match(/\.[cm]?js$/);
    const basePath = jsExtMatch ? absolutePath.slice(0, -jsExtMatch[0].length) : absolutePath;

    // Try all file extensions that could appear as module IDs in Rollup's chunk metadata
    const extensions = ["", ".d.ts", ".d.mts", ".d.cts", ".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"];
    const possiblePaths = extensions.map((ext) => basePath + ext);

    // Find which chunk contains this module
    for (const possiblePath of possiblePaths) {
      const chunkFileName = this.moduleToChunk.get(normalizePath(possiblePath));
      if (chunkFileName) {
        return this.formatChunkReference(chunkFileName, jsExtMatch?.[0]);
      }
    }

    // Module is not found in any chunk, keep the current chunk name as a fallback
    this.warn(
      `declare module "${absolutePath}" could not be resolved to any output chunk, falling back to current chunk "${this.chunkFileName}"`,
    );

    return this.formatChunkReference(this.chunkFileName, jsExtMatch?.[0]);
  }

  /**
   * Format a chunk filename as a relative path from the current chunk.
   */
  private formatChunkReference(chunkFileName: string, jsExt?: string): string {
    // Compute the relative path from the current chunk's directory to the target chunk
    const chunkDir = path.dirname(this.chunkFileName);
    let relativePath = normalizePath(path.relative(chunkDir, chunkFileName));

    // Strip declaration extension and apply JS extension if the source used one
    relativePath = relativePath.replace(/\.d\.[cm]?tsx?$/, "");
    if (jsExt) {
      relativePath += jsExt;
    }

    // Ensure it starts with "./"
    if (!relativePath.startsWith(".")) {
      relativePath = "./" + relativePath;
    }

    return relativePath;
  }
}
