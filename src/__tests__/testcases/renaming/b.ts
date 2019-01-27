interface A {}
interface B {}
interface C {}
interface D {}
interface E {}
interface F {}

class Parent {}

export class Klass extends Parent {
  a: A;
}

export interface Interface extends B {
  c: C;
}

export function Func(d: D): E {
  return;
}

export type Type = {
  f: F;
};
