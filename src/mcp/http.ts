import { config } from "../config.js";
import { pool } from "../db/client.js";
import { createMcpHttpApp } from "./app.js";

async function main() {
  const app = createMcpHttpApp();
  const port = config.MCP_HTTP_PORT;
  const server = app.listen(port, () => {
    console.log(
      `Applicable MCP (Streamable HTTP) listening on :${port}  POST/GET /  GET /health`,
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down MCP…`);
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
