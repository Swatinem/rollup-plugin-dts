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

/** Collect the names declared at the top level of an augmentation body. */
function getAugmentedNames(body: ts.ModuleBlock) {
  const names: string[] = [];
  for (const statement of body.statements) {
    if (
      (ts.isInterfaceDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name
    ) {
      names.push(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.push(declaration.name.text);
        }
      }
    }
  }
  return names;
}

export class ModuleDeclarationFixer {
  private code: MagicString;
  private sourcemap: boolean;
  private source: ts.SourceFile;
  private chunkFileName: string;
  private moduleToChunk: Map<string, string>;
  private chunks: Record<string, RenderedChunk>;
  private warn: (message: string) => void;

  constructor(
    chunk: RenderedChunk,
    code: MagicString,
    sourcemap: boolean,
    moduleToChunk: Map<string, string>,
    chunks: Record<string, RenderedChunk>,
    warn: (message: string) => void,
  ) {
    this.code = code;
    this.sourcemap = sourcemap;
    // Parse the MagicString's original text, not toString(): the code may already
    // carry TypeOnlyFixer edits, but overwrite() coordinates always refer to the
    // original string, so node positions must come from that same text
    this.source = parse(chunk.fileName, code.original);
    this.chunkFileName = chunk.fileName;
    this.moduleToChunk = moduleToChunk;
    this.chunks = chunks;
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

      const target = this.findTargetChunk(absolutePath);

      let specifier = node.name.getText();
      if (target === null) {
        // Keep the original specifier; consumers resolve it relative to the emitted
        // chunk, where it will typically dangle (a no-op augmentation) rather than
        // merge into the wrong module the way a current-chunk rewrite would
        this.warn(
          `declare module ${specifier} (${absolutePath}) could not be resolved to any output chunk, keeping the original specifier`,
        );
      } else if (!this.augmentationApplies(getAugmentedNames(node.body), target.moduleId, target.chunkFileName)) {
        // Module augmentation matches by the target module's exported names; when the
        // chunk renamed, dropped, or ambiguously exports an augmented name, retargeting
        // the specifier would merge the augmentation into the wrong declaration
        this.warn(
          `declare module ${specifier} (${absolutePath}) augments names that the target chunk does not export unchanged, keeping the original specifier`,
        );
      } else {
        const quote =
          node.name.kind === ts.SyntaxKind.StringLiteral && "singleQuote" in node.name && node.name.singleQuote
            ? "'"
            : '"';
        specifier = `${quote}${this.formatChunkReference(target.chunkFileName, target.jsExt)}${quote}`;
      }

      const cleanedBetween = stripResolvedModuleComment(textBetween);

      this.code.overwrite(node.name.getStart(), node.body.getStart(), specifier + cleanedBetween);
      modified = true;
    }

    return {
      code: this.code.toString(),
      map: modified && this.sourcemap ? this.code.generateMap() : null,
    };
  }

  /**
   * Find the output chunk containing the module at an absolute path.
   * Returns null when the module is not part of any output chunk.
   */
  private findTargetChunk(absolutePath: string): { chunkFileName: string; moduleId: string; jsExt?: string } | null {
    // Detect JS extension from the resolved path (present when the source uses ESM-style specifiers)
    const jsExtMatch = absolutePath.match(/\.[cm]?js$/);
    const basePath = jsExtMatch ? absolutePath.slice(0, -jsExtMatch[0].length) : absolutePath;

    // Try all file extensions that could appear as module IDs in Rollup's chunk metadata,
    // probing both the path itself and a directory index
    const extensions = ["", ".d.ts", ".d.mts", ".d.cts", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
    const possiblePaths: string[] = [];
    for (const base of [basePath, `${basePath}/index`]) {
      for (const ext of extensions) {
        possiblePaths.push(base + ext);
      }
    }

    // Find which chunk contains this module
    for (const possiblePath of possiblePaths) {
      const moduleId = normalizePath(possiblePath);
      const chunkFileName = this.moduleToChunk.get(moduleId);
      if (chunkFileName) {
        return { chunkFileName, moduleId, jsExt: jsExtMatch?.[0] };
      }
    }

    return null;
  }

  /**
   * Check that every augmented name is exported from the target chunk under its
   * original name. Augmentation matches by exported name, so a name the chunk
   * dropped, re-exported under an alias, or deconflicted (`Foo` → `Foo$1` when two
   * modules in the chunk export a `Foo`) would merge into the wrong declaration.
   */
  private augmentationApplies(names: string[], moduleId: string, chunkFileName: string): boolean {
    const chunkInfo = this.chunks[chunkFileName];
    if (!chunkInfo) {
      return true;
    }

    const targetModule = Object.entries(chunkInfo.modules).find(([id]) => normalizePath(id) === moduleId)?.[1];

    return names.every((name) => {
      if (!targetModule?.renderedExports.includes(name) || !chunkInfo.exports.includes(name)) {
        return false;
      }
      // A `name$<digits>` sibling export means this name was deconflicted within the
      // chunk, and there is no way to tell which module's declaration kept the name
      const deconflicted = new RegExp(`^${name.replace(/\$/g, "\\$")}\\$\\d+$`);
      return !chunkInfo.exports.some((exportName) => deconflicted.test(exportName));
    });
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
