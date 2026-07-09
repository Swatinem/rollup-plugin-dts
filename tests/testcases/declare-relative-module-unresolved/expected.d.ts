interface Config {
  base: string;
}
declare function getConfig(): Config;
declare module "./orphan" {
  interface Config {
    fromAugmentation: string;
  }
}
declare module "./logo.svg" {
  const url: string;
  export { url };
}
export { getConfig };
export type { Config };
