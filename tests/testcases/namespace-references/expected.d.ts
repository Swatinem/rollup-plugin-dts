interface Referenced1 {}
interface Referenced2 {}
declare namespace ns {
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
    export type { Referenced2 as ref };
  }
}
export { ns };
