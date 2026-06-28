# NyayaLoop

Voice-first civic grievance platform with **outward accountability pressure**.

An app can't force an official to act — so NyayaLoop makes inaction *visible,
aggregated, and legally on record*. When a department misses its SLA, the
complaint escalates **outward**, not up the hierarchy:

```
Filed  ->  Public flag  ->  RTI auto-filed  ->  Representative + pattern
ignorable   now visible     legally on record    electoral cost
```

## Run it

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

Build for production:

```bash
npm run build
npm run preview
```

## What works out of the box

- **File** — speak (browser mic + language selector) or type a complaint, or tap a sample.
- **Routing** — AI classifies the complaint, picks the department, sets urgency.
- **Pressure chain** — the signature view; an unresolved complaint climbs outward as days pass.
- **Auto-RTI** — when the SLA lapses, a formal RTI application (RTI Act 2005) is drafted for that complaint.
- **Pattern, not incident** — ward-level aggregation that turns many ignorable complaints into one verdict.
- **Run engine** — advances simulated days so escalation plays live; `Resolve` closes the loop.

## Demo path (90 seconds)

1. Hit **Run engine**, open **Pressure chain**.
2. File the Tamil water sample, watch it route and climb outward.
3. Select an aged complaint, open its **RTI** — a legal record, not a reminder.
4. Cut to **Pattern, not incident** — the ward verdict.

## Project structure

```
nyayaloop/
├── index.html          # mount point
├── package.json        # deps + scripts
├── vite.config.js      # Vite + React
├── README.md
└── src/
    ├── main.jsx        # React entry
    ├── App.jsx         # renders NyayaLoop
    └── NyayaLoop.jsx   # the whole app
```

## Partner integration seams

The three partner services are stubbed locally with the real call site marked in
`src/NyayaLoop.jsx`. Search the file for these comments:

- `SARVAM seam` — swap the browser `SpeechRecognition` for Sarvam streaming ASR
  (real Tamil / Hindi / Telugu / Bengali accuracy).
- `NEO4J seam` — the in-memory store is shaped as a property graph:
  `(:Citizen)-[:FILED]->(:Complaint)-[:IN_WARD]->(:Ward)`,
  `-[:ROUTED_TO]->(:Department)`, with an outward `[:ESCALATED_TO]` chain.
  Swap it for an AuraDB driver.
- `RENDER seam` — the day-tick loop stands in for a durable workflow. In
  production each complaint is a long-running workflow with timer-based SLA
  breach -> public flag -> RTI -> representative steps.

## A note on the AI calls

`aiRoute` and `aiRTI` call the Anthropic Messages API directly. That works inside
the Claude artifact sandbox, but **a plain browser app can't call it directly**
(CORS + no key). Locally the app falls back gracefully:

- routing -> a keyword router (`fallbackRoute`)
- RTI -> the local template (`templateRTI`)

To enable real AI locally, put a small backend proxy in front of the Anthropic
API (holding your key server-side) and point the two `fetch` calls at it.

## Honest scope

This is a working prototype. It does **not** claim to raise resolution rates —
no two-month build can prove that. It demonstrates the system and the incentive
shift: making non-resolution cost something. That is the claim to defend.
