import React from "react";
// @ts-expect-error The library does not currently install @types/react-dom.
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  reconcileSave,
  statusClearReason,
  statusDependencyReason,
} from "./statusRules";
import { StatusDropdown } from "./StatusDropdown";

it.each([0, "0", "0.00"])(
  "ignores zero amounts for status restrictions (%s)",
  (amount) => {
    expect(
      statusDependencyReason("contract_status", { signed_amount: amount }, {}),
    ).toBeNull();
  },
);
it("prevents status clearing when a related amount is nonzero or a related date is populated", () => {
  expect(
    statusDependencyReason("contract_status", { signed_amount: 100 }, {}),
  ).toContain("Clear the related");
  expect(
    statusDependencyReason(
      "contract_status",
      { signed_date: "2026-10-29" },
      {},
    ),
  ).not.toBeNull();
});
it("allows the dependency check once related fields are cleared and ignores other sections", () => {
  expect(
    statusDependencyReason(
      "contract_status",
      { signed_amount: null, signed_date: null, invoiced_amount: 50 },
      {},
    ),
  ).toBeNull();
});
it("checks configured section dates for all status fields", () => {
  expect(
    statusDependencyReason(
      "permit_status",
      { custom_date: "2026-10-29" },
      {
        permit_status: { group: "Permits" },
        custom_date: { group: "Permits" },
      },
    ),
  ).not.toBeNull();
});

it("respects explicit per-field restrictions when configured", () => {
  expect(
    statusClearReason(
      "delivery_status",
      "Scheduled",
      "Delivery Status",
      false,
      { delivery_status: { canClear: false } },
    ),
  ).toContain("cannot be cleared");
});
it("uses persisted delivery value rather than an unsaved selection", () => {
  expect(
    statusClearReason("delivery_status", null, "Delivery Status", false, {}),
  ).toBeNull();
});
it.each([
  "dev_status",
  "contract_status",
  "delivery_status",
  "hold_status",
  "permit_status",
])("allows verified status clearing for %s", (key) => {
  expect(statusClearReason(key, "Active", key, false, {})).toBeNull();
});
it("accepts verified clearing rules but respects required fields", () => {
  expect(
    statusClearReason("dev_status", "Active", "Dev Status", false, {
      dev_status: { canClear: true },
    }),
  ).toBeNull();
  expect(
    statusClearReason("dev_status", "Active", "Dev Status", true, {
      dev_status: { canClear: true },
    }),
  ).toContain("required");
});
it("reports changed fields restored by the database and adopts actual values", () => {
  const result = reconcileSave(
    { delivery_status: "Scheduled", bid: false },
    { delivery_status: null, bid: true },
    { delivery_status: "Scheduled", bid: true },
  );
  expect(result.mismatched).toEqual(["delivery_status"]);
  expect(result.value).toEqual({ delivery_status: "Scheduled", bid: true });
  expect(result.missing).toEqual([]);
});
it("distinguishes missing fields from explicit persisted nulls", () => {
  const result = reconcileSave(
    { dev_status: "Active", bid: false },
    { dev_status: null, bid: true },
    { dev_status: null },
  );
  expect(result.mismatched).toEqual([]);
  expect(result.missing).toEqual(["bid"]);
});
it("does not warn about unrelated server recalculations", () => {
  const result = reconcileSave(
    { bid: false, updated_at: "old" },
    { bid: true, updated_at: "old" },
    { bid: true, updated_at: "new" },
  );
  expect(result.mismatched).toEqual([]);
  expect(result.value.updated_at).toBe("new");
});
it("does not add unconfigured columns from the full returned row to the editor", () => {
  const result = reconcileSave(
    { bid: false },
    { bid: true },
    { bid: true, internal_column: "hidden" },
  );
  expect(result.value).toEqual({ bid: true });
  expect(result.baseline).toEqual({ bid: true });
});
const dropdown = (value: unknown, clearReason: string | null = null) =>
  renderToStaticMarkup(
    <StatusDropdown
      value={value}
      options={["Active", "Complete", "Not set", ""]}
      label="Dev Status"
      disabled={false}
      invalid={false}
      clearReason={clearReason}
      onChange={() => {}}
    />,
  );
it("renders null as a hidden disabled placeholder with no clear button", () => {
  const html = dropdown(null);
  expect(html).toMatch(
    /<option value="" disabled="" hidden="" selected="">Not set<\/option>/,
  );
  expect(html.match(/>Not set</g)).toHaveLength(1);
  expect(html).not.toContain('aria-label="Clear Dev Status"');
});
it("renders an accessible clear button only for populated clearable statuses", () => {
  expect(dropdown("Active")).toContain('aria-label="Clear Dev Status"');
  const restricted = dropdown("Active", "Cannot be cleared by workflow rules.");
  expect(restricted).not.toContain('aria-label="Clear Dev Status"');
  expect(restricted).toContain("Cannot be cleared by workflow rules.");
  expect(restricted).toContain('value="Complete"');
});
