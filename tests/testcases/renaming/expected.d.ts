interface A$1 {}
interface B$1 {}
interface C$1 {}
interface D$1 {}
interface E$1 {}
interface F$1 {}
declare class Parent$1 {}
declare class Klass$1 extends Parent$1 {
  a: A$1;
}
interface Interface$1 extends B$1 {
  c: C$1;
}
declare function Func$1(d: D$1): E$1;
declare type Type$1 = {
  f: F$1;
};
interface A {}
interface B {}
interface C {}
interface D {}
interface E {}
interface F {}
declare class Parent {}
declare class Klass extends Parent {
  a: A;
}
interface Interface extends B {
  c: C;
}
declare function Func(d: D): E;
declare type Type = {
  f: F;
};
export { Func$1 as AFunc, type Interface$1 as AInterface, Klass$1 as AKlass, type Type$1 as AType, Func as BFunc, type Interface as BInterface, Klass as BKlass, type Type as BType };
