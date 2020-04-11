export interface Shadowed1 {}
export interface Shadowed2 {}
export interface Shadowed3 {}
export interface Shadowed4 {}
export interface Referenced1 {}
export interface Referenced2 {}
export declare namespace ns {
  class Shadowed1 {}
  enum Shadowed2 {}
  type Shadowed3 = undefined;
  function Shadowed4(): void;
  interface A {
    a: Referenced1;
    b: Shadowed1;
    c: Shadowed2;
    d: Shadowed3;
    e: typeof Shadowed4;
  }
  namespace childNS {
    export { Referenced2 as ref };
  }
}
