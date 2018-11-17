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

We can use this knowledge to specifically direct rollup to _keep_, _change_ and
_remove_ parts of our input file.

# TODO

- explain how I abuse rollup to do what I want :-D

## Things to test:

- `export default`
- function arguments
- function return values
- make sure overrides work correctly
- make sure tsdoc and other type of comments work correctly

## Things to implement:

- classes
- maybe removing things from the bundle marked with `@internal` or `@hidden`
