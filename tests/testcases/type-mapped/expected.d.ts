interface A {}
interface B {}
declare type Foo = {
  [P in keyof A]: B[P];
};
export type { Foo };
