import type * as ESTree from "estree";
import ts from "typescript";
import { convertExpression, createIdentifier, createProgram, withStartEnd } from "./astHelpers.js";
import { DeclarationScope } from "./DeclarationScope.js";
import { UnsupportedSyntaxError } from "./errors.js";

type ESTreeImports = ESTree.ImportDeclaration["specifiers"];

interface ConvertInput {
  sourceFile: ts.SourceFile;
}

interface ConvertOutput {
  ast: ESTree.Program;
}

export function convert({ sourceFile }: ConvertInput): ConvertOutput {
  const transformer = new Transformer(sourceFile);
  return transformer.transform();
}

class Transformer {
  ast: ESTree.Program;

  declarations = new Map<string, DeclarationScope>();

  constructor(public sourceFile: ts.SourceFile) {
    this.ast = createProgram(sourceFile);
    for (const stmt of sourceFile.statements) {
      this.convertStatement(stmt);
    }
  }

  transform(): ConvertOutput {
    return {
      ast: this.ast,
    };
  }

  pushStatement(node: ESTree.Statement | ESTree.ModuleDeclaration) {
    this.ast.body.push(node);
  }

  createDeclaration(node: ts.Node, id?: ts.Identifier) {
    const range = { start: node.getFullStart(), end: node.getEnd() };
    if (!id) {
      const scope = new DeclarationScope({ range });
      this.pushStatement(scope.iife!);
      return scope;
    }

    const name = id.getText();
    // We have re-ordered and grouped declarations in `reorderStatements`,
    // so we can assume same-name statements are next to each other, so we just
    // bump the `end` range.
    const scope = new DeclarationScope({ id, range });
    const existingScope = this.declarations.get(name);
    if (existingScope) {
      existingScope.pushIdentifierReference(id);
      (existingScope.declaration as any).end = range.end;

      // we possibly have other declarations, such as an ExportDeclaration in
      // between, which should also be updated to the correct start/end.
      const selfIdx = this.ast.body.findIndex((node) => node == existingScope.declaration);
      for (let i = selfIdx + 1; i < this.ast.body.length; i++) {
        const decl = this.ast.body[i] as any;
        decl.start = decl.end = range.end;
      }
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
    if (node.kind === ts.SyntaxKind.NamespaceExportDeclaration) {
      // just ignore `export as namespace FOO` statements…
      return this.removeStatement(node);
    }
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
      scope.convertNamespace(node, true);
      return;
    }

    const scope = this.createDeclaration(node, node.name);
    scope.pushIdentifierReference(node.name);
    scope.convertNamespace(node, true);
  }

  convertEnumDeclaration(node: ts.EnumDeclaration) {
    const scope = this.createDeclaration(node, node.name);
    scope.pushIdentifierReference(node.name);
  }

  convertFunctionDeclaration(node: ts.FunctionDeclaration) {
    if (!node.name) {
      throw new UnsupportedSyntaxError(node, "FunctionDeclaration should have a name");
    }

    const scope = this.createDeclaration(node, node.name);
    scope.pushIdentifierReference(node.name);
    scope.convertParametersAndType(node);
  }

  convertClassOrInterfaceDeclaration(node: ts.ClassDeclaration | ts.InterfaceDeclaration) {
    if (!node.name) {
      throw new UnsupportedSyntaxError(node, "ClassDeclaration / InterfaceDeclaration should have a name");
    }

    const scope = this.createDeclaration(node, node.name);

    const typeVariables = scope.convertTypeParameters(node.typeParameters);
    scope.convertHeritageClauses(node);
    scope.convertMembers(node.members);
    scope.popScope(typeVariables);
  }

  convertTypeAliasDeclaration(node: ts.TypeAliasDeclaration) {
    /**
     * TODO: type-only import/export fixer.
     * Temporarily disable the type-only import/export transformation,
     * because the current implementation is unsafe.
     *
     * Issue: https://github.com/Swatinem/rollup-plugin-dts/issues/340
     */
    // if(parseTypeOnlyName(node.name.text).isTypeOnly) {
    //   this.pushStatement(convertTypeOnlyHintStatement(node))
    //   return
    // }

    const scope = this.createDeclaration(node, node.name);

    const typeVariables = scope.convertTypeParameters(node.typeParameters);
    scope.convertTypeNode(node.type);
    scope.popScope(typeVariables);
  }

  convertVariableStatement(node: ts.VariableStatement) {
    const { declarations } = node.declarationList;
    if (declarations.length !== 1) {
      throw new UnsupportedSyntaxError(node, "VariableStatement with more than one declaration not yet supported");
    }
    for (const decl of declarations) {
      if (!ts.isIdentifier(decl.name)) {
        throw new UnsupportedSyntaxError(node, "VariableDeclaration must have a name");
      }

      const scope = this.createDeclaration(node, decl.name);
      scope.convertTypeNode(decl.type);

      // Track references in the initializer (e.g., for object literals)
      if (decl.initializer) {
        this.trackExpressionReferences(decl.initializer, scope);
      }
    }
  }

  // Helper to track identifier references in expressions
  private trackExpressionReferences(expr: ts.Expression, scope: DeclarationScope) {
    if (ts.isIdentifier(expr)) {
      scope.pushIdentifierReference(expr);
    } else if (ts.isObjectLiteralExpression(expr)) {
      for (const prop of expr.properties) {
        if (ts.isShorthandPropertyAssignment(prop)) {
          scope.pushIdentifierReference(prop.name);
        } else if (ts.isPropertyAssignment(prop)) {
          this.trackExpressionReferences(prop.initializer, scope);
        }
      }
    } else if (ts.isArrayLiteralExpression(expr)) {
      for (const elem of expr.elements) {
        if (ts.isExpression(elem)) {
          this.trackExpressionReferences(elem, scope);
        }
      }
    } else if (ts.isPropertyAccessExpression(expr)) {
      this.trackExpressionReferences(expr.expression, scope);
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
            exported: null,
            attributes: [],
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
            attributes: [],
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
            attributes: [],
          },
          node,
        ),
      );
    }
  }

  convertImportDeclaration(node: ts.ImportDeclaration | ts.ImportEqualsDeclaration) {
    if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isEntityName(node.moduleReference)) {
        const scope = this.createDeclaration(node, node.name);
        scope.pushReference(scope.convertEntityName(node.moduleReference));
        return;
      }

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
            attributes: [],
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
          attributes: [],
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
