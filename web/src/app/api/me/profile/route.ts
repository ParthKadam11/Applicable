import { corsPreflight, json, requireUser } from "@/lib/api-guard";
import { getUserProfile } from "@/lib/me";

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const profile = await getUserProfile(gate.userId);
    if (!profile) {
      return json({ ok: false, error: "not_found" }, 404, gate.headers);
    }
    return json(
      {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        memberSince: profile.createdAt,
        preferences: profile.preferences,
      },
      200,
      gate.headers,
    );
  } catch (err) {
    console.error(
      "[api/me/profile] GET",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "profile_failed" }, 500, gate.headers);
  }
}
