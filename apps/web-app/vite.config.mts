import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileSystemPlugin } from "./src-vite/fileSystemPlugin";

export default defineConfig({
  plugins: [svelte(), fileSystemPlugin()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1422
  }
});
