import { Router, type IRouter, type Request, type Response } from "express";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import { openai } from "@workspace/integrations-openai-ai-server";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  parseAndValidateVectorCopilotPlan,
  validateVectorCopilotRequest,
} from "../lib/vectorCopilotPlan";

const router: IRouter = Router();
const sizes = new Set(["1024x1024", "1536x1024", "1024x1536"]);
const hour = 60 * 60 * 1000;
const sessionLimit = 3;
const ipLimit = 12;
const projectLimit = 50;
const copilotSessionLimit = 10;
const copilotIpLimit = 30;
const copilotProjectLimit = 150;
const buckets = new Map<string, { count: number; resetAt: number }>();
const secret = process.env.SESSION_SECRET;

if (!secret) throw new Error("SESSION_SECRET is required for AI generation access controls.");

const sign = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

const readCookies = (header = "") => Object.fromEntries(
  header.split(";").map(part => part.trim().split("=")).filter(parts => parts.length === 2),
);

const getSession = (req: Request) => {
  const signed = readCookies(req.headers.cookie).vs_ai_session;
  if (!signed) return null;
  const separator = signed.lastIndexOf(".");
  if (separator < 1) return null;
  const id = signed.slice(0, separator);
  return safeEqual(sign(id), signed.slice(separator + 1)) ? id : null;
};

const issueSession = (res: Response) => {
  const id = randomBytes(24).toString("base64url");
  res.cookie("vs_ai_session", `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * hour,
    path: "/api/ai",
  });
  return id;
};

const consume = (key: string, limit: number) => {
  const now = Date.now();
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + hour }
    : existing;
  if (bucket.count >= limit) return bucket.resetAt;
  bucket.count += 1;
  buckets.set(key, bucket);
  return null;
};

const sameOrigin = (req: Request) => {
  const origin = req.get("origin");
  if (!origin) return req.get("sec-fetch-site") === "same-origin" || process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
};

router.get("/ai/capabilities", (req, res) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: "AI generation is available only from this project." });
    return;
  }
  const sessionId = getSession(req) ?? issueSession(res);
  res.json({
    capabilityToken: sign(`capability:${sessionId}`),
    provider: "OpenAI via Replit AI Integrations",
    model: "gpt-image-1",
    limits: { generationsPerHour: sessionLimit },
  });
});

router.post("/ai/images", async (req, res) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: "AI generation is available only from this project." });
    return;
  }
  const sessionId = getSession(req);
  const capability = req.get("x-ai-capability") ?? "";
  if (!sessionId || !safeEqual(sign(`capability:${sessionId}`), capability)) {
    res.status(401).json({ error: "Refresh the AI workspace to renew generation access." });
    return;
  }
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const size = typeof req.body?.size === "string" && sizes.has(req.body.size)
    ? req.body.size as "1024x1024" | "1536x1024" | "1024x1536"
    : "1024x1024";

  if (prompt.length < 3 || prompt.length > 1500) {
    res.status(400).json({ error: "Prompt must be between 3 and 1500 characters." });
    return;
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const resetAt = consume(`session:${sessionId}`, sessionLimit)
    ?? consume(`ip:${ip}`, ipLimit)
    ?? consume("project", projectLimit);
  if (resetAt) {
    res.setHeader("Retry-After", Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
    res.status(429).json({ error: "The hourly image-generation limit has been reached. Existing review results remain available." });
    return;
  }

  try {
    const abortController = new AbortController();
    req.once("aborted", () => abortController.abort());
    const buffer = await generateImageBuffer(prompt, size, abortController.signal);
    if (!buffer.length) throw new Error("Provider returned an empty image.");
    res.json({
      image: `data:image/png;base64,${buffer.toString("base64")}`,
      provider: "OpenAI via Replit AI Integrations",
      model: "gpt-image-1",
      size,
    });
  } catch (error) {
    req.log.error({ err: error }, "AI image generation failed");
    res.status(503).json({
      error: "The image provider could not complete this request. Your document was not changed; retry when ready.",
    });
  }
});

router.post("/ai/vector-copilot", async (req, res) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: "AI copilot is available only from this project." });
    return;
  }
  const sessionId = getSession(req);
  const capability = req.get("x-ai-capability") ?? "";
  if (!sessionId || !safeEqual(sign(`capability:${sessionId}`), capability)) {
    res.status(401).json({ error: "Refresh the AI workspace to renew copilot access." });
    return;
  }
  const contentLength = Number(req.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > 200_000) {
    res.status(400).json({ error: "Copilot request exceeds the 200 KB safety limit." });
    return;
  }
  let serializedLength = 0;
  try {
    serializedLength = Buffer.byteLength(JSON.stringify(req.body), "utf8");
  } catch {
    res.status(400).json({ error: "Copilot request body must be valid JSON." });
    return;
  }
  if (serializedLength > 200_000) {
    res.status(400).json({ error: "Copilot request exceeds the 200 KB safety limit." });
    return;
  }
  const checked = validateVectorCopilotRequest(req.body);
  if (!checked.value) {
    res.status(400).json({ error: checked.error });
    return;
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const resetAt = consume(`copilot-session:${sessionId}`, copilotSessionLimit)
    ?? consume(`copilot-ip:${ip}`, copilotIpLimit)
    ?? consume("copilot-project", copilotProjectLimit);
  if (resetAt) {
    res.setHeader("Retry-After", Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
    res.status(429).json({ error: "The hourly copilot limit has been reached. No document changes were made." });
    return;
  }
  try {
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    req.once("aborted", abort);
    const timeout = setTimeout(abort, 60_000);
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5.6-terra",
        response_format: { type: "json_object" },
        max_completion_tokens: 4000,
        messages: [
          {
            role: "system",
            content: `You are Vector Studio's vector design planner. Return ONLY JSON matching this exact v1 contract:
{"version":1,"explanation":"string <=600","warnings":["string, <=10"],"operations":["<=40 operations"]}
Operations use the discriminator "op": select {op,ids}; update {op,ids,patch} where patch may contain only x,y,width,height,rotation,fill,stroke,strokeWidth,opacity,name; delete {op,ids}; duplicate {op,ids,offsetX?,offsetY?}; insert {op,objects}; group {op,ids}; ungroup {op,ids}; align {op,ids,alignment}; distribute {op,ids,axis}.
Inserted objects may only have type rect, ellipse, polygon, star, line, or path, plus name,x,y,width,height and optional rotation,fill,stroke,strokeWidth,opacity,rx,points,closed. Never create text or image objects and never emit imageSrc. Reference only object IDs supplied in the document. Never modify, delete, or group locked objects. Delete only when the user clearly asks for removal. Colors must be "none" or #rgb, #rrggbb, or #rrggbbaa. For type path, points is absolute SVG path data (M/L/C/Z commands); for type polygon, points is space-separated "x,y" coordinate pairs; both may contain only safe SVG path-data characters. When the request includes a non-empty selection, operate on the selected objects unless the prompt clearly says otherwise. Include a concise explanation and any warnings. Do not include markdown or fields outside the contract.`,
          },
          { role: "user", content: JSON.stringify(checked.value) },
        ],
      }, { signal: abortController.signal });
      const content = completion.choices[0]?.message.content;
      if (!content) throw new Error("Provider returned no copilot plan.");
      const plan = parseAndValidateVectorCopilotPlan(content, checked.value.document, checked.value.prompt, checked.value.selection);
      if (!plan.value) {
        res.status(502).json({ error: plan.error });
        return;
      }
      res.json({
        ...plan.value,
        provider: "OpenAI via Replit AI Integrations",
        model: "gpt-5.6-terra",
      });
    } finally {
      clearTimeout(timeout);
      req.off("aborted", abort);
    }
  } catch (error) {
    req.log.error({ err: error }, "AI vector copilot failed");
    res.status(503).json({ error: "The copilot provider could not complete this request. Your document was not changed; retry when ready." });
  }
});

export default router;