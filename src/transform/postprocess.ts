import MagicString from "magic-string";
import ts from "typescript";
import { UnsupportedSyntaxError } from "./errors.js";
import { getEnd, getStart } from "./utils.js";

interface PostProcessInput {
  sourceFile: ts.SourceFile;
}

interface PostProcessOutput {
  code: MagicString;
}

type Range = [start: number, end: number];

interface Export {
  exportedName: string;
  localName: string;
}

interface Namespace {
  name: string;
  exports: Array<Export>;
  node: ts.Node;
}

/**
 * The post-process step has the following goals:
 * - [x] Remove bogus semicolons (`EmptyStatement`s) that rollup might have
 *   inserted for some fake IIFE code that we generated.
 * - [x] Remove file extensions from import specifiers, as typescript prefers
 *   them without extension.
 * - [ ] Replace the javascript code that rollup generates for namespace imports
 *   with real typescript namespaces, fixing up all the references to those as well.
 */
export function postProcess({ sourceFile }: PostProcessInput): PostProcessOutput {
  const code = new MagicString(sourceFile.getFullText());

  /** A list of all the rollup namespace declarations we have found */
  const namespaces: Array<Namespace> = [];
  /** A map of all the declared names to their code range */
  const nameRanges = new Map<string, Array<Range>>();

  for (const node of sourceFile.statements) {
    // For some global `namespace` and `module` declarations, we generate
    // some fake IIFE code, so rollup can correctly scan its scope.
    // However, rollup will then insert bogus semicolons,
    // these `EmptyStatement`s, which are a syntax error and we want to
    // remove them.
    if (ts.isEmptyStatement(node)) {
      code.remove(node.getStart(), node.getEnd());
      continue;
    }

    // When generating multiple chunks, rollup links those via import
    // statements, obviously. But rollup uses full filenames with extension,
    // which typescript does not like. So make sure to remove those here.
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      let { text } = node.moduleSpecifier;
      if (text.startsWith(".") && text.endsWith(".d.ts")) {
        let end = node.moduleSpecifier.getEnd() - 1; // -1 to account for the quote
        code.remove(end - 5, end);
      }
      continue;
    }

    if (
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
        recordNameRange(name, node);
      }
    }

    if (!ts.isVariableStatement(node)) {
      continue;
    }
    const { declarations } = node.declarationList;
    if (declarations.length !== 1) {
      continue;
    }
    const decl = declarations[0]!;
    const name = decl.name.getText();
    if (!decl.initializer || !ts.isCallExpression(decl.initializer)) {
      recordNameRange(name, node);
      continue;
    }
    const obj = decl.initializer.arguments[0]!;
    if (
      !decl.initializer.expression.getFullText().includes("/*#__PURE__*/Object.freeze") ||
      !ts.isObjectLiteralExpression(obj)
    ) {
      continue;
    }
    const exports: Array<Export> = [];
    for (const prop of obj.properties) {
      if (
        !ts.isPropertyAssignment(prop) ||
        !ts.isIdentifier(prop.name) ||
        (prop.name.text !== "__proto__" && !ts.isIdentifier(prop.initializer))
      ) {
        throw new UnsupportedSyntaxError(prop, "Expected a property assignment");
      }
      if (prop.name.text === "__proto__") {
        continue;
      }
      exports.push({
        exportedName: prop.name.getText(),
        localName: prop.initializer.getText(),
      });
    }
    namespaces.push({
      name,
      exports,
      node,
    });
  }

  // remove first
  for (const ns of namespaces) {
    code.remove(getStart(ns.node), getEnd(ns.node));
  }

  // then, recreate them
  for (const ns of namespaces) {
    const start = getStart(ns.node);
    const end = getEnd(ns.node);
    code.appendRight(start, `declare namespace ${ns.name} {\n\n`);
    for (const { exportedName, localName } of ns.exports) {
      if (exportedName === localName) {
        const ranges = nameRanges.get(localName) ?? [];
        for (const range of ranges) {
          // TODO: better fix for these modifiers
          code.prependRight(range[0], "export ");
          code.move(range[0], range[1], end);
        }
      }
    }
    code.appendRight(end, "\n}\n");
  }

  // console.log(nameRanges);
  // if (namespaces.length) {
  //   console.log(namespaces);
  // }

  // TODO: maybe patch `foo_d as foo` exports as well

  return { code };

  function recordNameRange(name: string, node: ts.Node) {
    const range: Range = [getStart(node), getEnd(node)];
    const nameRange = nameRanges.get(name);
    if (!nameRange) {
      nameRanges.set(name, [range]);
    } else {
      nameRange.push(range);
    }
  }
}
