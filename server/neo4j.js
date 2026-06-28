import neo4j from "neo4j-driver";

/* NEO4J seam — guarded by USE_NEO4J. Mirrors the property graph documented in
   src/NyayaLoop.jsx:
     (:Citizen)-[:FILED]->(:Complaint)-[:IN_WARD]->(:Ward)
     (:Complaint)-[:ROUTED_TO]->(:Department)-[:HANDLED_BY]->(:Official)
     (:Complaint)-[:ESCALATED_TO]->(:Stage)   // outward pressure chain
   If the flag is off or the driver can't connect, callers fall back to the
   JSON file store — the app must work with no DB present. */

const USE_NEO4J = process.env.USE_NEO4J === "true";

let driver = null;

export function neo4jEnabled() {
  return USE_NEO4J;
}

export async function initNeo4j() {
  if (!USE_NEO4J) return null;
  const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
    console.warn("[neo4j] USE_NEO4J=true but connection vars missing — staying on JSON store");
    return null;
  }
  try {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    await driver.verifyConnectivity();
    console.log("[neo4j] connected to AuraDB");
    return driver;
  } catch (err) {
    console.warn(`[neo4j] connect failed (${err.message}) — staying on JSON store`);
    driver = null;
    return null;
  }
}

/* MERGE the full graph shape for one complaint. Idempotent — safe to call on
   every persist. No-op when the driver isn't up. */
export async function mirrorComplaint(c) {
  if (!driver) return;
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
        MERGE (cit)-[:FILED]->(cmp)
        MERGE (w:Ward {id: $ward})
        MERGE (cmp)-[:IN_WARD]->(w)
        MERGE (d:Department {id: $deptId})
        MERGE (cmp)-[:ROUTED_TO]->(d)
        MERGE (o:Official {dept: $deptId})
        MERGE (d)-[:HANDLED_BY]->(o)
        `,
        {
          id: c.id, summary: c.summary ?? c.text ?? "", urgency: c.urgency ?? "medium",
          status: c.status ?? "open", escLevel: neo4j.int(c.escLevel ?? 0),
          filedDay: neo4j.int(c.filedDay ?? 0), ward: c.ward, deptId: c.deptId,
        }
      )
    );
  } catch (err) {
    console.warn(`[neo4j] mirror failed for ${c.id}: ${err.message}`);
  } finally {
    await session.close();
  }
}

export async function closeNeo4j() {
  if (driver) { await driver.close(); driver = null; }
}
