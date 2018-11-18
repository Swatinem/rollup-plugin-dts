interface A {}
interface B {}
interface C {}
interface D {}
interface E {}
interface F {}

export default class Foo {
  constructor(a: A);
  constructor(b: B);

  constructor(ab: A | B) {}

  method(c: C): D;
  method(e: E): F;

  method(c: C | D): D | F {
    throw c;
  }
}
