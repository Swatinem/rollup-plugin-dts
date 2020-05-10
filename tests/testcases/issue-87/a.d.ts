export interface Cache {
  destroy: () => void;
}
export declare const uniqueId: (prefix?: string) => string;
export declare const Cache: () => Cache;
