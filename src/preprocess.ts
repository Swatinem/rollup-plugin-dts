import MagicString from "magic-string";
import ts from "typescript";
import { matchesModifier } from "./astHelpers";
import { UnsupportedSyntaxError } from "./errors";

type Range = [start: number, end: number];

interface PreProcessInput {
  sourceFile: ts.SourceFile;
}

interface PreProcessOutput {
  code: MagicString;
  typeReferences: Set<string>;
}

interface State {
  code: MagicString;
  sourceFile: ts.SourceFile;

  /** All the names that were declared, for collision detection. */
  declaredNames: Set<string>;
  /** All the names that are defined by one Node. */
  nameMap: Map<ts.Node, Set<string>>;
  /** Inlined exports from `fileId` -> <synthetic name>. */
  inlineImports: Map<string, string>;
  /** All the exported names that we need to render in the end. */
  exportedNames: Set<string>;
}

/**
 * The pre-process step has the following goals:
 * - [x] Fixes the "modifiers", removing any `export` modifier and adding any
 *   missing `declare` modifier.
 * - [x] Splitting compound `VariableStatement` into its parts.
 * - [x] Moving declarations for the same "name" to be next to each other.
 * - [x] Removing any triple-slash directives and recording them.
 * - [x] Create a synthetic name for any nameless "export default".
 * - [x] Resolve inline `import()` statements and generate top-level imports for
 *   them.
 * - [x] Generate a separate `export {}` statement for any item which had its
 *   modifiers rewritten.
 */
export function preProcess({ sourceFile }: PreProcessInput): PreProcessOutput {
  const nameMap = collectNames(sourceFile);
  const declaredNames = new Set<string>();
  for (const names of nameMap.values()) {
    names.forEach((name) => declaredNames.add(name));
  }

  const code = new MagicString(sourceFile.getFullText());
  const state: State = {
    code,
    sourceFile,
    declaredNames,
    nameMap,
    inlineImports: new Map(),
    exportedNames: new Set(),
  };

  removeEmptyStatements(state);
  splitVariableStatements(state);
  reorderNames(state);
  fixModifiersAndCollectExports(state);
  fixNamelessExportDefault(state);
  resolveInlineImports(state);
  renderExports(state);

  const typeReferences = recordAndRemoveTypeReferences(state);

  return {
    code,
    typeReferences,
  };
}

function collectNames(sourceFile: ts.SourceFile): Map<ts.Node, Set<string>> {
  let nameMap = new Map<ts.Node, Set<string>>();
  for (const stmt of sourceFile.statements) {
    const names = new Set<string>();
    nameMap.set(stmt, names);
    if (
      ts.isEnumDeclaration(stmt) ||
      ts.isFunctionDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isModuleDeclaration(stmt)
    ) {
      if (stmt.name) {
        names.add(stmt.name.getText());
      }
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          names.add(decl.name.getText());
        }
      }
    }
  }
  return nameMap;
}

function removeEmptyStatements({ code, sourceFile }: State) {
  for (const node of sourceFile.statements) {
    if (ts.isEmptyStatement(node)) {
      code.remove(node.getStart(), node.getEnd());
    }
  }
}

function reorderNames({ code, sourceFile }: State) {
  let namedNodes = new Map<string, Array<Range>>();
  for (const node of sourceFile.statements) {
    if (
      ts.isEnumDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      (ts.isModuleDeclaration(node) && !(node.flags & ts.NodeFlags.GlobalAugmentation))
    ) {
      if (!node.name) {
        continue;
      }
      const name = node.name.getText();
      pushNamedNode(name, [getStart(node), getEnd(node)]);
    } else if (ts.isVariableStatement(node)) {
      const { declarations } = node.declarationList;
      if (declarations.length == 1) {
        const decl = declarations[0];
        if (ts.isIdentifier(decl.name)) {
          pushNamedNode(decl.name.getText(), [getStart(node), getEnd(node)]);
        }
      } else {
        // we do reordering after splitting
        const decls = declarations.slice();
        const first = decls.shift()!;
        pushNamedNode(first.name.getText(), [getStart(node), first.getEnd()]);
        for (const decl of decls) {
          if (ts.isIdentifier(decl.name)) {
            pushNamedNode(decl.name.getText(), [decl.getFullStart(), decl.getEnd()]);
          }
        }
      }
    }
  }

  function pushNamedNode(name: string, range: Range) {
    let nodes = namedNodes.get(name);
    if (!nodes) {
      nodes = [range];
      namedNodes.set(name, nodes);
    } else {
      const last = nodes[nodes.length - 1]!;
      if (last[1] === range[0]) {
        last[1] = range[1];
      } else {
        nodes.push(range);
      }
    }
  }

  // TODO: magic-string needs an affinity for moves…
  for (const nodes of namedNodes.values()) {
    const last = nodes.pop()!;
    const start = last[0];
    for (const node of nodes) {
      code.move(node[0], node[1], start);
    }
  }
}

function splitVariableStatements({ code, sourceFile }: State) {
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      const { flags } = stmt.declarationList;
      const type = flags & ts.NodeFlags.Let ? "let" : flags & ts.NodeFlags.Const ? "const" : "var";
      const prefix = `declare ${type} `;

      const list = stmt.declarationList
        .getChildren()
        .find((c) => c.kind === ts.SyntaxKind.SyntaxList)!
        .getChildren();
      let commaPos = 0;
      for (const node of list) {
        if (node.kind === ts.SyntaxKind.CommaToken) {
          commaPos = node.getStart();
          code.remove(commaPos, node.getEnd());
        } else if (commaPos) {
          code.appendLeft(commaPos, ";\n");
          const start = node.getFullStart();
          const slice = code.slice(start, node.getStart());
          let whitespace = slice.length - slice.trimStart().length;
          if (whitespace) {
            code.overwrite(start, start + whitespace, prefix);
          } else {
            code.appendLeft(start, prefix);
          }
        }
      }
    }
  }
}

function fixModifiersAndCollectExports({ code, sourceFile, nameMap, exportedNames }: State) {
  for (const node of sourceFile.statements) {
    if (
      ts.isEnumDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isVariableStatement(node) ||
      ts.isModuleDeclaration(node)
    ) {
      let hasDeclare = false;
      const needsDeclare =
        ts.isClassDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isVariableStatement(node) ||
        ts.isModuleDeclaration(node);
      for (const mod of node.modifiers ?? []) {
        switch (mod.kind) {
          case ts.SyntaxKind.ExportKeyword:
            if (!matchesModifier(node, ts.ModifierFlags.ExportDefault)) {
              nameMap.get(node)?.forEach((name) => exportedNames.add(name));
            }
          // fall through
          case ts.SyntaxKind.DefaultKeyword:
            code.remove(mod.getStart(), mod.getEnd() + 1);
            break;
          case ts.SyntaxKind.DeclareKeyword:
            hasDeclare = true;
        }
      }
      if (needsDeclare && !hasDeclare) {
        code.appendRight(node.getStart(), "declare ");
      }
    }
  }
}

function fixNamelessExportDefault(state: State) {
  const { sourceFile, code } = state;
  let name: string = "";
  for (const node of sourceFile.statements) {
    if (!matchesModifier(node, ts.ModifierFlags.ExportDefault)) {
      continue;
    }
    if (
      ts.isEnumDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      if (node.name) {
        name = node.name.getText();
      } else {
        if (!name) {
          name = uniqName(state, "export_default");
        }

        const children = node.getChildren();
        const idx = children.findIndex(
          (node) => node.kind === ts.SyntaxKind.ClassKeyword || node.kind === ts.SyntaxKind.FunctionKeyword,
        );
        const token = children[idx];
        const nextToken = children[idx + 1];
        const isPunctuation =
          nextToken.kind >= ts.SyntaxKind.FirstPunctuation && nextToken.kind <= ts.SyntaxKind.LastPunctuation;

        if (isPunctuation) {
          code.appendLeft(nextToken.getStart(), name);
        } else {
          code.appendRight(token!.getEnd(), ` ${name}`);
        }
      }
    }
  }
  if (name) {
    code.append(`\nexport default ${name};\n`);
  }
}

function resolveInlineImports(state: State) {
  const { code, sourceFile } = state;
  ts.forEachChild(sourceFile, checkInlineImport);

  function checkInlineImport(node: ts.Node) {
    ts.forEachChild(node, checkInlineImport);

    if (ts.isImportTypeNode(node)) {
      if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)) {
        throw new UnsupportedSyntaxError(node, "inline imports should have a literal argument");
      }
      const fileId = node.argument.literal.text;
      const children = node.getChildren();

      const start = children.find((t) => t.kind === ts.SyntaxKind.ImportKeyword)!.getStart();
      let end = node.getEnd();

      const token = children.find((t) => t.kind === ts.SyntaxKind.DotToken || t.kind === ts.SyntaxKind.LessThanToken);
      if (token) {
        end = token.getStart();
      }

      const importName = createNamespaceImport(state, fileId);
      code.overwrite(start, end, importName);
    }
  }
}

function createNamespaceImport(state: State, fileId: string) {
  const { code, inlineImports } = state;
  let importName = inlineImports.get(fileId);
  if (!importName) {
    importName = uniqName(
      state,
      fileId.replace(/[^a-zA-Z0-9_$]/g, () => "_"),
    );
    code.prepend(`import * as ${importName} from "${fileId}";\n`);
    inlineImports.set(fileId, importName);
  }
  return importName;
}

function uniqName({ declaredNames }: State, hint: string): string {
  let name = hint;
  while (declaredNames.has(name)) {
    name = `_${name}`;
  }
  declaredNames.add(name);
  return name;
}

function renderExports({ code, exportedNames }: State) {
  if (!exportedNames.size) {
    return;
  }
  code.append(`\nexport { ${[...exportedNames].join(", ")} };\n`);
}

function recordAndRemoveTypeReferences({ code, sourceFile }: State): Set<string> {
  const typeReferences = new Set<string>();
  const lineStarts = sourceFile.getLineStarts();
  for (const ref of sourceFile.typeReferenceDirectives) {
    typeReferences.add(ref.fileName);

    const { line } = sourceFile.getLineAndCharacterOfPosition(ref.pos);
    const start = lineStarts[line];
    let end = sourceFile.getLineEndOfPosition(ref.pos);
    if (code.slice(end, end + 1) == "\n") {
      end += 1;
    }

    code.remove(start, end);
  }

  return typeReferences;
}

function getStart(node: ts.Node): number {
  const start = node.getFullStart();
  return start + (newlineAt(node, start) ? 1 : 0);
}
function getEnd(node: ts.Node): number {
  const end = node.getEnd();
  return end + (newlineAt(node, end) ? 1 : 0);
}

function newlineAt(node: ts.Node, idx: number): boolean {
  return node.getSourceFile().getFullText()[idx] == "\n";
}
