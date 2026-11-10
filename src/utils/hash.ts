import { createHash } from "node:crypto";

/** Stable content hash used to detect job description/title changes. */
export function contentHash(parts: {
  title: string;
  descriptionText: string;
  locationRaw?: string | null;
  employmentType?: string | null;
  applyUrl: string;
}): string {
  const payload = [
    parts.title,
    parts.descriptionText,
    parts.locationRaw ?? "",
    parts.employmentType ?? "",
    parts.applyUrl,
  ].join("\u0000");

  return createHash("sha256").update(payload, "utf8").digest("hex");
}
