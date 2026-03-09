import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const useTauriMock = env.VITE_TAURI_MOCK === "true" || mode === "mock";

  return {
    plugins: [svelte()],
    clearScreen: false,
    resolve: {
      alias: useTauriMock
        ? {
            "@tauri-apps/api/core": fileURLToPath(new URL("./src/mocks/tauri/core.ts", import.meta.url)),
            "@tauri-apps/plugin-dialog": fileURLToPath(
              new URL("./src/mocks/tauri/plugin-dialog.ts", import.meta.url)
            )
          }
        : undefined
    },
    server: {
      strictPort: true,
      port: 1420
    }
  };
});
