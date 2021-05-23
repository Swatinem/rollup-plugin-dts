import { StaticT } from "./foo";

export class Foo {
  static hello: string;
  static world: number;

  static [propName: string]: string | number | StaticT;
}
