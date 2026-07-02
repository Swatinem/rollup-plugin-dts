// entry-a.d.ts
interface Foo$1 {
  a: string;
}
interface Foo {
  b: string;
}
export type { Foo$1 as FooA, Foo as FooB };
// entry-b.d.ts
export { FooA, FooB } from './entry-a.js';
declare module "./foo-b" {
  interface Foo {
    extra: number;
  }
}
