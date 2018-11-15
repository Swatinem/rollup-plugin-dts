import * as ts from "typescript";
import * as ESTree from "estree";
import {
  withStartEnd,
  hasExportModifier,
  markForDelete,
  markBlockForDelete,
  emptyBlock,
  WithModifiers,
  createExportedReference,
  Ranged,
} from "./astHelpers";

export class ProgramConverter {
  ast: ESTree.Program;

  constructor(sourceFile: ts.SourceFile) {
    this.ast = withStartEnd<ESTree.Program>(
      {
        type: "Program",
        sourceType: "module",
        body: [],
      },
      sourceFile,
    );

    for (const stmt of sourceFile.statements) {
      this.convertStatement(stmt);
    }
    // console.log(this.ast);
  }

  pushStatement(node: undefined | ESTree.Statement | ESTree.ModuleDeclaration) {
    if (node) {
      this.ast.body.push(node);
    }
  }

  maybeMarkAsExported(node: WithModifiers, id: ts.Identifier) {
    if (hasExportModifier(node)) {
      this.pushStatement(createExportedReference(id));
    }
  }

  rangeAfterModifiers(node: WithModifiers) {
    if (!node.modifiers) {
      return node.pos;
    }
    const { end } = node.modifiers[node.modifiers.length - 1];

    this.markForDelete({
      start: node.pos,
      end,
    });
    return end;
  }

  markForDelete(node: Ranged) {
    this.pushStatement(markForDelete(node));
  }

  convertStatement(node: ts.Node) {
    if (ts.isFunctionDeclaration(node)) {
      return this.convertFunctionDeclaration(node);
    }
    if (ts.isInterfaceDeclaration(node)) {
      return this.convertInterfaceDeclaration(node);
    }
    console.error(node);
    throw new Error(`unsupported node type`);
  }

  convertFunctionDeclaration(node: ts.FunctionDeclaration) {
    // this should really not happen, on the top-level we only have
    // named functions
    if (!node.name) {
      this.markForDelete(node);
      return;
    }

    this.maybeMarkAsExported(node, node.name);

    const start = this.rangeAfterModifiers(node);

    // we convert this to a FunctionDeclaration and mark the body as to delete
    this.pushStatement(
      withStartEnd<ESTree.FunctionDeclaration>(
        {
          type: "FunctionDeclaration",
          id: withStartEnd(
            {
              type: "Identifier",
              name: node.name!.text,
            },
            node.name,
          ),
          params: [],
          body: markBlockForDelete(node.body),
        },
        {
          start,
          end: node.end,
        },
      ),
    );
  }

  convertInterfaceDeclaration(node: ts.InterfaceDeclaration): ESTree.Statement | ESTree.ExportNamedDeclaration {
    if (!hasExportModifier(node)) {
      return markForDelete(node);
    }
    const lastModifier = node.modifiers![node.modifiers!.length - 1];

    const exportDecl = withStartEnd<ESTree.ExportNamedDeclaration>(
      {
        type: "ExportNamedDeclaration",
        specifiers: [],
        declaration: withStartEnd<ESTree.FunctionDeclaration>(
          {
            type: "FunctionDeclaration",
            id: withStartEnd(
              {
                type: "Identifier",
                name: node.name.text,
              },
              node.name,
            ),
            params: [],
            body: emptyBlock(),
          },
          {
            start: lastModifier.end,
            end: node.end,
          },
        ),
      },
      node,
    );

    return exportDecl;
  }
}
