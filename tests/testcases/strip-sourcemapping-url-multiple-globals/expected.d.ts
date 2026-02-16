declare global {
  interface Window {
    __FEATURE_A__: boolean;
  }
}
declare const featureA: boolean;
declare global {
  interface Window {
    __FEATURE_B__: boolean;
  }
}
declare const featureB: boolean;
declare const flags: {
  a: typeof featureA;
  b: typeof featureB;
};
export { flags };
