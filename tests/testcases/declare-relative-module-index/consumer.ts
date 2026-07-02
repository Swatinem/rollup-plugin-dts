import { main } from "lib";

const u = main();

export const base: boolean = u.base;

// the "./utils" augmentation is rewritten to the chunk and must apply
export const augmented: number = u.augmented;
