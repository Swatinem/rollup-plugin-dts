interface Cache {
  destroy: () => void;
}
declare const Cache: () => Cache;
declare const uniqueId: (prefix?: string) => string;
interface Cache2 {
  add: (info: CacheInfo) => boolean;
  destroy: () => void;
}
declare const Cache2: () => Cache2;
interface CacheInfo {
  id: number;
}
export { Cache, Cache2, CacheInfo, uniqueId };
