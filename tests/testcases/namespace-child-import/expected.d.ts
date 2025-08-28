interface AnInterface {
  prop: number;
}
declare namespace Bar {
  type Baz = AnInterface;
  export type Qux = Baz;
}
export { Bar };
