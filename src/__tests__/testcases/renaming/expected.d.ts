interface A {
}
interface B {
}
interface C {
}
interface D {
}
interface E {
}
interface F {
}
declare class Parent {
}
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
interface A$1 {
}
interface B$1 {
}
interface C$1 {
}
interface D$1 {
}
interface E$1 {
}
interface F$1 {
}
declare class Parent$1 {
}
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
export { Klass as AKlass, Interface as AInterface, Func as AFunc, Type as AType, Klass$1 as BKlass, Interface$1 as BInterface, Func$1 as BFunc, Type$1 as BType };
