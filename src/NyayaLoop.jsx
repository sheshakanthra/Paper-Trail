import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Mic, Send, ShieldAlert, Play, Pause, FastForward, CheckCircle2,
  Activity, Eye, Scale, Vote, FileText, Copy, Sparkles, Square
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, LabelList } from "recharts";

/* ──────────────────────────────────────────────────────────────────────────
   NyayaLoop — voice-first civic grievance + OUTWARD accountability pressure.
   Thesis: an app can't force an official to act. It can make inaction
   visible, aggregated, and legally on record — so ignoring a citizen costs.
   Escalation climbs OUT of the bureaucracy: Filed → Public flag → RTI → Rep+Pattern.
   Partner seams (stubbed, real call marked):
     SARVAM → Indic ASR · NEO4J → property graph store · RENDER → durable escalation/RTI workflows
   AI routing + RTI drafting are live via the Anthropic API, with offline fallbacks.

   Presentation: a government case-file / docket system. Paper, ink, ruled forms,
   rubber stamps. No logic here changed — only structure, classNames and colour.
   ────────────────────────────────────────────────────────────────────────── */

/* docket palette — used only for data-driven colour (departments, stages, urgency) */
const C = {
  paper:"#f3efe6", paper2:"#ece7db", paperCard:"#faf7ef",
  ink:"#1c1a15", inkSoft:"#57524a", inkFaint:"#8d8779",
  rule:"#d8d1c0", ruleDark:"#b9b09a",
  red:"#b3372c", blue:"#1f4e79", green:"#2e6b45", amber:"#a06b1e",
};

const DEPTS = {
  water:      { name:"Water Board",       official:"Asst. Engineer", sla:3, hue:C.blue },
  roads:      { name:"Roads & Highways",  official:"Junior Engineer", sla:5, hue:C.amber },
  power:      { name:"Electricity Board", official:"Section Officer", sla:2, hue:C.red },
  sanitation: { name:"Sanitation",        official:"Sanitary Insp.",  sla:2, hue:C.green },
  health:     { name:"Public Health",     official:"Health Officer",  sla:4, hue:C.inkSoft },
};
const DEPT_IDS = Object.keys(DEPTS);

const WARDS = {
  W4:  { name:"Ward 4",  rep:"Cllr. R. Menon" },
  W7:  { name:"Ward 7",  rep:"Cllr. S. Iyer" },
  W12: { name:"Ward 12", rep:"Cllr. A. Khan" },
  W21: { name:"Ward 21", rep:"Cllr. D. Rao" },
};
const WARD_IDS = Object.keys(WARDS);

/* outward pressure chain — each step costs the department more */
const STAGES = [
  { key:"filed", label:"Filed",        cost:"ignorable",          color:C.amber, Icon:FileText },
  { key:"flag",  label:"Public flag",  cost:"now visible",        color:C.blue,  Icon:Eye },
  { key:"rti",   label:"RTI filed",    cost:"legally on record",  color:C.red,   Icon:Scale },
  { key:"rep",   label:"Rep + pattern",cost:"electoral cost",     color:C.ink,   Icon:Vote },
];

const LANGS = [
  { code:"en-IN", label:"English" }, { code:"ta-IN", label:"தமிழ் Tamil" },
  { code:"hi-IN", label:"हिन्दी Hindi" }, { code:"te-IN", label:"తెలుగు Telugu" },
  { code:"bn-IN", label:"বাংলা Bengali" },
];
const SAMPLES = [
  { lang:"en-IN", text:"No water supply in our street for the past four days." },
  { lang:"ta-IN", text:"எங்கள் தெருவில் கடந்த நான்கு நாட்களாக தண்ணீர் வரவில்லை." },
  { lang:"hi-IN", text:"हमारी गली में पिछले तीन दिनों से बिजली नहीं है।" },
  { lang:"en-IN", text:"Garbage has not been collected for a week and it is overflowing." },
  { lang:"en-IN", text:"Large pothole on the main road is causing accidents." },
];

const START_DAY = 14;
let _id = 100;
const uid = () => `C-${++_id}`;
/* after loading persisted complaints, advance the counter past existing ids
   so a newly filed complaint can't collide with a stored C-### id. */
function syncUid(complaints) {
  for (const c of complaints) {
    const n = parseInt(String(c.id).replace(/^C-/, ""), 10);
    if (!Number.isNaN(n) && n > _id) _id = n;
  }
}
const expectedLevel = (day, filedDay, sla) => Math.min(3, Math.floor((day - filedDay) / sla));
const URG_COLOR = { low:C.inkFaint, medium:C.amber, high:C.red, critical:C.red };

function buildTimeline(deptId, filedDay, level, status, resolvedDay) {
  const d = DEPTS[deptId];
  const tl = [{ day:filedDay, label:`Filed · routed to ${d.official}`, kind:"file" }];
  for (let l=1; l<=level; l++) {
    const s = STAGES[l];
    tl.push({ day:filedDay + l*d.sla, label:`${s.label} · ${s.cost}`, kind:s.key });
  }
  if (status==="resolved") tl.push({ day:resolvedDay, label:"Marked resolved", kind:"done" });
  return tl;
}

/* ── NEO4J seam: seed = (:Citizen)-[:FILED]->(:Complaint)-[:IN_WARD]->(:Ward),
   -[:ROUTED_TO]->(:Department), with outward [:ESCALATED_TO] pressure stages. ── */
function seed() {
  const raw = [
    // Ward 12 — the failing ward (high volume, low resolution)
    [1,"sanitation","open",null,"Garbage uncollected for over a week","high","W12"],
    [2,"water","open",null,"No water supply for several days","high","W12"],
    [3,"sanitation","open",null,"Open drain overflowing near homes","high","W12"],
    [4,"water","open",null,"Contaminated water coming from taps","critical","W12"],
    [5,"roads","open",null,"Road caved in after the rain","high","W12"],
    [6,"water","resolved",13,"Low pressure in the overhead tank","medium","W12"],
    // Ward 4 — the responsive ward (fast, mostly resolved)
    [8,"power","resolved",9,"Transformer sparking at night","critical","W4"],
    [9,"power","resolved",10,"Frequent power cuts in sector 4","medium","W4"],
    [10,"roads","resolved",12,"Pothole near the school gate","medium","W4"],
    [11,"health","resolved",12,"Mosquito breeding in stagnant water","medium","W4"],
    [12,"sanitation","resolved",13,"Dead animal not removed","low","W4"],
    [13,"power","open",null,"Streetlights off for two nights","low","W4"],
    // Ward 7 — middle
    [4,"roads","resolved",9,"Broken divider on the main road","low","W7"],
    [7,"health","resolved",9,"Expired stock at the PHC","high","W7"],
    [9,"water","open",null,"Pipeline leak flooding the lane","high","W7"],
    [11,"sanitation","open",null,"Sewage backflow into the street","critical","W7"],
    // Ward 21 — middling-bad
    [3,"sanitation","open",null,"Burning waste causing heavy smoke","high","W21"],
    [5,"water","open",null,"Borewell motor still not repaired","medium","W21"],
    [8,"roads","resolved",14,"Streetlight pole leaning dangerously","low","W21"],
    [10,"health","resolved",11,"Request for a fever screening camp","low","W21"],
  ];
  return raw.map(([filedDay, deptId, status, resolvedDay, text, urgency, ward]) => {
    const lvl = status==="open" ? expectedLevel(START_DAY, filedDay, DEPTS[deptId].sla) : 0;
    return {
      id:uid(), text, summary:text, deptId, ward, urgency, status, lang:"en-IN",
      filedDay, resolvedDay, escLevel:lvl, rti:null,
      timeline:buildTimeline(deptId, filedDay, lvl, status, resolvedDay),
    };
  });
}

/* ── keyword fallback router ── */
function fallbackRoute(text) {
  const s = text.toLowerCase();
  const has = (...w) => w.some((x) => s.includes(x));
  let deptId = "sanitation";
  if (has("water","தண்ணீர்","पानी","leak","pipe","supply","tap","borewell")) deptId="water";
  else if (has("power","electric","current","बिजली","மின்","light","streetlight","transformer")) deptId="power";
  else if (has("garbage","waste","trash","sewage","drain","குப்பை","कचरा","overflow","smoke")) deptId="sanitation";
  else if (has("road","pothole","street","highway","சாலை","सड़क","divider")) deptId="roads";
  else if (has("hospital","health","clinic","medicine","dengue","mosquito","fever","phc")) deptId="health";
  let urgency = "medium";
  if (has("accident","overflow","critical","sparking","contaminated","backflow","danger")) urgency="high";
  return { deptId, urgency, summary:text.slice(0,80), reason:"matched by keywords (offline fallback)" };
}

async function aiRoute(text) {
  const prompt =
    `You are a civic-grievance router for an Indian municipal body. Return ONLY a JSON object, no markdown.\n`+
    `Departments: water, roads, power, sanitation, health.\n`+
    `Schema: {"deptId": one of [water,roads,power,sanitation,health], "urgency": one of [low,medium,high,critical], `+
    `"summary":"neutral, max 12 words", "reason":"why this department, max 14 words"}\n\nComplaint: """${text}"""`;
  try {
    const res = await fetch("/api/claude", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ prompt, maxTokens:1000 }),
    });
    if (!res.ok) throw 0;
    const data = await res.json();
    const obj = JSON.parse((data.text||"").replace(/```json|```/g,"").trim());
    if (!DEPT_IDS.includes(obj.deptId)) throw 0;
    return { ...obj, reason:obj.reason||"routed by AI" };
  } catch { return fallbackRoute(text); }
}

/* ── RENDER seam: when SLA lapses, a durable workflow auto-drafts an RTI.
   Local template (always works) + optional AI enhance. ── */
function templateRTI(c) {
  const w = WARDS[c.ward], d = DEPTS[c.deptId];
  return `To,
The Public Information Officer,
${d.name} — ${w.name} Zonal Office

Subject: Request for information under the Right to Information Act, 2005

Sir/Madam,

Under Section 6(1) of the RTI Act, 2005, I seek the following information regarding grievance reference ${c.id}, registered on day ${c.filedDay}:

1. The present status of the grievance: "${c.summary}".
2. The reason it was not resolved within the stipulated ${d.sla}-day service window.
3. The name and designation of the official(s) responsible for action on it.
4. The committed timeline for its resolution.

The information may be furnished within 30 days as mandated under Section 7(1). I am a citizen of India and the application fee of Rs. 10 is enclosed.

Yours faithfully,
[Citizen] — ${w.name}`;
}
async function aiRTI(c) {
  const base = templateRTI(c);
  const prompt = `Tighten this RTI application into formal, precise legal-administrative English. Keep the RTI Act 2005 structure and all four numbered questions. Return only the letter.\n\n${base}`;
  try {
    const res = await fetch("/api/claude", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ prompt, maxTokens:1000 }),
    });
    if (!res.ok) throw 0;
    const data = await res.json();
    const txt = (data.text||"").trim();
    return txt || base;
  } catch { return base; }
}

/* ── Error boundary: the graph mirror is an optional enrichment. If anything in
   the pressure-chain subtree throws, contain it here and show a fallback instead
   of letting the whole React tree unmount (blank screen). ── */
class GraphErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.warn("[graph] pressure-chain render error:", err?.message); }
  render() {
    if (this.state.failed) {
      return (
        <div className="folder" style={{ padding:18 }}>
          <div className="label-mono" style={{ color:C.red, marginBottom:6 }}>Register unavailable</div>
          <div className="u-sans" style={{ fontSize:13, color:C.inkSoft }}>
            The escalation register hit an error and was contained. The rest of NyayaLoop is unaffected — reselect a case or switch tabs.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* Fetch the Neo4j graph mirror stats. The graph is an OPTIONAL mirror — Aura's
   free tier auto-pauses after ~3 days idle, so a 503 is a normal runtime state,
   not an error. fetch() does NOT throw on 503/500, so we MUST check res.ok
   before res.json(); on any non-200 we report the mirror unavailable and the UI
   falls back to the local complaint-derived view. Never throws. */
async function fetchGraphStats() {
  try {
    const res = await fetch("/api/graph/stats");
    if (!res.ok) return { available: false, stats: null };
    const data = await res.json();
    return { available: data?.connected === true, stats: data ?? null };
  } catch {
    return { available: false, stats: null };
  }
}

export default function NyayaLoop() {
  const [tab, setTab] = useState("file");
  const [complaints, setComplaints] = useState([]);
  const [day, setDay] = useState(START_DAY);
  const [playing, setPlaying] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [routeResult, setRouteResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [rtiOpen, setRtiOpen] = useState(null);   // complaint id whose RTI is shown
  const [rtiText, setRtiText] = useState("");
  const [rtiBusy, setRtiBusy] = useState(false);
  const [graphAvailable, setGraphAvailable] = useState(false); // Neo4j mirror live?
  const [graphStats, setGraphStats] = useState(null);          // {perDepartment, officialsUnderPressure}
  const [sarvamEnabled, setSarvamEnabled] = useState(false);   // Sarvam ASR live server-side?
  const [transcribing, setTranscribing] = useState(false);     // Sarvam request in flight
  const recogRef = useRef(null);
  const mediaRef = useRef(null);   // { recorder, stream } for the Sarvam record path
  const hydratedRef = useRef(false);

  /* Load persisted complaints; if the store is empty, seed it once and persist.
     If the API is unreachable, fall back to the in-memory seed (no persistence). */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/complaints")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length) {
          syncUid(data); setComplaints(data);
        } else {
          const s = seed(); setComplaints(s);
          fetch("/api/complaints", { method:"POST",
            headers:{ "Content-Type":"application/json" }, body:JSON.stringify(s) }).catch(()=>{});
        }
        hydratedRef.current = true;
      })
      .catch(() => { if (!cancelled) { setComplaints(seed()); hydratedRef.current = true; } });
    return () => { cancelled = true; };
  }, []);

  /* Persist on change (debounced). No-op until hydration completes so we don't
     overwrite the store with the empty initial state. */
  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = setTimeout(() => {
      fetch("/api/complaints", { method:"POST",
        headers:{ "Content-Type":"application/json" }, body:JSON.stringify(complaints) }).catch(()=>{});
    }, 400);
    return () => clearTimeout(t);
  }, [complaints]);

  /* Probe the optional Neo4j graph mirror. Re-probe whenever the store changes
     (a new filing may have just been mirrored) and when the graph tab opens.
     Uses the res.ok-gated helper so a 503 (Aura paused) degrades gracefully. */
  useEffect(() => {
    let cancelled = false;
    fetchGraphStats().then(({ available, stats }) => {
      if (cancelled) return;
      setGraphAvailable(available);
      setGraphStats(available ? stats : null);
    });
    return () => { cancelled = true; };
  }, [complaints, tab]);

  /* SARVAM seam: ask the server once whether Sarvam ASR is live. If it is, the
     mic records audio and posts it to /api/transcribe; if not (or on any
     failure) voice falls back to the browser recognizer. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setSarvamEnabled(Boolean(d && d.sarvam)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setDay(d => d + 1), 2200);
    return () => clearInterval(t);
  }, [playing]);

  /* ── RENDER seam: tick advances the durable workflow; SLA breaches push the
     complaint OUTWARD through the pressure chain and arm the RTI at stage 2. ── */
  useEffect(() => {
    setComplaints(prev => prev.map(c => {
      if (c.status !== "open") return c;
      const want = expectedLevel(day, c.filedDay, DEPTS[c.deptId].sla);
      if (want <= c.escLevel) return c;
      const tl = [...c.timeline];
      for (let l=c.escLevel+1; l<=want; l++) {
        const s = STAGES[l];
        tl.push({ day:c.filedDay + l*DEPTS[c.deptId].sla, label:`${s.label} · ${s.cost}`, kind:s.key });
      }
      const rti = (!c.rti && want >= 2) ? templateRTI(c) : c.rti;
      return { ...c, escLevel:want, rti, timeline:tl };
    }));
  }, [day]);

  /* Browser Web Speech API — the always-available fallback (real-time, on-device
     where supported). This is exactly the pre-Sarvam behaviour. */
  function browserVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setDraft(d => d || "Voice capture isn't available here — type the complaint instead."); setListening(false); return; }
    const r = new SR();
    r.lang = lang; r.interimResults = true; r.continuous = false;
    r.onresult = e => setDraft(Array.from(e.results).map(x=>x[0].transcript).join(""));
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    recogRef.current = r; setListening(true); r.start();
  }

  /* Send a recorded audio blob to the Sarvam proxy. On ANY failure (seam off,
     network, empty transcript) fall back to the browser recognizer so the mic
     never dead-ends. */
  async function sendToSarvam(blob) {
    setTranscribing(true);
    try {
      const res = await fetch(`/api/transcribe?language=${encodeURIComponent(lang)}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      if (!res.ok) throw new Error("sarvam unavailable");
      const data = await res.json();
      const text = (data.transcript || "").trim();
      if (!text) throw new Error("empty transcript");
      setDraft(d => (d ? d.trim() + " " : "") + text);
      setTranscribing(false);
    } catch {
      setTranscribing(false);
      browserVoice(); // fail-safe: keep voice working via the browser recognizer
    }
  }

  /* ── SARVAM seam: when the server reports Sarvam live, record the mic and send
     the audio for real Indic ASR; otherwise use the browser recognizer. ── */
  async function startVoice() {
    const canRecord = sarvamEnabled && typeof window.MediaRecorder !== "undefined"
      && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (!canRecord) return browserVoice();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        mediaRef.current = null;
        if (blob.size) sendToSarvam(blob); else browserVoice();
      };
      mediaRef.current = { recorder: rec, stream };
      rec.start();
      setListening(true);
    } catch {
      browserVoice(); // mic denied / MediaRecorder failed -> browser fallback
    }
  }

  function stopVoice() {
    const media = mediaRef.current;
    if (media && media.recorder && media.recorder.state !== "inactive") {
      media.recorder.stop();   // triggers onstop -> sendToSarvam
      setListening(false);
      return;
    }
    if (recogRef.current) recogRef.current.stop();
    setListening(false);
  }

  async function fileComplaint(text) {
    const body = (text ?? draft).trim();
    if (!body || busy) return;
    setBusy(true); setRouteResult(null);
    const r = await aiRoute(body);
    const id = uid();
    const ward = WARD_IDS[Math.floor(Math.random()*WARD_IDS.length)];
    const c = { id, text:body, summary:r.summary||body, deptId:r.deptId, ward, urgency:r.urgency,
      lang, status:"open", filedDay:day, resolvedDay:null, escLevel:0, rti:null,
      timeline:[{ day, label:`Filed · routed to ${DEPTS[r.deptId].official}`, kind:"file" }] };
    setComplaints(p => [c, ...p]);
    setRouteResult({ ...r, id, ward });
    setSelectedId(id); setDraft(""); setBusy(false);
    setTimeout(() => setTab("graph"), 650);
  }
  function resolve(id) {
    setComplaints(p => p.map(c => c.id===id
      ? { ...c, status:"resolved", resolvedDay:day, timeline:[...c.timeline,{ day, label:"Marked resolved", kind:"done" }] }
      : c));
  }
  function openRTI(c){ setRtiOpen(c.id); setRtiText(c.rti || templateRTI(c)); }
  async function enhanceRTI(c){ setRtiBusy(true); const t = await aiRTI(c); setRtiText(t); setRtiBusy(false); }

  const stats = useMemo(() => DEPT_IDS.map(id => {
    const list = complaints.filter(c=>c.deptId===id);
    const resolved = list.filter(c=>c.status==="resolved");
    const rate = list.length ? Math.round(resolved.length/list.length*100) : 0;
    return { id, name:DEPTS[id].name, hue:DEPTS[id].hue, total:list.length, open:list.length-resolved.length, rate };
  }), [complaints]);

  const wardStats = useMemo(() => WARD_IDS.map(id => {
    const list = complaints.filter(c=>c.ward===id);
    const resolved = list.filter(c=>c.status==="resolved");
    const open = list.filter(c=>c.status==="open");
    const rate = list.length ? Math.round(resolved.length/list.length*100) : 0;
    const avgAge = open.length ? Math.round(open.reduce((s,c)=>s+(day-c.filedDay),0)/open.length) : 0;
    const rtis = list.filter(c=>c.escLevel>=2).length;
    return { id, name:WARDS[id].name, rep:WARDS[id].rep, total:list.length, open:open.length, rate, avgAge, rtis };
  }), [complaints, day]);

  const best = useMemo(() => [...wardStats].filter(w=>w.total).sort((a,b)=>b.rate-a.rate)[0], [wardStats]);
  const worst = useMemo(() => [...wardStats].filter(w=>w.total).sort((a,b)=>a.rate-b.rate||b.open-a.open)[0], [wardStats]);

  const openC = complaints.filter(c=>c.status==="open");
  const flags = openC.filter(c=>c.escLevel>=1).length;
  const rtis = openC.filter(c=>c.escLevel>=2).length;
  const resolvedCount = complaints.filter(c=>c.status==="resolved").length;
  const selected = complaints.find(c=>c.id===selectedId) || null;
  const caseNo = `NL/2026/${String(complaints.length).padStart(4,"0")}`;

  const TABS = [["file","Statement"],["graph","Escalation register"],["pattern","Case index"]];

  return (
    <div className="page-rules" style={{ minHeight:"100vh" }}>
      <div style={{ maxWidth:1400, margin:"0 auto", padding:"0 20px 40px" }}>

        {/* ── MASTHEAD ── */}
        <header className="masthead" style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between",
          gap:20, flexWrap:"wrap", padding:"18px 0 14px", marginTop:14 }}>
          <div>
            <div className="u-serif" style={{ fontSize:42, lineHeight:1, fontWeight:600, letterSpacing:"-.5px" }}>
              Nyaya<span style={{ fontStyle:"italic", fontWeight:400 }}>loop</span>
            </div>
            <div className="eyebrow" style={{ marginTop:8 }}>Office of Civic Grievance &amp; Accountability</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div className="label-mono">Case file no.</div>
            <div className="u-mono" style={{ fontSize:13, letterSpacing:1, marginTop:2 }}>{caseNo}</div>
            <div className="u-serif" style={{ fontSize:30, fontWeight:600, marginTop:6, lineHeight:1 }}>
              Day {day}
            </div>
          </div>
        </header>

        {/* ── CONTROL BAR ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:14,
          flexWrap:"wrap", padding:"12px 0", borderBottom:`1px solid ${C.rule}` }}>
          <div className="label-mono" style={{ display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ width:7, height:7, borderRadius:9, background:C.green, display:"inline-block" }} className="blink"/>
            AI routing · Sarvam ASR · on record
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div className="coupon">
              <span className="u-serif" style={{ fontStyle:"italic", fontSize:13, color:C.inkSoft }}>
                Simulation engine
              </span>
              <button onClick={()=>setPlaying(p=>!p)} aria-pressed={playing}
                className="u-mono" style={{ textTransform:"uppercase", letterSpacing:"1.5px", fontSize:11,
                  background:"none", border:"none", cursor:"pointer", color:C.red, display:"inline-flex",
                  alignItems:"center", gap:6, fontWeight:500 }}>
                {playing ? <Pause size={12}/> : <Play size={12}/>}{playing ? "Halt" : "Run"}
              </button>
            </div>
            <button onClick={()=>setDay(d=>d+1)} aria-label="Advance one day" title="Advance one day"
              className="btn-outline" style={{ padding:"9px 12px" }}>
              <FastForward size={13}/> +1 day
            </button>
          </div>
        </div>

        {/* ── STATS LEDGER ── */}
        <div style={{ marginTop:16 }}>
          <div className="label-mono" style={{ marginBottom:7 }}>Register summary</div>
          <div className="ledger">
            {[
              ["Open", openC.length, C.amber],
              ["Publicly flagged", flags, C.blue],
              ["RTIs on record", rtis, C.red],
              ["Resolved", resolvedCount, C.green],
            ].map(([label,n,color]) => (
              <div key={label} className="ledger-cell">
                <div className="ledger-num" style={{ color }}>{String(n).padStart(2,"0")}</div>
                <div className="label-mono" style={{ marginTop:7 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FOLDER TABS ── */}
        <nav className="tabbar" style={{ marginTop:22, paddingLeft:4 }} aria-label="Case sections">
          {TABS.map(([k,l]) => (
            <button key={k} onClick={()=>setTab(k)}
              className={`file-tab ${tab===k ? "file-tab--active" : ""}`}
              aria-current={tab===k ? "page" : undefined}>{l}</button>
          ))}
        </nav>

        {/* ── FOLDER BODY ── */}
        <div className="folder" style={{ padding:22 }}>
          {tab==="file" && <FilePanel {...{lang,setLang,draft,setDraft,listening,transcribing,sarvamEnabled,startVoice,stopVoice,busy,fileComplaint,routeResult,day}} />}
          {tab==="graph" && (
            <GraphErrorBoundary>
              <GraphPanel {...{stats,complaints,selected,setSelectedId,resolve,day,openRTI,graphAvailable,graphStats}} />
            </GraphErrorBoundary>
          )}
          {tab==="pattern" && <Pattern {...{wardStats,best,worst}} />}
        </div>

        <div className="label-mono" style={{ textAlign:"center", marginTop:24, color:C.inkFaint, lineHeight:1.8 }}>
          This document is machine-generated · No signature required · Inaction has a price
        </div>
      </div>

      {rtiOpen && <RTIDrawer {...{ complaint:complaints.find(c=>c.id===rtiOpen), rtiText, rtiBusy, enhanceRTI, close:()=>setRtiOpen(null), day }} />}
    </div>
  );
}

/* ───── FILE — Statement of grievance + Routing slip ───── */
function FilePanel({ lang,setLang,draft,setDraft,listening,transcribing,sarvamEnabled,startVoice,stopVoice,busy,fileComplaint,routeResult,day }) {
  return (
    <div style={{ display:"grid", gap:26, gridTemplateColumns:"minmax(0,1.25fr) minmax(0,1fr)" }} className="filegrid">
      <style>{`@media (max-width:820px){.filegrid{grid-template-columns:1fr!important}}`}</style>

      {/* LEFT — the statement form */}
      <section>
        <div className="eyebrow" style={{ marginBottom:4 }}>Form NL-1 · Deposition</div>
        <h2 className="u-serif" style={{ fontSize:24, fontWeight:600, margin:"0 0 16px" }}>Statement of grievance</h2>

        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap" }}>
          <label className="label-mono">Language of record</label>
          <select value={lang} onChange={e=>setLang(e.target.value)} className="form-select">
            {LANGS.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <span className="u-serif" style={{ fontStyle:"italic", fontSize:12.5, color:sarvamEnabled?C.green:C.inkFaint }}>
            {sarvamEnabled ? "Indic ASR via Sarvam — on record" : "Indic ASR via Sarvam — browser fallback"}
          </span>
        </div>

        <div className="ruled-form">
          <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={4}
            className="ruled-textarea"
            placeholder="State the grievance in your own words…"/>
          {listening && (
            <span className="u-mono" style={{ position:"absolute", top:6, right:2, display:"flex",
              alignItems:"center", gap:6, fontSize:10, letterSpacing:"1.5px", color:C.red, textTransform:"uppercase" }}>
              <span className="blink" style={{ width:8, height:8, borderRadius:9, background:C.red }}/> Recording
            </span>
          )}
        </div>

        <div style={{ display:"flex", gap:12, marginTop:18, flexWrap:"wrap" }}>
          <button className="btn-outline" onClick={listening?stopVoice:startVoice} disabled={transcribing}
            style={ listening ? { borderColor:C.red, color:C.red } : undefined }>
            {transcribing
              ? <><Activity size={14} className="blink"/> Transcribing…</>
              : listening
                ? <><Square size={13}/> Stop</>
                : <><Mic size={14}/> Dictate</>}
          </button>
          <button className="btn-ink" onClick={()=>fileComplaint()} disabled={busy||!draft.trim()} style={{ marginLeft:"auto" }}>
            {busy ? <><Activity size={14} className="blink"/> Routing…</> : <><Send size={14}/> Enter into record</>}
          </button>
        </div>

        <div style={{ marginTop:28 }}>
          <div className="eyebrow" style={{ marginBottom:6 }}>Precedents on record</div>
          <div>
            {SAMPLES.map((s,i)=>(
              <button key={i} className="sample-item" onClick={()=>{ setLang(s.lang); setDraft(s.text); }}>
                <span className="sample-idx">{String.fromCharCode(97+i)}.</span>
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* RIGHT — the routing slip */}
      <section>
        <div className="card-flat" style={{ position:"relative" }}>
          <div className="slip-header">Routing slip — Form NL-7A</div>
          <div style={{ padding:"6px 16px 20px" }}>
            {!routeResult ? (
              <>
                {["Department","Ward","Urgency","Service window"].map(k=>(
                  <div key={k} className="slip-row">
                    <span className="slip-key label-mono">{k}</span>
                    <span className="u-mono" style={{ color:C.inkFaint }}>——</span>
                  </div>
                ))}
                <p className="u-serif" style={{ fontStyle:"italic", fontSize:13.5, color:C.inkSoft, lineHeight:1.6, marginTop:16 }}>
                  On entry, the grievance is classified, routed and assigned a service window. If the department lets that
                  window lapse, the matter escalates outward — public flag, then an RTI on record, then to the ward
                  representative. Nothing here can be quietly ignored.
                </p>
              </>
            ) : (
              <>
                <div className="slip-row">
                  <span className="slip-key label-mono">Department</span>
                  <span className="u-serif" style={{ fontSize:16, fontWeight:600, color:C.ink,
                    textDecoration:"underline", textDecorationColor:C.blue, textUnderlineOffset:3 }}>
                    {DEPTS[routeResult.deptId].name}
                  </span>
                </div>
                <div className="slip-row">
                  <span className="slip-key label-mono">Ward &amp; rep.</span>
                  <span className="u-sans" style={{ fontSize:13.5 }}>{WARDS[routeResult.ward].name} · {WARDS[routeResult.ward].rep}</span>
                </div>
                <div className="slip-row">
                  <span className="slip-key label-mono">Urgency</span>
                  <span className="chip-urg" style={{ color:URG_COLOR[routeResult.urgency] }}>{routeResult.urgency}</span>
                </div>
                <div className="slip-row">
                  <span className="slip-key label-mono">Service window</span>
                  <span className="u-sans" style={{ fontSize:13.5 }}>{DEPTS[routeResult.deptId].sla} days, then escalates</span>
                </div>
                <div style={{ marginTop:14, padding:"11px 13px", background:C.paper2, border:`1px solid ${C.rule}` }}>
                  <span className="label-mono" style={{ color:C.red }}>Grounds ▸ </span>
                  <span className="u-serif" style={{ fontStyle:"italic", fontSize:13.5, color:C.ink }}>{routeResult.reason}</span>
                </div>
                <div className="u-serif" style={{ fontStyle:"italic", fontSize:14, color:C.green, marginTop:14,
                  display:"flex", alignItems:"center", gap:8 }}>
                  <CheckCircle2 size={15}/> Entered into record. Opening the escalation register…
                </div>

                {/* rubber stamp overlapping the slip's bottom-right corner */}
                <div className="stamp" style={{ right:-14, bottom:-26 }}>
                  <span>Filed<br/>Nyayaloop Registry<br/>Day {day}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ───── ESCALATION REGISTER (signature) ───── */
function GraphPanel({ stats, complaints, selected, setSelectedId, resolve, day, openRTI, graphAvailable, graphStats }) {
  const sel = selected && selected.status==="open" ? selected : null;
  const open = complaints.filter(c=>c.status==="open");
  /* Optional-chaining + default so a null / partial payload never throws. */
  const underPressure = (graphStats?.officialsUnderPressure ?? []).slice(0, 4);

  return (
    <div style={{ display:"grid", gap:26, gridTemplateColumns:"minmax(0,1.35fr) minmax(0,1fr)" }} className="regrid">
      <style>{`@media (max-width:820px){.regrid{grid-template-columns:1fr!important}}`}</style>

      {/* LEFT — the register */}
      <section>
        <div className="eyebrow" style={{ marginBottom:4 }}>Form NL-9 · Escalation register</div>
        <h2 className="u-serif" style={{ fontSize:24, fontWeight:600, margin:"0 0 6px" }}>
          {sel ? <>Case <span className="u-mono" style={{ fontSize:18 }}>{sel.id}</span></> : "Escalation register"}
        </h2>

        {/* pressure readout / instruction */}
        {sel ? (
          <div style={{ display:"flex", alignItems:"baseline", gap:12, flexWrap:"wrap", marginBottom:16 }}>
            <span className="label-mono">Current standing</span>
            <span className="u-serif" style={{ fontSize:18, fontWeight:600, color:STAGES[sel.escLevel].color }}>
              {STAGES[sel.escLevel].label}
            </span>
            <span className="u-serif" style={{ fontStyle:"italic", fontSize:13.5, color:C.inkSoft }}>— {STAGES[sel.escLevel].cost}</span>
            <span className="u-mono" style={{ marginLeft:"auto", fontSize:11, letterSpacing:1, color:C.inkFaint }}>
              {day - sel.filedDay}d unaddressed
            </span>
          </div>
        ) : (
          <p className="u-serif" style={{ fontStyle:"italic", fontSize:14, color:C.inkSoft, lineHeight:1.6, marginBottom:16 }}>
            Escalation climbs outward — each ignored day makes the department pay more. Select an open case from the docket to trace its standing.
          </p>
        )}

        {/* the 4 stamped stages */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
          {STAGES.map((s,i)=>{
            const reached = sel && sel.escLevel>=i;
            const current = sel && sel.escLevel===i;
            return (
              <div key={s.key} className={`reg-cell ${reached ? "reg-cell--reached" : ""}`}>
                <div className="label-mono" style={{ color:reached ? s.color : C.inkFaint }}>
                  {i===0?"I":i===1?"II":i===2?"III":"IV"}
                </div>
                <div className="u-serif" style={{ fontSize:14, fontWeight:600, marginTop:4,
                  color:reached ? C.ink : C.inkFaint }}>{s.label}</div>
                <div className="u-serif" style={{ fontStyle:"italic", fontSize:11.5, color:reached ? C.inkSoft : C.inkFaint, marginTop:3 }}>
                  {s.cost}
                </div>
                {reached && (
                  <div className="u-mono" style={{ marginTop:9, fontSize:8.5, letterSpacing:"1px",
                    color:s.color, border:`1px solid ${s.color}`, padding:"2px 5px", display:"inline-block",
                    transform:"rotate(-2deg)" }}>
                    {current ? "● CURRENT" : "ON RECORD"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* graph mirror status — real functionality, degrades gracefully */}
        <div className="label-mono" style={{ marginTop:16, display:"flex", alignItems:"center", gap:8, color:C.inkFaint }}>
          <span style={{ width:7, height:7, borderRadius:9, background:graphAvailable?C.green:C.ruleDark, display:"inline-block" }}/>
          {graphAvailable
            ? <span>Graph mirror live{underPressure.length>0 && <> · pressure on {underPressure.map(o=>o?.official).filter(Boolean).join(", ")}</>}</span>
            : <span>Graph mirror idle — showing local register</span>}
        </div>

        {sel && sel.escLevel>=2 && (
          <button className="btn-outline" onClick={()=>openRTI(sel)}
            style={{ marginTop:16, borderColor:C.red, color:C.red }}>
            <Scale size={14}/> RTI on record for {sel.id} — view instrument
          </button>
        )}
      </section>

      {/* RIGHT — the docket of open cases + timeline */}
      <section>
        <div className="eyebrow" style={{ marginBottom:8, display:"flex", alignItems:"center", gap:8 }}>
          Open docket
          <span className="u-mono" style={{ background:C.ink, color:C.paper, padding:"1px 7px", fontSize:10, letterSpacing:1 }}>
            {String(open.length).padStart(2,"0")}
          </span>
        </div>

        <div style={{ maxHeight:520, overflow:"auto", borderTop:`1.5px solid ${C.ink}` }}>
          {open.length===0 && (
            <div className="u-serif" style={{ fontStyle:"italic", fontSize:13.5, color:C.inkSoft, padding:"14px 4px" }}>
              Docket clear. Enter a grievance, then run the engine to watch it escalate outward.
            </div>
          )}
          {open.sort((a,b)=>b.escLevel-a.escLevel).map(c=>{
            const isSel = selected && selected.id===c.id, stage=STAGES[c.escLevel];
            return (
              <div key={c.id} className={`case-row ${isSel ? "case-row--sel" : ""}`} role="button" tabIndex={0} aria-pressed={isSel}
                aria-label={`${c.summary} — ${DEPTS[c.deptId].name}, ${WARDS[c.ward].name}, ${c.urgency} urgency`}
                onClick={()=>setSelectedId(c.id)}
                onKeyDown={e=>{ if(e.target===e.currentTarget && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); setSelectedId(c.id); } }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                  <span className="u-mono" style={{ fontSize:10.5, letterSpacing:1, color:C.ink }}>{c.id}</span>
                  <span className="label-mono" style={{ color:DEPTS[c.deptId].hue }}>{DEPTS[c.deptId].name}</span>
                  <span className="u-mono" style={{ fontSize:9.5, color:C.inkFaint }}>· {WARDS[c.ward].name}</span>
                  <span className="u-mono" style={{ marginLeft:"auto", fontSize:9.5, letterSpacing:1, textTransform:"uppercase", color:URG_COLOR[c.urgency] }}>{c.urgency}</span>
                </div>
                <div className="u-serif" style={{ fontSize:14.5, lineHeight:1.4, marginBottom:8, color:C.ink }}>{c.summary}</div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span className="label-mono" style={{ color:stage.color, display:"flex", alignItems:"center", gap:5 }}>
                    <stage.Icon size={11}/> {stage.label}
                  </span>
                  <span className="u-mono" style={{ fontSize:9.5, color:C.inkFaint }}>· {day-c.filedDay}d</span>
                  <button className="btn-outline" onClick={e=>{ e.stopPropagation(); resolve(c.id); }} aria-label={`Mark ${c.id} resolved`}
                    style={{ marginLeft:"auto", padding:"4px 10px", fontSize:10, borderColor:C.green, color:C.green }}>Resolve</button>
                </div>
              </div>
            );
          })}
        </div>

        {selected && (
          <div style={{ marginTop:18 }}>
            <div className="eyebrow" style={{ marginBottom:8 }}>Proceedings · {selected.id}</div>
            <div style={{ borderTop:`1px solid ${C.rule}` }}>
              {selected.timeline.map((e,i)=>(
                <div key={i} style={{ display:"flex", gap:12, alignItems:"baseline", padding:"8px 2px", borderBottom:`1px solid ${C.rule}` }}>
                  <span className="u-mono" style={{ fontSize:10.5, letterSpacing:1, color:C.inkFaint, width:52, flex:"none" }}>DAY {String(e.day).padStart(2,"0")}</span>
                  <span style={{ width:8, height:8, borderRadius:9, flex:"none", alignSelf:"center",
                    background:e.kind==="done"?C.green:e.kind==="rti"?C.red:e.kind==="rep"?C.ink:e.kind==="flag"?C.blue:C.amber }}/>
                  <span className="u-serif" style={{ fontSize:14, color:C.ink }}>{e.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ───── CASE INDEX (pattern, not incident) ───── */
function Pattern({ wardStats, best, worst }) {
  const data = wardStats.filter(w=>w.total).map(w=>({ name:w.name, rate:w.rate, open:w.open,
    hue:w.rate>=70?C.green:w.rate>=40?C.amber:C.red }));
  const rateColor = (r) => r>=70?C.green:r>=40?C.amber:C.red;
  const rows = wardStats.filter(w=>w.total);
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom:4 }}>Form NL-12 · Comparative case index</div>
      <h2 className="u-serif" style={{ fontSize:24, fontWeight:600, margin:"0 0 16px" }}>Pattern, not incident</h2>

      {worst && best && (
        <div className="card-flat" style={{ borderColor:C.red, boxShadow:`3px 3px 0 ${C.ruleDark}`,
          borderLeft:`4px solid ${C.red}`, padding:18, marginBottom:22, display:"flex", gap:16, alignItems:"flex-start" }}>
          <ShieldAlert size={26} color={C.red} style={{ flex:"none", marginTop:2 }}/>
          <div>
            <div className="label-mono" style={{ color:C.red, marginBottom:6 }}>Finding of record</div>
            <div className="u-serif" style={{ fontSize:17, fontWeight:600, lineHeight:1.5, color:C.ink }}>
              {worst.name} stands at <span style={{ color:C.red }}>{worst.rate}%</span> resolved, {worst.open} open, average age {worst.avgAge} days —
              while {best.name} clears at <span style={{ color:C.green }}>{best.rate}%</span>.
            </div>
            <div className="u-serif" style={{ fontStyle:"italic", fontSize:13.5, color:C.inkSoft, marginTop:7 }}>
              One complaint is ignorable. This is not. {worst.rtis} RTIs are now on record against {WARDS[worst.id].rep}.
            </div>
          </div>
        </div>
      )}

      {/* case index table */}
      <div className="card-flat" style={{ padding:"4px 14px 8px", marginBottom:22, overflowX:"auto" }}>
        <table className="index-table">
          <thead>
            <tr>
              <th>Ward</th><th>Representative</th><th style={{ textAlign:"right" }}>Resolved</th>
              <th style={{ textAlign:"right" }}>Open</th><th style={{ textAlign:"right" }}>Avg age</th>
              <th style={{ textAlign:"right" }}>RTIs</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(w=>(
              <tr key={w.id} style={ w===worst ? { boxShadow:`inset 4px 0 0 ${C.red}` } : undefined }>
                <td className="u-serif" style={{ fontSize:15.5, fontWeight:600 }}>{w.name}</td>
                <td className="u-sans" style={{ fontSize:13, color:C.inkSoft }}>{w.rep}</td>
                <td className="u-serif" style={{ fontSize:20, fontWeight:600, textAlign:"right", color:rateColor(w.rate) }}>{w.rate}%</td>
                <td className="u-mono" style={{ fontSize:13, textAlign:"right" }}>{w.open}</td>
                <td className="u-mono" style={{ fontSize:13, textAlign:"right" }}>{w.avgAge}d</td>
                <td className="u-mono" style={{ fontSize:13, textAlign:"right", color:w.rtis?C.red:C.inkFaint }}>{w.rtis}</td>
                <td style={{ textAlign:"right" }}>
                  {w===worst && (
                    <span className="u-mono" style={{ fontSize:9, letterSpacing:1, color:C.red, border:`1px solid ${C.red}`,
                      padding:"2px 6px", display:"inline-block", transform:"rotate(-2deg)" }}>Flagged</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* flat ledger chart */}
      <div className="card-flat" style={{ padding:18 }}>
        <div className="label-mono" style={{ marginBottom:14 }}>Resolution rate by ward — accountability, aggregated</div>
        <div style={{ height:220 }} role="img"
          aria-label={`Resolution rate by ward — ${data.map(d=>`${d.name} ${d.rate} percent`).join(", ")}`}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top:18, right:8, left:-18, bottom:0 }}>
              <XAxis dataKey="name" tick={{ fill:C.inkSoft, fontSize:11, fontFamily:"'IBM Plex Mono',monospace" }} axisLine={{ stroke:C.ink }} tickLine={false}/>
              <YAxis domain={[0,100]} tick={{ fill:C.inkFaint, fontSize:10, fontFamily:"'IBM Plex Mono',monospace" }} axisLine={false} tickLine={false}/>
              <Tooltip cursor={{ fill:"rgba(28,26,21,0.06)" }} contentStyle={{ background:C.paperCard, border:`1px solid ${C.ink}`, borderRadius:0, fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:C.ink }} formatter={(v)=>[`${v}%`,"resolved"]}/>
              <Bar dataKey="rate" radius={[0,0,0,0]}>
                <LabelList dataKey="rate" position="top" formatter={(v)=>`${v}%`} fill={C.inkSoft} fontSize={11} fontFamily="'IBM Plex Mono',monospace"/>
                {data.map((d,i)=><Cell key={i} fill={d.hue}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ───── RTI INSTRUMENT (drawer) ───── */
function RTIDrawer({ complaint, rtiText, rtiBusy, enhanceRTI, close, day }) {
  /* Escape closes the drawer — a standard modal escape route (a11y). */
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  if (!complaint) return null;
  return (
    <div onClick={close} style={{ position:"fixed", inset:0, background:"rgba(28,26,21,0.55)", display:"flex", justifyContent:"flex-end", zIndex:50 }}>
      <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`RTI application for ${complaint.id}`}
        style={{ width:"min(560px,96vw)", height:"100%", background:C.paperCard, borderLeft:`1px solid ${C.ink}`,
          boxShadow:`-3px 0 0 ${C.ruleDark}`, overflow:"auto" }} className="page-rules">
        <div style={{ padding:22 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:4 }}>
            <Scale size={18} color={C.red}/>
            <div className="u-serif" style={{ fontSize:20, fontWeight:600 }}>
              RTI application · <span className="u-mono" style={{ fontSize:15 }}>{complaint.id}</span>
            </div>
            <button className="btn-outline" onClick={close} style={{ marginLeft:"auto", padding:"6px 12px" }}>Close</button>
          </div>
          <div className="eyebrow" style={{ marginBottom:16 }}>Instrument under the Right to Information Act, 2005</div>

          <p className="u-serif" style={{ fontStyle:"italic", fontSize:13.5, color:C.inkSoft, lineHeight:1.6, marginBottom:16 }}>
            Auto-drafted when the {DEPTS[complaint.deptId].name} let its {DEPTS[complaint.deptId].sla}-day window lapse.
            This creates a legal obligation to respond within 30 days.
          </p>

          <div style={{ display:"flex", gap:12, marginBottom:16 }}>
            <button className="btn-outline" onClick={()=>navigator.clipboard && navigator.clipboard.writeText(rtiText)}>
              <Copy size={13}/> Copy
            </button>
            <button className="btn-ink" onClick={()=>enhanceRTI(complaint)} disabled={rtiBusy}>
              {rtiBusy ? <><Activity size={13} className="blink"/> Refining…</> : <><Sparkles size={13}/> Refine with AI</>}
            </button>
          </div>

          <div style={{ position:"relative" }}>
            <pre className="u-mono" style={{ whiteSpace:"pre-wrap", background:C.paper, border:`1px solid ${C.ink}`,
              padding:20, fontSize:12, lineHeight:1.7, color:C.ink, margin:0 }}>{rtiText}</pre>
            <div className="stamp" style={{ right:10, bottom:10, width:104, height:104 }}>
              <span>Registered<br/>RTI · Day {day}<br/>NL Registry</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
