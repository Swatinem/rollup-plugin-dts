interface A {}
interface B {}
interface C {}
interface D {}
interface E {}
interface F {}
declare class Parent {}
export declare class Klass extends Parent {
  a: A;
}
export interface Interface extends B {
  c: C;
}
export declare function Func(d: D): E;
export declare type Type = {
  f: F;
};
export {};
