import * as ESTree from "estree";
import * as ts from "typescript";
import {
  convertExpression,
  createDefaultExport,
  createExport,
  createIdentifier,
  createProgram,
  matchesModifier,
  Ranged,
  withStartEnd,
} from "./astHelpers";
import { DeclarationScope } from "./DeclarationScope";
import { UnsupportedSyntaxError } from "./errors";

type ESTreeImports = ESTree.ImportDeclaration["specifiers"];

interface Fixup {
  range: {
    start: number;
    end: number;
  };
  replaceWith: string;
}

export interface TransformOutput {
  ast: ESTree.Program;
  fixups: Array<Fixup>;
  typeReferences: Set<string>;
}

export class Transformer {
  ast: ESTree.Program;
  fixups: Array<Fixup> = [];
  typeReferences = new Set<string>();

  declarations = new Map<string, DeclarationScope>();
  exports = new Set<string>();

  constructor(public sourceFile: ts.SourceFile) {
    // collect all the type references and create fixups to remove them from the code,
    // we will add all of these later on to the whole chunk…
    const lineStarts = sourceFile.getLineStarts();
    for (const ref of sourceFile.typeReferenceDirectives) {
      this.typeReferences.add(ref.fileName);

      const { line } = sourceFile.getLineAndCharacterOfPosition(ref.pos);
      const start = lineStarts[line];
      const end = sourceFile.getLineEndOfPosition(ref.pos);
      this.fixups.push({
        range: { start, end },
        replaceWith: "",
      });
    }

    this.ast = createProgram(sourceFile);
    for (const stmt of sourceFile.statements) {
      this.convertStatement(stmt);
    }
  }

  transform(): TransformOutput {
    return {
      ast: this.ast,
      fixups: this.fixups,
      typeReferences: this.typeReferences,
    };
  }

  addFixupLocation(range: { start: number; end: number }) {
    const original = this.sourceFile.text.slice(range.start, range.end);
    let identifier = `_mp_rt${this.fixups.length}`;
    identifier += original.slice(identifier.length).replace(/[^a-zA-Z0-9_$]/g, () => "_");

    this.fixups.push({
      range,
      replaceWith: identifier,
    });
    return identifier;
  }

  unshiftStatement(node: ESTree.Statement | ESTree.ModuleDeclaration) {
    this.ast.body.unshift(withStartEnd(node, { start: 0, end: 0 }));
  }

  pushStatement(node: ESTree.Statement | ESTree.ModuleDeclaration) {
    this.ast.body.push(node);
  }

  maybeMarkAsExported(node: ts.Node, id: ts.Identifier) {
    const loc = { start: node.pos, end: node.pos };

    if (!matchesModifier(node, ts.ModifierFlags.Export) || !node.modifiers) {
      return false;
    }

    const isExportDefault = matchesModifier(node, ts.ModifierFlags.ExportDefault);
    const name = isExportDefault ? "default" : id.getText();

    if (this.exports.has(name)) {
      return true;
    }

    this.pushStatement((isExportDefault ? createDefaultExport : createExport)(id, loc));

    this.exports.add(name);
    return true;
  }

  createDeclaration(range: Ranged, id?: ts.Identifier) {
    if (!id) {
      const scope = new DeclarationScope({ range, transformer: this });
      this.pushStatement(scope.iife!);
      return scope;
    }

    const name = id.getText();
    // We have re-ordered and grouped declarations in `reorderStatements`,
    // so we can assume same-name statements are next to each other, so we just
    // bump the `end` range.
    const scope = new DeclarationScope({ id, range, transformer: this });
    const existingScope = this.declarations.get(name);
    if (existingScope) {
      (existingScope.declaration as any).end = range.end;
    } else {
      this.pushStatement(scope.declaration);
      this.declarations.set(name, scope);
    }
    return existingScope || scope;
  }

  convertStatement(node: ts.Node) {
    if (ts.isEnumDeclaration(node)) {
      return this.convertEnumDeclaration(node);
    }
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
    if (ts.isModuleDeclaration(node)) {
      return this.convertNamespaceDeclaration(node);
    }
    if (node.kind == ts.SyntaxKind.NamespaceExportDeclaration) {
      // just ignore `export as namespace FOO` statements…
      return this.removeStatement(node);
    }
    if (ts.isEmptyStatement(node)) {
      return this.removeStatement(node);
    }
    // istanbul ignore else
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
      return this.convertImportDeclaration(node);
    } else {
      throw new UnsupportedSyntaxError(node);
    }
  }

  removeStatement(node: ts.Node) {
    this.pushStatement(
      withStartEnd(
        {
          type: "ExpressionStatement",
          expression: { type: "Literal", value: "pls remove me" },
        },
        node,
      ),
    );
  }

  convertNamespaceDeclaration(node: ts.ModuleDeclaration) {
    // we want to keep `declare global` augmentations, and we want to
    // pull in all the things referenced inside.
    // so for this case, we need to figure out some way so that rollup does
    // the right thing and not rename these…
    const isGlobalAugmentation = node.flags & ts.NodeFlags.GlobalAugmentation;

    if (isGlobalAugmentation || !ts.isIdentifier(node.name)) {
      const scope = this.createDeclaration(node);
      scope.convertNamespace(node);
      return;
    }

    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node, node.name);
    scope.fixModifiers(node);

    scope.pushIdentifierReference(node.name);

    scope.convertNamespace(node);
  }

  convertEnumDeclaration(node: ts.EnumDeclaration) {
    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node, node.name);
    scope.fixModifiers(node);

    scope.pushIdentifierReference(node.name);
  }

  convertFunctionDeclaration(node: ts.FunctionDeclaration) {
    // istanbul ignore if
    if (!node.name) {
      throw new UnsupportedSyntaxError(node, `FunctionDeclaration should have a name`);
    }

    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node, node.name);
    scope.fixModifiers(node);

    scope.pushIdentifierReference(node.name);

    scope.convertParametersAndType(node);
  }

  convertClassOrInterfaceDeclaration(node: ts.ClassDeclaration | ts.InterfaceDeclaration) {
    // istanbul ignore if
    if (!node.name) {
      throw new UnsupportedSyntaxError(node, `ClassDeclaration / InterfaceDeclaration should have a name`);
    }

    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node, node.name);
    scope.fixModifiers(node);

    const typeVariables = scope.convertTypeParameters(node.typeParameters);
    scope.convertHeritageClauses(node);
    scope.convertMembers(node.members);
    scope.popScope(typeVariables);
  }

  convertTypeAliasDeclaration(node: ts.TypeAliasDeclaration) {
    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node, node.name);
    scope.fixModifiers(node);

    const typeVariables = scope.convertTypeParameters(node.typeParameters);
    scope.convertTypeNode(node.type);
    scope.popScope(typeVariables);
  }

  convertVariableStatement(node: ts.VariableStatement) {
    const { declarations } = node.declarationList;
    // istanbul ignore if
    if (declarations.length !== 1) {
      throw new UnsupportedSyntaxError(node, `VariableStatement with more than one declaration not yet supported`);
    }
    for (const decl of declarations) {
      // istanbul ignore if
      if (!ts.isIdentifier(decl.name)) {
        throw new UnsupportedSyntaxError(node, `VariableDeclaration must have a name`);
      }

      this.maybeMarkAsExported(node, decl.name);

      const scope = this.createDeclaration(node, decl.name);
      scope.fixModifiers(node);

      scope.convertTypeNode(decl.type);
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
      // export * from './other'
      this.pushStatement(
        withStartEnd(
          {
            type: "ExportAllDeclaration",
            source,
            exported: null
          },
          node,
        ),
      );
    } else if (ts.isNamespaceExport(node.exportClause)) {
      // export * as name from './other'
      this.pushStatement(
        withStartEnd(
          {
            type: "ExportAllDeclaration",
            source,
            exported: createIdentifier(node.exportClause.name),
          },
          node,
        ),
      );
    } else {
      // export { name } from './other'
      const specifiers: Array<ESTree.ExportSpecifier> = [];
      for (const elem of node.exportClause.elements) {
        specifiers.push(this.convertExportSpecifier(elem));
      }

      this.pushStatement(
        withStartEnd(
          {
            type: "ExportNamedDeclaration",
            declaration: null,
            specifiers,
            source,
          },
          node,
        ),
      );
    }
  }

  convertImportDeclaration(node: ts.ImportDeclaration | ts.ImportEqualsDeclaration) {
    if (ts.isImportEqualsDeclaration(node)) {
      // assume its like `import default`
      if (!ts.isExternalModuleReference(node.moduleReference)) {
        throw new UnsupportedSyntaxError(node, "ImportEquals should have a literal source.");
      }
      this.pushStatement(
        withStartEnd(
          {
            type: "ImportDeclaration",
            specifiers: [
              {
                type: "ImportDefaultSpecifier",
                local: createIdentifier(node.name),
              },
            ],
            source: convertExpression(node.moduleReference.expression) as any,
          },
          node,
        ),
      );
      return;
    }
    const source = convertExpression(node.moduleSpecifier) as any;

    const specifiers: ESTreeImports =
      node.importClause && node.importClause.namedBindings
        ? this.convertNamedImportBindings(node.importClause.namedBindings)
        : [];
    if (node.importClause && node.importClause.name) {
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
      return node.elements.map((el) => {
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
