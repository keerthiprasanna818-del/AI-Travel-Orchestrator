import { describe, expect, it } from "vitest";
import { displayToIso, isoToDisplay, maskDisplayInput, validateDateRange } from "@/lib/date-input";
import { emptyTrip } from "@/lib/trip";

describe("date-input helpers", () => {
  it("converts ISO to the dd-mm-yyyy display format", () => {
    expect(isoToDisplay("2026-09-04")).toBe("04-09-2026");
    expect(isoToDisplay("")).toBe("");
  });

  it("parses manually typed dates into ISO", () => {
    expect(displayToIso("04-09-2026")).toBe("2026-09-04");
    expect(displayToIso("4/9/2026")).toBe("2026-09-04");
    expect(displayToIso("04.09.2026")).toBe("2026-09-04");
  });

  it("rejects impossible or incomplete dates", () => {
    expect(displayToIso("31-02-2026")).toBeNull();
    expect(displayToIso("04-13-2026")).toBeNull();
    expect(displayToIso("04-09")).toBeNull();
  });

  it("masks digit-only typing into dd-mm-yyyy", () => {
    expect(maskDisplayInput("12032027")).toBe("12-03-2027");
    expect(maskDisplayInput("120")).toBe("12-0");
  });

  it("prevents past departures and returns before departure", () => {
    expect(validateDateRange("2000-01-01", "2000-01-05")).toMatch(/past/i);
    expect(validateDateRange("2999-05-10", "2999-05-02")).toMatch(/on or after/i);
    expect(validateDateRange("2999-05-10", "2999-05-12")).toBeNull();
  });
});

describe("form defaults", () => {
  it("starts empty with an explicit transport default", () => {
    expect(emptyTrip.from).toBe("");
    expect(emptyTrip.destination).toBe("");
    expect(emptyTrip.departDate).toBe("");
    expect(emptyTrip.returnDate).toBe("");
    expect(emptyTrip.preferences).toEqual([]);
    expect(emptyTrip.transport).toBe("Flights");
  });
});
