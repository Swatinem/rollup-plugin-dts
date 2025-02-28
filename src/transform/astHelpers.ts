import type * as ESTree from "estree";
import ts from "typescript";
import { UnsupportedSyntaxError } from "./errors.js";

let IDs = 1;

/**
 * Create a new `Program` for the given `node`:
 */
export function createProgram(node: ts.SourceFile): ESTree.Program {
  return withStartEnd(
    {
      type: "Program",
      sourceType: "module",
      body: [],
    },
    { start: node.getFullStart(), end: node.getEnd() },
  );
}

/**
 * Creates a reference to `id`:
 * `_ = ${id}`
 */
export function createReference(id: ESTree.Expression): { ident: ESTree.Identifier; expr: ESTree.AssignmentPattern } {
  const ident: ESTree.Identifier = {
    type: "Identifier",
    name: String(IDs++),
  };
  return {
    ident,
    expr: {
      type: "AssignmentPattern",
      left: ident,
      right: id,
    },
  };
}

export function createIdentifier(node: ts.Identifier | ts.StringLiteral): ESTree.Identifier {
  return withStartEnd(
    {
      type: "Identifier",
      name: node.getText(),
    },
    node,
  );
}

/**
 * Create a new Scope which is always included
 * `(function (_ = MARKER) {})()`
 */
export function createIIFE(range: Range): { fn: ESTree.FunctionExpression; iife: ESTree.ExpressionStatement } {
  const fn = withStartEnd<ESTree.FunctionExpression>(
    {
      type: "FunctionExpression",
      id: null,
      params: [],
      body: { type: "BlockStatement", body: [] },
    },
    range,
  );
  const iife = withStartEnd<ESTree.ExpressionStatement>(
    {
      type: "ExpressionStatement",
      expression: {
        type: "CallExpression",
        callee: { type: "Identifier", name: String(IDs++) },
        arguments: [fn],
        optional: false,
      },
    },
    range,
  );
  return { fn, iife };
}

/**
 * Create a dummy ReturnStatement with an ArrayExpression:
 * `return [];`
 */
export function createReturn(): { stmt: ESTree.Statement; expr: ESTree.ArrayExpression } {
  const expr: ESTree.ArrayExpression = {
    type: "ArrayExpression",
    elements: [],
  };
  return {
    expr,
    stmt: {
      type: "ReturnStatement",
      argument: expr,
    },
  };
}

/**
 * Create a new Declaration and Scope for `id`:
 * `function ${id}(_ = MARKER) {}`
 */
export function createDeclaration(id: ts.Identifier, range: Range): ESTree.FunctionDeclaration {
  return withStartEnd(
    {
      type: "FunctionDeclaration",
      id: withStartEnd(
        {
          type: "Identifier",
          name: ts.idText(id),
        },
        id,
      ),
      params: [],
      body: { type: "BlockStatement", body: [] },
    },
    range,
  );
}

export function convertExpression(node: ts.Expression): ESTree.Expression {
  if (ts.isLiteralExpression(node)) {
    return { type: "Literal", value: node.text };
  }
  if (ts.isPropertyAccessExpression(node)) {
    if (ts.isPrivateIdentifier(node.name)) {
      throw new UnsupportedSyntaxError(node.name);
    }
    return withStartEnd(
      {
        type: "MemberExpression",
        computed: false,
        optional: false,
        object: convertExpression(node.expression),
        property: convertExpression(node.name),
      },
      {
        start: node.expression.getStart(),
        end: node.name.getEnd(),
      },
    );
  }
  if (ts.isIdentifier(node)) {
    return createIdentifier(node);
  } else if (node.kind == ts.SyntaxKind.NullKeyword) {
    return { type: "Literal", value: null };
  } else {
    throw new UnsupportedSyntaxError(node);
  }
}

/**
 * Turn type-only hint statements into "AssignmentExpression" statements.
 * 
 * TypeScript statement:  type A$TYPE_ONLY = B;
 * ↓
 * ESTree statement:      A$TYPE_ONLY = B;
 * 
 * This statement will be kept in the final output because of "side effects",
 * so that we can use it to restore the type-only modifier of imports/exports.
 * 
 * However, the drawback is that it may result in some **import statements**
 * that should be treeshaken not being treeshaken.
 * (This does not affect the treeshake results of exports and other types of statements.)
 */
export function convertTypeOnlyHintStatement(node: ts.TypeAliasDeclaration) {
  return withStartEnd({
    type: "ExpressionStatement",
    expression: {
      type: "AssignmentExpression",
      operator: "=",
      left: createIdentifier(node.name),
      right: createIdentifier((node.type as ts.TypeReferenceNode).typeName as ts.Identifier)
    },
  }, node);
}

export interface Range {
  start: number;
  end: number;
}

export function withStartEnd<T extends ESTree.Node>(esNode: T, nodeOrRange: ts.Node | Range): T {
  const range: Range =
    "start" in nodeOrRange ? nodeOrRange : { start: nodeOrRange.getStart(), end: nodeOrRange.getEnd() };
  return Object.assign(esNode, range);
}

export function matchesModifier(node: ts.Node, flags: ts.ModifierFlags) {
  const nodeFlags = ts.getCombinedModifierFlags(node as any);
  return (nodeFlags & flags) === flags;
}
