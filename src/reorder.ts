import * as ts from "typescript";

/**
 * Reorder Statements and group them by name.
 *
 * In JS, there is a 1:1 relationship between *names* and declarations.
 *
 * In TS however, one *name* can consist of multiple declarations.
 *
 * Examples are function overrides, and the fact that there is a difference
 * between *types* and *values*, which can have the same *name*, but obviously
 * different declarations.
 */
export function reorderStatements(sourceFile: ts.SourceFile): ts.SourceFile {
  // Some statements, such as import/export, etc do not have `names`, but we
  // want to render them. So we just assign random names to them, and since
  // JS Map iteration works in insertion order, things will work out just fine.
  // Additionally, we use the special `"0"` name for things that we want to
  // just remove from the code and not render at all.
  let nameless = 0;
  const names = new Map<string, Array<ts.Node>>();
  let needsReorder = false;

  for (const stmt of sourceFile.statements) {
    const name = getName(stmt) ?? String(++nameless);
    if (names.has(name)) {
      names.get(name)?.push(stmt);
      needsReorder = true;
    } else {
      names.set(name, [stmt]);
    }
  }

  // avoid re-parsing if there is nothing to re-order
  if (!names.has("0") && !needsReorder) {
    return sourceFile;
  }

  names.delete("0");
  let input = sourceFile.getFullText();
  let code = "";
  for (const group of names.values()) {
    for (const stmt of group) {
      code += input.slice(stmt.pos, stmt.end);
    }
  }

  return ts.createSourceFile(sourceFile.fileName, code, ts.ScriptTarget.Latest, true);
}

function getName(node: ts.Node): string | undefined {
  if (
    ts.isEnumDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
  ) {
    return node.name?.getText();
  }
  if (ts.isVariableStatement(node)) {
    const { declarations } = node.declarationList;
    if (declarations.length !== 0 && ts.isIdentifier(declarations[0].name)) {
      return declarations[0].name.getText();
    }
  }
  return undefined;
}
