declare const Aprop: "a";
declare const Dprop: unique symbol;
interface A {}
interface B {}
interface C {}
interface D {}
type Klass = {
  [Aprop]?: A[];
  ["B"]: B;
  [0]: C;
  [Dprop]: D;
};
export type { Klass };
