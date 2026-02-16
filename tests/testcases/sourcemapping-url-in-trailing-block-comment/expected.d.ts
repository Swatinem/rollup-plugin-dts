declare global {
  interface Window {
    __TEST__: string;
  }
}
declare const value: string;
declare const result: typeof value;
export { result };
