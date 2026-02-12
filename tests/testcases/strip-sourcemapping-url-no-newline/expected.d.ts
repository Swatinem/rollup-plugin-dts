declare global {
  interface Window {
    __CONFIG__: Config;
  }
}
declare interface Config {
  debug: boolean;
}
declare const config: Config;
export { config };
