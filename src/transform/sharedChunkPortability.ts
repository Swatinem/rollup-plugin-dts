import * as path from "node:path";
import type { OutputBundle, OutputChunk, SourceMap } from "rollup";
import remapping from "@jridgewell/remapping";
import type { RawSourceMap } from "@jridgewell/remapping";
import ts from "typescript";
import MagicString from "magic-string";
import { parse } from "../helpers.js";

type ChunkGraphInfo = {
  exports: string[];
  isEntry: boolean;
};

type ImportSpecifierInfo = {
  importedName: string;
  isTypeOnly: boolean;
  localName: string;
};

type ImportStatementInfo = {
  isTypeOnly: boolean;
  moduleSpecifier: string;
  quote: "'" | '"';
  specifiers: ImportSpecifierInfo[];
  statement: ts.ImportDeclaration;
};

type ImportBinding = {
  importedName: string;
  isTypeOnly: boolean;
  moduleSpecifier: string;
};

type HostExportRoute = {
  exportedName: string;
  isTypeOnly: boolean;
};

type ChunkAnalysis = {
  hostRoutesByModule: Map<string, Map<string, HostExportRoute[]>>;
  importStatements: ImportStatementInfo[];
};

export function rewritePortableSharedChunkImportsInBundle(
  bundle: OutputBundle,
  warn: (message: string) => void,
) {
  const chunks = Object.values(bundle).filter(isOutputChunk);
  const sharedChunks = chunks.filter((chunk) => !chunk.isEntry);
  if (sharedChunks.length === 0) return;

  const entryChunks = chunks.filter((chunk) => chunk.isEntry);
  const chunkGraph = new Map<string, ChunkGraphInfo>(
    chunks.map((chunk) => [
      chunk.fileName,
      {
        exports: chunk.exports,
        isEntry: chunk.isEntry,
      },
    ]),
  );
  const analyses = new Map<string, ChunkAnalysis>(
    chunks.map((chunk) => [chunk.fileName, analyzeChunk(chunk, chunkGraph)]),
  );

  for (const chunk of entryChunks) {
    const analysis = analyses.get(chunk.fileName)!;
    const magicCode = new MagicString(chunk.code);
    let hasChanges = false;
    const unresolvedSymbols = new Set<string>();

    for (const statement of analysis.importStatements) {
      const sharedChunk = sharedChunks.find(
        (candidate) => getChunkImportSpecifier(chunk.fileName, candidate.fileName) === statement.moduleSpecifier,
      );
      if (!sharedChunk) {
        continue;
      }

      const keptSpecifiers: ImportSpecifierInfo[] = [];
      const rewrittenSpecifiers = new Map<string, ImportSpecifierInfo[]>();

      for (const specifier of statement.specifiers) {
        if (hasPublicHostRoute(analysis, statement.moduleSpecifier, specifier.importedName)) {
          keptSpecifiers.push(specifier);
          continue;
        }

        const hostCandidate = pickHostCandidate(
          entryChunks,
          analyses,
          chunk.fileName,
          sharedChunk.fileName,
          specifier,
        );

        if (!hostCandidate) {
          keptSpecifiers.push(specifier);
          unresolvedSymbols.add(specifier.localName);
          continue;
        }

        const hostSpecifier = getChunkImportSpecifier(chunk.fileName, hostCandidate.chunk.fileName);
        const hostImportSpecifiers = rewrittenSpecifiers.get(hostSpecifier) || [];
        hostImportSpecifiers.push({
          importedName: hostCandidate.exportedName,
          isTypeOnly: specifier.isTypeOnly || hostCandidate.isTypeOnly,
          localName: specifier.localName,
        });
        rewrittenSpecifiers.set(hostSpecifier, hostImportSpecifiers);
      }

      if (!rewrittenSpecifiers.size) {
        continue;
      }

      const replacementStatements: string[] = [];

      if (keptSpecifiers.length) {
        replacementStatements.push(buildImportStatement(statement, keptSpecifiers, statement.moduleSpecifier, statement.quote));
      }

      const hostSpecifiers = Array.from(rewrittenSpecifiers.keys()).sort(compareStrings);
      for (const hostSpecifier of hostSpecifiers) {
        replacementStatements.push(
          buildImportStatement(statement, rewrittenSpecifiers.get(hostSpecifier)!, hostSpecifier, statement.quote),
        );
      }

      magicCode.overwrite(
        statement.statement.getStart(),
        statement.statement.getEnd(),
        replacementStatements.join("\n"),
      );
      hasChanges = true;
    }

    if (hasChanges) {
      applyChunkEdits(chunk, magicCode);
    }

    if (unresolvedSymbols.size) {
      warn(formatUnresolvedSharedTypeWarning(chunk.fileName, unresolvedSymbols));
    }
  }
}

function analyzeChunk(
  chunk: Pick<OutputChunk, "code" | "exports" | "fileName">,
  chunkGraph: Map<string, ChunkGraphInfo>,
): ChunkAnalysis {
  const source = parse(chunk.fileName, chunk.code);
  const importStatements: ImportStatementInfo[] = [];
  const importedBindings = new Map<string, ImportBinding>();
  const hostRoutesByModule = new Map<string, Map<string, HostExportRoute[]>>();
  const starExports: string[] = [];

  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      !statement.importClause?.name &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      const moduleSpecifier = statement.moduleSpecifier.text;
      const quote = statement.moduleSpecifier.getText(source).startsWith('"') ? '"' : "'";
      const specifiers = statement.importClause.namedBindings.elements.map((element) => {
        const specifier = {
          importedName: element.propertyName?.text || element.name.text,
          isTypeOnly: element.isTypeOnly || statement.importClause?.isTypeOnly || false,
          localName: element.name.text,
        };
        importedBindings.set(specifier.localName, {
          importedName: specifier.importedName,
          isTypeOnly: specifier.isTypeOnly,
          moduleSpecifier,
        });
        return specifier;
      });

      importStatements.push({
        isTypeOnly: statement.importClause.isTypeOnly,
        moduleSpecifier,
        quote,
        specifiers,
        statement,
      });
      continue;
    }

    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    if (!statement.exportClause) {
      starExports.push(statement.moduleSpecifier.text);
      continue;
    }

    if (!ts.isNamedExports(statement.exportClause)) {
      continue;
    }

    for (const element of statement.exportClause.elements) {
      addHostExportRoute(
        hostRoutesByModule,
        statement.moduleSpecifier.text,
        element.propertyName?.text || element.name.text,
        {
          exportedName: element.name.text,
          isTypeOnly: statement.isTypeOnly || element.isTypeOnly,
        },
      );
    }
  }

  for (const statement of source.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.moduleSpecifier ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }

    for (const element of statement.exportClause.elements) {
      const localName = element.propertyName?.text || element.name.text;
      const binding = importedBindings.get(localName);
      if (!binding) {
        continue;
      }

      addHostExportRoute(hostRoutesByModule, binding.moduleSpecifier, binding.importedName, {
        exportedName: element.name.text,
        isTypeOnly: binding.isTypeOnly || statement.isTypeOnly || element.isTypeOnly,
      });
    }
  }

  for (const moduleSpecifier of starExports) {
    const sharedChunk = Array.from(chunkGraph.entries()).find(
      ([candidateFileName, candidate]) => !candidate.isEntry && getChunkImportSpecifier(chunk.fileName, candidateFileName) === moduleSpecifier,
    );
    if (!sharedChunk) {
      continue;
    }

    for (const exportedName of sharedChunk[1].exports) {
      if (exportedName === "default") {
        continue;
      }

      addHostExportRoute(hostRoutesByModule, moduleSpecifier, exportedName, {
        exportedName,
        isTypeOnly: false,
      });
    }
  }

  return {
    hostRoutesByModule,
    importStatements,
  };
}

const isOutputChunk = (chunk: { type: string }): chunk is OutputChunk => chunk.type === "chunk";

function pickHostCandidate(
  entryChunks: OutputChunk[],
  analyses: Map<string, ChunkAnalysis>,
  currentChunkFileName: string,
  sharedChunkFileName: string,
  specifier: ImportSpecifierInfo,
) {
  const candidates: Array<HostExportRoute & { chunk: OutputChunk }> = [];

  for (const hostChunk of entryChunks) {
    if (hostChunk.fileName === currentChunkFileName) {
      continue;
    }

    const hostAnalysis = analyses.get(hostChunk.fileName)!;
    const sharedSpecifier = getChunkImportSpecifier(hostChunk.fileName, sharedChunkFileName);
    const routes = getHostExportRoutes(hostAnalysis, sharedSpecifier, specifier.importedName);

    for (const route of routes) {
      candidates.push({
        ...route,
        chunk: hostChunk,
      });
    }
  }

  candidates.sort((left, right) => {
    const leftMatchesLocal = left.exportedName === specifier.localName ? 0 : 1;
    const rightMatchesLocal = right.exportedName === specifier.localName ? 0 : 1;
    if (leftMatchesLocal !== rightMatchesLocal) {
      return leftMatchesLocal - rightMatchesLocal;
    }

    const fileNameOrder = compareStrings(left.chunk.fileName, right.chunk.fileName);
    if (fileNameOrder !== 0) {
      return fileNameOrder;
    }

    return compareStrings(left.exportedName, right.exportedName);
  });

  return candidates[0];
}

const getHostExportRoutes = (analysis: ChunkAnalysis, moduleSpecifier: string, importedName: string) =>
  analysis.hostRoutesByModule.get(moduleSpecifier)?.get(importedName) || [];

const hasPublicHostRoute = (analysis: ChunkAnalysis, moduleSpecifier: string, importedName: string) =>
  getHostExportRoutes(analysis, moduleSpecifier, importedName).length > 0;

const compareStrings = (left: string, right: string) => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

function addHostExportRoute(
  hostRoutesByModule: Map<string, Map<string, HostExportRoute[]>>,
  moduleSpecifier: string,
  importedName: string,
  route: HostExportRoute,
) {
  const routesByImportedName = hostRoutesByModule.get(moduleSpecifier) || new Map<string, HostExportRoute[]>();
  const routes = routesByImportedName.get(importedName) || [];

  if (!routes.some((existing) => existing.exportedName === route.exportedName && existing.isTypeOnly === route.isTypeOnly)) {
    routes.push(route);
  }

  routesByImportedName.set(importedName, routes);
  hostRoutesByModule.set(moduleSpecifier, routesByImportedName);
}

function buildImportStatement(
  statement: ImportStatementInfo,
  specifiers: ImportSpecifierInfo[],
  moduleSpecifier: string,
  quote: "'" | '"',
) {
  const useTypeOnlyImport = statement.isTypeOnly || specifiers.every((specifier) => specifier.isTypeOnly);
  const importKeyword = useTypeOnlyImport ? "import type" : "import";
  const namedImports = specifiers
    .map((specifier) => {
      const prefix = !useTypeOnlyImport && specifier.isTypeOnly ? "type " : "";
      if (specifier.importedName === specifier.localName) {
        return `${prefix}${specifier.importedName}`;
      }
      return `${prefix}${specifier.importedName} as ${specifier.localName}`;
    })
    .join(", ");

  return `${importKeyword} { ${namedImports} } from ${quote}${moduleSpecifier}${quote};`;
}

function applyChunkEdits(chunk: Pick<OutputChunk, "code" | "fileName" | "map">, code: MagicString) {
  const nextCode = code.toString();
  if (nextCode === chunk.code) {
    return;
  }

  if (chunk.map) {
    const chunkFileName = normalizeChunkPath(chunk.fileName);
    const rewriteMap = code.generateMap({
      file: chunkFileName,
      hires: true,
      includeContent: true,
      source: chunkFileName,
    });
    const remapped = remapping(rewriteMap as unknown as RawSourceMap, (file) => {
      if (normalizeChunkPath(file) === chunkFileName) {
        return chunk.map as unknown as RawSourceMap;
      }
      return null;
    });

    chunk.map = {
      ...chunk.map,
      mappings: typeof remapped.mappings === "string" ? remapped.mappings : "",
      names: remapped.names || [],
      sources: remapped.sources,
    } as SourceMap;
    delete (chunk.map as any).sourcesContent;
  }

  chunk.code = nextCode;
}

const formatUnresolvedSharedTypeWarning = (chunkFileName: string, symbols: Set<string>) => {
  const symbolList = Array.from(symbols).sort().join(", ");
  return [
    `Entry "${chunkFileName}" still references private shared type exports with no public re-export: ${symbolList}.`,
    "rollup-plugin-dts will not invent new public exports for these types.",
    "Re-export them from a public entry to avoid downstream TS2742 errors.",
  ].join(" ");
};

const getChunkImportSpecifier = (fromChunkFileName: string, toChunkFileName: string) => {
  const fromDir = path.posix.dirname(normalizeChunkPath(fromChunkFileName));
  const toRuntimeFileName = getChunkRuntimeFileName(normalizeChunkPath(toChunkFileName));
  let relativePath = path.posix.relative(fromDir, toRuntimeFileName);
  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
};

const getChunkRuntimeFileName = (fileName: string) => {
  if (fileName.endsWith(".d.mts")) {
    return `${fileName.slice(0, -6)}.mjs`;
  }
  if (fileName.endsWith(".d.cts")) {
    return `${fileName.slice(0, -6)}.cjs`;
  }
  if (fileName.endsWith(".d.ts")) {
    return `${fileName.slice(0, -5)}.js`;
  }
  return `${fileName}.js`;
};

const normalizeChunkPath = (fileName: string) => fileName.replaceAll("\\", "/");
