declare global {
  interface Window {
    __ENVIRONMENT__: Environment;
  }
}
declare enum Environment {
  Development = "development",
  Production = "production"
}
declare const env: Environment;
export { Environment, env };
