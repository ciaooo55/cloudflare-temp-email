import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import wasm from "vite-plugin-wasm";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: './dist',
  },
  plugins: [
    vue(),
    wasm(),
    AutoImport({
      imports: [
        'vue',
        {
          'naive-ui': [
            'useMessage',
            'useNotification',
            'NButton',
            'NPopconfirm',
            'NIcon',
          ]
        }
      ]
    }),
    Components({
      resolvers: [NaiveUiResolver()]
    }),
    VitePWA({
      registerType: null,
      devOptions: {
        enabled: false
      },
      workbox: {
        disableDevLogs: true,
        // Precache the shell only; lazy tools are cached when actually opened.
        globPatterns: ['index.html', 'assets/index-*.{js,css}', '*.{ico,png,svg}'],
        runtimeCaching: [
          {
            // 页面导航：优先网络（保证拿到最新版），断网时回退缓存
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'page-cache' },
          },
          {
            // 静态资源：缓存优先（哈希文件名，部署后自动换新名失效）
            urlPattern: ({ request, url, sameOrigin }) => sameOrigin && (
              ['script', 'style', 'image', 'font'].includes(request.destination)
              || url.pathname.endsWith('.wasm')
            ),
            handler: 'CacheFirst',
            options: {
              cacheName: 'asset-cache',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Temp Email',
        short_name: 'Temp Email',
        description: 'Temp Email - Temporary Email',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url))
      }
    ]
  },
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(process.env.npm_package_version),
  }
})
