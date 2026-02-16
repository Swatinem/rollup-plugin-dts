declare global {
  interface Window {
    __APP_VERSION__: string;
  }
}
declare const VERSION: string;
declare const appVersion: typeof VERSION;
export { appVersion };
