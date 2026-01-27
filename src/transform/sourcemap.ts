import fs from "node:fs/promises";
import * as path from "node:path";
import { decode, encode, type SourceMapMappings, type SourceMapSegment } from "@jridgewell/sourcemap-codec";
import convert from "convert-source-map";

export type InputSourceMap = {
  version: number;
  sources: Array<string | null>;
  sourceRoot?: string;
  // Parsed from input but NOT copied to output. TypeScript's emitter never includes
  // sourcesContent in declaration maps, and tsserver rejects maps that have it.
  // https://github.com/microsoft/TypeScript/blob/b19a9da2a3b8f2a720d314d01258dd2bdc110fef/src/services/sourcemaps.ts#L226
  sourcesContent?: (string | null)[];
  mappings: string;
  names?: string[];
};

/**
 * Hydrate sparse sourcemap with detailed segments from input map.
 *
 * Problem: Rollup produces sparse mappings because this plugin uses a "virtual AST"
 * trick - it generates fake ESTree nodes with start/end positions but no token-level
 * detail. Standard sourcemap composition (@jridgewell/remapping) can only trace
 * existing segments through the chain, not add new ones.
 *
 * Solution: Use Rollup's sparse segments as "anchors" to find which source line
 * each output line came from, then copy ALL segments from that input line.
 * The column delta between anchor positions aligns the segments correctly.
 *
 * This enables Go-to-Definition to work for individual identifiers, not just line starts.
 */
export function hydrateSourcemap(
  sparseMappings: string,
  inputMap: InputSourceMap,
  outputCode: string,
): string {
  const sparseDecoded = decode(sparseMappings);
  const inputDecoded = decode(inputMap.mappings);
  const outputLines = outputCode.split("\n");

  const hydratedMappings: SourceMapMappings = [];

  for (let outLine = 0; outLine < sparseDecoded.length; outLine += 1) {
    const sparseSegments = sparseDecoded[outLine];
    if (!sparseSegments || sparseSegments.length === 0) {
      hydratedMappings.push([]);
      continue;
    }

    // Use first mapped segment as anchor to find source line
    const anchor = sparseSegments.find((segment) => segment.length >= 4);
    if (!anchor) {
      hydratedMappings.push(sparseSegments);
      continue;
    }

    const [, srcIdx, srcLine] = anchor;
    if (srcIdx !== 0 || srcLine === undefined || srcLine < 0 || srcLine >= inputDecoded.length) {
      hydratedMappings.push(sparseSegments);
      continue;
    }

    const inputSegments = inputDecoded[srcLine];
    if (!inputSegments || inputSegments.length === 0) {
      hydratedMappings.push(sparseSegments);
      continue;
    }

    const anchorOutCol = anchor[0];
    const anchorSrcCol = anchor.length >= 4 ? anchor[3] : 0;
    const delta = anchorOutCol - (anchorSrcCol ?? 0);

    const outputLine = outputLines[outLine] || "";

    const hydratedSegments: SourceMapSegment[] = [];
    for (const seg of inputSegments) {
      const adjustedCol = seg[0] + delta;

      // Sanity check: skip segments outside valid range
      if (adjustedCol < 0 || adjustedCol > outputLine.length) continue;

      if (seg.length === 5) {
        hydratedSegments.push([adjustedCol, seg[1], seg[2], seg[3], seg[4]]);
      } else if (seg.length === 4) {
        hydratedSegments.push([adjustedCol, seg[1], seg[2], seg[3]]);
      } else {
        hydratedSegments.push([adjustedCol]);
      }
    }

    // Sort by column (required by sourcemap spec)
    hydratedSegments.sort((a, b) => a[0] - b[0]);
    hydratedMappings.push(hydratedSegments);
  }

  return encode(hydratedMappings);
}

// Info needed to lazily load an input sourcemap
export type SourcemapInfo = {
  fileName: string;
  originalCode: string; // Original code for convert-source-map to parse
  inputMapText?: string; // Pre-loaded map text (from TypeScript emit of .ts files)
};

// Load sourcemap from inline data URL, file reference, or external .map file
export async function loadInputSourcemap(info: SourcemapInfo): Promise<InputSourceMap | null> {
  const { fileName, originalCode, inputMapText } = info;

  // Use pre-loaded map if available (from TypeScript emit of .ts files)
  if (inputMapText) {
    try {
      return JSON.parse(inputMapText);
    } catch {
      return null;
    }
  }

  // Try inline sourcemap (base64 or url-encoded data URL)
  // Note: TypeScript never emits inline declaration maps, but other tools might.
  // This is defensive code - low cost since convert.fromSource returns null for TS maps.
  const inlineConverter = convert.fromSource(originalCode);
  if (inlineConverter) {
    return inlineConverter.toObject() as InputSourceMap;
  }

  // Try file reference (//# sourceMappingURL=foo.map)
  const readMap = async (mapFile: string) => {
    // Strip query string or fragment if present (e.g., "index.d.ts.map?v=12345" or "index.d.ts.map#hash")
    // Note: TypeScript doesn't add these, but other build tools might. Defensive code - trivial cost.
    const urlWithoutQuery = mapFile.split(/[?#]/)[0]!;
    const mapFilePath = path.resolve(path.dirname(fileName), urlWithoutQuery);
    return fs.readFile(mapFilePath, "utf8");
  };

  try {
    const fileConverter = await convert.fromMapFileSource(originalCode, readMap);
    if (fileConverter) {
      return fileConverter.toObject() as InputSourceMap;
    }
  } catch {
    // File not found or parse error, try external .map
  }

  // Try external .map file (no comment in source)
  try {
    const mapContent = await fs.readFile(fileName + ".map", "utf8");
    return JSON.parse(mapContent);
  } catch {
    return null;
  }
}
