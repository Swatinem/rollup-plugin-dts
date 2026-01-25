# How does it work?

This project abuses the internals implementation of rollup in a quite interesting
way.
See, rollup uses **string manipulation** to generate its output file, by
_changing_ and _removing_ parts of the input file content via [MagicString](https://github.com/rich-harris/magic-string). It also does quite
extensive **dead code elimination** by walking the AST of the input code and
figuring out which parts it can safely remove from the output bundle.

We can use this knowledge to specifically direct rollup to _keep_ and
_remove_ parts of our input file, and to [rename the correct Identifiers](https://github.com/rollup/rollup/blob/7af842b3af052d1c305e90ac1fbf0cfb8c9fa359/src/ast/nodes/Identifier.ts#L155).

What we do, is to transform the Typescript code into a _virtual AST_, that is in
itself just really strange code, but it makes rollup do what we would like it
to do.

## Creating declarations

For each export (`class`, `function`, `interface` or `type`), we will create
a bogus `FunctionDeclaration` for rollup.
The trick here is to annotate this `FunctionDeclaration` with a certain
`start` and `end`.
Rollup will then just [remove all the bytes](https://github.com/rollup/rollup/blob/7af842b3af052d1c305e90ac1fbf0cfb8c9fa359/src/utils/treeshakeNode.ts#L4-L7) between `start` and `end`, without
even looking into what those bytes actually are, if it figures out that the
declaration is not referenced.

```
function foo() {}
export function bar() {}
```

[See it live](https://rollupjs.org/repl?version=3.10.0&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMmZ1bmN0aW9uJTIwZm9vKCklMjAlN0IlN0QlNUNuZXhwb3J0JTIwZnVuY3Rpb24lMjBiYXIoKSUyMCU3QiU3RCUyMiU3RCU1RCUyQyUyMm9wdGlvbnMlMjIlM0ElN0IlMjJmb3JtYXQlMjIlM0ElMjJlc20lMjIlMkMlMjJuYW1lJTIyJTNBJTIybXlCdW5kbGUlMjIlMkMlMjJhbWQlMjIlM0ElN0IlMjJpZCUyMiUzQSUyMiUyMiU3RCU3RCUyQyUyMmV4YW1wbGUlMjIlM0FudWxsJTdE)

## Creating side-effects

Rollup will actually analyze functions for side-effects and happily remove
functions which are side-effect free, even though they are referenced in other
parts of your code.

In order for rollup to at least consider putting a function into our bundle,
we have to introduce a side-effect into the function. How do we do that?
The answer is to generate code that rollup can not see inside. For example
by calling an unreferenced identifier. That identifier could potentially live
in `window` and rollup does not know that. So it does not touch that code.

```
_()
```

[See it live](https://rollupjs.org/repl?version=3.10.0&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMl8oKSUyMiU3RCU1RCUyQyUyMm9wdGlvbnMlMjIlM0ElN0IlMjJmb3JtYXQlMjIlM0ElMjJlc20lMjIlMkMlMjJuYW1lJTIyJTNBJTIybXlCdW5kbGUlMjIlMkMlMjJhbWQlMjIlM0ElN0IlMjJpZCUyMiUzQSUyMiUyMiU3RCU3RCUyQyUyMmV4YW1wbGUlMjIlM0FudWxsJTdE)

## Creating references

If someone has looked very carefully at the previous example, you will see
that rollup actually inserts a semicolon after the `CallExpression`.
This one took me a long time to figure out and work around.

In the end I decided to create references between different declarations
as function argument defaults. That way rollup will not insert semicolons that
would otherwise mess with out TypeScript code.

Again, all the `Identifier`s are annotated with correct `start` and `end`
markers. So if rollup decides to rename them, it will touch the correct parts
of the code. Also, the function name itself is part of the identifier list,
because there might be identifiers _before_ the function name, such as type
parameters and maybe things we would want to remove.

```
function foo(_0 = foo) {}
function bar(_0 = bar, _1 = foo) {}
function baz(_0 = baz) {}
export function foobar(_0 = foobar, _1 = bar, _2 = baz) {}
```

[See it live](https://rollupjs.org/repl?version=3.10.0&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMmZ1bmN0aW9uJTIwZm9vKF8wJTIwJTNEJTIwZm9vKSUyMCU3QiU3RCU1Q25mdW5jdGlvbiUyMGJhcihfMCUyMCUzRCUyMGJhciUyQyUyMF8xJTIwJTNEJTIwZm9vKSUyMCU3QiU3RCU1Q25mdW5jdGlvbiUyMGJheihfMCUyMCUzRCUyMGJheiklMjAlN0IlN0QlNUNuZXhwb3J0JTIwZnVuY3Rpb24lMjBmb29iYXIoXzAlMjAlM0QlMjBmb29iYXIlMkMlMjBfMSUyMCUzRCUyMGJhciUyQyUyMF8yJTIwJTNEJTIwYmF6KSUyMCU3QiU3RCUyMiU3RCU1RCUyQyUyMm9wdGlvbnMlMjIlM0ElN0IlMjJmb3JtYXQlMjIlM0ElMjJlc20lMjIlMkMlMjJuYW1lJTIyJTNBJTIybXlCdW5kbGUlMjIlMkMlMjJhbWQlMjIlM0ElN0IlMjJpZCUyMiUzQSUyMiUyMiU3RCU3RCUyQyUyMmV4YW1wbGUlMjIlM0FudWxsJTdE)

## Removing nested code

Building on the previous example, we can use the list of function argument
defaults to, and the thing we learned before about removing top-level code to
mark nested code for deletion.

For this case, we create an arrow function with some dead code inside. As you
will see in the example, rollup will remove that code. Again, annotating it with
`start` and `end` markers and you are done.

```
function foo(_0 = foo, _1 = () => {removeme}) {}
export function bar(_0 = bar, _1 = foo) {}
```

[See it live](https://rollupjs.org/repl?version=3.10.0&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMmZ1bmN0aW9uJTIwZm9vKF8wJTIwJTNEJTIwZm9vJTJDJTIwXzElMjAlM0QlMjAoKSUyMCUzRCUzRSUyMCU3QnJlbW92ZW1lJTdEKSUyMCU3QiU3RCU1Q25leHBvcnQlMjBmdW5jdGlvbiUyMGJhcihfMCUyMCUzRCUyMGJhciUyQyUyMF8xJTIwJTNEJTIwZm9vKSUyMCU3QiU3RCUyMiU3RCU1RCUyQyUyMm9wdGlvbnMlMjIlM0ElN0IlMjJmb3JtYXQlMjIlM0ElMjJlc20lMjIlMkMlMjJuYW1lJTIyJTNBJTIybXlCdW5kbGUlMjIlMkMlMjJhbWQlMjIlM0ElN0IlMjJpZCUyMiUzQSUyMiUyMiU3RCU3RCUyQyUyMmV4YW1wbGUlMjIlM0FudWxsJTdE)

With that, we have all the tools to create roll-upd `.d.ts` files.

## Sourcemap challenges

The virtual AST trick creates a problem for sourcemaps: **[Go to Definition](https://code.visualstudio.com/docs/languages/typescript#_code-navigation) breaks**.

TypeScript's declaration maps (`.d.ts.map`) have [per-token granularity](https://github.com/microsoft/TypeScript/blob/b19a9da2a3b8f2a720d314d01258dd2bdc110fef/src/compiler/emitter.ts#L6234-L6240)—each identifier like `User`, `id`, `name` gets its own mapping. This enables "Go to Definition" to jump to the exact identifier, not just the line.

But Rollup's bundle sourcemap is **sparse**. It only has mappings at declaration boundaries, not per-identifier. Why? Our virtual AST only has `FunctionDeclaration` nodes with `start`/`end` markers—no token-level detail for Rollup to preserve.

### Why can't MagicString/Rollup handle this?

They do handle sourcemaps properly—the bottleneck is in Rollup's bundle map generation.

MagicString works fine; we use `hires: true` in our transform hook. Rollup properly [composes the chain](https://github.com/rollup/rollup/blob/7af842b3af052d1c305e90ac1fbf0cfb8c9fa359/src/utils/collapseSourcemaps.ts) via `collapseSourcemaps`. The problem is that Rollup [generates the bundle map](https://github.com/rollup/rollup/blob/7af842b3af052d1c305e90ac1fbf0cfb8c9fa359/src/utils/renderChunks.ts#L161) with `hires: false` by default, and there's no output option to change this.

Even if Rollup supported `hires: true`, it wouldn't help—our virtual AST doesn't have real token positions, just `FunctionDeclaration` boundaries.

### Why standard remapping fails

You might think [`@jridgewell/remapping`](https://github.com/jridgewell/remapping) could compose Rollup's map with the input `.d.ts.map` after the fact. It can't add detail back.

Remapping **traces** segments—for each segment in the outer map, it looks up where that position maps in the inner map. It cannot **add** segments that don't exist in the outer map.

```
Rollup's sparse map:     6 segments  (outer)
Input .d.ts.map:        17 segments  (inner)
Remapped result:         3 segments  (fewer, not more!)
```

The outer map's granularity is the ceiling. Remapping can only lose detail, never gain it.

### Sparse-anchor hydration

Instead of remapping, we use Rollup's sparse map as "anchors" to find which source line each output line came from, then copy the detailed segments from the input map:

```
For each output line:
  1. Find first mapped segment in Rollup's map (the "anchor")
  2. Extract the source line number from the anchor
  3. Copy ALL segments from that source line in the input map
  4. Adjust columns by delta: anchorOutputCol - anchorSourceCol
```

This works because TypeScript preserves line structure—declarations stay on their original lines through bundling. The anchor tells us "this output line came from source line N", and we know the input map has detailed per-identifier mappings for line N.

We defer sourcemap processing to `generateBundle` rather than `transform`. Even if we composed maps in `transform`, Rollup's bundling would still produce a sparse output map. Plus, `options.sourcemap` is an output option—not available in `transform`. By deferring, we also skip loading input sourcemaps entirely when sourcemaps are disabled.

### Input paths

When `dts({ sourcemap: true })` is set, the plugin handles two input types:

- **`.d.ts` files**: External `.d.ts.map` files are loaded from disk
- **`.ts` files**: TypeScript's in-memory declaration map is captured during `program.emit()`

Without this option, sourcemaps remain sparse (basic line-level mappings from MagicString).

For `.ts` inputs, we strip `//# sourceMappingURL` comments from emitted declarations. TypeScript emits external map references, but we pass the map directly via `inputMapText`. Without stripping, Rollup would double-process the sourcemap.

### Implementation quirks

**sourcesContent rejection**: tsserver [rejects](https://github.com/microsoft/TypeScript/blob/b19a9da2a3b8f2a720d314d01258dd2bdc110fef/src/services/sourcemaps.ts#L226) sourcemaps containing `sourcesContent`, silently falling back to no mapping:

```typescript
if (map.sourcesContent && map.sourcesContent.some(isString)) return undefined;
```

We strip `sourcesContent` entirely from output maps to stay compatible.

**URL sourceRoot**: TypeScript's `sourceRoot` can be a URL like `https://github.com/org/repo/blob/main/src/`. We detect URLs via the `://` pattern (not just `:`, which would match Windows drive letters) and use the [`URL` constructor](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL) for proper path resolution—`new URL("../../src/index.ts", "https://example.com/dist/types/")` correctly produces `https://example.com/src/index.ts`.

### Libraries

- [`convert-source-map`](https://github.com/thlorenz/convert-source-map) — loads input sourcemaps (inline base64, URL-encoded, file references)
- [`@jridgewell/sourcemap-codec`](https://github.com/jridgewell/sourcemap-codec) — decodes/encodes VLQ mappings
- [`@jridgewell/remapping`](https://github.com/jridgewell/remapping) — composes sourcemaps for multi-source cases
