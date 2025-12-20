export const generatePackageJson = (slug, dependencies = {}, devDependencies = {}) => JSON.stringify({
  "name": slug,
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/server/index.cjs",
  "scripts": {
    "dev": "devvit playtest",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build --config client/vite.config.js",
    "build:server": "vite build --config server/vite.config.ts",
    "setup": "node scripts/setup.js", 
    "register": "devvit upload",
    "upload": "devvit upload",
    "validate": "node scripts/validate.js"
  },
  "dependencies": {
    "@devvit/web": "latest",
    "@devvit/public-api": "latest",
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

export const generateDevvitYaml = (slug) => `name: ${slug}
version: 0.1.0
webroot: webroot
main: dist/server/index.cjs
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
    outDir: '../webroot',
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
    "target": "es2020",
    "module": "es2020",
    "moduleResolution": "node",
    "lib": ["es2020", "dom"],
    "jsx": "react",
    "jsxFactory": "Devvit.createElement",
    "jsxFragmentFactory": "Devvit.Fragment",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "noImplicitAny": false
  },
  "include": [
    "src"
  ]
}, null, 2);

