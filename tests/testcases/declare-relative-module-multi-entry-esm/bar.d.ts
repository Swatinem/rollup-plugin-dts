export * from "./foobar/index.js";
export * from "./foobaz.js";

declare module "./foo.js" {
  interface Foo {
    foo2: string;
  }
}

export interface Bar {
  bar: string;
}
