// conflicting name:
declare const foo: number;

export interface Direct {
  ns1: import("foo");
  ns2: typeof import("foo");
}
export interface Member {
  bar: import("./bar" /* will be removed */)./* will be kept */ Bar;
  baz: typeof import("./bar").Baz;
}
export interface Generic {
  bar: import("./bar").Bar<number>;
  baz: import("foo")/* will be removed*/ </* will be kept */ import("./bar").Bar>;
}
export type TypeScript = typeof import("typescript");
export interface Test {
  rollup: import("rollup").RollupOptions;
}
