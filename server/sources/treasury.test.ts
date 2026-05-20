import { describe, expect, it } from "vitest";
import { parseTreasuryYieldCurveXml } from "./treasury";

describe("parseTreasuryYieldCurveXml", () => {
  it("extracts Treasury curve points into primary UST metrics", () => {
    const xml = `
      <feed>
        <entry>
          <content type="application/xml">
            <m:properties>
              <d:NEW_DATE m:type="Edm.DateTime">2026-05-18T00:00:00</d:NEW_DATE>
              <d:BC_3MONTH m:type="Edm.Double">3.70</d:BC_3MONTH>
              <d:BC_2YEAR m:type="Edm.Double">4.12</d:BC_2YEAR>
              <d:BC_5YEAR m:type="Edm.Double">4.31</d:BC_5YEAR>
              <d:BC_10YEAR m:type="Edm.Double">4.66</d:BC_10YEAR>
            </m:properties>
          </content>
        </entry>
      </feed>
    `;

    expect(parseTreasuryYieldCurveXml(xml, "2026-05-19T00:00:00.000Z")).toMatchObject([
      { metricId: "ust3m", date: "2026-05-18", value: 3.7 },
      { metricId: "ust2y", date: "2026-05-18", value: 4.12 },
      { metricId: "ust5y", date: "2026-05-18", value: 4.31 },
      { metricId: "ust10y", date: "2026-05-18", value: 4.66 },
      { metricId: "curve_10y2y", date: "2026-05-18", value: 54 },
      { metricId: "curve_10y3m", date: "2026-05-18", value: 96 }
    ]);
  });

  it("ignores pages without XML entries", () => {
    expect(parseTreasuryYieldCurveXml("<div>No Results Found.</div>", "2026-05-19T00:00:00.000Z")).toEqual([]);
  });
});
