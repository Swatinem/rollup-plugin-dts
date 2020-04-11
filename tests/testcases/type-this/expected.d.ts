declare class Foo {
  a: this;
}
declare function thisType(this: Foo): void;
export { thisType };
