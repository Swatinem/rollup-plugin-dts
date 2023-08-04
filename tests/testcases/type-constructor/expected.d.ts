interface A {}
interface B {}
interface C {}
declare type Foo = new (a: A, b: B) => C;
export type { Foo };
