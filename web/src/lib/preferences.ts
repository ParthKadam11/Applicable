import { z } from "zod";
import { LabelSchema, RoleSchema } from "@/lib/jobs-filters";

export const UserPreferencesSchema = z.object({
  defaultLabels: z
    .array(LabelSchema)
    .min(1)
    .default(["open", "india_remote"]),
  defaultRoles: z.array(RoleSchema).default([]),
  hideNoSalary: z.boolean().default(false),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultLabels: ["open", "india_remote"],
  defaultRoles: [],
  hideNoSalary: false,
};

/** Coerce stored jsonb (possibly partial / empty) into validated preferences. */
export function normalizePreferences(raw: unknown): UserPreferences {
  const parsed = UserPreferencesSchema.safeParse(
    raw && typeof raw === "object" ? raw : {},
  );
  return parsed.success ? parsed.data : { ...DEFAULT_PREFERENCES };
}

/** PATCH body: partial update; empty object ok. */
export const PatchPreferencesSchema = z
  .object({
    defaultLabels: z.array(LabelSchema).min(1).optional(),
    defaultRoles: z.array(RoleSchema).optional(),
    hideNoSalary: z.boolean().optional(),
  })
  .strict();

export type PatchPreferences = z.infer<typeof PatchPreferencesSchema>;

export function mergePreferences(
  current: UserPreferences,
  patch: PatchPreferences,
): UserPreferences {
  return normalizePreferences({
    ...current,
    ...patch,
  });
}
