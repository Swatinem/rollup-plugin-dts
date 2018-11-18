# rollup-plugin-dts

[![Build Status](https://img.shields.io/travis/Swatinem/rollup-plugin-dts.svg)](https://travis-ci.org/Swatinem/rollup-plugin-dts)
[![Coverage Status](https://img.shields.io/codecov/c/github/Swatinem/rollup-plugin-dts.svg)](https://codecov.io/gh/Swatinem/rollup-plugin-dts)

This is an **EXPERIMENT** to generate roll-upd `.d.ts` definition files from
your `.ts` files.

## Why?

Well, ideally TypeScript should just do that itself, and it also has a
[proposal](https://github.com/Microsoft/TypeScript/issues/4433) to do that.
But since ~3 years, it hasn’t happened yet.

There are also some solutions for this already:

- [API Extractor](https://github.com/Microsoft/web-build-tools/wiki/API-Extractor)
  an official Microsoft project, which however is super complicated and I was not
  able to get it to work.
- [dts-bundle-generator](https://github.com/timocov/dts-bundle-generator) which
  was a good inspiration for this project but in the end didn’t really work as
  well for my use-cases.

Some projects, like [rollup itself](https://github.com/rollup/rollup/blob/24fe07f39da8e4225f4bc4f797331930d8405ec2/src/rollup/types.d.ts)
go the route of completely separating their public interfaces in a separate file.

## Does it even work?

Well yes it does, even though I am sure there are _a lot_ of things I haven’t
covered yet. However, so far it is complete enough to even generate
[its own definition file](./src/__tests__/testcases/rollup-plugin-dts/expected.ts)

## How does it work?

This project abuses the internals implementation of rollup in a quite interesting
way.
See, rollup uses **string manipulation** to generate its output file, by
_changing_ and _removing_ parts of the input file content. It also does quite
extensive **dead code elimination** by walking the AST of the input code and
figuring out which parts it can safely remove from the output bundle.

We can use this knowledge to specifically direct rollup to _keep_ and
_remove_ parts of our input file, and to rename the correct Identifiers.

What we do, is to transform the Typescript code into a _virtual AST_, that is in
itself just really strange code, but it makes rollup do what we would like it
to do.

### Marking code for removal

For things on the top-level that we want removed from our source, we generate
an `IfStatement` that is always false. Rollup will figure this out and just
remove that statement altogether.

```
if (false) {}
```

[See it live](https://rollupjs.org/repl?version=0.67.1&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMmlmJTIwKGZhbHNlKSUyMCU3QiU3RCUyMiU3RCU1RCUyQyUyMm9wdGlvbnMlMjIlM0ElN0IlMjJmb3JtYXQlMjIlM0ElMjJlc20lMjIlMkMlMjJuYW1lJTIyJTNBJTIybXlCdW5kbGUlMjIlMkMlMjJhbWQlMjIlM0ElN0IlMjJpZCUyMiUzQSUyMiUyMiU3RCU3RCUyQyUyMmV4YW1wbGUlMjIlM0FudWxsJTdE)

The trick here is to annotate this `IfStatement` with a certain `start` and `end`.
Rollup will then just remove all the bytes between `start` and `end`, without
even looking into what those bytes actually are.

**TODO**: actually, it should be easier to just generate any identifier without
a side-effect, like I do for nested code.

### Creating declarations

For each export (`class`, `function`, `interface` or `type`), we will create
a bogus `FunctionDeclaration` for rollup. Again, we annotate the
`FunctionDeclaration` with a set of `start` and `end` markers, so that rollup
will remove the correct parts of our code if it figures out the declaration is
not referenced.

```
function foo() {}
export function bar() {}
```

[See it live](https://rollupjs.org/repl?version=0.67.1&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMmZ1bmN0aW9uJTIwZm9vKCklMjAlN0IlN0QlNUNuZXhwb3J0JTIwZnVuY3Rpb24lMjBiYXIoKSUyMCU3QiU3RCUyMiU3RCU1RCUyQyUyMm9wdGlvbnMlMjIlM0ElN0IlMjJmb3JtYXQlMjIlM0ElMjJlc20lMjIlMkMlMjJuYW1lJTIyJTNBJTIybXlCdW5kbGUlMjIlMkMlMjJhbWQlMjIlM0ElN0IlMjJpZCUyMiUzQSUyMiUyMiU3RCU3RCUyQyUyMmV4YW1wbGUlMjIlM0FudWxsJTdE)

### Creating side-effects

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

[See it live](https://rollupjs.org/repl?version=0.67.1&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMl8oKSUyMiU3RCU1RCUyQyUyMm9wdGlvbnMlMjIlM0ElN0IlMjJmb3JtYXQlMjIlM0ElMjJlc20lMjIlMkMlMjJuYW1lJTIyJTNBJTIybXlCdW5kbGUlMjIlMkMlMjJhbWQlMjIlM0ElN0IlMjJpZCUyMiUzQSUyMiUyMiU3RCU3RCUyQyUyMmV4YW1wbGUlMjIlM0FudWxsJTdE)

### Creating references

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

[See it live](https://rollupjs.org/repl?version=0.67.1&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMmZ1bmN0aW9uJTIwZm9vKF8wJTIwJTNEJTIwZm9vKSUyMCU3QiU3RCU1Q25mdW5jdGlvbiUyMGJhcihfMCUyMCUzRCUyMGJhciUyQyUyMF8xJTIwJTNEJTIwZm9vKSUyMCU3QiU3RCU1Q25mdW5jdGlvbiUyMGJheihfMCUyMCUzRCUyMGJheiklMjAlN0IlN0QlNUNuZXhwb3J0JTIwZnVuY3Rpb24lMjBmb29iYXIoXzAlMjAlM0QlMjBmb29iYXIlMkMlMjBfMSUyMCUzRCUyMGJhciUyQyUyMF8yJTIwJTNEJTIwYmF6KSUyMCU3QiU3RCUyMiU3RCU1RCUyQyUyMm9wdGlvbnMlMjIlM0ElN0IlMjJmb3JtYXQlMjIlM0ElMjJlc20lMjIlMkMlMjJuYW1lJTIyJTNBJTIybXlCdW5kbGUlMjIlMkMlMjJhbWQlMjIlM0ElN0IlMjJpZCUyMiUzQSUyMiUyMiU3RCU3RCUyQyUyMmV4YW1wbGUlMjIlM0FudWxsJTdE)

### Removing nested code

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

[See it live](https://rollupjs.org/repl?version=0.67.1&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMmZ1bmN0aW9uJTIwZm9vKF8wJTIwJTNEJTIwZm9vJTJDJTIwXzElMjAlM0QlMjAoKSUyMCUzRCUzRSUyMCU3QnJlbW92ZW1lJTdEKSUyMCU3QiU3RCU1Q25leHBvcnQlMjBmdW5jdGlvbiUyMGJhcihfMCUyMCUzRCUyMGJhciUyQyUyMF8xJTIwJTNEJTIwZm9vKSUyMCU3QiU3RCUyMiU3RCU1RCUyQyUyMm9wdGlvbnMlMjIlM0ElN0IlMjJmb3JtYXQlMjIlM0ElMjJlc20lMjIlMkMlMjJuYW1lJTIyJTNBJTIybXlCdW5kbGUlMjIlMkMlMjJhbWQlMjIlM0ElN0IlMjJpZCUyMiUzQSUyMiUyMiU3RCU3RCUyQyUyMmV4YW1wbGUlMjIlM0FudWxsJTdE)

With that, we have all the tools to create roll-upd `.d.ts` files.

# TODO

## Things to test:

- [ ] make sure overrides work correctly
- [ ] make sure tsdoc and other type of comments work correctly

## Things to implement:

- [ ] type parameters with correct shadowing
- [ ] maybe removing things from the bundle marked with `@internal` or `@hidden`
