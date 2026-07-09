import { getConfig } from "lib";

const config = getConfig();

export const base: string = config.base;

// @ts-expect-error -- the unresolved "./orphan" augmentation must stay dormant
// instead of merging into the chunk's own exported Config
export const fromAugmentation: string = config.fromAugmentation;
