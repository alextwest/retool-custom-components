import React from "react";
// @ts-expect-error The library does not currently install @types/react-dom.
import { renderToStaticMarkup } from "react-dom/server";
import moment from "moment-timezone";
import { beforeEach, expect, it, vi } from "vitest";
import { CalendarWrapper } from "./CalendarWrapper";

const state = vi.hoisted(() => ({ include: true, crewField: "serviceTitanCrew" }));
vi.mock("./theme", () => ({ useAppTheme: () => ({}) }));
vi.mock("@tryretool/custom-component-support", () => ({ Retool: {
  useStateArray: ({ name }: { name: string }) => [name === "crewsData"
    ? [{ id: "internal", name: "Internal crew" }, { id: "st", name: "Service Titan" }]
    : [
      { id: "internal-job", resource_id: "internal", title: "Internal project", start: moment().startOf("isoWeek").format("YYYY-MM-DD"), end: moment().startOf("isoWeek").format("YYYY-MM-DD") },
      ...["Pat", "Adam", ""].map((crew, index) => ({ id: `st-${index}`, resource_id: "st", title: `External appointment ${index}`, serviceTitanCrew: crew, alternateCrew: "Alternate crew", start: moment().startOf("isoWeek").format("YYYY-MM-DD"), end: moment().startOf("isoWeek").format("YYYY-MM-DD") }))
    ]],
  useStateString: ({ name, initialValue }: { name: string; initialValue: string }) => [name === "serviceTitanCrewField" ? state.crewField : initialValue, vi.fn()],
  useStateBoolean: () => [state.include, vi.fn()],
  useEventCallback: () => vi.fn()
} }));
beforeEach(() => { state.include = true; state.crewField = "serviceTitanCrew"; });
it("groups external appointments by crew with an unassigned fallback", () => {
  const html = renderToStaticMarkup(<CalendarWrapper />);
  expect(html).toContain("Internal project");
  expect(html).toContain("Pat");
  expect(html).toContain("Adam");
  expect(html).toContain("Unassigned");
  expect(html).toContain("3 crews / 3 appointments");
  expect(html.match(/External appointment 0/g)).toHaveLength(2); // label and tooltip, one rendered appointment
});
it("hides ServiceTitan while retaining internal work", () => {
  state.include = false;
  const html = renderToStaticMarkup(<CalendarWrapper />);
  expect(html).toContain("Internal project");
  expect(html).not.toContain("External appointment");
  expect(html).not.toContain("Unassigned");
});
it("supports a configured API crew field", () => {
  state.crewField = "alternateCrew";
  const html = renderToStaticMarkup(<CalendarWrapper />);
  expect(html).toContain("Alternate crew");
  expect(html).toContain("1 crews / 3 appointments");
  expect(html).not.toContain("Unassigned");
});
