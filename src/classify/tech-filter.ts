/**
 * Shared tech-role gate for stats, LLM enqueue, and future MCP queries.
 * Non-tech jobs are stored with role_family=non_tech but excluded from
 * user-facing results.
 */
export { isTechRole, TECH_ROLE_FAMILIES } from "./roles.js";

/** SQL-ish helper note: filter `job_tags.role_family IS DISTINCT FROM 'non_tech'`. */
export const NON_TECH_ROLE = "non_tech" as const;
