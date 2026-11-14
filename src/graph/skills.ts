/**
 * Deterministic skill extraction — fixed dictionary + aliases, no LLM.
 * Names are stored normalized (lowercase).
 */

/** Flat list of canonical skills (~150). */
export const CANONICAL_SKILLS: readonly string[] = [
  // languages
  "python",
  "typescript",
  "javascript",
  "java",
  "golang",
  "rust",
  "kotlin",
  "swift",
  "ruby",
  "php",
  "scala",
  "csharp",
  "cpp",
  "c",
  "r",
  "matlab",
  "sql",
  "bash",
  "shell",
  // frontend
  "react",
  "vue",
  "angular",
  "svelte",
  "nextjs",
  "nuxt",
  "remix",
  "html",
  "css",
  "tailwind",
  "sass",
  "webpack",
  "vite",
  // backend / frameworks
  "nodejs",
  "express",
  "nestjs",
  "django",
  "flask",
  "fastapi",
  "rails",
  "laravel",
  "spring",
  "springboot",
  "dotnet",
  "gin",
  "fiber",
  "actix",
  "axum",
  // data / ml
  "pandas",
  "numpy",
  "scikit-learn",
  "pytorch",
  "tensorflow",
  "keras",
  "huggingface",
  "langchain",
  "openai",
  "llm",
  "nlp",
  "spark",
  "flink",
  "airflow",
  "dbt",
  "snowflake",
  "databricks",
  "bigquery",
  "redshift",
  "tableau",
  "looker",
  "powerbi",
  // databases
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "cassandra",
  "dynamodb",
  "elasticsearch",
  "opensearch",
  "clickhouse",
  "neo4j",
  "sqlite",
  "cockroachdb",
  "timescaledb",
  // cloud / devops
  "aws",
  "gcp",
  "azure",
  "kubernetes",
  "docker",
  "terraform",
  "ansible",
  "pulumi",
  "helm",
  "prometheus",
  "grafana",
  "datadog",
  "sentry",
  "jenkins",
  "github-actions",
  "gitlab-ci",
  "circleci",
  "argocd",
  "istio",
  "nginx",
  "linux",
  "s3",
  "lambda",
  "ecs",
  "eks",
  "gke",
  "cloudflare",
  // messaging / systems
  "kafka",
  "rabbitmq",
  "nats",
  "pulsar",
  "sqs",
  "pubsub",
  "websocket",
  "graphql",
  "grpc",
  "rest",
  "openapi",
  // testing / quality
  "jest",
  "vitest",
  "cypress",
  "playwright",
  "pytest",
  "junit",
  "selenium",
  // mobile
  "android",
  "ios",
  "react-native",
  "flutter",
  "swiftui",
  // security / other
  "oauth",
  "oidc",
  "jwt",
  "security",
  "sre",
  "devops",
  "observability",
  "microservices",
  "distributed-systems",
  "ci-cd",
  "agile",
  "scrum",
  "figma",
  "storybook",
  "prisma",
  "drizzle",
  "typeorm",
  "hibernate",
  "celery",
  "sidekiq",
  "temporal",
  "cadence",
] as const;

/** alias (lowercase) -> canonical */
const ALIAS_TO_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const skill of CANONICAL_SKILLS) {
    m.set(skill.toLowerCase(), skill);
  }
  const extra: Array<[string, string]> = [
    ["postgresql", "postgres"],
    ["psql", "postgres"],
    ["postgre", "postgres"],
    ["mariadb", "mysql"],
    ["mongo", "mongodb"],
    ["elastic search", "elasticsearch"],
    ["k8s", "kubernetes"],
    ["amazon s3", "s3"],
    ["aws s3", "s3"],
    ["amazon dynamodb", "dynamodb"],
    ["aws dynamodb", "dynamodb"],
    ["google cloud", "gcp"],
    ["amazon web services", "aws"],
    ["ts", "typescript"],
    ["js", "javascript"],
    ["ecmascript", "javascript"],
    ["es6", "javascript"],
    ["go lang", "golang"],
    ["go", "golang"],
    ["c#", "csharp"],
    ["c sharp", "csharp"],
    [".net", "dotnet"],
    ["asp.net", "dotnet"],
    ["c++", "cpp"],
    ["node.js", "nodejs"],
    ["node js", "nodejs"],
    ["node", "nodejs"],
    ["next.js", "nextjs"],
    ["next js", "nextjs"],
    ["reactjs", "react"],
    ["react.js", "react"],
    ["vuejs", "vue"],
    ["vue.js", "vue"],
    ["angularjs", "angular"],
    ["fast api", "fastapi"],
    ["spring boot", "springboot"],
    ["graph ql", "graphql"],
    ["g rpc", "grpc"],
    ["tf", "terraform"],
    ["github actions", "github-actions"],
    ["gitlab ci", "gitlab-ci"],
    ["ci/cd", "ci-cd"],
    ["react native", "react-native"],
    ["scikit learn", "scikit-learn"],
    ["sklearn", "scikit-learn"],
    ["hugging face", "huggingface"],
    ["power bi", "powerbi"],
    ["distributed systems", "distributed-systems"],
  ];
  for (const [alias, canon] of extra) {
    m.set(alias.toLowerCase(), canon);
  }
  return m;
})();

/** Longer phrases first so "spring boot" wins over "spring". */
const MATCH_TERMS: Array<{ term: string; canonical: string }> = (() => {
  const items: Array<{ term: string; canonical: string }> = [];
  for (const [term, canonical] of ALIAS_TO_CANONICAL) {
    items.push({ term, canonical });
  }
  items.sort((a, b) => b.term.length - a.term.length);
  return items;
})();

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract canonical skills from title + description.
 * Deterministic; case-insensitive; word-boundary for short tokens.
 */
export function extractSkills(title: string, description: string): string[] {
  const text = `${title}\n${description}`.toLowerCase();
  const found = new Set<string>();
  for (const { term, canonical } of MATCH_TERMS) {
    if (found.has(canonical)) continue;
    const pattern =
      term.includes(" ") || term.includes(".") || term.includes("/")
        ? new RegExp(escapeRegExp(term), "i")
        : new RegExp(
            `(?:^|[^a-z0-9_+#])${escapeRegExp(term)}(?:[^a-z0-9_+#]|$)`,
            "i",
          );
    if (pattern.test(text)) {
      found.add(canonical);
    }
  }
  return [...found].sort();
}

export function normalizeSkill(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  return ALIAS_TO_CANONICAL.get(key) ?? null;
}
