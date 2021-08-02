interface A {}
interface B {}
interface C {}
interface D {}
interface E {}
interface F {}
declare class Foo {
  constructor(a: A);
  constructor(b: B);
  method(c: C): D;
  method(e: E): F;
}
export { Foo as default };
