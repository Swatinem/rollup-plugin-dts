import type { U } from "./utils";

export declare function main(): U;

export type { U };

declare module "./utils" {
  interface U {
    augmented: number;
  }
}
