import { defineConfig } from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"

export default defineConfig({
  // mupdf locates its .wasm via import.meta.url relative to its own dist files:
  // keep it un-prebundled in dev, and copy the wasm next to the build output's
  // assets (where the bundled chunk's import.meta.url points) for build.
  optimizeDeps: { exclude: ["mupdf"] },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "node_modules/mupdf/dist/mupdf-wasm.wasm", dest: "assets" },
        { src: "node_modules/mupdf/dist/mupdf-wasm.js", dest: "assets" },
      ],
    }),
  ],
})
