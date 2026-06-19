import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

const isVercel = Boolean(process.env.VERCEL);

export default defineConfig({
  server: {
    port: 5173,
  },
  plugins: [
    ...tanstackStart({
      server: { entry: "server" },
    }),
    nitro(
      isVercel
        ? {
            preset: "vercel",
            vercel: {
              functions: {
                maxDuration: 60,
              },
            },
          }
        : {},
    ),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
