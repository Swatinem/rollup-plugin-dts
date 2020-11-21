import { Color, HorizontalAlignment, Quantity, VerticalAlignment } from "./foo";

export type SeussFish = `${Quantity | Color} fish`;
export declare function setAlignment(value: `${VerticalAlignment}-${HorizontalAlignment}`): void;
