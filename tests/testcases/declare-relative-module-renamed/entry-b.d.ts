export type { Foo as FooA } from "./foo-a";
export type { Foo as FooB } from "./foo-b";

declare module "./foo-b" {
  interface Foo {
    extra: number;
  }
}
