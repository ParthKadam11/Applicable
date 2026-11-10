import { describe, expect, it } from "vitest";
import { isHardwareManufacturing } from "../../src/discover/hardware.js";
import { parseYcHits } from "../../src/discover/sources/yc.js";

describe("isHardwareManufacturing", () => {
  it("flags hardware / manufacturing tags", () => {
    expect(
      isHardwareManufacturing({
        tags: ["Hard Tech", "Hardware"],
        industries: ["Industrials", "Manufacturing and Robotics"],
      }),
    ).toBe(true);
  });

  it("does not flag plain SaaS", () => {
    expect(
      isHardwareManufacturing({
        tags: ["SaaS", "B2B"],
        industries: ["B2B", "Engineering, Product and Design"],
        industry: "B2B",
      }),
    ).toBe(false);
  });
});

describe("parseYcHits hardware filter", () => {
  it("drops hardware companies", () => {
    const out = parseYcHits([
      {
        name: "SoftCo",
        website: "https://soft.co",
        isHiring: true,
        tags: ["SaaS"],
        industries: ["B2B"],
      },
      {
        name: "CircuitHub",
        website: "https://circuithub.com",
        isHiring: true,
        tags: ["Hardware", "Manufacturing"],
        industries: ["Industrials", "Manufacturing and Robotics"],
      },
    ]);
    expect(out.map((c) => c.name)).toEqual(["SoftCo"]);
  });
});
