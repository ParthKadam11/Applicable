import { z } from "zod";

/** Labels we push to HydraDB (keep volume small). */
export const HYDRA_SYNC_LABELS = [
  "open",
  "india_remote",
  "india_onsite",
] as const;

export type HydraSyncLabel = (typeof HYDRA_SYNC_LABELS)[number];

export const HYDRA_COLLECTION = "jobs";

export const HydraEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullable().optional(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .nullable()
    .optional(),
  meta: z
    .object({
      request_id: z.string().optional(),
      latency_ms: z.number().optional(),
    })
    .optional(),
});

export const HydraIngestResultSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.string().optional(),
        status: z.string().optional(),
        error_code: z.string().optional(),
        error_message: z.string().optional(),
      }),
    )
    .optional(),
  ids: z.array(z.string()).optional(),
});

export const HydraDeleteResultSchema = z.object({
  deleted_count: z.number().optional(),
  results: z.array(z.unknown()).optional(),
});

const EntityNodeSchema = z
  .object({
    name: z.string().optional(),
    type: z.string().optional(),
    namespace: z.string().optional(),
    entity_id: z.string().optional(),
    identifier: z.string().nullable().optional(),
  })
  .passthrough();

const RelationNodeSchema = z
  .object({
    canonical_predicate: z.string().optional(),
    raw_predicate: z.string().optional(),
    context: z.string().nullable().optional(),
  })
  .passthrough();

const TripletSchema = z
  .object({
    source: EntityNodeSchema.optional(),
    target: EntityNodeSchema.optional(),
    relation: RelationNodeSchema.optional(),
  })
  .passthrough();

export const HydraQueryDataSchema = z
  .object({
    chunks: z
      .array(
        z
          .object({
            id: z.string().optional(),
            chunk_uuid: z.string().optional(),
            chunk_content: z.string().optional(),
            source_title: z.string().optional(),
            relevancy_score: z.number().optional(),
            metadata: z.record(z.unknown()).optional(),
            additional_metadata: z.record(z.unknown()).optional(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
    graph_context: z
      .object({
        query_paths: z
          .array(
            z
              .object({
                triplets: z.array(TripletSchema).optional(),
                combined_context: z.string().optional(),
              })
              .passthrough(),
          )
          .optional()
          .default([]),
        chunk_relations: z
          .array(
            z
              .object({
                triplets: z.array(TripletSchema).optional(),
              })
              .passthrough(),
          )
          .optional()
          .default([]),
      })
      .passthrough()
      .optional(),
    llm_prompt: z.string().optional(),
  })
  .passthrough();

export type HydraQueryData = z.infer<typeof HydraQueryDataSchema>;

export type HydraGraphPayload = {
  entities: Record<
    string,
    {
      name: string;
      type: string;
      namespace?: string;
      identifier?: string;
    }
  >;
  relations: Array<{
    source: string;
    target: string;
    predicate: string;
    context?: string;
  }>;
};

export type HydraAppKnowledgeItem = {
  id: string;
  title: string;
  kind: "custom";
  provider: string;
  external_id: string;
  url?: string;
  timestamp?: string;
  fields: { kind: "custom"; body: string };
  additional_metadata: Record<string, string | boolean | number | null>;
};

export type SyncJobRow = {
  id: string;
  title: string;
  descriptionText: string;
  locationRaw: string | null;
  applyUrl: string;
  contentHash: string;
  postedAt: Date | null;
  firstSeenAt: Date;
  closedAt: Date | null;
  hydraSyncedAt: Date | null;
  hydraContentHash: string | null;
  companyName: string;
  companySlug: string | null;
  companyAts: string;
  label: string | null;
  roleFamily: string | null;
  eligibilityEvidence: string[] | null;
  hasSalary: boolean;
};
