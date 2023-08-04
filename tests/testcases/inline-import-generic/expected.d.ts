interface Bar<T> {
  t: T;
}
interface Foo {
  bar: Bar<number>;
}
export type { Foo };
