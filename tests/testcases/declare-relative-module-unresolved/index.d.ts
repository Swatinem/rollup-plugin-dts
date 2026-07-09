export interface Config {
  base: string;
}

export declare function getConfig(): Config;

declare module "./orphan" {
  interface Config {
    fromAugmentation: string;
  }
}

declare module "./logo.svg" {
  const url: string;
  export { url };
}
