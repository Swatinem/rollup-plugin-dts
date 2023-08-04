import * as rollup from 'rollup';
import * as typescript from 'typescript';
type TypeScript = typeof typescript;
interface Test {
  rollup: rollup.RollupOptions;
}
export type { Test, TypeScript };
