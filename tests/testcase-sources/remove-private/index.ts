interface A {}
class B {}

export class Foo {
  private a: A;
  protected b = new B();

  private ma() {
    this.a;
  }

  protected mb() {
    this.ma();
  }
}
