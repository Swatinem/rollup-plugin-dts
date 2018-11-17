import * as ts from "typescript";
import * as ESTree from "estree";
import {
  Ranged,
  createExport,
  createDeclaration,
  createIdentifier,
  createReference,
  createProgram,
  removeNested,
  withStartEnd,
  createDefaultExport,
  matchesModifier,
} from "./astHelpers";

export class Transformer {
  ast: ESTree.Program;

  constructor(sourceFile: ts.SourceFile) {
    this.ast = createProgram(sourceFile);

    for (const stmt of sourceFile.statements) {
      this.convertStatement(stmt);
    }
  }

  transform() {
    return this.ast;
  }

  pushStatement(node: undefined | ESTree.Statement | ESTree.ModuleDeclaration) {
    if (node) {
      this.ast.body.push(node);
    }
  }

  maybeMarkAsExported(node: ts.Declaration, id: ts.Identifier) {
    if (matchesModifier(node, ts.ModifierFlags.ExportDefault)) {
      const start = node.pos;
      this.pushStatement(createDefaultExport(id, { start, end: start }));
    } else if (matchesModifier(node, ts.ModifierFlags.Export)) {
      const start = node.pos;
      this.pushStatement(createExport(id, { start, end: start }));
    }
  }

  removeExportModifier(node: ts.Declaration) {
    const ret = [];
    for (const mod of node.modifiers || []) {
      if (mod.kind === ts.SyntaxKind.ExportKeyword) {
        const start = node.getStart();
        const end = mod.end + 1;
        ret.push(removeNested({ start, end }));
      }
    }
    return ret;
  }

  convertStatement(node: ts.Node) {
    if (ts.isFunctionDeclaration(node)) {
      return this.convertFunctionDeclaration(node);
    }
    if (ts.isInterfaceDeclaration(node)) {
      return this.convertInterfaceDeclaration(node);
    }
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      return this.convertExportDeclaration(node);
    }
    if (ts.isImportDeclaration(node)) {
      return this.convertImportDeclaration(node);
    }
    console.log({ code: node.getFullText() });
    throw new Error(`unsupported node type`);
  }

  createDeclaration(id: ts.Identifier, range: Ranged) {
    const decl = createDeclaration(id, range);
    this.pushStatement(decl);
    return decl.params;
  }

  convertFunctionDeclaration(node: ts.FunctionDeclaration) {
    if (!node.name) {
      console.log(node);
      throw new Error(`FunctionDeclaration should have a name`);
    }

    this.maybeMarkAsExported(node, node.name);

    const body = this.createDeclaration(node.name, node);
    body.push(...this.removeExportModifier(node));

    for (const param of node.parameters) {
      if (param.type) {
        this.convertTypeNode(param.type, body);
      }
    }
    if (node.type) {
      this.convertTypeNode(node.type, body);
    }
  }

  convertInterfaceDeclaration(node: ts.InterfaceDeclaration) {
    if (!node.name) {
      console.log(node);
      throw new Error(`InterfaceDeclaration should have a name`);
    }

    this.maybeMarkAsExported(node, node.name);

    const body = this.createDeclaration(node.name, node);
    body.push(...this.removeExportModifier(node));

    for (const heritage of node.heritageClauses || []) {
      for (const type of heritage.types) {
        body.push(createReference(this.convertExpression(type.expression)));
      }
    }

    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.type) {
        this.convertTypeNode(member.type, body);
      }
    }
  }

  convertExportDeclaration(node: ts.ExportDeclaration | ts.ExportAssignment) {
    if (ts.isExportAssignment(node)) {
      this.pushStatement(
        withStartEnd(
          {
            type: "ExportDefaultDeclaration",
            declaration: this.convertExpression(node.expression),
          },
          node,
        ),
      );
      return;
    }

    const source = node.moduleSpecifier ? (this.convertExpression(node.moduleSpecifier) as any) : undefined;

    if (!node.exportClause) {
      this.pushStatement(
        withStartEnd(
          {
            type: "ExportAllDeclaration",
            source,
          },
          node,
        ),
      );
    } else {
      this.pushStatement(
        withStartEnd(
          {
            type: "ExportNamedDeclaration",
            declaration: null,
            specifiers: node.exportClause ? node.exportClause.elements.map(e => this.convertExportSpecifier(e)) : [],
            source,
          },
          node,
        ),
      );
    }
  }

  convertImportDeclaration(node: ts.ImportDeclaration) {
    if (!node.importClause || !node.importClause.namedBindings) {
      throw new Error(`ImportDeclaration should have imports`);
    }
    this.pushStatement(
      withStartEnd(
        {
          type: "ImportDeclaration",
          specifiers: this.convertNamedImportBindings(node.importClause.namedBindings),
          source: this.convertExpression(node.moduleSpecifier) as any,
        },
        node,
      ),
    );
  }

  convertNamedImportBindings(
    node: ts.NamedImportBindings,
  ): Array<ESTree.ImportSpecifier | ESTree.ImportNamespaceSpecifier> {
    if (ts.isNamedImports(node)) {
      return node.elements.map(el => {
        const local = createIdentifier(el.name);
        const imported = el.propertyName ? createIdentifier(el.propertyName) : local;
        return {
          type: "ImportSpecifier",
          local,
          imported,
        } as ESTree.ImportSpecifier;
      });
    }
    return [
      {
        type: "ImportNamespaceSpecifier",
        local: createIdentifier(node.name),
      },
    ];
  }

  convertExportSpecifier(node: ts.ExportSpecifier): ESTree.ExportSpecifier {
    const exported = createIdentifier(node.name);
    return {
      type: "ExportSpecifier",
      exported: exported,
      local: node.propertyName ? createIdentifier(node.propertyName) : exported,
    };
  }

  convertTypeNode(node: ts.TypeNode, body: Array<ESTree.Pattern>) {
    if (ts.isTypeReferenceNode(node)) {
      body.push(createReference(this.convertEntityName(node.typeName)));
    }
  }

  convertEntityName(node: ts.EntityName): ESTree.Expression {
    if (ts.isIdentifier(node)) {
      return createIdentifier(node);
    }
    return withStartEnd(
      {
        type: "MemberExpression",
        computed: false,
        object: this.convertEntityName(node.left),
        property: createIdentifier(node.right),
      },
      // TODO: clean up all the `start` handling!
      { start: node.getStart(), end: node.end },
    );
  }

  convertExpression(node: ts.Expression): ESTree.Expression {
    if (ts.isLiteralExpression(node)) {
      return { type: "Literal", value: node.text };
    }
    if (ts.isIdentifier(node)) {
      return createIdentifier(node);
    }
    console.log({ code: node.getFullText() });
    throw new Error(`Unknown Expression`);
  }
}
