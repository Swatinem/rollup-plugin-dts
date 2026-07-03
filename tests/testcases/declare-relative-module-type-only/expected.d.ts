interface Other {
  base: string;
}
interface Foo {
  someProp: boolean;
}
declare namespace ns {
  export type { Foo };
}
declare function useOther(): Other;
declare module "./index" {
  interface Other {
    extra: number;
  }
}
export { ns, useOther };
export type { Foo, Other };
