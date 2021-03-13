declare namespace __bar {

export interface IBar {}
export declare class Bar {}

}

interface Foo {
  ns: typeof __bar;
}

export { Foo };
