import * as Store from './types';

// Re-export interface and namespace from another namespace
// `import` maintains interface semantics, while `type` would create type alias
export namespace CrudArrayObjectStore {
  export import Data = Store.ArrayObjectStore.Data;
  export import Util = Store.ArrayObjectStore.Util;
}
