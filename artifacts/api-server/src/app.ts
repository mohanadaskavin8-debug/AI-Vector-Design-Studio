import express, { type Express } from "express";
import pinoHttp from "pino-http";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// The app is served same-origin through the path-routed proxy, so CORS is only
// ever legitimate from our own hosts. Never reflect arbitrary origins with
// credentials — that would let hostile sites issue authenticated API calls.
const ALLOWED_ORIGINS = (() => {
  const origins = new Set<string>();
  const hosts = [
    ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
    process.env.REPLIT_DEV_DOMAIN,
  ];
  for (const host of hosts) {
    const trimmed = host?.trim();
    if (trimmed) origins.add(`https://${trimmed}`);
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost");
    origins.add("http://127.0.0.1");
    origins.add("http://localhost:5000");
  }
  return origins;
})();
app.use(cors({
  credentials: true,
  origin: (origin, callback) => callback(null, !origin || ALLOWED_ORIGINS.has(origin)),
}));
// CSRF/origin guard: reject state-changing requests whose Origin is present
// and not ours. (cors() only withholds response headers; this blocks execution.)
app.use((req, res, next) => {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.status(403).json({ error: "Cross-origin request rejected." });
    return;
  }
  next();
});
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
