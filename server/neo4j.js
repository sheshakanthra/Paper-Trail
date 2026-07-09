import neo4j from "neo4j-driver";

/* NEO4J seam — guarded by USE_NEO4J. Mirrors the property graph documented in
   src/NyayaLoop.jsx:
     (:Citizen)-[:FILED]->(:Complaint)-[:IN_WARD]->(:Ward)
     (:Complaint)-[:ROUTED_TO]->(:Department)
     (:Complaint)-[:ESCALATED_TO]->(:Official)   // outward pressure target
   The JSON file store stays the source of truth. If the flag is off or the
   driver can't connect, every export below degrades to a safe no-op so the
   app works with no DB present. */

/* process.env values are always strings — a naive `=== true` (or even
   `=== "true"` against "TRUE"/"True") would silently disable the seam. Normalize. */
const truthy = (v) => String(v).toLowerCase() === "true";
const USE_NEO4J = truthy(process.env.USE_NEO4J);

let driver = null;

/* Human-readable reference, mirrored from the DEPTS/WARDS maps in
   src/NyayaLoop.jsx. The server only receives IDs on the wire, so we look up
   names/officials here to make the graph presentable. Keep in sync with the
   frontend if those maps change. */
const DEPTS = {
  water:      { name: "Water Board",      official: "Asst. Engineer" },
  roads:      { name: "Roads & Highways", official: "Junior Engineer" },
  power:      { name: "Electricity Board", official: "Section Officer" },
  sanitation: { name: "Sanitation",       official: "Sanitary Insp." },
  health:     { name: "Public Health",    official: "Health Officer" },
};
const WARDS = {
  W4:  { name: "Ward 4",  rep: "Cllr. R. Menon" },
  W7:  { name: "Ward 7",  rep: "Cllr. S. Iyer" },
  W12: { name: "Ward 12", rep: "Cllr. A. Khan" },
  W21: { name: "Ward 21", rep: "Cllr. D. Rao" },
};

export function neo4jEnabled() {
  return USE_NEO4J;
}

/* True only once a driver is live — lets callers know the graph is actually
   being written, independent of the flag. */
export function neo4jConnected() {
  return driver !== null;
}

export async function initNeo4j() {
  if (!USE_NEO4J) return null;
  const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
    console.warn("[neo4j] USE_NEO4J=true but connection vars missing — staying on JSON store");
    return null;
  }
  /* Build into a local first and only publish it to the module-level `driver`
     AFTER verifyConnectivity() resolves. Assigning `driver` at construction
     would flip neo4jConnected() to true before the handshake succeeds, so a
     request landing in that window (or an auth failure) would be reported as
     connected. neo4jConnected() must mean "verified", not "constructed". */
  const candidate = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  try {
    await candidate.verifyConnectivity();
    driver = candidate;
    console.log("[neo4j] connected to AuraDB — graph mirror active");
    return driver;
  } catch (err) {
    console.warn(`[neo4j] connect failed (${err.message}) — staying on JSON store`);
    try { await candidate.close(); } catch { /* ignore */ }
    driver = null;
    return null;
  }
}

/* MERGE the full graph shape for one complaint. Idempotent — safe to call on
   every persist; re-runs update properties without duplicating nodes. No-op
   when the driver isn't up, and any error is swallowed so the caller's HTTP
   write can never fail because of the graph mirror. */
export async function mirrorComplaint(c) {
  if (!driver || !c || !c.id) return;
  const dept = DEPTS[c.deptId] || { name: c.deptId, official: "Official" };
  const ward = WARDS[c.ward] || { name: c.ward, rep: "Representative" };
  const session = driver.session();
  try {
    await session.executeWrite((tx) =>
      tx.run(
        `
        MERGE (cmp:Complaint {id: $id})
          SET cmp.summary = $summary, cmp.urgency = $urgency,
              cmp.status = $status, cmp.escLevel = $escLevel,
              cmp.filedDay = $filedDay
        MERGE (cit:Citizen {ward: $ward})
          SET cit.name = $wardName + ' citizen'
        MERGE (cit)-[:FILED]->(cmp)
        MERGE (w:Ward {id: $ward})
          SET w.name = $wardName, w.rep = $wardRep
        MERGE (cmp)-[:IN_WARD]->(w)
        MERGE (d:Department {id: $deptId})
          SET d.name = $deptName
        MERGE (cmp)-[:ROUTED_TO]->(d)
        MERGE (o:Official {id: $officialId})
          SET o.name = $officialName, o.dept = $deptId
        MERGE (cmp)-[esc:ESCALATED_TO]->(o)
          SET esc.level = $escLevel
        `,
        {
          id: c.id,
          summary: c.summary ?? c.text ?? "",
          urgency: c.urgency ?? "medium",
          status: c.status ?? "open",
          escLevel: neo4j.int(c.escLevel ?? 0),
          filedDay: neo4j.int(c.filedDay ?? 0),
          ward: c.ward,
          wardName: ward.name,
          wardRep: ward.rep,
          deptId: c.deptId,
          deptName: dept.name,
          officialId: `${c.deptId}:official`,
          officialName: dept.official,
        }
      )
    );
  } catch (err) {
    console.warn(`[neo4j] mirror failed for ${c.id}: ${err.message}`);
  } finally {
    await session.close();
  }
}

/* Coerce a neo4j Integer (or plain value) to a JS number for JSON output. */
function num(v) {
  return neo4j.isInt(v) ? v.toNumber() : (v ?? 0);
}

/* Read-side: two graph traversals SQL makes awkward —
   1. per-department unresolved load + accumulated outward escalation pressure,
   2. officials with live escalation chains (the outward-pressure money shot).
   Returns null when the graph isn't connected so the route can 503 cleanly. */
export async function getGraphStats() {
  if (!driver) return null;
  const session = driver.session();
  try {
    const byDept = await session.executeRead((tx) =>
      tx.run(`
        MATCH (d:Department)<-[:ROUTED_TO]-(c:Complaint)
        WHERE c.status <> 'resolved'
        OPTIONAL MATCH (c)-[:ESCALATED_TO]->(o:Official)
        RETURN d.id AS deptId, d.name AS deptName,
               count(DISTINCT c) AS unresolved,
               sum(c.escLevel) AS escalationPressure,
               collect(DISTINCT o.name) AS officials
        ORDER BY unresolved DESC, escalationPressure DESC
      `)
    );

    const chains = await session.executeRead((tx) =>
      tx.run(`
        MATCH (c:Complaint)-[esc:ESCALATED_TO]->(o:Official)
        WHERE esc.level > 0
        MATCH (c)-[:IN_WARD]->(w:Ward)
        RETURN o.name AS official, o.dept AS dept,
               count(DISTINCT c) AS escalatedComplaints,
               max(esc.level) AS maxLevel,
               collect(DISTINCT w.id) AS wards
        ORDER BY maxLevel DESC, escalatedComplaints DESC
      `)
    );

    return {
      perDepartment: byDept.records.map((r) => ({
        deptId: r.get("deptId"),
        deptName: r.get("deptName"),
        unresolved: num(r.get("unresolved")),
        escalationPressure: num(r.get("escalationPressure")),
        officials: r.get("officials").filter(Boolean),
      })),
      officialsUnderPressure: chains.records.map((r) => ({
        official: r.get("official"),
        dept: r.get("dept"),
        escalatedComplaints: num(r.get("escalatedComplaints")),
        maxLevel: num(r.get("maxLevel")),
        wards: r.get("wards"),
      })),
    };
  } finally {
    await session.close();
  }
}

export async function closeNeo4j() {
  if (driver) { await driver.close(); driver = null; }
}
