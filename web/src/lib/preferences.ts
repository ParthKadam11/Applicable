import { z } from "zod";
import { LabelSchema, RoleSchema } from "@/lib/jobs-filters";

/** Default browse: jobs an India applicant can usefully act on. */
export const DEFAULT_BROWSE_LABELS = [
  "open",
  "india_remote",
  "india_onsite",
] as const satisfies ReadonlyArray<z.infer<typeof LabelSchema>>;

export const UserPreferencesSchema = z.object({
  defaultLabels: z
    .array(LabelSchema)
    .min(1)
    .default([...DEFAULT_BROWSE_LABELS]),
  defaultRoles: z.array(RoleSchema).default([]),
  hideNoSalary: z.boolean().default(false),
  /** Free-text skills for matching / onboarding chips. */
  skills: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultLabels: [...DEFAULT_BROWSE_LABELS],
  defaultRoles: [],
  hideNoSalary: false,
  skills: [],
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
    skills: z.array(z.string().trim().min(1).max(40)).max(40).optional(),
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
