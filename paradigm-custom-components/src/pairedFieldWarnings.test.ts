import { expect, it } from "vitest";
import { pairedFieldWarnings } from "./pairedFieldWarnings";

it("warns for a date without an amount in its configured section", () => {
  expect(
    pairedFieldWarnings(
      { signed_date: "2026-10-29", signed_amount: null },
      {
        signed_amount: {
          group: "Contract and incentives",
          label: "Signed Amount",
        },
      },
    ),
  ).toEqual([
    {
      group: "Contract and incentives",
      message:
        "Signed Date is entered, but Signed Amount is missing. Add the matching value if applicable.",
    },
  ]);
});
it("warns for a nonzero amount without a date", () => {
  expect(
    pairedFieldWarnings({ invoiced_amount: 100, invoiced_date: "" }, {}),
  ).toHaveLength(1);
});
it.each([0, "0", "0.00"])(
  "does not require a date for a zero amount (%s)",
  (amount) => {
    expect(
      pairedFieldWarnings(
        { incentive_amount: amount, incentive_received_date: null },
        {},
      ),
    ).toEqual([]);
  },
);
it("applies the zero exemption to explicitly configured numeric pairs", () => {
  expect(
    pairedFieldWarnings(
      { cost: 0, completion: null },
      { cost: { type: "number", pairedField: "completion" } },
    ),
  ).toEqual([]);
});
it("accepts complete and entirely empty pairs", () => {
  expect(
    pairedFieldWarnings(
      {
        reviewed_amount: 0,
        reviewed_date: "2026-10-29",
        submitted_amount: null,
        submitted_date: " ",
      },
      {},
    ),
  ).toEqual([]);
});
it("pairs incentives with the received date", () => {
  expect(
    pairedFieldWarnings(
      { incentive_amount: 200, incentive_received_date: null },
      {},
    )[0].message,
  ).toContain("Incentive Received Date is missing");
});
it("does not invent amounts for standalone schedule or inspection dates", () => {
  expect(
    pairedFieldWarnings(
      { scheduled_start_date: "2026-10-29", inspection_date: "2026-10-29" },
      {},
    ),
  ).toEqual([]);
});
it("supports explicit pair names without duplicate warnings", () => {
  expect(
    pairedFieldWarnings(
      { cost: 100, completion: null },
      {
        cost: { pairedField: "completion" },
        completion: { pairedField: "cost" },
      },
    ),
  ).toHaveLength(1);
});
it("omits hidden and absent counterpart fields", () => {
  expect(
    pairedFieldWarnings(
      { installed_amount: 1, installed_date: null, signed_amount: 2 },
      { installed_date: { hidden: true } },
    ),
  ).toEqual([]);
});
