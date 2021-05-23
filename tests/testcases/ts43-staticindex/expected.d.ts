interface StaticT {}
declare class Foo {
  static hello: string;
  static world: number;
  static [propName: string]: string | number | StaticT;
}
export { Foo };
