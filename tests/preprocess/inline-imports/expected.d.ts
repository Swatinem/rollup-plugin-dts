import * as rollup from "rollup";
import * as typescript from "typescript";
import * as __bar from "./bar";
import * as _foo from "foo";
// conflicting name:
declare const foo: number;

interface Direct {
  ns1: _foo;
  ns2: typeof _foo;
}
interface Member {
  bar: __bar./* will be kept */ Bar;
  baz: typeof __bar.Baz;
}
interface Generic {
  bar: __bar.Bar<number>;
  baz: _foo</* will be kept */ __bar.Bar>;
}
type TypeScript = typeof typescript;
interface Test {
  rollup: rollup.RollupOptions;
}

export { Direct, Member, Generic, TypeScript, Test };
