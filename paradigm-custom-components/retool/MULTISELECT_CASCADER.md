# Measure status multiselect cascader

The library exports `MultiSelectCascader`: category navigation, search across categories, removable tags, clear, and persistent multiple selections. Only leaves can be selected. Values retain the JSON-encoded `[field, status]` strings used by the exported `qProjects`; the SQL needs no change.

## Install

Run `npm run deploy` from this repository and select the new ParadigmCustomComponents library version in your app. Add **MultiSelectCascader** from that library.

Rename the old component to `measureStatusFilterOld`, then name the new one `measureStatusFilter`. Retool may rewrite references on rename: restore `measureStatusFilter` in `qProjects`, Clear Filters, and the Clear Filters button's Disabled expression.

Set **App theme** to `{{ theme }}`. Set **Options** to the old Cascader's data source, or paste:

```javascript
{{
  [
    { value: "dev_status", label: "Dev Status" },
    { value: "contract_status", label: "Contract Status" },
    { value: "delivery_status", label: "Delivery Status" }
  ].flatMap(group => [
    { ...group, parent: null },
    ...[...new Set(
      formatDataAsArray(qSubitemStatuses.data ?? [])
        .filter(row => row.field_name === group.value)
        .map(row => row.value)
        .filter(status => typeof status === "string" && status.trim())
    )].map(status => ({
      value: JSON.stringify([group.value, status]),
      label: status,
      parent: group.value
    }))
  ])
}}
```

Initialize **Value** to `{{ [] }}`. Leave it as component state; do not bind it to itself. Set **Label** to `Measure Status Filter`.

Add **Change → Run script**:

```javascript
qRunMainTabQueries.trigger();
```

In Clear Filters, replace `measureStatusFilter.clearValue();` with:

```javascript
measureStatusFilter.setValue([]);
```

After clearing all filters, call `qRunMainTabQueries.trigger();` to refresh results; custom state setters do not emit the component's Change event. The Clear Filters Disabled expression can continue using `measureStatusFilter.value?.length`.

## Compact filter row

Custom components render inside an iframe. Their dropdown cannot escape that frame, even with a portal or high z-index. Dropdown mode requires enough component height for the open menu (approximately 430–500 px including tags), leaving unused canvas space when closed. It is not a drop-in overlay for a 40 px filter row.

To keep the filter row compact using documented native containers, put the picker inside a **Retool modal**, and set **Picker only** to `true`. Give the component roughly 400 px height. Open the modal from a button in the filter row, using this button label:

```javascript
{{ measureStatusFilter.value?.length
  ? `${measureStatusFilter.value.length} statuses selected`
  : "Select options" }}
```

Put the Measure Status Filter label above the button and style it to match adjacent filters. This opens a modal, rather than an anchored dropdown. In picker-only mode, selected rows show checkmarks and the footer shows the count. A native-sized anchored dropdown cannot be delivered by this custom component alone. If an anchored dropdown with no extra canvas space is essential, the native Multiselect with category-prefixed labels is the supported fallback, at the cost of drill-down navigation.

## Verify in Retool

Select two Dev statuses, then a Contract status. The picker should remain open and `measureStatusFilter.value` should contain three JSON strings. Confirm `qProjects` matches any selected pair. Deselect a row, remove a tag in dropdown mode, search across groups, and clear all filters. Confirm the value becomes `[]` and results refresh. Keep the old component until these checks pass.

Local validation does not verify Retool's deployed host layout or live query results.
