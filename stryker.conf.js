// @ts-nocheck

module.exports = function(config) {
  config.set({
    mutator: "typescript",
    packageManager: "npm",
    reporters: ["clear-text", "progress"],
    testRunner: "jest",
    // transpilers: ["typescript"],
    coverageAnalysis: "off",
    timeoutMS: 10000, // because some tests are super slow :-(
    tsconfigFile: "tsconfig.stryker.json",
    mutate: ["src/**/*.ts"],
  });
};
