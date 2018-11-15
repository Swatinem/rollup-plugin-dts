import * as ts from "typescript";
import * as ESTree from "estree";

export interface WithModifiers extends ts.Node {
  modifiers?: ts.NodeArray<ts.Modifier>;
}

export function maybeMarkAsExported(node: WithModifiers, id: ts.Identifier) {
  if (hasExportModifier(node)) {
    return createExportedReference(id);
  }
  return undefined;
  // if (!hasExportModifier(node)) {
  //   return markForDelete(node);
  // }
}

export function hasExportModifier(node: WithModifiers) {
  return node.modifiers && node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword);
}

export function createExportedReference(node: ts.Identifier) {
  const id = createIdentifier(node);
  return withStartEnd<ESTree.ExportNamedDeclaration>({
    type: "ExportNamedDeclaration",
    declaration: null,
    specifiers: [
      withStartEnd<ESTree.ExportSpecifier>(
        {
          type: "ExportSpecifier",
          exported: id,
          local: id,
        },
        node,
      ),
    ],
  });
}

function createIdentifier(node: ts.Identifier) {
  return withStartEnd<ESTree.Identifier>(
    {
      type: "Identifier",
      name: node.text,
    },
    // node,
  );
}

// function emptyIdentifier() {
//   return withStartEnd<ESTree.Identifier>({start: 0, end: 0}, {
//     type: "Identifier",
//     name: '',
//   });
// }

// function emptyFunction() {
//   return withStartEnd<ESTree.FunctionDeclaration>(
//     {start: 0, end: 0},
//     {
//       type: "FunctionDeclaration",
//       id: emptyIdentifier(),
//       params: [],
//       body: emptyBlock()
//     },
//   );
// }

export function emptyBlock() {
  return withStartEnd<ESTree.BlockStatement>({
    type: "BlockStatement",
    body: [],
  });
}

export function markBlockForDelete(node?: ts.Node) {
  return withStartEnd<ESTree.BlockStatement>(
    {
      type: "BlockStatement",
      body: node ? [markForDelete(node)] : [],
    },
    node,
  );
}

export function markForDelete(node: Ranged) {
  return withStartEnd<ESTree.IfStatement>(
    {
      type: "IfStatement",
      test: { type: "Literal", value: false },
      consequent: {
        type: "BlockStatement",
        body: [],
      },
      alternate: null,
    },
    node,
  );
}

export interface Ranged {
  start?: number;
  pos?: number;
  end: number;
}

interface WithRange {
  start: number;
  end: number;
}

// function castRanged<T>(node: T): T & WithRange {
//   return node as any;
// }

export function withStartEnd<T extends ESTree.Node>(
  node: T,
  { start, pos, end }: Ranged = { start: 0, end: 0 },
): T & WithRange {
  Object.assign(node, {
    start: typeof start === "number" ? start : pos || 0,
    end,
  });
  return node as any;
}
