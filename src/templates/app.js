export const generateServerIndexTs = () => `import { Devvit } from "@devvit/public-api";
import express from "express";
import {
    createServer,
    context,
    getServerPort,
    reddit,
    redis,
} from "@devvit/web/server";
import { createPost } from "./core/post";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const router = express.Router();

// 1. User Identity Endpoint
router.get("/api/me", async (_req, res) => {
    try {
        const username = await reddit.getCurrentUsername();
        if (username) {
            const snoovatarUrl = await reddit.getSnoovatarUrl(username);
            res.json({
                id: username, // WebSim compat
                username: username,
                name: username,
                avatar_url: snoovatarUrl ?? '/img/default_pfp.png',
                avatarUrl: snoovatarUrl ?? '/img/default_pfp.png', // WebSim compat
                status: "success",
            });
        } else {
            res.json({
                id: 'guest',
                username: "Guest",
                name: "Guest",
                avatar_url: '/img/default_pfp.png',
                avatarUrl: '/img/default_pfp.png',
                status: "success",
            });
        }
    } catch (error) {
        console.error("Error fetching current user:", error);
        res.status(500).json({ 
            status: "error", 
            message: "Failed to fetch user data.",
        });
    }
});

// 2. Database Endpoints
router.post("/api/db/set", async (req, res) => {
    const { key, value } = req.body;
    try {
        await redis.set(key, JSON.stringify(value));
        res.json({ status: "success" });
    } catch (error) {
        res.status(500).json({ status: "error", message: String(error) });
    }
});

router.get("/api/db/get/:key", async (req, res) => {
    try {
        const value = await redis.get(req.params.key);
        res.json({ value: value ? JSON.parse(value) : null });
    } catch (error) {
        res.status(500).json({ status: "error", message: String(error) });
    }
});

// Hash support for WebSim Collection Polyfill
router.post("/api/db/hset", async (req, res) => {
    const { key, fields } = req.body;
    try {
        await redis.hSet(key, fields);
        res.json({ status: "success" });
    } catch (error) {
        res.status(500).json({ status: "error", message: String(error) });
    }
});

router.get("/api/db/hgetall/:key", async (req, res) => {
    try {
        const data = await redis.hGetAll(req.params.key);
        res.json({ data: data || {} });
    } catch (error) {
        res.status(500).json({ status: "error", message: String(error) });
    }
});

// 3. Game State Endpoints
router.post("/api/game/save", async (req, res) => {
    const { state } = req.body;
    const username = await reddit.getCurrentUsername() ?? "anonymous";
    try {
        await redis.set(\`gamestate:\${username}\`, JSON.stringify(state));
        res.json({ status: "success" });
    } catch (error) {
        res.status(500).json({ status: "error", message: String(error) });
    }
});

router.get("/api/game/load", async (_req, res) => {
    const username = await reddit.getCurrentUsername() ?? "anonymous";
    try {
        const stateStr = await redis.get(\`gamestate:\${username}\`);
        res.json({ state: stateStr ? JSON.parse(stateStr) : null });
    } catch (error) {
        res.status(500).json({ status: "error", message: String(error) });
    }
});

// 4. Realtime Endpoints (Redis backed)
router.post("/api/realtime/send", async (req, res) => {
    const { channel, message } = req.body;
    const username = await reddit.getCurrentUsername() ?? "anonymous";
    const timestamp = Date.now();
    const msg = { ...message, senderId: username, timestamp };

    try {
        const key = \`messages:\${channel}\`;
        await redis.zAdd(key, {
             member: JSON.stringify(msg),
             score: timestamp
        });
        await redis.expire(key, 86400); // 24h retention
        res.json({ status: "success" });
    } catch (error) {
        res.status(500).json({ status: "error", message: String(error) });
    }
});

router.get("/api/realtime/get/:channel", async (req, res) => {
    const channel = req.params.channel;
    const since = parseInt(req.query.since as string) || 0;
    
    try {
        const key = \`messages:\${channel}\`;
        const msgs = await redis.zRangeByScore(key, since + 1, Infinity);
        const parsed = msgs.map(m => {
            try { return JSON.parse(m.member); } catch(e){ return null; }
        }).filter(Boolean);
        res.json({ messages: parsed });
    } catch (error) {
        res.status(500).json({ status: "error", message: String(error) });
    }
});

app.use(router);

const server = createServer(app);
server.listen(getServerPort());

Devvit.configure({
    redditAPI: true,
    http: true,
    menu: [
        {
            label: "Create Game Post",
            location: "subreddit",
            forUserType: "moderator",
            onPress: async (_event, context) => {
                const { ui } = context;
                try {
                    await createPost(context);
                    ui.showToast("Game post created!");
                } catch(e) {
                    console.error(e);
                    ui.showToast("Error creating post: " + e.message);
                }
            }
        }
    ]
});

export default Devvit;
`;

export const generateServerPostTs = (title) => `
export const createPost = async (context) => {
  const { reddit } = context;
  const subredditName = context.subredditName || (await reddit.getCurrentSubreddit()).name;
  
  if (!subredditName) {
    throw new Error("subredditName is required");
  }

  return await reddit.submitCustomPost({
    splash: {
      appDisplayName: '${title.replace(/'/g, "\\'")}',
      backgroundUri: 'splash.png',
      buttonLabel: 'Play Now',
      description: 'A WebSim game ported to Reddit',
      entryUri: 'index.html',
      heading: '${title.replace(/'/g, "\\'")}',
      appIconUri: 'icon.png',
    },
    postData: {
      gameState: 'initial',
    },
    subredditName: subredditName,
    title: "${title.replace(/'/g, "\\'")}",
  });
};
`;

export const generateServerViteConfig = () => `import { defineConfig } from "vite";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  ssr: {
    noExternal: true,
  },
  build: {
    emptyOutDir: false,
    ssr: "main.ts",
    outDir: "../dist",
    target: "node22",
    sourcemap: true,
    rollupOptions: {
      external: [...builtinModules],
      output: {
        format: "cjs",
        entryFileNames: "main.cjs",
        inlineDynamicImports: true,
      },
    },
  },
});
`;

export const generateServerTsConfig = () => JSON.stringify({
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "types": ["node"],
    "rootDir": ".",
    "outDir": "../../dist/types/server",
    "esModuleInterop": true,
    "strict": true
  },
  "include": ["**/*", "**/*.json"],
  "exclude": ["**/*.test.ts"]
}, null, 2);

