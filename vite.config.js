import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        hand: resolve(__dirname, "hand.html"),
        avatar: resolve(__dirname, "avatar.html"),
      },
    },
  },
});
