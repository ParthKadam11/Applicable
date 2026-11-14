import { createGraphClient, closeSharedGraphDriver } from "../graph/driver.js";
import { upsertNodesByLabel, mergeTypedEdges } from "../graph/cypher.js";
import { stableGraphId } from "../graph/ids.js";

async function main() {
  const client = createGraphClient({ enabled: true });
  const a = stableGraphId("company", "probe-co");
  const b = stableGraphId("job", "probe-job");
  console.log({ a, b });
  try {
    const q = upsertNodesByLabel("Company", [
      { id: a, ext_id: "probe-co", slug: "probe", name: "Probe", ats: "ashby" },
    ]);
    await client.run(q.cypher, q.params);
    console.log("company upsert ok");
    const q2 = upsertNodesByLabel("Job", [
      {
        id: b,
        ext_id: "probe-job",
        title: "T",
        label: "open",
        role: "backend",
        posted_at: "",
        first_seen_at: "",
        apply_url: "https://example.com",
        active: true,
      },
    ]);
    await client.run(q2.cypher, q2.params);
    console.log("job upsert ok");
    const q3 = mergeTypedEdges("POSTS", [{ src: a, dst: b }]);
    await client.run(q3.cypher, q3.params);
    console.log("edge ok");
  } catch (e) {
    console.error("FAIL", e);
  }
  await closeSharedGraphDriver();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
