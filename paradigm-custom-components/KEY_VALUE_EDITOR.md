# KeyValueEditor: measure details integration

`KeyValueEditor` is exported by this library. It provides responsive grouped fields, search, nullable values, typed editors, read-only fields, dirty indicators, Discard, Save changes, and optional debounced autosave. It follows `appTheme = {{ theme }}`.

## Install in your app

From `paradigm-custom-components`, run `npm run dev` for local development or `npm run deploy` to publish a version. Add KeyValueEditor from Paradigm Custom Components and name the instance `measureDetailsEditor`.

Set these Inspector properties:

| Property | Binding |
| --- | --- |
| data | `{{ formatDataAsArray(qSelectedMeasureDetails.data)[0] || {} }}` |
| recordId | `{{ selectedMeasureId.value || '' }}` |
| appTheme | `{{ theme }}` |
| title | `Measure details` |
| autoSave | `false` initially; enable after testing the save handler |
| debounceMs | `900` |
| saveResult | `{{ measureEditorSaveResult.value }}` |

Create a Retool temporary state named `measureEditorSaveResult`, initialized to `{}`. This state acknowledges saves; without it the editor will stay in Saving state. A failed save retains changes, stops automatic retries for that draft, and enables manual retry. Editing again allows another autosave. Inputs are disabled during saves to keep the save snapshot stable.

Configure `fields` as an object, for example:

```javascript
{
  measure_name: { label: "Measure name", group: "Overview", required: true },
  measure_key: { group: "Overview" },
  contract_status: { group: "Status" },
  delivery_status: { group: "Status" },
  dev_status: { group: "Status" },
  crew: { group: "Schedule" },
  schedule_confidence: { group: "Schedule", type: "select", options: ["Tentative", "Confirmed"] },
  scheduled_start_date: { group: "Schedule", type: "date" },
  scheduled_end_date: { group: "Schedule", type: "date" },
  signed_date: { group: "Financials", type: "date" },
  signed_amount: { group: "Financials", type: "number" },
  incentive_amount: { group: "Financials", type: "number" },
  installed_amount: { group: "Financials", type: "number" },
  invoiced_amount: { group: "Financials", type: "number" },
  submitted_amount: { group: "Financials", type: "number" },
  reviewed_amount: { group: "Financials", type: "number" },
  final_scope_web_url: { group: "Documents", readOnly: true },
  source_subitem_json: { hidden: true }
}
```

Use your actual allowed status and crew options when configuring selects. Unconfigured fields still appear. IDs, timestamps, source fields, durations, and aging metrics default to read-only; override with `readOnly: false` only when intentional. Date-suffixed fields infer a date editor, booleans infer a nullable true/false select, numbers infer a number editor, and objects infer JSON. Nullable fields otherwise default to text, so explicitly configure their intended types. Edited numeric strings become numbers; empty inputs become `null`. There is no key renaming or deletion, so database columns remain stable.

## Save event handler

Add a **save ? Run script** handler with the code below. Do not also save from the change event when using autosave. `change` is available for dependent UI/validation; `reset` fires on Discard. Events have no payload: exposed state supplies the values.

```javascript
const request = measureDetailsEditor.saveRequest;
const { requestId, recordId: measureId, changeset: changes, original, value } = request;
let persisted = false;
try {
  if (!measureId) throw new Error("No measure is selected.");
  const hadSchedule = original.scheduled_start_date != null;
  const hasSchedule = value.scheduled_start_date != null;
  const outlookAction = !hadSchedule && hasSchedule ? "create"
    : hadSchedule && hasSchedule ? "update"
    : hadSchedule && !hasSchedule ? "delete" : null;

  await measureOutlookAction.setValue(outlookAction);
  await qSaveSubitemEdits.trigger({
    additionalScope: { measureChanges: [{ ...changes, measure_id: measureId }] }
  });
  persisted = true;
  await qSelectedMeasureOverview.trigger();
  // Avoid restoring an old selection if the user moved to another measure during save.
  if (selectedMeasureId.value === measureId) {
    await qSelectedMeasureDetails.trigger();
  }
} catch (error) {
  if (persisted) {
    utils.showNotification({
      title: "Saved; refresh failed",
      description: String(error?.message || error),
      notificationType: "warning"
    });
  } else {
    await measureEditorSaveResult.setValue({
      requestId, success: false, error: String(error?.message || error)
    });
  }
} finally {
  if (persisted) {
    await measureEditorSaveResult.setValue({ requestId, success: true });
  }
}
```

Configure `qSaveSubitemEdits` to throw on persistence failures, including application-level errors returned with HTTP 200. A resolved query is treated as success. This preserves your existing Outlook action selection; it does not create a new Outlook integration. Autosave can invoke that existing workflow more frequently, so test its calendar behavior before enabling it.

`value` is the current draft, `changeset` contains only changed keys, `isDirty` indicates unsaved changes, and `saveRequest` contains the immutable request snapshot. The custom component has no `clearChangeset()` method: matching success acknowledgement clears dirty state instead. Acknowledgements for previous records are ignored. Switching recordId discards that record's unsaved local edits; keep selection fixed in your app if users must save/discard before switching. Same-record data refreshes preserve dirty edits; discard them before loading external updates. Server-normalized values are picked up by the next clean data refresh.

## Validation in Retool

Test a manual save, a rejected query and retry, null/false/zero edits, dropdowns, switching records, and autosave after rapid edits. Confirm only changed columns reach the save query and the calendar action remains correct. Local TypeScript/build checks do not verify the host app's query wiring or database behavior.
