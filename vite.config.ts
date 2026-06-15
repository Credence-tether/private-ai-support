import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    target: "node",
    nitro: {
      preset: process.env.VERCEL
        ? "vercel"
        : process.env.NITRO_PRESET || "node-server",
    },
  },
});
