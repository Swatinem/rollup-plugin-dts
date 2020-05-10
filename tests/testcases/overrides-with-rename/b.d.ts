import a from "./a";

export default function autobind(): typeof a;
export default function autobind(constructor: Function): void;
export default function autobind(prototype: typeof a, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
