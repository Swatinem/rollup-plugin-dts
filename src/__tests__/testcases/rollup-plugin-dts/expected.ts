import { CompilerOptions } from 'typescript';
import { Plugin } from 'rollup';

interface Options {
    include?: Array<string>;
    exclude?: Array<string>;
    tsconfig?: string;
    compilerOptions?: CompilerOptions;
}
declare function dts(options?: Options): Plugin;

export default dts;
