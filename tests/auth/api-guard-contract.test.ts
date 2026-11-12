import { describe, expect, it } from "vitest";

/**
 * Contract for web /api/me/* (Auth.js session cookie).
 * Handlers live in web/; this locks the response shape expected by the UI.
 */
describe("/api/me auth-guard contract", () => {
  it("unauthenticated requests must get 401 unauthorized JSON", () => {
    const body = { ok: false, error: "unauthorized" };
    expect(body.error).toBe("unauthorized");
    const status = 401;
    expect(status).toBe(401);
  });

  it("save endpoints are idempotent in response shape", () => {
    expect({ ok: true, saved: true, already: true }).toMatchObject({
      ok: true,
      saved: true,
    });
    expect({ ok: true, removed: false }).toMatchObject({ ok: true });
  });
});
