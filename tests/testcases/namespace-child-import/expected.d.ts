interface AnInterface {
  prop: number;
}
declare namespace Bar {
  // Basic import alias inside namespace
  import Baz = AnInterface;
  export type Qux = Baz;
}
export { Bar };
