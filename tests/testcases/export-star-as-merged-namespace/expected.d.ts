declare namespace create {
  type Options = {
    size: number;
  };
}
declare function create(options: create.Options): void;
import foo_d_create = create;
declare namespace foo_d {
  export {
    foo_d_create as create,
  };
}
export { foo_d as foo };
