interface A {}
interface B {}
export declare type Foo = {
  [P in keyof A]: B[P];
};
export {};
