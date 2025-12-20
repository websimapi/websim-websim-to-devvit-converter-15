import JSZip from 'jszip';
import { 
    cleanName, 
    AssetAnalyzer 
} from './processors.js';

import { WebSimDetector } from './websim-detector.js';

import {
    generatePackageJson,
    generateDevvitYaml,
    generateViteConfig,
    tsConfig,
    simpleLoggerJs,
    websimStubsJs,
    websimPackageJs,
    jsxDevProxy,
    validateScript,
    setupScript,
    generateReadme,
    websimToDevvitPolyfill,
    generateServerIndexTs,
    generateServerPostTs
} from './templates.js';

export async function generateDevvitZip(projectMeta, assets, includeReadme = true) {
    const zip = new JSZip();
    
    const safeId = projectMeta.project.id ? projectMeta.project.id.slice(0, 6) : '000000';
    const rawSlug = projectMeta.project.slug || "websim-game";
    const projectSlug = cleanName(`${rawSlug}-${safeId}`);
    const projectTitle = projectMeta.project.title || "WebSim Game";

    // Initialize Analyzers
    const analyzer = new AssetAnalyzer();
    const websimDetector = new WebSimDetector();
    const clientFiles = {};

    console.log('[Generator] Starting WebSim → Devvit conversion...');

    // 1. Process Assets for Client Folder
    for (const [path, content] of Object.entries(assets)) {
        if (path.includes('..')) continue;

        if (/\.(js|mjs|ts|jsx|tsx)$/i.test(path)) {
            const processedJS = analyzer.processJS(content, path);
            const { code: finalCode } = websimDetector.processScript(processedJS, path);
            clientFiles[path] = finalCode;
        } else if (path.endsWith('.html')) {
            const { html, extractedScripts } = analyzer.processHTML(content, path.split('/').pop());
            extractedScripts.forEach(script => {
                const { code } = websimDetector.processScript(script.content, script.filename);
                script.content = code;
            });
            const finalHtml = websimDetector.processHTML(html, path);
            clientFiles[path] = finalHtml;
            extractedScripts.forEach(script => {
                const parts = path.split('/');
                parts.pop();
                const dir = parts.join('/');
                const fullPath = dir ? `${dir}/${script.filename}` : script.filename;
                clientFiles[fullPath] = script.content;
            });
        } else if (path.endsWith('.css')) {
            clientFiles[path] = analyzer.processCSS(content, path);
        } else {
            clientFiles[path] = content;
        }
    }

    // 2. Config Files (Root)
    const hasRemotion = !!analyzer.dependencies['remotion'];
    const hasReact = hasRemotion || !!analyzer.dependencies['react'];

    const extraDevDeps = {};
    if (hasReact) {
        extraDevDeps['@vitejs/plugin-react'] = '^4.2.0';
        extraDevDeps['@babel/core'] = '^7.23.0';
        extraDevDeps['@babel/preset-react'] = '^7.23.0';
    }

    zip.file("package.json", generatePackageJson(projectSlug, analyzer.dependencies, extraDevDeps));
    zip.file("devvit.yaml", generateDevvitYaml(projectSlug));
    zip.file(".gitignore", "node_modules\n.devvit\ndist\nwebroot");
    
    // Root TSConfig (Generic)
    zip.file("tsconfig.json", tsConfig);

    // Root Devvit entrypoint that forwards to our server main
    zip.file("main.ts", `export { default } from "./src/server/main.ts";\n`);

    if (includeReadme) {
        const baseReadme = generateReadme(projectTitle, `https://websim.ai/p/${projectMeta.project.id}`);
        const migrationNotes = websimDetector.generateMigrationNotes();
        zip.file("README.md", baseReadme + '\n\n' + migrationNotes);
    }

    zip.file("scripts/setup.mjs", setupScript);
    zip.file("scripts/validate.mjs", validateScript);

    // 3. Project Structure
    const srcFolder = zip.folder("src");
    const clientFolder = srcFolder.folder("client");
    const serverFolder = srcFolder.folder("server");
    const sharedFolder = srcFolder.folder("shared");

    // --- Client Setup (src/client) ---
    // Client Vite Config
    clientFolder.file("vite.config.mjs", generateViteConfig({ hasReact, hasRemotion }));

    for (const [path, content] of Object.entries(clientFiles)) {
        clientFolder.file(path, content);
    }

    // Default Assets
    const emptyPng = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
        0x42, 0x60, 0x82
    ]);
    
    if (!clientFiles['splash.png']) clientFolder.file("splash.png", emptyPng);
    if (!clientFiles['icon.png']) clientFolder.file("icon.png", emptyPng);

    // Client Polyfills
    clientFolder.file("logger.js", simpleLoggerJs);
    clientFolder.file("websim_stubs.js", websimStubsJs);
    clientFolder.file("websim_package.js", websimPackageJs);
    clientFolder.file("jsx-dev-proxy.js", jsxDevProxy);
    clientFolder.file("devvit-client.js", websimToDevvitPolyfill);

    if (hasRemotion) {
        clientFolder.file("remotion_bridge.js", `export * from 'remotion';\nexport { Player } from '@remotion/player';`);
    }

    // --- Server Setup (src/server) ---
    serverFolder.file("main.ts", generateServerIndexTs());
    const coreFolder = serverFolder.folder("core");
    coreFolder.file("post.ts", generateServerPostTs(projectTitle));

    // --- Shared Setup (src/shared) ---
    sharedFolder.file("types.ts", "export type ApiRequest = { method: string };");

    const blob = await zip.generateAsync({ type: "blob" });
    return { blob, filename: `${projectSlug}-devvit.zip` };
}

