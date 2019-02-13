import { A, B, C, D, E } from "./foo";

export default class Foo extends A {
  b: B;

  constructor(c: C) {
    super();
  }

  method(d: D): E {
    throw new Error();
  }
}
