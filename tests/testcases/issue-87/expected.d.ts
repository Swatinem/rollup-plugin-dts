declare const uniqueId: (prefix?: string) => string;
interface Cache {
  destroy: () => void;
}
declare const Cache: () => Cache;
interface CacheInfo {
  id: number;
}
interface Cache2 {
  add: (info: CacheInfo) => boolean;
  destroy: () => void;
}
declare const Cache2: () => Cache2;
export { Cache, Cache2, type CacheInfo, uniqueId };
