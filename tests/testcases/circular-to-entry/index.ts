import Foo from "./Foo";

export default class FooManager {
  foos: Array<Foo>;
  constructor() {
    this.foos = [new Foo(this)];
    // ...
  }
}
