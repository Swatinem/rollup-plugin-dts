import MagicString from "magic-string";
import ts from "typescript";
import { matchesModifier } from "./astHelpers.js";
import { UnsupportedSyntaxError } from "./errors.js";
import { createTypeOnlyName, createTypeOnlyReExportName } from './TypeOnlyFixer.js'

type Range = [start: number, end: number];

interface PreProcessInput {
  sourceFile: ts.SourceFile;
  isEntry: boolean;
  isJSON?: boolean;
}

interface PreProcessOutput {
  code: MagicString;
  typeReferences: Set<string>;
  fileReferences: Set<string>;
}

function preProcessNamespaceBody(body: ts.ModuleBlock | ts.ModuleDeclaration, code: MagicString, sourceFile: ts.SourceFile) {
  // Recurse through dotted namespace chain (e.g. `namespace A.B.C {}`)
  if (ts.isModuleDeclaration(body)) {
    if (body.body && (ts.isModuleBlock(body.body) || ts.isModuleDeclaration(body.body))) {
      preProcessNamespaceBody(body.body, code, sourceFile);
    }
    return;
  }

  for (const stmt of body.statements) {
    // Safely call the new context-aware function on all children
    fixModifiers(code, stmt);

    // Recurse for nested namespaces
    if (ts.isModuleDeclaration(stmt) && stmt.body && (ts.isModuleBlock(stmt.body) || ts.isModuleDeclaration(stmt.body))) {
      preProcessNamespaceBody(stmt.body, code, sourceFile);
    }
  }
}

/**
 * The pre-process step has the following goals:
 * - [x] Fixes the "modifiers", removing any `export` modifier and adding any
 *   missing `declare` modifier.
 * - [x] Splitting compound `VariableStatement` into its parts.
 * - [x] Moving declarations for the same "name" to be next to each other.
 * - [x] Removing any triple-slash directives and recording them.
 * - [x] Create a synthetic name for any nameless "export default".
 * - [x] Resolve inline `import()` statements and generate top-level imports for
 *   them.
 * - [x] Generate a separate `export {}` statement for any item which had its
 *   modifiers rewritten.
 * - [ ] Duplicate the identifiers of a namespace `export`, so that renaming does
 *   not break it
 */
export function preProcess({ sourceFile, isEntry, isJSON }: PreProcessInput): PreProcessOutput {
  const code = new MagicString(sourceFile.getFullText());

  // Only treat as global module if it's not an entry point,
  // otherwise the final output will be mismatched with the entry.
  const treatAsGlobalModule = !isEntry && isGlobalModule(sourceFile)

  /** All the names that are declared in the `SourceFile`. */
  const declaredNames = new Set<string>();
  /** All the names that are exported. */
  const exportedNames = new Set<string>();
  /** The name of the default export. */
  let defaultExport = "";
  /** Inlined exports from `fileId` -> <synthetic name>. */
  const inlineImports = new Map<string, string>();
  /** The ranges that each name covers, for re-ordering. */
  const nameRanges = new Map<string, Array<Range>>();

  /**
   * Pass 1:
   *
   * - Remove statements that we can’t handle.
   * - Collect a `Set` of all the declared names.
   * - Collect a `Set` of all the exported names.
   * - Maybe collect the name of the default export if present.
   * - Fix the modifiers of all the items.
   * - Collect the ranges of each named statement.
   * - Duplicate the identifiers of a namespace `export`, so that renaming does
   *   not break it
   */
  for (const node of sourceFile.statements) {
    if (ts.isEmptyStatement(node)) {
      code.remove(node.getStart(), node.getEnd());
      continue;
    }

    if (ts.isImportDeclaration(node)) {
      if(!node.importClause) {
        continue;
      }
      
      if (node.importClause.name) {
        declaredNames.add(node.importClause.name.text);
      } 
      if (node.importClause.namedBindings) {
        if(ts.isNamespaceImport(node.importClause.namedBindings)) {
          declaredNames.add(node.importClause.namedBindings.name.text);
        } else {
          node.importClause.namedBindings.elements
            .forEach((element) => declaredNames.add(element.name.text))
        }
      }
    } else if (
      ts.isEnumDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      // collect the declared name
      if (node.name) {
        const name = node.name.getText();
        declaredNames.add(name);

        // collect the exported name, maybe as `default`.
        if (matchesModifier(node, ts.ModifierFlags.ExportDefault)) {
          defaultExport = name;
        } else if (
          (treatAsGlobalModule && ts.isIdentifier(node.name))
          || matchesModifier(node, ts.ModifierFlags.Export)
        ) {
          exportedNames.add(name);
        }
        if (!(node.flags & ts.NodeFlags.GlobalAugmentation)) {
          pushNamedNode(name, [getStart(node), getEnd(node)]);
        }
      }

      // duplicate exports of namespaces
      if (ts.isModuleDeclaration(node)) {
        if (node.body && (ts.isModuleBlock(node.body) || ts.isModuleDeclaration(node.body))) {
          preProcessNamespaceBody(node.body, code, sourceFile);
        }

        duplicateExports(code, node);
      }

      fixModifiers(code, node);
    } else if (ts.isVariableStatement(node)) {
      const { declarations } = node.declarationList;
      // collect all the names, also check if they are exported
      const isExport = matchesModifier(node, ts.ModifierFlags.Export);
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.getText();
          declaredNames.add(name);
          if (treatAsGlobalModule || isExport) {
            exportedNames.add(name);
          }
        }
      }

      fixModifiers(code, node);

      // collect the ranges for re-ordering
      if (declarations.length === 1) {
        const decl = declarations[0]!;
        if (ts.isIdentifier(decl.name)) {
          pushNamedNode(decl.name.getText(), [getStart(node), getEnd(node)]);
        }
      } else {
        // we do reordering after splitting
        const decls = declarations.slice();
        const first = decls.shift()!;
        pushNamedNode(first.name.getText(), [getStart(node), first.getEnd()]);
        for (const decl of decls) {
          if (ts.isIdentifier(decl.name)) {
            pushNamedNode(decl.name.getText(), [decl.getFullStart(), decl.getEnd()]);
          }
        }
      }

      // split the variable declaration into different statements
      const { flags } = node.declarationList;
      const type = flags & ts.NodeFlags.Let ? "let" : flags & ts.NodeFlags.Const ? "const" : "var";
      const prefix = `declare ${type} `;

      const list = node.declarationList
        .getChildren()
        .find((c) => c.kind === ts.SyntaxKind.SyntaxList)!
        .getChildren();
      let commaPos = 0;
      for (const node of list) {
        if (node.kind === ts.SyntaxKind.CommaToken) {
          commaPos = node.getStart();
          code.remove(commaPos, node.getEnd());
        } else if (commaPos) {
          code.appendLeft(commaPos, ";\n");
          const start = node.getFullStart();
          const slice = code.slice(start, node.getStart());
          const whitespace = slice.length - slice.trimStart().length;
          if (whitespace) {
            code.overwrite(start, start + whitespace, prefix);
          } else {
            code.appendLeft(start, prefix);
          }
        }
      }
    }
  }

  /**
   * Pass 2:
   *
   * Now that we have a Set of all the declared names, we can use that to
   * generate and de-conflict names for the following steps:
   *
   * - Resolve all the inline imports.
   * - Give any name-less `default export` a name.
   */
  for (const node of sourceFile.statements) {
    // recursively check inline imports
    checkInlineImport(node);

    /**
     * TODO: type-only import/export fixer.
     * Temporarily disable the type-only import/export transformation,
     * because the current implementation is unsafe.
     * 
     * Issue: https://github.com/Swatinem/rollup-plugin-dts/issues/340
     */
    // transformTypeOnlyImport(node);
    // transformTypeOnlyExport(node);

    // Handle export default with object/array literals
    // These need to be converted to named declarations so Rollup can track references within them
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      if (ts.isObjectLiteralExpression(node.expression) || ts.isArrayLiteralExpression(node.expression)) {
        if (!defaultExport) {
          defaultExport = uniqName("export_default");
        }
        // Replace "export default" with "declare var export_default ="
        code.overwrite(node.getStart(), node.expression.getStart(), `declare var ${defaultExport} = `);
        continue;
      }
    }

    if (!matchesModifier(node, ts.ModifierFlags.ExportDefault)) {
      continue;
    }

    // only function and class can be default exported, and be missing a name
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      if (node.name) {
        continue;
      }
      if (!defaultExport) {
        defaultExport = uniqName("export_default");
      }

      const children = node.getChildren();
      const idx = children.findIndex(
        (node) => node.kind === ts.SyntaxKind.ClassKeyword || node.kind === ts.SyntaxKind.FunctionKeyword,
      );
      const token = children[idx]!;
      const nextToken = children[idx + 1]!;
      const isPunctuation =
        nextToken.kind >= ts.SyntaxKind.FirstPunctuation && nextToken.kind <= ts.SyntaxKind.LastPunctuation;

      if (isPunctuation) {
        const addSpace = code.slice(token.getEnd(), nextToken.getStart()) != " ";
        code.appendLeft(nextToken.getStart(), `${addSpace ? " " : ""}${defaultExport}`);
      } else {
        code.appendRight(token.getEnd(), ` ${defaultExport}`);
      }
    }
  }

  // and re-order all the name ranges to be contiguous
  for (const ranges of nameRanges.values()) {
    // we have to move all the nodes in front of the *last* one, which is a bit
    // unintuitive but is a workaround for:
    // https://github.com/Rich-Harris/magic-string/issues/180
    const last = ranges.pop()!;
    const start = last[0];
    for (const node of ranges) {
      code.move(node[0], node[1], start);
    }
  }

  // render all the inline imports, and all the exports
  if (defaultExport) {
    code.append(`\nexport default ${defaultExport};\n`);
  }
  if (exportedNames.size) {
    code.append(`\nexport { ${[...exportedNames].join(", ")} };\n`);
  }
  if(isJSON && exportedNames.size) {
    /**
     * Add default export for JSON modules.
     * 
     * The typescript compiler only generate named exports for each top-level key,
     * but we also need a default export for JSON modules in most cases.
     * This also aligns with the behavior of `@rollup/plugin-json`.
     */
    defaultExport = uniqName("export_default");
    code.append([
      `\ndeclare const ${defaultExport}: {`,
      [...exportedNames].map(name => `  ${name}: typeof ${name};`).join("\n"),
      `};`,
      `export default ${defaultExport};\n` 
      ].join('\n')
    );
  }
  for (const [fileId, importName] of inlineImports.entries()) {
    code.prepend(`import * as ${importName} from "${fileId}";\n`);
  }

  const lineStarts = sourceFile.getLineStarts();

  // and collect/remove all the typeReferenceDirectives
  const typeReferences = new Set<string>();
  for (const ref of sourceFile.typeReferenceDirectives) {
    typeReferences.add(ref.fileName);

    const { line } = sourceFile.getLineAndCharacterOfPosition(ref.pos);
    const start = lineStarts[line]!;
    let end = sourceFile.getLineEndOfPosition(ref.pos);
    if (code.slice(end, end + 1) === "\n") {
      end += 1;
    }

    code.remove(start, end);
  }

  // and collect/remove all the fileReferenceDirectives
  const fileReferences = new Set<string>();
  for (const ref of sourceFile.referencedFiles) {
    fileReferences.add(ref.fileName);

    const { line } = sourceFile.getLineAndCharacterOfPosition(ref.pos);
    const start = lineStarts[line]!;
    let end = sourceFile.getLineEndOfPosition(ref.pos);
    if (code.slice(end, end + 1) === "\n") {
      end += 1;
    }

    code.remove(start, end);
  }

  // Strip trailing sourceMappingURL comments so they don't leak into bundled output
  const fullText = sourceFile.getFullText();

  // Check EOF token's leading trivia (comment on its own line after last statement)
  // and last statement's trailing trivia (comment on same line as last statement)
  const eofTrivia = ts.getLeadingCommentRanges(fullText, sourceFile.endOfFileToken.getFullStart());
  const lastStatement = sourceFile.statements[sourceFile.statements.length - 1];
  const trailingTrivia = lastStatement
    ? ts.getTrailingCommentRanges(fullText, lastStatement.getEnd())
    : undefined;

  for (const comment of [...(eofTrivia ?? []), ...(trailingTrivia ?? [])]) {
    // Skip block comments — sourceMappingURL text inside /** */ must not be stripped
    if (comment.kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;
    const text = fullText.slice(comment.pos, comment.end);
    if (!/\/\/[#@]\s*sourceMappingURL=/.test(text)) continue;

    let start = comment.pos;
    if (start > 0 && fullText[start - 1] === "\n") {
      start -= 1;
    }
    code.remove(start, comment.end);
    break;
  }

  return {
    code,
    typeReferences,
    fileReferences,
  };

  // @ts-expect-error temporary disabled
  function transformTypeOnlyImport(node: ts.Node) {
    if (!ts.isImportDeclaration(node) || !node.importClause) {
      return;
    }

    if(node.importClause.isTypeOnly && node.importClause.name) {
      const name = node.importClause.name.text;
      const hintName = createTypeOnlyName(name);
      // import type A from 'a';
      // ↓
      // import type A from 'a';
      // type A$type_only_import = A;
      code.appendRight(node.getEnd(), `\ntype ${hintName} = ${name};\n`);
      return;
    }

    if (
      node.importClause.isTypeOnly 
      && node.importClause.namedBindings 
      && ts.isNamespaceImport(node.importClause.namedBindings)
    ) {
      const name = node.importClause.namedBindings.name.text;
      const hintName = createTypeOnlyName(name);
      // import type * as A from 'a'
      // ↓
      // import type * as A from 'a'
      // type A$type_only_import = A
      code.appendRight(node.getEnd(), `\ntype ${hintName} = ${name};\n`);
      return;
    }

    if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const element of node.importClause.namedBindings.elements) {
        if(node.importClause.isTypeOnly || element.isTypeOnly) {
          const name = element.name.text;
          const hintName = createTypeOnlyName(name);
          // import type { A } from 'a'
          // ↓
          // import type { A } from 'a'
          // type A$type_only_import = A
          code.appendRight(node.getEnd(), `\ntype ${hintName} = ${name};\n`);
        }
      }
    }
  }

  // @ts-expect-error temporary disabled
  function transformTypeOnlyExport(node: ts.Node) {
    if(!ts.isExportDeclaration(node)) {
      return;
    }

    if(node.exportClause && ts.isNamedExports(node.exportClause) && node.moduleSpecifier) {
      const values: string[] = [];
      const types: Array<{ localName: string; hintName: string; sourceName: string; targetName: string }> = [];
      const specifier = node.moduleSpecifier.getText();

      for (const element of node.exportClause.elements) {
        const targetName = element.name.text;
        const sourceName = element.propertyName?.text || targetName;
        if(node.isTypeOnly || element.isTypeOnly) {
          const localName = uniqName(getSafeName((node.moduleSpecifier as ts.StringLiteral).text));
          const hintName = createTypeOnlyReExportName(targetName);
          types.push({ sourceName, localName, hintName, targetName });
        } else {
          values.push(element.getText());
        }
      }

      if(types.length) {
        // export type { A } from 'a'
        // ↓
        // import type { A as uniqName } from 'a'
        // type A$type_only_re_export = uniqName
        // export type { uniqName as A }
        code.overwrite(
          node.getStart(), 
          node.getEnd(), 
          [
            values.length ? `export { ${values.join(', ')} } from ${specifier};` : '',
            `import type { ${types.map(hint => `${getNameBinding(hint.sourceName, hint.localName)}`).join(', ')} } from ${specifier};`,
            ...types.map(hint => `type ${hint.hintName} = ${hint.localName};`),
            `export type { ${types.map(hint => `${getNameBinding(hint.localName, hint.targetName)}`).join(', ')} };`
          ].filter(Boolean).join('\n'),
        );
      }
      return;
    }

    if(node.exportClause && ts.isNamedExports(node.exportClause) && !node.moduleSpecifier) {
      for (const element of node.exportClause.elements) {
        if(node.isTypeOnly || element.isTypeOnly) {
          const name = element.propertyName?.text || element.name.text;
          const hintName = createTypeOnlyName(name);
          // export type { A }
          // ↓ 
          // type A$type_only_export = A
          // export type { A }
          code.appendLeft(node.getStart(), `\ntype ${hintName} = ${name};\n`);
        }
      }
      return;
    }

    if(node.exportClause && node.isTypeOnly && ts.isNamespaceExport(node.exportClause) && node.moduleSpecifier) {
      const specifier = node.moduleSpecifier.getText();
      const name = node.exportClause.name.text;
      const localName = uniqName(getSafeName((node.moduleSpecifier as ts.StringLiteral).text));
      const hintName = createTypeOnlyReExportName(name);
      // export type * as A from 'a'
      // ↓
      // import type * as uniqName from 'a'
      // type A$type_only_re_export = uniqName
      // export type { uniqName as A }
      code.overwrite(
        node.getStart(), 
        node.getEnd(),
        [
          `import type * as ${localName} from ${specifier};`,
          `type ${hintName} = ${localName};`,
          `export type { ${getNameBinding(localName, name)} };`
        ].join('\n'),
      );
      return;
    }

    // TODO: The type-only bare re-export is still not supported,
    // `export type * from 'a';` will be bundled as `export * from 'a';`
  }

  function checkInlineImport(node: ts.Node) {
    ts.forEachChild(node, checkInlineImport);

    if (ts.isImportTypeNode(node)) {
      if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)) {
        throw new UnsupportedSyntaxError(node, "inline imports should have a literal argument");
      }
      const fileId = node.argument.literal.text;
      const children = node.getChildren();

      const start = children.find((t) => t.kind === ts.SyntaxKind.ImportKeyword)!.getStart();
      let end = node.getEnd();

      const token = children.find((t) => t.kind === ts.SyntaxKind.DotToken || t.kind === ts.SyntaxKind.LessThanToken);
      if (token) {
        end = token.getStart();
      }

      const importName = createNamespaceImport(fileId);
      code.overwrite(start, end, importName);
    }
  }

  function createNamespaceImport(fileId: string) {
    let importName = inlineImports.get(fileId);
    if (!importName) {
      importName = uniqName(getSafeName(fileId));
      inlineImports.set(fileId, importName);
    }
    return importName;
  }

  function uniqName(hint: string): string {
    let name = hint;
    while (declaredNames.has(name)) {
      name = `_${name}`;
    }
    declaredNames.add(name);
    return name;
  }

  function pushNamedNode(name: string, range: Range) {
    let nodes = nameRanges.get(name);
    if (!nodes) {
      nodes = [range];
      nameRanges.set(name, nodes);
    } else {
      const last = nodes[nodes.length - 1]!;
      if (last[1] === range[0]) {
        last[1] = range[1];
      } else {
        nodes.push(range);
      }
    }
  }
}

/**
 * If the `SourceFile` is a "global module":
 * 
 * 1. Doesn't have any top-level `export {}` or `export default` statements,
 *    otherwise it's a "scoped module".
 * 
 * 2. Should have at least one top-level `import` or `export` statement,
 *    otherwise it's not a module.
 * 
 * Issue: https://github.com/Swatinem/rollup-plugin-dts/issues/334
 */
function isGlobalModule(sourceFile: ts.SourceFile) {
  let isModule = false

  for (const node of sourceFile.statements) {
    if(ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      return false
    }

    if(isModule || ts.isImportDeclaration(node) || matchesModifier(node, ts.ModifierFlags.Export)) {
      isModule = true
    }
  }

  return isModule
}

function fixModifiers(code: MagicString, node: ts.Node) {
  // remove the `export` and `default` modifier, add a `declare` if its missing.
  if (!ts.canHaveModifiers(node)) {
    return;
  }

  const isTopLevel = node.parent.kind === ts.SyntaxKind.SourceFile;

  if (isTopLevel) {
    // For top-level statements, remove `export`/`default` and ensure `declare` exists
    let hasDeclare = false;
    const needsDeclare =
      ts.isEnumDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isModuleDeclaration(node) ||
      ts.isVariableStatement(node);

    for (const mod of node.modifiers ?? []) {
      switch (mod.kind) {
        case ts.SyntaxKind.ExportKeyword: // fall through
        case ts.SyntaxKind.DefaultKeyword:
          // TODO: be careful about that `+ 1`
          code.remove(mod.getStart(), mod.getEnd() + 1);
          break;
        case ts.SyntaxKind.DeclareKeyword:
          hasDeclare = true;
      }
    }
    if (needsDeclare && !hasDeclare) {
      code.appendRight(node.getStart(), "declare ");
    }
  }
  // For statements inside namespaces, preserve all modifiers (including export)
}

function duplicateExports(code: MagicString, module: ts.ModuleDeclaration) {
  if (!module.body) {
    return;
  }
  // Recurse through dotted namespace chain
  if (ts.isModuleDeclaration(module.body)) {
    duplicateExports(code, module.body);
    return;
  }
  if (!ts.isModuleBlock(module.body)) {
    return;
  }
  for (const node of module.body.statements) {
    if (ts.isExportDeclaration(node) && node.exportClause) {
      if (ts.isNamespaceExport(node.exportClause)) {
        continue;
      }
      for (const decl of node.exportClause.elements) {
        if (!decl.propertyName) {
          code.appendLeft(decl.name.getEnd(), ` as ${decl.name.getText()}`);
        }
      }
    }
  }
}

function getNameBinding(sourceName: string, targetName: string) {
  return sourceName === targetName ? sourceName : `${sourceName} as ${targetName}`;
}

function getSafeName(fileId: string) {
  return fileId.replace(/[^a-zA-Z0-9_$]/g, () => "_")
}

function getStart(node: ts.Node): number {
  const start = node.getFullStart();
  return start + (newlineAt(node, start) ? 1 : 0);
}
function getEnd(node: ts.Node): number {
  const end = node.getEnd();
  return end + (newlineAt(node, end) ? 1 : 0);
}

function newlineAt(node: ts.Node, idx: number): boolean {
  return node.getSourceFile().getFullText()[idx] === "\n";
}
