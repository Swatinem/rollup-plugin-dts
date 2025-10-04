import * as Foo from "./foo";

export namespace Bar {
  // Basic import alias inside namespace
  import Baz = Foo.AnInterface;
  export type Qux = Baz;
}
