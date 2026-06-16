import { describe, expect, it } from "vitest";
import { parseMarketRatePage } from "./marketRates";

describe("parseMarketRatePage", () => {
  it("parses unchanged quote language", () => {
    const html = `
      <p>The yield on US 10 Year Note Bond Yield held steady at 4.48% on June 16, 2026.</p>
    `;

    expect(parseMarketRatePage(html, "US 10 Year Note Bond Yield")).toEqual({
      date: "2026-06-16",
      value: 4.48
    });
  });

  it("parses directional quote language", () => {
    const html = `
      <p>The yield on US 2 Year Note Bond Yield eased to 4.07% on June 16, 2026.</p>
    `;

    expect(parseMarketRatePage(html, "US 2 Year Note Bond Yield")).toEqual({
      date: "2026-06-16",
      value: 4.07
    });
  });
});
