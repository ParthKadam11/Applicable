import neo4j from "neo4j-driver";
import { stableGraphId } from "../graph/ids.js";

async function main() {
  const token = process.env.HYDRA_TOKEN;
  if (!token) throw new Error("HYDRA_TOKEN required");
  const id = stableGraphId("job", "11111111-1111-1111-1111-111111111111");
  console.log("id", id);

  const driver = neo4j.driver(
    process.env.HYDRA_BOLT_URL ?? "bolt://127.0.0.1:7687",
    neo4j.auth.basic("neo4j", token),
    { encrypted: "ENCRYPTION_OFF" },
  );
  const session = driver.session({ database: "default" });
  try {
    await session.run(
      "UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Job, n.ext_id = row.ext_id",
      { rows: [{ id, ext_id: "t-plain" }] },
    );
    console.log("plain number ok");
  } catch (e) {
    console.error("plain fail", e instanceof Error ? e.message : e);
  }
  try {
    await session.run(
      "UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Job, n.ext_id = row.ext_id",
      { rows: [{ id: neo4j.int(id), ext_id: "t-int" }] },
    );
    console.log("neo4j.int ok");
  } catch (e) {
    console.error("int fail", e instanceof Error ? e.message : e);
  }
  await session.close();
  await driver.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
