import { RollupOptions } from 'rollup';
import * as typescript from 'typescript';
type TypeScript = typeof typescript;
interface Test {
  rollup: RollupOptions;
}
export { Test, TypeScript };
