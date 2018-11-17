# rollup-plugin-dts

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
  also has this goal, but it is also very immature so far.

Some projects, like [rollup itself](https://github.com/rollup/rollup/blob/24fe07f39da8e4225f4bc4f797331930d8405ec2/src/rollup/types.d.ts)
go the route of completely separating their public interfaces in a separate file.

## How does it work?

This project abuses the internals implementation of rollup in a quite interesting
way.
See, rollup uses **string manipulation** to generate its output file, by
_changing_ and _removing_ parts of the input file content. It also does quite
extensive **dead code elimination** by walking the AST of the input code and
figuring out which parts it can safely remove from the output bundle.

We can use this knowledge to specifically direct rollup to _keep_, _change_ and
_remove_ parts of our input file.
