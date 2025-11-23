import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    // Optional: helps with SPA routing if using client-side router
    historyApiFallback: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        hand: resolve(__dirname, "hand.html"),
      },
    },
  },
});
