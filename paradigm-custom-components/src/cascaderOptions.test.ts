import { expect, it } from "vitest";
import { normalizeOptions, optionPath } from "./cascaderOptions";

it("keeps identical statuses in separate fields distinct", () => {
  const values = ["dev_status", "contract_status"].map(field => JSON.stringify([field, "Pending"]));
  const rows = normalizeOptions(values.map(value => ({ value, label: "Pending" })));
  expect(rows.map(row => row.value)).toEqual(values);
  expect(normalizeOptions([null, {}, ...rows, rows[0]])).toHaveLength(2);
});

it("builds nested search labels and terminates on parent cycles", () => {
  const rows = normalizeOptions([{ value: "contract_status", label: "Contract Status" }, { value: "leaf", label: "Retracted", parent: "contract_status" }]);
  expect(optionPath(rows[1], rows).map(row => row.label).join(" / ")).toBe("Contract Status / Retracted");
  const cyclic = normalizeOptions([{ value: "a", parent: "b" }, { value: "b", parent: "a" }]);
  expect(optionPath(cyclic[0], cyclic)).toHaveLength(2);
});
