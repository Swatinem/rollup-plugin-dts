interface A {}
interface B {}
interface C {}
declare type Foo = (a: A, b: B) => C;
export type { Foo };
