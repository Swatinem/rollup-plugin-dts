type T = { one: 1 };
type U = { two: 2 };
declare namespace component {
  export type { T };
  export type { U as V };
}
export { component };
