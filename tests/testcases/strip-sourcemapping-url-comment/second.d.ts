declare global {
  interface Window {
    __ENVIRONMENT__: Environment;
  }
}
declare enum Environment {
  Development = "development",
  Production = "production"
}
declare function getEnvironment(): Environment;

export { Environment, getEnvironment };
//# sourceMappingURL=second.d.ts.map
