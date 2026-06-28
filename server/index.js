import express from "express";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initNeo4j, neo4jEnabled, mirrorComplaint } from "./neo4j.js";
import rateLimit from "express-rate-limit";

const PORT = process.env.PORT || 8787;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const CLAUDE_RATE_MAX = Number(process.env.CLAUDE_RATE_MAX || 20); // req/min/IP
const BODY_LIMIT = process.env.BODY_LIMIT || "100kb";              // request body cap

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "complaints.json");

/* Simple JSON file store — mirrors the in-memory complaint shape from
   src/NyayaLoop.jsx. Not a DB; just survives a reload. */
function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE_FILE, "utf8")); }
  catch { return null; } // no file yet / unreadable -> caller decides
}
function writeStore(complaints) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(complaints, null, 2));
}

const app = express();
app.use(express.json({ limit: BODY_LIMIT }));

/* Rate-limit the one route that spends money. A deployed instance can't be
   hammered to drain the API key. Health + JSON store routes are untouched. */
const claudeLimiter = rateLimit({
  windowMs: 60_000,
  max: CLAUDE_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate limit exceeded — try again in a minute" },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, keyLoaded: Boolean(ANTHROPIC_API_KEY) });
});

/* GET returns the persisted collection; POST replaces it (full-array upsert),
   so escalation/resolve state survives a reload, not just new filings. */
app.get("/api/complaints", (_req, res) => {
  const stored = readStore();
  res.json(Array.isArray(stored) ? stored : []);
});

app.post("/api/complaints", (req, res) => {
  const body = req.body;
  const complaints = Array.isArray(body) ? body : body && body.complaints;
  if (!Array.isArray(complaints)) {
    return res.status(400).json({ error: "expected an array of complaints" });
  }
  try {
    writeStore(complaints);
    // NEO4J seam: mirror into the graph when enabled. Fire-and-forget — the
    // JSON store stays the source of truth, so a DB hiccup never fails the write.
    if (neo4jEnabled()) {
      for (const c of complaints) mirrorComplaint(c);
    }
    res.json({ ok: true, count: complaints.length });
  } catch (err) {
    res.status(500).json({ error: err.message || "failed to write store" });
  }
});

/* Proxies a single Claude messages call. The browser never sees the API key. */
app.post("/api/claude", claudeLimiter, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
  }
  const { prompt, maxTokens } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "prompt is required" });
  }
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens || 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data?.error?.message || "Anthropic API error" });
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    res.json({ text });
  } catch (err) {
    res.status(502).json({ error: err.message || "upstream request failed" });
  }
});

app.listen(PORT, () => {
  console.log(`NyayaLoop API proxy listening on http://localhost:${PORT}`);
  initNeo4j(); // no-op unless USE_NEO4J=true and vars are set
});
