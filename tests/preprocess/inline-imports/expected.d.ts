import * as rollup from "rollup";
import * as typescript from "typescript";
import * as __bar from "./bar";
import * as _foo from "foo";
// conflicting name:
declare const foo: number;

declare interface Direct {
  ns1: _foo;
  ns2: typeof _foo;
}
declare interface Member {
  bar: __bar./* will be kept */ Bar;
  baz: typeof __bar.Baz;
}
declare interface Generic {
  bar: __bar.Bar<number>;
  baz: _foo</* will be kept */ __bar.Bar>;
}
declare type TypeScript = typeof typescript;
declare interface Test {
  rollup: rollup.RollupOptions;
}

export { Direct, Member, Generic, TypeScript, Test };
