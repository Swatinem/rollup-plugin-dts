export interface Cache2 {
  add: (info: CacheInfo) => boolean;
  destroy: () => void;
}
export interface CacheInfo {
  id: number;
}
export declare const Cache2: () => Cache2;
