import * as ts from "typescript";
import * as ESTree from "estree";
import {
  Ranged,
  isNodeExported,
  createExport,
  createDeclaration,
  createIdentifier,
  createReference,
  createProgram,
  removeNested,
  withStartEnd,
} from "./astHelpers";

interface TransformerOptions {
  logAst?: boolean;
}

export class Transformer {
  ast: ESTree.Program;

  constructor(sourceFile: ts.SourceFile, options: TransformerOptions) {
    this.ast = createProgram(sourceFile);

    for (const stmt of sourceFile.statements) {
      this.convertStatement(stmt);
    }

    if (options.logAst) {
      console.log({
        tsAst: sourceFile,
        ast: this.ast,
      });
    }
  }

  pushStatement(node: undefined | ESTree.Statement | ESTree.ModuleDeclaration) {
    if (node) {
      this.ast.body.push(node);
    }
  }

  maybeMarkAsExported(node: ts.Declaration, id: ts.Identifier) {
    if (isNodeExported(node)) {
      const start = node.pos;
      this.pushStatement(createExport(id, { start, end: start }));
    }
  }

  removeExportModifier(node: ts.Declaration) {
    const ret = [];
    for (const mod of node.modifiers || []) {
      const end = mod.end + 1;
      if (mod.kind === ts.SyntaxKind.ExportKeyword) {
        ret.push(
          removeNested({
            start: end - "export ".length,
            end,
          }),
        );
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
    if (ts.isExportDeclaration(node)) {
      return this.convertExportDeclaration(node);
    }
    if (ts.isImportDeclaration(node)) {
      return this.convertImportDeclaration(node);
    }
    console.log(node);
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

  convertExportDeclaration(node: ts.ExportDeclaration) {
    this.pushStatement({
      type: "ExportNamedDeclaration",
      declaration: null,
      specifiers: node.exportClause ? node.exportClause.elements.map(e => this.convertExportSpecifier(e)) : [],
    });
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
    return {
      type: "MemberExpression",
      computed: false,
      object: this.convertEntityName(node.left),
      property: createIdentifier(node.right),
    };
  }

  convertExpression(node: ts.Expression): ESTree.Expression {
    if (ts.isLiteralExpression(node)) {
      return { type: "Literal", value: node.text };
    }
    if (ts.isIdentifier(node)) {
      return createIdentifier(node);
    }
    console.log(node);
    throw new Error(`Unknown Expression`);
  }
}
