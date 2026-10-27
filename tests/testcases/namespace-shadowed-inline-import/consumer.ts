import { A, B } from "lib";

const result: A = B.b();
const local: B.A = { y: 1 };
export const p: number = result.p;
export const y: number = local.y;
