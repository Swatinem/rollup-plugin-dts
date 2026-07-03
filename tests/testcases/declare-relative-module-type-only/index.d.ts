import type { Other } from "./other";

export interface Foo {
  someProp: boolean;
}

export declare namespace ns {
  export { Foo };
}

export declare function useOther(): Other;

export type { Other };

declare module "./other" {
  interface Other {
    extra: number;
  }
}
