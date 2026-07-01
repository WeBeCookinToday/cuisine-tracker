import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps asset URLs relative so the build works both at a domain
// root and under a GitHub Pages project path (e.g. /cuisine-tracker/).
export default defineConfig({
  base: "./",
  plugins: [react()],
});
