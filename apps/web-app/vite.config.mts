import { sveltekit } from "@sveltejs/kit/vite";
import { fileSystemPlugin } from "./src-vite/fileSystemPlugin";

export default {
  plugins: [sveltekit(), fileSystemPlugin()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1422
  }
};
