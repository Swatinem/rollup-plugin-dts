declare const uniqueId: (prefix?: string) => string;
declare interface Cache {
  destroy: () => void;
}
declare const Cache: () => Cache;
declare interface CacheInfo {
  id: number;
}

declare interface Cache2 {
  add: (info: CacheInfo) => boolean;
  destroy: () => void;
}
declare const Cache2: () => Cache2;

import b from "./b";

declare function autobind(): typeof b;
declare function autobind(constructor: Function): void;
declare function autobind(prototype: typeof b, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
declare function unused(): ClassDecorator | MethodDecorator;
declare function unused(constructor: Function): void;
declare function unused(prototype: Object, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;

export { Cache, uniqueId, Cache2, CacheInfo, unused };
