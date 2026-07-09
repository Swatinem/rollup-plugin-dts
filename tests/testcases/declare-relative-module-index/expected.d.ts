interface U {
  base: boolean;
}
declare function main(): U;
declare module "./index" {
  interface U {
    augmented: number;
  }
}
export { main };
export type { U };
