interface A {}
interface B {}
interface C {}

export type Foo = new (a: A, b: B) => C;
