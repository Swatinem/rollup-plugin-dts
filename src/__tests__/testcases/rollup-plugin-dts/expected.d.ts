import { Plugin } from 'rollup';
import { CompilerOptions } from 'typescript';
declare enum CompileMode {
    Types = "dts",
    Js = "js"
}
interface Options {
    include?: Array<string>;
    exclude?: Array<string>;
    tsconfig?: string;
    compilerOptions?: CompilerOptions;
    compileMode?: CompileMode;
}
declare function plugin(options?: Options): Plugin;
declare function dts(options?: Options): Plugin;
declare function js(options?: Options): Plugin;
export default plugin;
export { CompileMode, plugin, dts, js, js as ts };
