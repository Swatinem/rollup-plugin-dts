import * as ESTree from "estree";
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
export function createReference(id: ESTree.Expression): ESTree.AssignmentPattern {
  return {
    type: "AssignmentPattern",
    left: {
      type: "Identifier",
      name: String(IDs++),
    },
    right: id,
  };
}

export function createIdentifier(node: ts.Identifier): ESTree.Identifier {
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
export function createIIFE(range: Range) {
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
  } else {
    throw new UnsupportedSyntaxError(node);
  }
}

export interface Range {
  start: number;
  end: number;
}

export function withStartEnd<T extends ESTree.Node>(esNode: T, nodeOrRange: ts.Node | Range): T {
  let range: Range =
    "start" in nodeOrRange ? nodeOrRange : { start: nodeOrRange.getStart(), end: nodeOrRange.getEnd() };
  return Object.assign(esNode, range);
}

export function matchesModifier(node: ts.Node, flags: ts.ModifierFlags) {
  const nodeFlags = ts.getCombinedModifierFlags(node as any);
  return (nodeFlags & flags) === flags;
}
