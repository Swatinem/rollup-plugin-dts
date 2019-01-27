# rollup-plugin-dts

[![Build Status](https://img.shields.io/travis/Swatinem/rollup-plugin-dts.svg)](https://travis-ci.org/Swatinem/rollup-plugin-dts)
[![Coverage Status](https://img.shields.io/codecov/c/github/Swatinem/rollup-plugin-dts.svg)](https://codecov.io/gh/Swatinem/rollup-plugin-dts)

This is an **EXPERIMENT** to generate roll-upd `.d.ts` definition files from
your `.ts` files.

It is complete enough to generate
[its own definition file](./src/__tests__/testcases/rollup-plugin-dts/expected.ts),
and it is used successfully for [intl-codegen](https://github.com/eversport/intl-codegen) as well.

## Usage

Install the package from `npm`:

    $ npm install --save-dev tslib rollup rollup-plugin-dts rollup-plugin-dts

Create your `rollup.config.js`:

```js
import resolve from "rollup-plugin-node-resolve";
// NOTE: The plugin has two different modes:
// * one to transpile `.ts -> .js`
// * one to create `.ts -> .d.ts` bundles
import { ts, dts } from "rollup-plugin-dts";

const config = [
  {
    input: "./src/index.ts",
    // NOTE: The first output is your transpiled typescript
    output: [{ file: "dist/my-library.js", format: "cjs" }, { file: "dist/my-library.mjs", format: "es" }],

    plugins: [
      resolve({
        jsnext: true,
        extensions: [".ts"],
      }),
      ts(),
    ],
  },
  {
    input: "./src/index.ts",
    // NOTE: The second output is your bundled `.d.ts` file
    output: [{ file: "dist/my-library.d.ts", format: "es" }],

    plugins: [dts()],
  },
];

export default config;
```

And then instruct node or other bundles where to find your code

```json
  "main": "dist/my-library.js",
  "module": "dist/my-library.mjs",
  "types": "dist/my-library.d.ts",
```

## Why?

Well, ideally TypeScript should just do all this itself, and it even has a
[proposal](https://github.com/Microsoft/TypeScript/issues/4433) to do that.
But there hasn’t been any progress in ~3 years.

There are also some solutions for this already:

- [API Extractor](https://github.com/Microsoft/web-build-tools/wiki/API-Extractor)
  an official Microsoft project, which however is super complicated and I was not
  able to get it to work.
- [dts-bundle-generator](https://github.com/timocov/dts-bundle-generator) which
  was a good inspiration for this project but in the end didn’t really work as
  well for my use-cases.
- [rollup-plugin-typescript2](https://github.com/ezolenko/rollup-plugin-typescript2/blob/master/README.md#declarations)
  has support for outputting declarations, those are not rolled-up however.

Some projects, like [rollup itself](https://github.com/rollup/rollup/blob/24fe07f39da8e4225f4bc4f797331930d8405ec2/src/rollup/types.d.ts)
go the route of completely separating their public interfaces in a separate file.

## [How does it work](./docs/how-it-works.md)
