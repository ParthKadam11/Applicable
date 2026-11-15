import { corsPreflight, json, requireUser } from "@/lib/api-guard";
import { getOnboardingState, markOnboardingSeen } from "@/lib/me";

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const state = await getOnboardingState(gate.userId);
    return json(
      {
        seen: state.seen,
        seen_at: state.seenAt,
        skills: state.skills,
      },
      200,
      gate.headers,
    );
  } catch (err) {
    console.error(
      "[api/me/onboarding] GET",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "onboarding_failed" }, 500, gate.headers);
  }
}

/** Mark onboarding as seen (idempotent). */
export async function POST(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const result = await markOnboardingSeen(gate.userId);
    if (!result) {
      return json({ ok: false, error: "not_found" }, 404, gate.headers);
    }
    return json(
      { ok: true, seen: true, seen_at: result.seenAt },
      200,
      gate.headers,
    );
  } catch (err) {
    console.error(
      "[api/me/onboarding] POST",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "onboarding_failed" }, 500, gate.headers);
  }
}
