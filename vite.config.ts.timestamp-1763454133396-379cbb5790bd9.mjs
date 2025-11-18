// vite.config.ts
import { defineConfig } from "file:///C:/projects/2025/json-editor/node_modules/.pnpm/vite@5.4.21_@types+node@24.10.1/node_modules/vite/dist/node/index.js";
import { svelte } from "file:///C:/projects/2025/json-editor/node_modules/.pnpm/@sveltejs+vite-plugin-svelt_061b9276e33fc85f6e9e3fec0e9113fa/node_modules/@sveltejs/vite-plugin-svelte/src/index.js";
var vite_config_default = defineConfig({
  plugins: [svelte()],
  // GitHub Pages를 위한 base URL 설정
  // 환경 변수가 없으면 기본값 '/' (로컬 개발용)
  base: process.env.VITE_BASE_URL || "/",
  // Vite options tailored for Tauri development
  clearScreen: false,
  // to make use of `TAURI_DEBUG` and other env variables
  envPrefix: ["VITE_", "TAURI_"],
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      // tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"]
    }
  },
  build: {
    // Tauri supports es2021
    target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxwcm9qZWN0c1xcXFwyMDI1XFxcXGpzb24tZWRpdG9yXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxwcm9qZWN0c1xcXFwyMDI1XFxcXGpzb24tZWRpdG9yXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9wcm9qZWN0cy8yMDI1L2pzb24tZWRpdG9yL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCB7IHN2ZWx0ZSB9IGZyb20gJ0BzdmVsdGVqcy92aXRlLXBsdWdpbi1zdmVsdGUnO1xyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBwbHVnaW5zOiBbc3ZlbHRlKCldLFxyXG5cclxuICAvLyBHaXRIdWIgUGFnZXNcdUI5N0MgXHVDNzA0XHVENTVDIGJhc2UgVVJMIFx1QzEyNFx1QzgxNVxyXG4gIC8vIFx1RDY1OFx1QUNCRCBcdUJDQzBcdUMyMThcdUFDMDAgXHVDNUM2XHVDNzNDXHVCQTc0IFx1QUUzMFx1QkNGOFx1QUMxMiAnLycgKFx1Qjg1Q1x1Q0VFQyBcdUFDMUNcdUJDMUNcdUM2QTkpXHJcbiAgYmFzZTogcHJvY2Vzcy5lbnYuVklURV9CQVNFX1VSTCB8fCAnLycsXHJcblxyXG4gIC8vIFZpdGUgb3B0aW9ucyB0YWlsb3JlZCBmb3IgVGF1cmkgZGV2ZWxvcG1lbnRcclxuICBjbGVhclNjcmVlbjogZmFsc2UsXHJcbiAgLy8gdG8gbWFrZSB1c2Ugb2YgYFRBVVJJX0RFQlVHYCBhbmQgb3RoZXIgZW52IHZhcmlhYmxlc1xyXG4gIGVudlByZWZpeDogWydWSVRFXycsICdUQVVSSV8nXSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIHBvcnQ6IDUxNzMsXHJcbiAgICBzdHJpY3RQb3J0OiBmYWxzZSxcclxuICAgIHdhdGNoOiB7XHJcbiAgICAgIC8vIHRlbGwgdml0ZSB0byBpZ25vcmUgd2F0Y2hpbmcgYHNyYy10YXVyaWBcclxuICAgICAgaWdub3JlZDogWycqKi9zcmMtdGF1cmkvKionXSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBidWlsZDoge1xyXG4gICAgLy8gVGF1cmkgc3VwcG9ydHMgZXMyMDIxXHJcbiAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LlRBVVJJX1BMQVRGT1JNID09ICd3aW5kb3dzJyA/ICdjaHJvbWUxMDUnIDogJ3NhZmFyaTEzJyxcclxuICAgIC8vIGRvbid0IG1pbmlmeSBmb3IgZGVidWcgYnVpbGRzXHJcbiAgICBtaW5pZnk6ICFwcm9jZXNzLmVudi5UQVVSSV9ERUJVRyA/ICdlc2J1aWxkJyA6IGZhbHNlLFxyXG4gICAgLy8gcHJvZHVjZSBzb3VyY2VtYXBzIGZvciBkZWJ1ZyBidWlsZHNcclxuICAgIHNvdXJjZW1hcDogISFwcm9jZXNzLmVudi5UQVVSSV9ERUJVRyxcclxuICB9LFxyXG59KTtcclxuXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBOFEsU0FBUyxvQkFBb0I7QUFDM1MsU0FBUyxjQUFjO0FBR3ZCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxPQUFPLENBQUM7QUFBQTtBQUFBO0FBQUEsRUFJbEIsTUFBTSxRQUFRLElBQUksaUJBQWlCO0FBQUE7QUFBQSxFQUduQyxhQUFhO0FBQUE7QUFBQSxFQUViLFdBQVcsQ0FBQyxTQUFTLFFBQVE7QUFBQSxFQUM3QixRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUE7QUFBQSxNQUVMLFNBQVMsQ0FBQyxpQkFBaUI7QUFBQSxJQUM3QjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQU87QUFBQTtBQUFBLElBRUwsUUFBUSxRQUFRLElBQUksa0JBQWtCLFlBQVksY0FBYztBQUFBO0FBQUEsSUFFaEUsUUFBUSxDQUFDLFFBQVEsSUFBSSxjQUFjLFlBQVk7QUFBQTtBQUFBLElBRS9DLFdBQVcsQ0FBQyxDQUFDLFFBQVEsSUFBSTtBQUFBLEVBQzNCO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
