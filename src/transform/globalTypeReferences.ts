import type MagicString from "magic-string";
import ts from "typescript";

/**
 * Qualifies type references that point to a global type through a name that
 * the module also declares as a value or namespace:
 *
 * ```ts
 * declare const PropertyKey: unique symbol;
 * interface A { key: PropertyKey } // the global `PropertyKey` type
 * ```
 *
 * TypeScript resolves the unqualified `PropertyKey` in a type position with
 * the type meaning only, so it skips the local value. Rollup has a single
 * namespace for names, so it binds the reference to the local value and
 * renames both together, which makes the reference point to the value.
 *
 * Rewriting the reference to `globalThis.PropertyKey` keeps it pointing to the
 * global type, and no bundled declaration can capture it.
 */
export function qualifyShadowedGlobalTypeReferences(sourceFile: ts.SourceFile, code: MagicString) {
  const values = collectValuesWithoutTypeMeaning(sourceFile);
  if (values.size === 0) {
    return;
  }

  const qualify = (name: ts.Node) => {
    const root = getRootIdentifier(name);
    if (!root) {
      return;
    }
    const isNamespace = values.get(root.text);
    // `A.B` resolves `A` with the namespace meaning, which a local namespace has
    if (isNamespace === undefined || (isNamespace && root !== name)) {
      return;
    }
    code.appendRight(root.getStart(), "globalThis.");
  };

  const visit = (node: ts.Node): void => {
    // Namespaces can merge with declarations in other files, which may
    // declare the name in the namespace, so their bodies stay as they are.
    if (ts.isModuleDeclaration(node)) {
      return;
    }
    if (ts.isTypeReferenceNode(node)) {
      qualify(node.typeName);
    } else if (ts.isExpressionWithTypeArguments(node) && isTypeHeritage(node)) {
      qualify(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/**
 * Collects the top-level variables, functions, and namespaces whose names
 * no other declaration in the module uses. Outside of namespaces, a type
 * reference to such a name can only point to a global type. The value maps
 * each name to whether it is declared as a namespace.
 *
 * Any other declaration of the name, such as an interface, an import, a type
 * parameter, or a namespace member, can give the name a type meaning in some
 * scope. Those names stay as they are.
 */
function collectValuesWithoutTypeMeaning(sourceFile: ts.SourceFile): Map<string, boolean> {
  const values = new Map<string, boolean>();
  const valueNames = new Set<ts.Identifier>();
  const addValue = (name: ts.Identifier, isNamespace: boolean) => {
    valueNames.add(name);
    values.set(name.text, values.get(name.text) || isNamespace);
  };
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          addValue(decl.name, false);
        }
      }
    } else if (ts.isFunctionDeclaration(stmt)) {
      if (stmt.name) {
        addValue(stmt.name, false);
      }
    } else if (ts.isModuleDeclaration(stmt)) {
      // `declare global` and `declare module "x"` do not declare a local name
      if (ts.isIdentifier(stmt.name) && !(stmt.flags & ts.NodeFlags.GlobalAugmentation)) {
        addValue(stmt.name, true);
      }
    }
  }
  if (values.size === 0) {
    return values;
  }

  let declaresGlobalThis = false;
  const visit = (node: ts.Node): void => {
    if (!ts.isIdentifier(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    const { parent } = node;
    if (
      // exports and members do not declare a name in a scope
      ts.isExportSpecifier(parent) ||
      ts.isExportAssignment(parent) ||
      ts.isTypeElement(parent) ||
      ts.isClassElement(parent) ||
      ts.isEnumMember(parent) ||
      ts.getNameOfDeclaration(parent as ts.Declaration) !== node
    ) {
      return;
    }
    declaresGlobalThis ||= node.text === "globalThis";
    if (!valueNames.has(node)) {
      values.delete(node.text);
    }
  };
  visit(sourceFile);

  // A local `globalThis` would capture the inserted qualifier
  return declaresGlobalThis ? new Map() : values;
}

function getRootIdentifier(node: ts.Node): ts.Identifier | undefined {
  if (ts.isIdentifier(node)) {
    return node;
  }
  if (ts.isQualifiedName(node)) {
    return getRootIdentifier(node.left);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return getRootIdentifier(node.expression);
  }
  return undefined;
}

/** A class `extends` clause references a value, all other heritage clauses reference types. */
function isTypeHeritage(node: ts.ExpressionWithTypeArguments) {
  const clause = node.parent;
  return (
    ts.isHeritageClause(clause) &&
    (clause.token === ts.SyntaxKind.ImplementsKeyword || ts.isInterfaceDeclaration(clause.parent))
  );
}
