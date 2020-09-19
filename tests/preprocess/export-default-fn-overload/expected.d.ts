declare function _export_default(): number;
declare function _export_default(constructor: Function): void;
declare function _export_default(name: string, descriptor: PropertyDescriptor): string;

// conflicting name:
declare const export_default: number;

export default _export_default;
export { export_default };
