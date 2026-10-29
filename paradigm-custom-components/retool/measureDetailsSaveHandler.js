// Replace customMeasureDetails' existing save event script with this code.
const request = customMeasureDetails.saveRequest;
const {
  requestId,
  recordId: measureId,
  changeset: changes = {},
  original,
  value: updatedMeasure,
} = request;
const rows = (result) =>
  Array.isArray(result) ? result : formatDataAsArray(result || {});
const findMeasure = (result) =>
  rows(result).find((row) => String(row.measure_id) === String(measureId));
let persisted = false;
let persistedValue;

try {
  if (!measureId) throw new Error("No measure is currently selected.");
  const hadSchedule = original.scheduled_start_date != null;
  const hasSchedule = updatedMeasure.scheduled_start_date != null;
  const outlookAction =
    !hadSchedule && hasSchedule
      ? "create"
      : hadSchedule && hasSchedule
        ? "update"
        : hadSchedule && !hasSchedule
          ? "delete"
          : null;
  await measureOutlookAction.setValue(outlookAction);

  const normalizedChanges = { ...changes };
  for (const field of [
    "dev_status",
    "contract_status",
    "delivery_status",
    "hold_status",
    "permit_status",
  ]) {
    if (
      Object.prototype.hasOwnProperty.call(changes, field) ||
      (Object.prototype.hasOwnProperty.call(updatedMeasure || {}, field) &&
        updatedMeasure[field] !== original?.[field])
    ) {
      const value = updatedMeasure?.[field];
      normalizedChanges[field] =
        value === "" || value === undefined || value === "Not set"
          ? null
          : value;
    }
  }
  const result = await qSaveSubitemEdits.trigger({
    additionalScope: {
      measureChanges: [{ ...normalizedChanges, measure_id: measureId }],
    },
  });
  // Capture RETURNING values immediately, including nulls preserved/replaced by triggers.
  persistedValue = findMeasure(result);
  if (!persistedValue)
    throw new Error(
      "The update returned no matching measure. Refresh the record before retrying.",
    );
  persisted = true;

  try {
    await qSelectedMeasureOverview.trigger();
  } finally {
    if (String(selectedMeasureId.value) === String(measureId)) {
      const refreshed = await qSelectedMeasureDetails.trigger();
      const actual = findMeasure(refreshed);
      if (actual) persistedValue = { ...persistedValue, ...actual };
    }
  }
} catch (error) {
  const message = String(error?.message || error);
  if (persisted) {
    utils.showNotification({
      title: "Update executed; refresh failed",
      description: message,
      notificationType: "warning",
    });
  } else {
    await measureEditorSaveResult.setValue({
      requestId,
      success: false,
      error: message,
    });
    utils.showNotification({
      title: "Save failed",
      description: message,
      notificationType: "error",
    });
  }
} finally {
  if (persisted) {
    const changed = Object.keys(changes);
    const hasField = (field) =>
      Object.prototype.hasOwnProperty.call(persistedValue, field);
    const mismatched = changed.filter(
      (field) =>
        hasField(field) &&
        JSON.stringify(persistedValue[field]) !==
          JSON.stringify(updatedMeasure[field]),
    );
    const missing = changed.filter((field) => !hasField(field));
    if (mismatched.length || missing.length) {
      const explanations = [];
      if (mismatched.length)
        explanations.push(
          `Not saved as entered: ${mismatched.join(", ")}. A database rule may have preserved or recalculated these values.`,
        );
      if (missing.length)
        explanations.push(
          `Could not verify: ${missing.join(", ")}. The database result did not include these fields.`,
        );
      utils.showNotification({
        title: "Check saved values",
        description: explanations.join(" "),
        notificationType: "warning",
      });
    }
    await measureEditorSaveResult.setValue({
      requestId,
      success: true,
      persistedValue,
    });
  }
}
