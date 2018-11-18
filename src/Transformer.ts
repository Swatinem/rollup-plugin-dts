import * as ts from "typescript";
import * as ESTree from "estree";
import {
  Ranged,
  createExport,
  createIdentifier,
  createProgram,
  withStartEnd,
  createDefaultExport,
  matchesModifier,
  convertExpression,
} from "./astHelpers";
import { DeclarationScope } from "./DeclarationScope";

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

  maybeMarkAsExported(node: ts.Node, id: ts.Identifier) {
    if (matchesModifier(node as any, ts.ModifierFlags.ExportDefault)) {
      const start = node.pos;
      this.pushStatement(createDefaultExport(id, { start, end: start }));
    } else if (matchesModifier(node as any, ts.ModifierFlags.Export)) {
      const start = node.pos;
      this.pushStatement(createExport(id, { start, end: start }));
    }
  }

  createDeclaration(id: ts.Identifier, range: Ranged) {
    const scope = new DeclarationScope(id, range);
    this.pushStatement(scope.declaration);
    return scope;
  }

  convertStatement(node: ts.Node) {
    if (ts.isFunctionDeclaration(node)) {
      return this.convertFunctionDeclaration(node);
    }
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
      return this.convertClassOrInterfaceDeclaration(node);
    }
    if (ts.isTypeAliasDeclaration(node)) {
      return this.convertTypeAliasDeclaration(node);
    }
    if (ts.isVariableStatement(node)) {
      return this.convertVariableStatement(node);
    }
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      return this.convertExportDeclaration(node);
    }
    // istanbul ignore else
    if (ts.isImportDeclaration(node)) {
      return this.convertImportDeclaration(node);
    } else {
      console.log({ kind: node.kind, code: node.getFullText() });
      throw new Error(`unsupported node type`);
    }
  }

  convertFunctionDeclaration(node: ts.FunctionDeclaration) {
    // istanbul ignore if
    if (!node.name) {
      console.log({ code: node.getFullText() });
      throw new Error(`FunctionDeclaration should have a name`);
    }

    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node.name, node);
    scope.removeModifier(node);

    scope.pushIdentifierReference(node.name);

    scope.convertParametersAndType(node);
  }

  convertClassOrInterfaceDeclaration(node: ts.ClassDeclaration | ts.InterfaceDeclaration) {
    // istanbul ignore if
    if (!node.name) {
      console.log({ code: node.getFullText() });
      throw new Error(`ClassDeclaration / InterfaceDeclaration should have a name`);
    }

    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node.name, node);
    scope.removeModifier(node);
    if (ts.isInterfaceDeclaration(node)) {
      scope.removeModifier(node, ts.SyntaxKind.DefaultKeyword);
    }

    scope.convertHeritageClauses(node);

    // NOTE(swatinem): typescript loses the non-null assertion for `node.name`
    scope.pushIdentifierReference(node.name!);

    scope.convertMembers(node.members);
  }

  convertTypeAliasDeclaration(node: ts.TypeAliasDeclaration) {
    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node.name, node);
    scope.removeModifier(node);

    scope.pushIdentifierReference(node.name);

    scope.convertTypeNode(node.type);
  }

  convertVariableStatement(node: ts.VariableStatement) {
    const { declarations } = node.declarationList;
    // istanbul ignore if
    if (declarations.length !== 1) {
      console.log({ code: node.getFullText() });
      throw new Error(`VariableStatement with more than one declaration not yet supported`);
    }
    for (const decl of declarations) {
      // istanbul ignore if
      if (!ts.isIdentifier(decl.name)) {
        console.log({ code: node.getFullText() });
        throw new Error(`VariableDeclaration must have a name`);
      }

      this.maybeMarkAsExported(node, decl.name);

      const scope = this.createDeclaration(decl.name, node);
      scope.removeModifier(node);

      scope.pushIdentifierReference(decl.name);

      if (decl.type) {
        scope.convertTypeNode(decl.type);
      }
    }
  }

  convertExportDeclaration(node: ts.ExportDeclaration | ts.ExportAssignment) {
    if (ts.isExportAssignment(node)) {
      this.pushStatement(
        withStartEnd(
          {
            type: "ExportDefaultDeclaration",
            declaration: convertExpression(node.expression),
          },
          node,
        ),
      );
      return;
    }

    const source = node.moduleSpecifier ? (convertExpression(node.moduleSpecifier) as any) : undefined;

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
    const source = convertExpression(node.moduleSpecifier) as any;
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
}
