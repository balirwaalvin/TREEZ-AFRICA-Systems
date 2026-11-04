import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// The site itself is plain files in public/, which Vite copies to the build unchanged.
export default defineConfig({
  plugins: [cloudflare()],
});
