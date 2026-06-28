import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Mic, Send, Network, ShieldAlert, Play, Pause, FastForward, CheckCircle2,
  Languages, Zap, Radio, Activity, Eye, Scale, Vote, FileText, Copy, Sparkles
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";

/* ──────────────────────────────────────────────────────────────────────────
   NyayaLoop — voice-first civic grievance + OUTWARD accountability pressure.
   Thesis: an app can't force an official to act. It can make inaction
   visible, aggregated, and legally on record — so ignoring a citizen costs.
   Escalation climbs OUT of the bureaucracy: Filed → Public flag → RTI → Rep+Pattern.
   Partner seams (stubbed, real call marked):
     SARVAM → Indic ASR · NEO4J → property graph store · RENDER → durable escalation/RTI workflows
   AI routing + RTI drafting are live via the Anthropic API, with offline fallbacks.
   ────────────────────────────────────────────────────────────────────────── */

const T = {
  bg:"#0a0a0b", panel:"#121214", panel2:"#16161a", line:"#26262c",
  text:"#ededf2", dim:"#8a8a94", faint:"#5a5a62",
  gold:"#e0a82e", goldHi:"#f5c451", violet:"#7c5cff", teal:"#3ecf8e",
  red:"#ff5470", orange:"#ff9457", blue:"#3b9eff",
};

const DEPTS = {
  water:      { name:"Water Board",       official:"Asst. Engineer", sla:3, hue:T.blue },
  roads:      { name:"Roads & Highways",  official:"Junior Engineer", sla:5, hue:T.gold },
  power:      { name:"Electricity Board", official:"Section Officer", sla:2, hue:T.goldHi },
  sanitation: { name:"Sanitation",        official:"Sanitary Insp.",  sla:2, hue:T.teal },
  health:     { name:"Public Health",     official:"Health Officer",  sla:4, hue:T.violet },
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
  { key:"filed", label:"Filed",        cost:"ignorable",          color:T.gold,   Icon:FileText },
  { key:"flag",  label:"Public flag",  cost:"now visible",        color:T.orange, Icon:Eye },
  { key:"rti",   label:"RTI filed",    cost:"legally on record",  color:T.red,    Icon:Scale },
  { key:"rep",   label:"Rep + pattern",cost:"electoral cost",     color:T.violet, Icon:Vote },
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
const URG_COLOR = { low:T.dim, medium:T.gold, high:T.orange, critical:T.red };

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
  const recogRef = useRef(null);
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

  function startVoice() {
    // ── SARVAM seam: replace with Sarvam streaming ASR for real Indic accuracy ──
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setDraft(d => d || "Voice capture isn't available here — type the complaint instead."); return; }
    const r = new SR();
    r.lang = lang; r.interimResults = true; r.continuous = false;
    r.onresult = e => setDraft(Array.from(e.results).map(x=>x[0].transcript).join(""));
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    recogRef.current = r; setListening(true); r.start();
  }
  function stopVoice(){ recogRef.current && recogRef.current.stop(); setListening(false); }

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
  const selected = complaints.find(c=>c.id===selectedId) || null;

  return (
    <div style={{ background:T.bg, color:T.text, minHeight:660, fontFamily:"'JetBrains Mono', ui-monospace, monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box}
        ::selection{background:${T.gold};color:#000}
        .nl-btn{transition:transform .12s,background .15s,border-color .15s}
        .nl-btn:active{transform:translateY(1px)}
        .nl-chip:hover{border-color:${T.gold};color:${T.text}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes dash{to{stroke-dashoffset:-16}}
        @keyframes rec{0%,100%{opacity:1}50%{opacity:.25}}
        .flow{stroke-dasharray:5 5;animation:dash 1s linear infinite}
        .escpulse{animation:pulse 1.1s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.flow,.escpulse{animation:none}}
        textarea,select{font-family:inherit}
        textarea:focus,select:focus,button:focus-visible{outline:2px solid ${T.gold};outline-offset:2px}
      `}</style>

      {/* top bar */}
      <div style={{ borderBottom:`1px solid ${T.line}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:18, flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:26, height:26, borderRadius:6, background:`linear-gradient(135deg,${T.gold},${T.violet})`, display:"grid", placeItems:"center" }}>
            <Network size={15} color="#000" />
          </div>
          <div>
            <div style={{ fontWeight:700, letterSpacing:2, fontSize:15 }}>NYAYA<span style={{ color:T.gold }}>LOOP</span></div>
            <div style={{ fontSize:9.5, color:T.faint, letterSpacing:1 }}>inaction has a price</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:4, marginLeft:8 }}>
          {[["file","File"],["graph","Pressure chain"],["pattern","Pattern, not incident"]].map(([k,l]) => (
            <button key={k} onClick={()=>setTab(k)} className="nl-btn"
              style={{ background:"none", border:"none", cursor:"pointer", padding:"6px 10px", fontSize:12,
                color:tab===k?T.text:T.dim, borderBottom:`2px solid ${tab===k?T.gold:"transparent"}` }}>{l}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:11, color:T.dim }}>Day {day}</span>
          <button className="nl-btn" onClick={()=>setPlaying(p=>!p)}
            style={{ display:"flex", alignItems:"center", gap:6, background:playing?T.violet:T.panel2, color:playing?"#fff":T.text,
              border:`1px solid ${T.line}`, borderRadius:7, padding:"6px 11px", cursor:"pointer", fontSize:11 }}>
            {playing?<Pause size={13}/>:<Play size={13}/>}{playing?"Running":"Run engine"}
          </button>
          <button className="nl-btn" onClick={()=>setDay(d=>d+1)}
            style={{ display:"grid", placeItems:"center", background:T.panel2, color:T.text, border:`1px solid ${T.line}`, borderRadius:7, padding:"7px 8px", cursor:"pointer" }}>
            <FastForward size={13}/>
          </button>
        </div>
      </div>

      {/* status strip */}
      <div style={{ display:"flex", gap:22, padding:"9px 20px", borderBottom:`1px solid ${T.line}`, fontSize:11, color:T.dim, background:T.panel }}>
        <span><b style={{ color:T.text }}>{openC.length}</b> open</span>
        <span><b style={{ color:T.orange }}>{flags}</b> publicly flagged</span>
        <span><b style={{ color:T.red }}>{rtis}</b> RTIs auto-filed</span>
        <span><b style={{ color:T.teal }}>{complaints.filter(c=>c.status==="resolved").length}</b> resolved</span>
        <span style={{ marginLeft:"auto", color:T.faint }}>AI routing · Sarvam · Neo4j · Render</span>
      </div>

      <div style={{ padding:20 }}>
        {tab==="file" && <FilePanel {...{lang,setLang,draft,setDraft,listening,startVoice,stopVoice,busy,fileComplaint,routeResult}} />}
        {tab==="graph" && <GraphPanel {...{stats,complaints,selected,setSelectedId,resolve,day,openRTI}} />}
        {tab==="pattern" && <Pattern {...{wardStats,best,worst}} />}
      </div>

      {rtiOpen && <RTIDrawer {...{ complaint:complaints.find(c=>c.id===rtiOpen), rtiText, rtiBusy, enhanceRTI, close:()=>setRtiOpen(null) }} />}
    </div>
  );
}

/* ───── FILE ───── */
function FilePanel({ lang,setLang,draft,setDraft,listening,startVoice,stopVoice,busy,fileComplaint,routeResult }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1.4fr) minmax(0,1fr)", gap:18 }}>
      <div style={{ background:T.panel, border:`1px solid ${T.line}`, borderRadius:12, padding:18 }}>
        <div style={{ fontSize:12, color:T.dim, marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
          <Radio size={14} color={T.gold}/> File a grievance — speak or type, in any language
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <Languages size={15} color={T.dim}/>
          <select value={lang} onChange={e=>setLang(e.target.value)}
            style={{ background:T.panel2, color:T.text, border:`1px solid ${T.line}`, borderRadius:8, padding:"7px 10px", fontSize:12 }}>
            {LANGS.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <span style={{ fontSize:10, color:T.faint }}>Indic ASR via Sarvam in production</span>
        </div>
        <div style={{ position:"relative" }}>
          <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={4}
            placeholder="e.g. No water in our street for four days…"
            style={{ width:"100%", resize:"vertical", background:T.bg, color:T.text, border:`1px solid ${T.line}`, borderRadius:10, padding:"12px 14px", fontSize:13, lineHeight:1.5 }}/>
          {listening && <span style={{ position:"absolute", top:12, right:14, display:"flex", alignItems:"center", gap:6, fontSize:10, color:T.red }}>
            <span style={{ width:7, height:7, borderRadius:9, background:T.red, animation:"rec 1s infinite" }}/> listening</span>}
        </div>
        <div style={{ display:"flex", gap:10, marginTop:12 }}>
          <button className="nl-btn" onClick={listening?stopVoice:startVoice}
            style={{ display:"flex", alignItems:"center", gap:8, background:listening?T.red:T.panel2, color:listening?"#fff":T.text, border:`1px solid ${T.line}`, borderRadius:9, padding:"10px 14px", cursor:"pointer", fontSize:12 }}>
            <Mic size={15}/> {listening?"Stop":"Speak"}
          </button>
          <button className="nl-btn" onClick={()=>fileComplaint()} disabled={busy||!draft.trim()}
            style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto",
              background:busy||!draft.trim()?T.panel2:`linear-gradient(135deg,${T.gold},${T.goldHi})`,
              color:busy||!draft.trim()?T.faint:"#000", fontWeight:600, border:"none", borderRadius:9, padding:"10px 18px",
              cursor:busy||!draft.trim()?"default":"pointer", fontSize:12 }}>
            {busy?<Activity size={15} className="escpulse"/>:<Send size={15}/>}{busy?"Routing…":"File complaint"}
          </button>
        </div>
        <div style={{ marginTop:16, borderTop:`1px solid ${T.line}`, paddingTop:14 }}>
          <div style={{ fontSize:10, color:T.faint, marginBottom:8, letterSpacing:1 }}>TRY A SAMPLE</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {SAMPLES.map((s,i)=>(
              <button key={i} className="nl-chip nl-btn" onClick={()=>{ setLang(s.lang); setDraft(s.text); }}
                style={{ background:T.bg, color:T.dim, border:`1px solid ${T.line}`, borderRadius:20, padding:"6px 12px", cursor:"pointer", fontSize:11, maxWidth:280, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.text}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ background:T.panel, border:`1px solid ${T.line}`, borderRadius:12, padding:18 }}>
        <div style={{ fontSize:12, color:T.dim, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
          <Zap size={14} color={T.gold}/> Routing decision
        </div>
        {!routeResult ? (
          <div style={{ color:T.faint, fontSize:12, lineHeight:1.7 }}>
            The AI classifies the complaint, routes it, sets urgency, and hands it to the engine. If the department ignores it past its SLA, the system escalates it <i>outward</i> — public flag, then an auto-filed RTI, then to your ward representative.
          </div>
        ) : (
          <div>
            <Row k="Department" v={<span style={{ color:DEPTS[routeResult.deptId].hue }}>{DEPTS[routeResult.deptId].name}</span>} />
            <Row k="Ward" v={`${WARDS[routeResult.ward].name} · ${WARDS[routeResult.ward].rep}`} />
            <Row k="Urgency" v={<span style={{ color:URG_COLOR[routeResult.urgency], textTransform:"uppercase" }}>{routeResult.urgency}</span>} />
            <Row k="SLA" v={`${DEPTS[routeResult.deptId].sla} days → then escalates outward`} />
            <div style={{ marginTop:12, padding:"10px 12px", background:T.bg, border:`1px solid ${T.line}`, borderRadius:9, fontSize:11.5, color:T.dim, lineHeight:1.6 }}>
              <span style={{ color:T.gold }}>why ▸ </span>{routeResult.reason}
            </div>
            <div style={{ marginTop:12, fontSize:11, color:T.teal, display:"flex", alignItems:"center", gap:6 }}>
              <CheckCircle2 size={13}/> Filed. Opening the pressure chain…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function Row({ k, v }) {
  return <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${T.line}`, fontSize:12.5 }}>
    <span style={{ color:T.faint }}>{k}</span><span style={{ fontWeight:500 }}>{v}</span></div>;
}

/* ───── PRESSURE CHAIN (signature) ───── */
function GraphPanel({ stats, complaints, selected, setSelectedId, resolve, day, openRTI }) {
  const W=720, H=300, midY=120;
  const cit={x:60}, dept={x:185};
  const stageX=[330,455,575,680];
  const sel = selected && selected.status==="open" ? selected : null;
  const open = complaints.filter(c=>c.status==="open");

  return (
    <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1.55fr) minmax(0,1fr)", gap:18 }}>
      <div style={{ background:T.panel, border:`1px solid ${T.line}`, borderRadius:12, padding:14 }}>
        <div style={{ fontSize:11, color:T.dim, padding:"2px 4px 10px" }}>
          escalation climbs <span style={{ color:T.gold }}>outward</span> — each step makes ignoring the citizen cost more
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:"auto" }}>
          {/* spine edges */}
          <line x1={cit.x+20} y1={midY} x2={dept.x-32} y2={midY} stroke={sel?DEPTS[sel.deptId].hue:T.line} strokeWidth={sel?2.2:1.4} className={sel?"flow":""} opacity={sel?1:0.5}/>
          {stageX.map((x,i)=>{
            const fromX = i===0 ? dept.x+34 : stageX[i-1]+34;
            const reached = sel && sel.escLevel>=i;
            return <line key={"sp"+i} x1={fromX} y1={midY} x2={x-34} y2={midY}
              stroke={reached?STAGES[i].color:T.line} strokeWidth={reached?2.4:1.2} className={reached?"flow":""} opacity={reached?1:0.45}/>;
          })}

          {/* citizen */}
          <circle cx={cit.x} cy={midY} r={20} fill={T.panel2} stroke={T.gold} strokeWidth={1.5}/>
          <text x={cit.x} y={midY+4} fill={T.text} fontSize="9" textAnchor="middle" fontFamily="monospace">YOU</text>
          <text x={cit.x} y={midY+36} fill={T.faint} fontSize="8.5" textAnchor="middle" fontFamily="monospace">citizen</text>

          {/* department */}
          <circle cx={dept.x} cy={midY} r={28} fill={T.panel2} stroke={sel?DEPTS[sel.deptId].hue:T.line} strokeWidth={sel?2.4:1.4}/>
          <text x={dept.x} y={midY-2} fill={T.text} fontSize="9.5" textAnchor="middle" fontFamily="monospace">{sel?DEPTS[sel.deptId].name.split(" ")[0]:"Dept"}</text>
          <text x={dept.x} y={midY+11} fill={T.dim} fontSize="8" textAnchor="middle" fontFamily="monospace">{sel?DEPTS[sel.deptId].sla+"d SLA":"—"}</text>
          <text x={dept.x} y={midY+44} fill={T.faint} fontSize="8.5" textAnchor="middle" fontFamily="monospace">internal</text>

          {/* outward pressure stages */}
          {STAGES.map((s,i)=>{
            const x=stageX[i], reached=sel&&sel.escLevel>=i, tip=sel&&sel.escLevel===i;
            return (
              <g key={s.key} className={tip?"escpulse":""}>
                <circle cx={x} cy={midY} r={24} fill={reached?(tip?s.color:T.panel2):T.panel2}
                  stroke={reached?s.color:T.line} strokeWidth={tip?3:1.4} opacity={reached?1:0.5}/>
                <text x={x} y={midY+4} fill={reached?(tip?"#000":s.color):T.faint} fontSize="9" textAnchor="middle" fontFamily="monospace" fontWeight="700">{i===0?"FILE":i===1?"FLAG":i===2?"RTI":"REP"}</text>
                <text x={x} y={midY-34} fill={reached?s.color:T.faint} fontSize="9" textAnchor="middle" fontFamily="monospace">{s.label}</text>
                <text x={x} y={midY+42} fill={reached?T.dim:T.faint} fontSize="8" textAnchor="middle" fontFamily="monospace">{s.cost}</text>
              </g>
            );
          })}
          {!sel && <text x={W/2} y={H-12} fill={T.faint} fontSize="9.5" textAnchor="middle" fontFamily="monospace">select an open complaint to trace its pressure →</text>}
        </svg>

        {sel && sel.escLevel>=2 && (
          <button className="nl-btn" onClick={()=>openRTI(sel)}
            style={{ marginTop:6, display:"flex", alignItems:"center", gap:8, background:T.bg, color:T.red, border:`1px solid ${T.red}`, borderRadius:9, padding:"9px 13px", cursor:"pointer", fontSize:11.5 }}>
            <Scale size={14}/> RTI auto-filed for {sel.id} — view the legal record
          </button>
        )}
      </div>

      {/* queue */}
      <div style={{ background:T.panel, border:`1px solid ${T.line}`, borderRadius:12, padding:14, maxHeight:430, overflow:"auto" }}>
        <div style={{ fontSize:11, color:T.dim, marginBottom:10 }}>open complaints · {open.length}</div>
        {open.length===0 && <div style={{ color:T.faint, fontSize:12 }}>All clear. File one, then run the engine to watch it escalate outward.</div>}
        {open.sort((a,b)=>b.escLevel-a.escLevel).map(c=>{
          const isSel = selected && selected.id===c.id, stage=STAGES[c.escLevel];
          return (
            <div key={c.id} onClick={()=>setSelectedId(c.id)}
              style={{ border:`1px solid ${isSel?DEPTS[c.deptId].hue:T.line}`, background:isSel?T.panel2:T.bg, borderRadius:10, padding:11, marginBottom:9, cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ width:7, height:7, borderRadius:9, background:DEPTS[c.deptId].hue }}/>
                <span style={{ fontSize:10, color:T.dim }}>{DEPTS[c.deptId].name}</span>
                <span style={{ fontSize:9.5, color:T.faint }}>· {WARDS[c.ward].name}</span>
                <span style={{ marginLeft:"auto", fontSize:9.5, color:URG_COLOR[c.urgency], textTransform:"uppercase" }}>{c.urgency}</span>
              </div>
              <div style={{ fontSize:12, lineHeight:1.4, marginBottom:8 }}>{c.summary}</div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:9.5, color:stage.color, display:"flex", alignItems:"center", gap:4 }}><stage.Icon size={11}/> {stage.label}</span>
                <span style={{ fontSize:9.5, color:T.faint }}>· {day-c.filedDay}d</span>
                <button className="nl-btn" onClick={e=>{ e.stopPropagation(); resolve(c.id); }}
                  style={{ marginLeft:"auto", background:T.panel2, color:T.teal, border:`1px solid ${T.line}`, borderRadius:7, padding:"4px 9px", cursor:"pointer", fontSize:10 }}>resolve</button>
              </div>
            </div>
          );
        })}
        {selected && (
          <div style={{ marginTop:12, borderTop:`1px solid ${T.line}`, paddingTop:12 }}>
            <div style={{ fontSize:10, color:T.faint, marginBottom:8, letterSpacing:1 }}>TIMELINE · {selected.id}</div>
            {selected.timeline.map((e,i)=>(
              <div key={i} style={{ display:"flex", gap:9, marginBottom:8 }}>
                <span style={{ width:8, height:8, marginTop:4, borderRadius:9, flexShrink:0,
                  background:e.kind==="done"?T.teal:e.kind==="rti"?T.red:e.kind==="rep"?T.violet:e.kind==="flag"?T.orange:T.gold }}/>
                <div><div style={{ fontSize:11.5, lineHeight:1.4 }}>{e.label}</div><div style={{ fontSize:9.5, color:T.faint }}>day {e.day}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───── PATTERN, NOT INCIDENT (the wow) ───── */
function Pattern({ wardStats, best, worst }) {
  const data = wardStats.filter(w=>w.total).map(w=>({ name:w.name, rate:w.rate, open:w.open,
    hue:w.rate>=70?T.teal:w.rate>=40?T.gold:T.red }));
  return (
    <div>
      {worst && best && (
        <div style={{ background:"linear-gradient(135deg,#1a0e12,#14060a)", border:`1px solid ${T.red}`, borderRadius:12, padding:18, marginBottom:16, display:"flex", alignItems:"center", gap:16 }}>
          <ShieldAlert size={30} color={T.red}/>
          <div>
            <div style={{ fontSize:10, color:T.red, letterSpacing:1, marginBottom:4 }}>THE PATTERN</div>
            <div style={{ fontSize:15, fontWeight:600, lineHeight:1.4 }}>
              {worst.name} sits at <span style={{ color:T.red }}>{worst.rate}%</span> resolved, {worst.open} open, avg age {worst.avgAge}d —
              while {best.name} clears at <span style={{ color:T.teal }}>{best.rate}%</span>.
            </div>
            <div style={{ fontSize:11.5, color:T.dim, marginTop:5 }}>
              One complaint is ignorable. This isn't. {worst.rtis} RTIs are now on record against {WARDS[worst.id].rep}.
            </div>
          </div>
        </div>
      )}
      <div style={{ background:T.panel, border:`1px solid ${T.line}`, borderRadius:12, padding:18, marginBottom:16 }}>
        <div style={{ fontSize:12, color:T.dim, marginBottom:14 }}>resolution rate by ward — accountability, aggregated</div>
        <div style={{ height:220 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top:6, right:8, left:-18, bottom:0 }}>
              <XAxis dataKey="name" tick={{ fill:T.dim, fontSize:11, fontFamily:"monospace" }} axisLine={{ stroke:T.line }} tickLine={false}/>
              <YAxis domain={[0,100]} tick={{ fill:T.faint, fontSize:10, fontFamily:"monospace" }} axisLine={false} tickLine={false}/>
              <Tooltip cursor={{ fill:"#ffffff08" }} contentStyle={{ background:T.panel2, border:`1px solid ${T.line}`, borderRadius:8, fontFamily:"monospace", fontSize:12 }} formatter={(v)=>[`${v}%`,"resolved"]}/>
              <Bar dataKey="rate" radius={[6,6,0,0]}>{data.map((d,i)=><Cell key={i} fill={d.hue}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))", gap:12 }}>
        {wardStats.filter(w=>w.total).map(w=>(
          <div key={w.id} style={{ background:T.panel, border:`1px solid ${w===worst?T.red:T.line}`, borderRadius:11, padding:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:600 }}>{w.name}</span>
              <span style={{ fontSize:18, fontWeight:700, color:w.rate>=70?T.teal:w.rate>=40?T.gold:T.red }}>{w.rate}%</span>
            </div>
            <div style={{ fontSize:10.5, color:T.faint, marginBottom:8 }}>{w.rep}</div>
            <div style={{ display:"flex", gap:14, fontSize:10.5, color:T.dim }}>
              <span>{w.open} open</span><span>avg {w.avgAge}d</span>
              <span style={{ color:w.rtis?T.red:T.faint }}>{w.rtis} RTIs</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───── RTI DRAWER ───── */
function RTIDrawer({ complaint, rtiText, rtiBusy, enhanceRTI, close }) {
  if (!complaint) return null;
  return (
    <div onClick={close} style={{ position:"fixed", inset:0, background:"#000a", display:"flex", justifyContent:"flex-end", zIndex:50 }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"min(520px,94vw)", height:"100%", background:T.panel, borderLeft:`1px solid ${T.line}`, padding:20, overflow:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
          <Scale size={18} color={T.red}/>
          <div style={{ fontSize:14, fontWeight:600 }}>RTI application · {complaint.id}</div>
          <button className="nl-btn" onClick={close} style={{ marginLeft:"auto", background:"none", border:`1px solid ${T.line}`, color:T.dim, borderRadius:7, padding:"4px 10px", cursor:"pointer", fontSize:12 }}>close</button>
        </div>
        <div style={{ fontSize:11, color:T.faint, marginBottom:14 }}>
          Auto-drafted under the RTI Act, 2005 when the {DEPTS[complaint.deptId].name} missed its {DEPTS[complaint.deptId].sla}-day window. This creates a legal obligation to respond within 30 days.
        </div>
        <div style={{ display:"flex", gap:10, marginBottom:12 }}>
          <button className="nl-btn" onClick={()=>navigator.clipboard && navigator.clipboard.writeText(rtiText)}
            style={{ display:"flex", alignItems:"center", gap:7, background:T.panel2, color:T.text, border:`1px solid ${T.line}`, borderRadius:8, padding:"8px 12px", cursor:"pointer", fontSize:11.5 }}>
            <Copy size={13}/> Copy
          </button>
          <button className="nl-btn" onClick={()=>enhanceRTI(complaint)} disabled={rtiBusy}
            style={{ display:"flex", alignItems:"center", gap:7, background:rtiBusy?T.panel2:`linear-gradient(135deg,${T.gold},${T.goldHi})`, color:rtiBusy?T.faint:"#000", fontWeight:600, border:"none", borderRadius:8, padding:"8px 12px", cursor:rtiBusy?"default":"pointer", fontSize:11.5 }}>
            {rtiBusy?<Activity size={13} className="escpulse"/>:<Sparkles size={13}/>}{rtiBusy?"Refining…":"Refine with AI"}
          </button>
        </div>
        <pre style={{ whiteSpace:"pre-wrap", background:T.bg, border:`1px solid ${T.line}`, borderRadius:10, padding:16, fontSize:11.5, lineHeight:1.6, color:T.text, fontFamily:"'JetBrains Mono',monospace" }}>{rtiText}</pre>
      </div>
    </div>
  );
}
