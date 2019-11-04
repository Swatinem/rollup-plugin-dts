interface A {
}
declare function b(): void;
declare class C {
}
declare enum D {
    A = 0,
    B = 1
}
declare const E: string;
type defs_A = A;
declare const defs_b: typeof b;
type defs_C = C;
declare const defs_C: typeof C;
type defs_D = D;
declare const defs_D: typeof D;
declare const defs_E: typeof E;
declare namespace defs {
  export {
    defs_A as A,
    defs_b as b,
    defs_C as C,
    defs_D as D,
    defs_E as E,
  };
}
declare namespace deep {
  export {
    defs as ns,
  };
}
type onlyOne_A = A;
declare namespace onlyOne {
  export {
    onlyOne_A as A,
  };
}
interface WithA {
    a: A;
}
export { WithA, deep, defs as ns, onlyOne };
