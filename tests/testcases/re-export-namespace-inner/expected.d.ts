declare namespace inner {
  type Ty = number;
  const num: number;
}
import mod_d_inner = inner;
declare namespace mod_d {
  export {
    mod_d_inner as inner,
  };
}
export { mod_d as outer };
