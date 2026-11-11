import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { db, pool } from "../db/client.js";
import { createCaniApplyMcpServer } from "./server.js";

async function main() {
  const server = createCaniApplyMcpServer(db);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep process alive for stdio; pool closes on exit.
  process.stdin.on("end", async () => {
    await pool.end();
  });
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
