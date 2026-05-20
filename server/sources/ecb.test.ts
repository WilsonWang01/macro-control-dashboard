import { describe, expect, it } from "vitest";
import { parseEcbUsdJpy } from "./ecb";

describe("parseEcbUsdJpy", () => {
  it("converts ECB EUR rates into USDJPY", () => {
    const xml = `
      <Cube>
        <Cube time="2026-05-19">
          <Cube currency="USD" rate="1.1620"/>
          <Cube currency="JPY" rate="184.89"/>
        </Cube>
      </Cube>
    `;

    expect(parseEcbUsdJpy(xml, "2026-05-19T00:00:00.000Z")).toMatchObject([
      {
        metricId: "usdjpy",
        date: "2026-05-19",
        value: 184.89 / 1.162
      }
    ]);
  });

  it("skips days missing either leg of the cross rate", () => {
    const xml = `<Cube><Cube time="2026-05-19"><Cube currency="USD" rate="1.1620"/></Cube></Cube>`;

    expect(parseEcbUsdJpy(xml, "2026-05-19T00:00:00.000Z")).toEqual([]);
  });
});
