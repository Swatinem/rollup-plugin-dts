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

type ESTreeImports = ESTree.ImportDeclaration["specifiers"];

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

  pushStatement(node: ESTree.Statement | ESTree.ModuleDeclaration) {
    this.ast.body.push(node);
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

  removeExportModifier(node: ts.Declaration, removeDefault = false) {
    const ret = [];
    for (const mod of node.modifiers || []) {
      if (mod.kind === ts.SyntaxKind.ExportKeyword || (removeDefault && mod.kind === ts.SyntaxKind.DefaultKeyword)) {
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
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
      return this.convertClassOrInterfaceDeclaration(node);
    }
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      return this.convertExportDeclaration(node);
    }
    // istanbul ignore else
    if (ts.isImportDeclaration(node)) {
      return this.convertImportDeclaration(node);
    } else {
      console.log({ code: node.getFullText() });
      throw new Error(`unsupported node type`);
    }
  }

  createDeclaration(id: ts.Identifier, range: Ranged) {
    const decl = createDeclaration(id, range);
    this.pushStatement(decl);
    return decl.params;
  }

  convertFunctionDeclaration(node: ts.FunctionDeclaration) {
    // istanbul ignore if
    if (!node.name) {
      console.log({ code: node.getFullText() });
      throw new Error(`FunctionDeclaration should have a name`);
    }

    this.maybeMarkAsExported(node, node.name);

    const body = this.createDeclaration(node.name, node);
    body.push(...this.removeExportModifier(node));

    this.convertParametersAndType(node, body);
  }

  convertParametersAndType(node: ts.SignatureDeclarationBase, body: Array<ESTree.Pattern>) {
    for (const param of node.parameters) {
      if (param.type) {
        this.convertTypeNode(param.type, body);
      }
    }
    if (node.type) {
      this.convertTypeNode(node.type, body);
    }
  }

  convertHeritageClauses(node: ts.InterfaceDeclaration | ts.ClassDeclaration, body: Array<ESTree.Pattern>) {
    for (const heritage of node.heritageClauses || []) {
      for (const type of heritage.types) {
        body.push(createReference(this.convertExpression(type.expression)));
      }
    }
  }

  convertMembers(node: ts.InterfaceDeclaration | ts.ClassDeclaration, body: Array<ESTree.Pattern>) {
    for (const member of node.members) {
      if ((ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) && member.type) {
        this.convertTypeNode(member.type, body);
      } else if (
        ts.isMethodDeclaration(member) ||
        ts.isMethodSignature(member) ||
        ts.isConstructorDeclaration(member) ||
        ts.isConstructSignatureDeclaration(member)
      ) {
        this.convertParametersAndType(member, body);
      }
    }
  }

  convertClassOrInterfaceDeclaration(node: ts.ClassDeclaration | ts.InterfaceDeclaration) {
    // istanbul ignore if
    if (!node.name) {
      console.log({ code: node.getFullText() });
      throw new Error(`ClassDeclaration / InterfaceDeclaration should have a name`);
    }

    this.maybeMarkAsExported(node, node.name);

    const body = this.createDeclaration(node.name, node);
    body.push(...this.removeExportModifier(node, ts.isInterfaceDeclaration(node)));

    this.convertHeritageClauses(node, body);

    this.convertMembers(node, body);
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
    const source = this.convertExpression(node.moduleSpecifier) as any;
    // istanbul ignore if
    if (!node.importClause || (!node.importClause.name && !node.importClause.namedBindings)) {
      console.log({ code: node.getFullText() });
      throw new Error(`ImportDeclaration should have imports`);
    }
    const specifiers: ESTreeImports = node.importClause.namedBindings
      ? this.convertNamedImportBindings(node.importClause.namedBindings)
      : [];
    if (node.importClause.name) {
      specifiers.push({
        type: "ImportDefaultSpecifier",
        local: createIdentifier(node.importClause.name),
      });
    }

    this.pushStatement(
      withStartEnd(
        {
          type: "ImportDeclaration",
          specifiers,
          source,
        },
        node,
      ),
    );
  }

  convertNamedImportBindings(node: ts.NamedImportBindings): ESTreeImports {
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
    // istanbul ignore else
    if (ts.isIdentifier(node)) {
      return createIdentifier(node);
    } else {
      console.log({ code: node.getFullText() });
      throw new Error(`Unknown Expression`);
    }
  }
}
