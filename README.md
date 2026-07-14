<div align="center">

# Paper Trail

### Inaction has a price.

**A voice-first civic grievance platform that turns ignored complaints into legal record.**

India doesn't lack complaint apps — it lacks accountability. Complaints get closed, not fixed, because ignoring a citizen costs an official nothing. Paper Trail changes that.

[Live Demo](#) · [Report Bug](../../issues) · [Request Feature](../../issues)

</div>

---

## The Problem

Every civic body in India already runs a complaint portal. None of them fix the underlying failure: a complaint that gets marked *"disposed"* isn't the same as a complaint that gets *resolved*. Internal escalation up an unaccountable hierarchy changes nothing, because the same incentive — ignore it, close it — exists at every rung.

**Paper Trail doesn't try to force officials to act.** It makes inaction *visible, aggregated, and legally costly* — the only lever that has ever actually worked.

---

## How It Works

```
   Citizen speaks         AI routes           Department has
   a complaint         →  & classifies     →  a fixed SLA to act
   (any language)          it instantly         (2–5 days)
                                                       │
                                                       ▼
                                          ┌─────────────────────┐
                                          │   SLA breached?      │
                                          └──────────┬───────────┘
                                                      │ yes
                     ┌────────────────────────────────┼────────────────────────────────┐
                     ▼                                ▼                                ▼
              🚩 Public Flag                   ⚖️ RTI Auto-Filed              🗳️ Ward Rep + Pattern
        Complaint becomes visible      A real RTI Act, 2005 application    Escalates to the elected
        on the department's public    is auto-drafted — correct state     representative; aggregated
        record. No longer ignorable.  fee, 30-day legal clock, BPL         into a ward-level scorecard
                                       exemption logic.                    no council can dismiss.
```

Every stage makes ignoring the citizen **more expensive** than fixing the problem.

---

## Core Features

### 🎙️ Voice-First Filing, In Any Language
Citizens speak their complaint in Tamil, Hindi, Telugu, Bengali, or English. Speech-to-text transcription removes the literacy and English-fluency barrier that silently excludes most complaint portals' actual target users.

### 🤖 AI-Driven Classification & Routing
An LLM reads the complaint, assigns it to the correct department (Water, Roads, Power, Sanitation, Health), sets urgency, and explains its own routing decision — no human dispatcher in the loop, with a keyword-based fallback so routing never fails silently.

### ⚖️ Automated RTI Generation
When a department misses its SLA, the system doesn't send a polite reminder — it drafts a formal **RTI Act, 2005** application: correct jurisdiction, the state's actual filing fee (fees vary — ₹0 to ₹50 depending on state), BPL fee-exemption handling, and a 48-hour expedited clause for life/safety-critical complaints.

### 🗺️ Pattern, Not Incident
One ignored pothole is invisible. A dashboard showing *Ward 12 resolves 18% of complaints while Ward 4 resolves 91%* is a political liability. The ward-level accountability view turns thousands of individually dismissible complaints into one verdict a council cannot explain away.

### 🔐 Privacy-Respecting Architecture
API keys never touch the browser. All third-party calls (AI routing, speech-to-text) are proxied through a hardened Express backend — rate-limited, size-capped, and fail-safe by design.

---

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   React + Vite Frontend │  ────▶  │   Express Proxy Server    │
│   (Tailwind, dark UI)   │  ◀────  │   (secrets held server-   │
└─────────────────────────┘         │   side, rate-limited)     │
                                     └────────────┬──────────────┘
                                                   │
                       ┌───────────────────────────┼───────────────────────────┐
                       ▼                           ▼                           ▼
              ┌─────────────────┐        ┌──────────────────┐        ┌──────────────────┐
              │  Claude (routing │        │  Speech-to-Text   │        │  JSON file store  │
              │  + RTI drafting) │        │  (voice → text)    │        │  (persistence)     │
              └─────────────────┘        └──────────────────┘        └──────────────────┘
```

Every external integration is **fail-safe by design**: if a live service is unreachable, the app falls back to a local equivalent (keyword router, browser speech recognition, JSON store) rather than breaking the user experience.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| AI / Routing | Claude (Anthropic) |
| Speech-to-Text | Sarvam AI |
| Persistence | JSON file store *(Neo4j AuraDB graph mirror scaffolded, dormant)* |
| Security | Server-side secrets, rate-limiting, request size caps |

---

## Getting Started

### Prerequisites
- Node.js 18+
- An Anthropic API key
- A Sarvam AI API key

### Installation

```bash
git clone https://github.com/sheshakanthra/Paper-Trail.git
cd Paper-Trail
npm install
cp .env.example .env
```

Fill in `.env` with your keys:

```env
ANTHROPIC_API_KEY=your_key_here
SARVAM_API_KEY=your_key_here
USE_SARVAM=true
USE_NEO4J=false
```

### Run locally

```bash
npm run dev
```

This starts both the frontend (`localhost:5173`) and the API proxy (`localhost:8787`) together.

---

## Project Structure

```
paper-trail/
├── src/
│   ├── NyayaLoop.jsx      # Core application
│   ├── App.jsx
│   └── index.css
├── server/
│   ├── index.js           # Express proxy — routing, RTI, rate limiting
│   └── neo4j.js           # Graph mirror seam (dormant)
├── .env.example
└── package.json
```

---

## Roadmap

- [x] Voice-first complaint filing (Sarvam AI speech-to-text)
- [x] AI-driven complaint classification and routing
- [x] Outward escalation chain (public flag → RTI → representative)
- [x] State-accurate RTI generation with BPL exemption logic
- [x] Ward-level accountability analytics
- [ ] Neo4j AuraDB graph mirror — architected and driver-tested, integration pending
- [ ] Durable, timer-based escalation workflows
- [ ] Mobile application
- [ ] Public deployment with persistent database

---

## Honest Scope

Paper Trail is a working prototype, not a production civic system. It does not claim to raise government resolution rates — no short build cycle could prove that. What it demonstrates is the mechanism: **making non-resolution visible, aggregated, and legally on record changes the incentive to ignore a citizen.** That is the claim this project makes, and the one it can defend.

---

## Built For

**HackHazards '26** — organized by NAMESPACE Community.

**Theme:** Public Systems, Governance & Civic Tech

**Track:** Sarvam AI — Build AI Applications with Sarvam AI

---

<div align="center">

*We didn't build another inbox. We built the thing that makes ignoring a citizen expensive.*

</div>
