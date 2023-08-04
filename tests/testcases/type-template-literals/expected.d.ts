type Color = "red" | "blue";
type Quantity = "one" | "two";
type VerticalAlignment = "top" | "middle" | "bottom";
type HorizontalAlignment = "left" | "center" | "right";
type SeussFish = `${Quantity | Color} fish`;
declare function setAlignment(value: `${VerticalAlignment}-${HorizontalAlignment}`): void;
export { type SeussFish, setAlignment };
