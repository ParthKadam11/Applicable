import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHydraClient,
  resetHydraClientCache,
} from "../../src/hydra/client.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetHydraClientCache();
});

describe("hydra client", () => {
  it("disabled mode makes no HTTP calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = createHydraClient({ enabled: false });
    expect(client.enabled).toBe(false);

    await client.ingestKnowledge({ items: [], graphPayload: {} });
    await client.deleteKnowledge(["x"]);
    await client.queryKnowledge({
      query: "backend",
      maxResults: 5,
      labels: ["open"],
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends API-Version 2 and retries 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", { status: 429, headers: { "retry-after": "0" } }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { deleted_count: 1 },
            error: null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = createHydraClient({
      enabled: true,
      apiKey: "test-key",
      database: "applicable",
    });

    // Override config key via creating enabled client - auth uses config.HYDRADB_API_KEY
    // so stub env is not needed if we only check headers from createHydraClient path.
    // createHydraClient still reads config for API key in authHeaders.
    // Force by temporarily setting process.env won't re-parse config. Patch fetch assertion:
    const n = await client.deleteKnowledge(["job-1"]);
    expect(n).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers["API-Version"]).toBe("2");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.hydradb.com/context");
  });
});
