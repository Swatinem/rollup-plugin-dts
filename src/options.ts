import type ts from "typescript";

export interface Options {
  /**
   * The plugin will by default flag *all* external libraries as `external`
   * (unless specified through includeExternal), and thus prevent them from be bundled.
   * If you set the `respectExternal` option to `true`, the plugin will not do
   * any default classification, but rather use the `external` option as
   * configured via rollup.
   */
  respectExternal?: boolean;
  /**
   * A list of external modules to include types from.
   */
  includeExternal?: Array<string>;
  /**
   * In case you want to use TypeScript path-mapping feature, using the
   * `baseUrl` and `paths` properties, you can pass in `compilerOptions`.
   */
  compilerOptions?: ts.CompilerOptions;
  /**
   * Path to tsconfig.json, by default, will try to load 'tsconfig.json'
   */
  tsconfig?: string;
}

export function resolveDefaultOptions(options: Options) {
  return {
    ...options,
    compilerOptions: options.compilerOptions ?? {},
    respectExternal: options.respectExternal ?? false,
    includeExternal: options.includeExternal ?? [],
  };
}

export type ResolvedOptions = ReturnType<typeof resolveDefaultOptions>;
