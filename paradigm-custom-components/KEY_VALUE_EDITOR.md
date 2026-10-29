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
| debounceMs | `1000` (dropdowns and checkbox) |
| typingDebounceMs | `2500` (after leaving a typed field) |
| statusClearRules | Verified clearing rules; see below |
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

Use [retool/measureDetailsSaveHandler.js](retool/measureDetailsSaveHandler.js) as the replacement save event script for `customMeasureDetails`. It preserves the existing selected-measure checks, summary/details refresh queries, status normalization, and Outlook action selection.

In `qSaveSubitemEdits`, keep the existing SQL update and replace only its `RETURNING` list with:

```sql
RETURNING m.*;
```

The existing RETURNING list includes all five statuses but omits other editable fields. Returning the full row lets the component verify every changed field even when a refresh fails. No trigger changes are required.

The component trusts a matching `{ requestId, success: true }` acknowledgment and marks the submitted draft saved immediately. `persistedValue` is optional and is not required or verified by the component. Failed acknowledgments retain edits and display the handler's error. The supplied replacement handler can still return database values and show its own notifications, but no handler or SQL change is required solely to acknowledge a successful save.


Configure `qSaveSubitemEdits` to throw on persistence failures, including application-level errors returned with HTTP 200. A resolved query alone does not prove that submitted values persisted. This preserves your existing Outlook action selection; it does not create a new Outlook integration. Autosave can invoke that existing workflow more frequently, so test its calendar behavior before enabling it.

`value` is the current draft, `changeset` contains only changed keys, `isDirty` indicates unsaved changes, and `saveRequest` contains the immutable request snapshot. The custom component has no `clearChangeset()` method: a matching success acknowledgment clears dirty state instead. Acknowledgements for previous records are ignored. Switching recordId discards that record's unsaved local edits; keep selection fixed in your app if users must save/discard before switching. Same-record data refreshes preserve dirty edits; discard them before loading external updates. Server-normalized values are picked up by a subsequent clean data refresh.

## Validation in Retool

Test a manual save, a rejected query and retry, null/false/zero edits, dropdowns, switching records, and autosave after rapid edits. Confirm only changed columns reach the save query and the calendar action remains correct. Local TypeScript/build checks do not verify the host app's query wiring or database behavior.

## Status clearing rules

The reusable status control applies to `dev_status`, `contract_status`, `delivery_status`, `hold_status`, and `permit_status`. Existing `fields[key].options` values remain the source of valid choices. The empty value is a hidden, disabled "Not set" placeholder. "Not set" is never submitted as a literal status. Allowed clearing uses a separate keyboard-accessible X button and publishes explicit `null` through the existing changeset.

`src/statusRules.ts` centralizes clearing decisions. The user verified that all five statuses can be cleared when related money and date fields are cleared. The component therefore enables clearing by default for all five statuses, subject to the current draft's related-date/amount checks. Zero amounts do not block clearing, per the requested frontend behavior. Required fields still cannot be cleared. Optional `statusClearRules` overrides can impose per-field restrictions using `{ canClear: false, reason: "cannot be cleared because ..." }`.

## Remaining live integration checks

Apply the replacement handler and `RETURNING m.*` in the Retool app. Test clearing statuses with related fields cleared, rejecting clearing while related fields remain populated, selecting another valid status, saving a value that a trigger changes, saving dates/amounts, switching records during a save, and Outlook scheduling. Component-library uploads do not update Retool app event scripts or SQL queries.

## Date and amount warnings

Editable populated fields provide an accessible X that sends explicit `null`; read-only fields and links do not. Clearing required fields still produces their existing validation error. Status X buttons additionally require related dates and amounts to be empty in the current draft, excluding zero amounts (including numeric strings such as "0.00"). Related fields are determined by configured sections, with default mappings for development (reviewed/submitted), contract (signed/incentive), and delivery (schedule dates). Optional explicit per-field restrictions still apply after dates and amounts are cleared.

The editor displays nonblocking warnings within the existing configured sections when only one half of a date/amount pair is populated. Matching `_amount` / `_date` fields are paired automatically, including reviewed, submitted, signed, installed, and invoiced. `incentive_amount` uses `incentive_received_date` when available. Both fields must exist in the editor data and be visible. Zero amounts (including numeric strings such as "0.00") do not require a matching date. A date paired with an explicitly entered zero is also accepted. Standalone dates such as schedule start/end and inspection do not require an invented amount field.

For differently named pairs, set `pairedField` on either field, for example `{ pairedField: "incentive_received_date" }`. Warnings appear in the missing field's section (falling back to the populated field's section). They do not block manual saves or autosave and disappear when both values are filled or cleared.
