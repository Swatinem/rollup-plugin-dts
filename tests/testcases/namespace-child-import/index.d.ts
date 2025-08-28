import * as Foo from "./foo";

export namespace Bar {
  import Baz = Foo.AnInterface;
  export type Qux = Baz;
}
