import { inspect } from 'util';
declare const b: "b";
declare const deep: { deep: { a: "deep" } };
declare class Test {
  [inspect.custom](): string;
  [b](): string;
  [deep.deep.a]: string;
}
export { Test };
