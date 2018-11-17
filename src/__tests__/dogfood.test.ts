import { rollup } from "rollup";
import dts from "../";
import path from "path";

const ROOT = path.join(__dirname, "..", "..");

it("should compile its own type definitions", async () => {
  const bundle = await rollup({
    input: path.join(ROOT, "src", "index.ts"),
    plugins: [dts({ tsconfig: ROOT })],
    external: ["typescript", "rollup"],
  });
  const { code } = await bundle.generate({ format: "es" });

  console.log(code);
});
