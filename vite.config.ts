import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defaultMetadata, metadataTags } from "./src/lib/seo/metadata";
import { DEFAULT_SITE_ORIGIN, escapeMarkup, siteOrigin } from "./src/lib/seo/site";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const origin = siteOrigin(env.VITE_SITE_ORIGIN || DEFAULT_SITE_ORIGIN);
  return {
    plugins: [react(), tailwindcss(), {
      name: "ccs-generic-metadata",
      transformIndexHtml(html) {
        const metadata = defaultMetadata();
        const tags = Object.entries(metadataTags(metadata, origin)).flatMap(([key, value]) => value === undefined ? [] : [
          `<meta ${key.startsWith("og:") || key.startsWith("article:") ? "property" : "name"}="${key}" content="${escapeMarkup(value)}" />`,
        ]);
        return html.replace("<!-- CCS_METADATA -->", [`<title>${escapeMarkup(metadata.title)}</title>`, ...tags].join("\n    "));
      },
    }],
    define: { "import.meta.env.VITE_SITE_ORIGIN": JSON.stringify(origin) },
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    publicDir: "static",
    server: {
      port: 3000,
      open: true,
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      },
    },
    preview: {
      host: "localhost",
      port: 3000,
    },
  };
});
