declare const Mode: number;
type Mode = "a" | "b";
type Status = {
  code: number;
};
declare const Status: Status;
type foo_d_Mode = Mode;
declare const foo_d_Mode: typeof Mode;
type foo_d_Status = Status;
declare const foo_d_Status: typeof Status;
declare namespace foo_d {
  export {
    foo_d_Mode as Mode,
    foo_d_Status as Status,
  };
}
export { foo_d as foo };
