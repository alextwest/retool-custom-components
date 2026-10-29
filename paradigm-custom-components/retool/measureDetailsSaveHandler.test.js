import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("./measureDetailsSaveHandler.js", import.meta.url),
  "utf8",
);
function setup() {
  return {
    customMeasureDetails: {
      saveRequest: {
        requestId: "request-1",
        recordId: "measure-1",
        changeset: { delivery_status: null },
        original: { delivery_status: "Scheduled", scheduled_start_date: null },
        value: { delivery_status: null, scheduled_start_date: null },
      },
    },
    formatDataAsArray: (result) =>
      Object.keys(result).length
        ? result.measure_id.map((_, i) =>
            Object.fromEntries(
              Object.keys(result).map((key) => [key, result[key][i]]),
            ),
          )
        : [],
    measureOutlookAction: { setValue: vi.fn() },
    qSaveSubitemEdits: {
      trigger: vi
        .fn()
        .mockResolvedValue({
          measure_id: ["measure-1"],
          delivery_status: ["Scheduled"],
        }),
    },
    qSelectedMeasureOverview: { trigger: vi.fn() },
    qSelectedMeasureDetails: {
      trigger: vi
        .fn()
        .mockResolvedValue([
          {
            measure_id: "measure-1",
            delivery_status: "Scheduled",
            scheduled_start_date: null,
          },
        ]),
    },
    selectedMeasureId: { value: "measure-1" },
    measureEditorSaveResult: { setValue: vi.fn() },
    utils: { showNotification: vi.fn() },
  };
}
const run = (context) =>
  runInNewContext(`(async () => {${source}\n})()`, context);

it("passes actual trigger-preserved statuses back and warns without changing scheduling", async () => {
  const context = setup();
  await run(context);
  expect(context.qSaveSubitemEdits.trigger).toHaveBeenCalledWith({
    additionalScope: {
      measureChanges: [{ measure_id: "measure-1", delivery_status: null }],
    },
  });
  expect(context.measureOutlookAction.setValue).toHaveBeenCalledWith(null);
  expect(context.measureEditorSaveResult.setValue).toHaveBeenCalledWith({
    requestId: "request-1",
    success: true,
    persistedValue: {
      measure_id: "measure-1",
      delivery_status: "Scheduled",
      scheduled_start_date: null,
    },
  });
  expect(context.utils.showNotification.mock.calls[0][0].description).toContain(
    "delivery_status",
  );
});
it("acknowledges returned values if refresh fails and still attempts details refresh", async () => {
  const context = setup();
  context.qSelectedMeasureOverview.trigger.mockRejectedValue(
    new Error("refresh failed"),
  );
  await run(context);
  expect(context.qSelectedMeasureDetails.trigger).toHaveBeenCalledOnce();
  expect(
    context.measureEditorSaveResult.setValue.mock.calls[0][0].persistedValue
      .delivery_status,
  ).toBe("Scheduled");
});
it("does not refresh another selected measure", async () => {
  const context = setup();
  context.selectedMeasureId.value = "measure-2";
  await run(context);
  expect(context.qSelectedMeasureDetails.trigger).not.toHaveBeenCalled();
  expect(context.qSelectedMeasureOverview.trigger).toHaveBeenCalledOnce();
});
it("does not acknowledge success for an empty update result", async () => {
  const context = setup();
  context.qSaveSubitemEdits.trigger.mockResolvedValue([]);
  await run(context);
  expect(
    context.measureEditorSaveResult.setValue.mock.calls[0][0].success,
  ).toBe(false);
  expect(context.qSelectedMeasureOverview.trigger).not.toHaveBeenCalled();
});
