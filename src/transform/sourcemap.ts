import fs from "node:fs/promises";
import * as path from "node:path";

export type InputSourceMap = {
  version: number;
  sources: string[];
  sourcesContent?: (string | null)[];
  mappings: string;
  names?: string[];
};

// Info needed to lazily load an input sourcemap
export type SourcemapInfo = {
  fileName: string;
  sourceMappingUrl: string | null; // URL from comment, or null to try external .map
};

// Load sourcemap from external file, inline data URL, or file reference
export async function loadInputSourcemap(info: SourcemapInfo): Promise<InputSourceMap | null> {
  const { fileName, sourceMappingUrl } = info;

  // Try external .map file first (when no sourceMappingURL comment)
  if (!sourceMappingUrl) {
    const inputMapPath = fileName + ".map";
    try {
      const inputMapContent = await fs.readFile(inputMapPath, "utf8");
      return JSON.parse(inputMapContent);
    } catch {
      return null;
    }
  }

  // File reference (not a data URL)
  if (!sourceMappingUrl.startsWith("data:")) {
    try {
      // Strip query string if present (e.g., "index.d.ts.map?v=12345" -> "index.d.ts.map")
      const urlWithoutQuery = sourceMappingUrl.split("?")[0]!;
      const mapFilePath = path.resolve(path.dirname(fileName), urlWithoutQuery);
      const mapContent = await fs.readFile(mapFilePath, "utf8");
      return JSON.parse(mapContent);
    } catch {
      return null;
    }
  }

  // Parse data URL (inline sourcemap)
  const dataUrlRegex = /^data:([^;,]*)(;[^,]*)?,(.*)$/;
  const dataMatch = dataUrlRegex.exec(sourceMappingUrl);
  if (!dataMatch) return null;

  const params = dataMatch[2] || "";
  const data = dataMatch[3]!;

  try {
    if (params.includes("base64")) {
      const decoded = Buffer.from(data, "base64").toString("utf8");
      return JSON.parse(decoded);
    } else {
      const decoded = decodeURIComponent(data);
      return JSON.parse(decoded);
    }
  } catch {
    return null;
  }
}
