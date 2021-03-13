declare namespace defs_d {

export declare function b(): void;
export declare class C {}
export declare enum D {
  A = 0,
  B = 1,
}
export declare const E: string;
export declare type F = string;

}
declare namespace deep_d {


}
declare namespace onlyOne_d {

export export interface A {}

}

interface WithA {
  a: A;
}

export { WithA, deep_d as deep, defs_d as ns, onlyOne_d as onlyOne };
