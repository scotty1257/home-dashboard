import { describe, expect, it } from "vitest";
import { placeNameFromTimezone } from "./openMeteo.js";

/**
 * The weather tile shows where the forecast is for. Open-Meteo returns no
 * place name, and the raw coordinates it used to fall back on ("40.71,
 * -74.01") read as noise on a wall display.
 */
describe("placeNameFromTimezone", () => {
  it("takes the city from an IANA timezone", () => {
    expect(placeNameFromTimezone("America/New_York")).toBe("New York");
    expect(placeNameFromTimezone("Europe/London")).toBe("London");
  });

  it("un-escapes multi-word cities", () => {
    expect(placeNameFromTimezone("America/Los_Angeles")).toBe("Los Angeles");
    expect(placeNameFromTimezone("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
  });

  it("returns null when there is nothing usable, so the caller can fall back", () => {
    expect(placeNameFromTimezone(undefined)).toBeNull();
    expect(placeNameFromTimezone("")).toBeNull();
  });
});
