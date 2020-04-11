interface A {}
declare class B {}
declare class Foo {
  private a;
  protected b: B;
  constructor(a: A, b: B);
}
export { Foo };
