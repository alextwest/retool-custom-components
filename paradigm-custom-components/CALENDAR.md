# Calendar ServiceTitan display

The calendar toolbar includes an **Include ServiceTitan** checkbox (enabled by default). It filters ServiceTitan events from every view. The checkbox is also exposed to Retool as `includeServiceTitan`.

In week, multiweek, and month views, ServiceTitan appears below the main crews in each week. Click its section header to collapse or expand all ServiceTitan sections. Headers show crew and appointment counts for that week; the left column lists each crew separately.

## API mapping

ServiceTitan events are recognized when `source`, `platform`, the configured resource field, the configured crew-name field, or the matching crew name is `ServiceTitan` (ignoring spaces, punctuation, and capitalization).

Add a dedicated crew value to each API event, for example:

```json
{
  "id": "st-123",
  "source": "ServiceTitan",
  "resource_id": "ServiceTitan",
  "crew_name": "ServiceTitan",
  "serviceTitanCrew": "Pat",
  "title": "Corina Mincia",
  "start": "2026-10-29",
  "end": "2026-10-29"
}
```

Set the Retool property `serviceTitanCrewField` to the name of your API field if it differs from `serviceTitanCrew`. It expects a flat string or number. Missing or blank values appear under **Unassigned**; crew names are not inferred from appointment titles. For appointments assigned to multiple people, supply a crew label such as `Colby, Erik Palm` to keep one appointment in one row.

Original event objects and existing event colors are preserved. Each row shows the number of appointments overlapping the week. Collapsing the section leaves its summary visible; unchecking Include ServiceTitan hides it entirely.
