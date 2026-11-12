import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Local compose publishes 5435 and keeps legacy jobfit DB name (see docker-compose.yml).
    url: process.env.DATABASE_URL ?? "postgres://jobfit:jobfit@127.0.0.1:5435/jobfit",
  },
});
