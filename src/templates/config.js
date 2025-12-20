export const generatePackageJson = (slug, dependencies = {}, devDependencies = {}) => JSON.stringify({
  "name": slug,
  "version": "0.1.0",
  "private": true,
  "main": "src/main.ts",
  "scripts": {
    "dev": "npm run build && devvit playtest",
    "build": "npm run build:client",
    "build:client": "vite build --config src/client/vite.config.mjs",
    "setup": "node scripts/setup.mjs", 
    "register": "devvit upload",
    "upload": "npm run build && devvit upload",
    "validate": "node scripts/validate.mjs"
  },
  "dependencies": {
    "@devvit/web": "latest",
    "@devvit/public-api": "latest",
    "@devvit/reddit": "latest",
    "@devvit/redis": "latest",
    "express": "^4.18.2",
    ...dependencies
  },
  "devDependencies": {
    "devvit": "latest",
    "@types/express": "^4.17.17",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "terser": "^5.19.0",
    ...devDependencies
  }
}, null, 2);

export const generateDevvitYaml = (slug) => `name: "${slug}"
version: 0.1.0
webroot: webroot
main: src/main.ts
permissions:
  - redis
  - realtime
  - reddit_api
  - http
`;

export const generateViteConfig = ({ hasReact = false, hasRemotion = false } = {}) => `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  mode: 'production',
  root: __dirname, // Ensure root is set to client/ directory
  base: './',
  plugins: [
    ${hasReact ? `react({
      jsxRuntime: 'automatic', 
      // Force production runtime even if code tries to import dev
      jsxImportSource: 'react',
      include: "**/*.{jsx,tsx,js,ts}",
      babel: {
        babelrc: false,
        configFile: false,
        plugins: []
      }
    }),` : ''}
  ],
  resolve: {
    alias: {
      // CRITICAL: Remotion and some React libs might try to import jsx-dev-runtime in 'dev' mode.
      // We alias to a local proxy that implements jsxDEV using the production jsx runtime.
      'react/jsx-dev-runtime': '/jsx-dev-proxy.js',
      'websim': '/websim_package.js'
    },
    // Ensure we prioritize browser builds
    mainFields: ['browser', 'module', 'main'],
  },
  assetsInclude: ['**/*.mp3', '**/*.wav', '**/*.ogg', '**/*.glb', '**/*.gltf', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif'],
  build: {
    outDir: '../../webroot',
    emptyOutDir: true,
    target: 'es2020',
    minify: 'esbuild',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
      // Ensure React is treated as a singleton
      external: [], 
    },
  },
  define: {
    // Hardcode production environment to prevent libs from taking dev paths
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.platform": JSON.stringify("browser"),
    // Remotion specific flags if needed
    "process.env.REMOTION_ENV": JSON.stringify("production"),
  },
  optimizeDeps: {
    include: [${hasReact ? "'react', 'react-dom'" : ""}, ${hasRemotion ? "'remotion', '@remotion/player'" : ""}]
  }
});
`;

export const tsConfig = JSON.stringify({
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": [
    "src"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "src/client"
  ]
}, null, 2);

