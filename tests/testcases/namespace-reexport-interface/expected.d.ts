// Source namespace with interface and nested namespace
declare namespace ArrayObjectStore {
  export interface Data {
    id: string;
    value: number;
  }
  namespace Util {
    export function helper(): void;
  }
}
// Re-export interface and namespace from another namespace
// `import` maintains interface semantics, while `type` would create type alias
declare namespace CrudArrayObjectStore {
  export import Data = ArrayObjectStore.Data;
  export import Util = ArrayObjectStore.Util;
}
export { CrudArrayObjectStore };
