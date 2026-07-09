import express from "express";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initNeo4j, neo4jEnabled, neo4jConnected, mirrorComplaint, getGraphStats } from "./neo4j.js";
import rateLimit from "express-rate-limit";
import { SarvamAIClient } from "sarvamai";

const PORT = process.env.PORT || 8787;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const CLAUDE_RATE_MAX = Number(process.env.CLAUDE_RATE_MAX || 20); // req/min/IP
const BODY_LIMIT = process.env.BODY_LIMIT || "100kb";              // request body cap

/* SARVAM seam — server-side Indic ASR proxy, guarded by USE_SARVAM. The browser
   records audio and posts it here; the key stays server-side, exactly like the
   Claude proxy. When the seam is off or misconfigured, /api/transcribe 503s and
   the frontend falls back to the browser recognizer, so voice always works. */
const truthy = (v) => String(v).toLowerCase() === "true";
const USE_SARVAM = truthy(process.env.USE_SARVAM);
const SARVAM_API_KEY = process.env.SARVAM_API_KEY || "";
const SARVAM_RATE_MAX = Number(process.env.SARVAM_RATE_MAX || 20); // req/min/IP
const AUDIO_BODY_LIMIT = process.env.AUDIO_BODY_LIMIT || "8mb";    // audio upload cap
const SARVAM_MODEL = process.env.SARVAM_MODEL || "saaras:v3";      // per Sarvam STT docs
const sarvamReady = USE_SARVAM && Boolean(SARVAM_API_KEY);
const sarvamClient = sarvamReady ? new SarvamAIClient({ apiSubscriptionKey: SARVAM_API_KEY }) : null;

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

/* Same discipline as the Claude limiter — transcribe hits a paid partner API. */
const sarvamLimiter = rateLimit({
  windowMs: 60_000,
  max: SARVAM_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate limit exceeded — try again in a minute" },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, keyLoaded: Boolean(ANTHROPIC_API_KEY), sarvam: sarvamReady });
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

/* Read-side graph endpoint — per-department unresolved load and the live
   escalation chains pressing on each official. A multi-hop traversal that's
   awkward in SQL but native to the property graph. 503s (not 500s) when the
   graph isn't connected, so the frontend can treat it as "feature off". */
app.get("/api/graph/stats", async (_req, res) => {
  if (!neo4jConnected()) {
    return res.status(503).json({ error: "neo4j graph not connected", connected: false });
  }
  try {
    const stats = await getGraphStats();
    res.json({ connected: true, ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message || "graph query failed", connected: true });
  }
});

/* SARVAM seam: transcribe browser-recorded audio via Sarvam's Indic ASR. The
   browser POSTs the raw audio blob (MediaRecorder → usually audio/webm) with a
   ?language=<BCP-47> hint; we forward it to Sarvam with the key held server-side
   and return { transcript }. 503s when the seam is off so the frontend falls
   back to the browser recognizer. Uses express.raw (not express.json) to read
   the binary body, with its own larger, dedicated size cap. */
app.post("/api/transcribe",
  sarvamLimiter,
  express.raw({ type: () => true, limit: AUDIO_BODY_LIMIT }),
  async (req, res) => {
    if (!sarvamReady || !sarvamClient) {
      return res.status(503).json({ error: "sarvam not configured", enabled: false });
    }
    const audio = req.body;
    if (!Buffer.isBuffer(audio) || audio.length === 0) {
      return res.status(400).json({ error: "audio body is required" });
    }
    // Strip any codec parameter (e.g. "audio/webm;codecs=opus") — Sarvam matches
    // the MIME against an exact allowlist, and the ";codecs=…" suffix breaks it.
    const contentType = (req.headers["content-type"] || "audio/webm").split(";")[0].trim() || "audio/webm";
    const ext = contentType.includes("wav") ? "wav"
      : contentType.includes("ogg") ? "ogg"
      : contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3"
      : contentType.includes("mp4") || contentType.includes("m4a") ? "m4a"
      : "webm";
    const language = typeof req.query.language === "string" && req.query.language
      ? req.query.language : "unknown";
    try {
      // file accepts a Buffer with metadata — no fs stream needed for browser audio.
      const params = {
        file: { data: audio, filename: `recording.${ext}`, contentType },
        model: SARVAM_MODEL,
        language_code: language,
      };
      if (SARVAM_MODEL.startsWith("saaras")) params.mode = "transcribe"; // mode is saaras-only
      const result = await sarvamClient.speechToText.transcribe(params);
      res.json({ transcript: result.transcript || "", language_code: result.language_code || null });
    } catch {
      // Deliberately generic — never surface upstream error text (avoids any
      // chance of leaking request/key context). The non-200 is enough for the
      // frontend to fall back to the browser recognizer.
      console.warn("[sarvam] transcription failed");
      res.status(502).json({ error: "transcription failed" });
    }
  }
);

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

app.listen(PORT, async () => {
  console.log(`NyayaLoop API proxy listening on http://localhost:${PORT}`);
  // Await so the connected flag is settled (verifyConnectivity resolved/rejected)
  // rather than racing the first request. No-op unless USE_NEO4J=true and vars set.
  await initNeo4j();
});
