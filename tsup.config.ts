import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/react/index.ts",
    vanilla: "src/vanilla/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  treeshake: true,
  sourcemap: true,
  clean: true,
  minify: false,
  target: "es2020",
  external: ["react", "react-dom"],
})
