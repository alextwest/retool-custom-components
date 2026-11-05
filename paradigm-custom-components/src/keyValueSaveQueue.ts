export type EditorData = Record<string, any>;
export const equalValues = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export const changedValues = (
  base: EditorData,
  draft: EditorData,
): EditorData =>
  Object.fromEntries(
    Object.keys(draft)
      .filter((key) => !equalValues(base[key], draft[key]))
      .map((key) => [key, draft[key]]),
  );
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export type EditorRecord = {
  base: EditorData;
  draft: EditorData;
  revisions: Record<string, number>;
  version: number;
  errors: Record<string, string>;
  message: string;
  editingField: string | null;
  lastActivity: number;
  dropdown: boolean;
  manual: boolean;
  paused: boolean;
  incoming: string;
};
export type EditorSaveRequest = {
  requestId: string;
  recordId: string;
  changeset: EditorData;
  value: EditorData;
  original: EditorData;
};
type Pending = EditorSaveRequest & { revisions: Record<string, number> };
export type SaveSettings = {
  autoSave: boolean;
  disabled: boolean;
  debounceMs: number;
  typingDebounceMs: number;
  saveWhileFocused: boolean;
};
export const initialEditorRecord = (data: EditorData = {}): EditorRecord => ({
  base: copy(data),
  draft: copy(data),
  revisions: {},
  version: 0,
  errors: {},
  message: "",
  editingField: null,
  lastActivity: 0,
  dropdown: false,
  manual: false,
  paused: false,
  incoming: JSON.stringify(data),
});
const dirty = (record: EditorRecord) =>
  Object.keys(changedValues(record.base, record.draft)).length;
const validDelay = (value: number, fallback: number) =>
  Math.max(250, Number.isFinite(value) && value > 0 ? value : fallback);

/** One immutable request at a time; local drafts and field revisions survive its acknowledgment. */
export class KeyValueSaveQueue {
  private state: {
    activeId: string;
    records: Record<string, EditorRecord>;
    pending: Pending | null;
  } = { activeId: "", records: {}, pending: null };
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private commit(
    records: Record<string, EditorRecord>,
    pending = this.state.pending,
    activeId = this.state.activeId,
  ) {
    this.state = { activeId, records, pending };
    this.listeners.forEach((listener) => listener());
  }
  select(recordId: string, data: EditorData, now: number) {
    const records = { ...this.state.records };
    const oldId = this.state.activeId;
    if (oldId !== recordId && records[oldId]?.editingField)
      records[oldId] = {
        ...records[oldId],
        editingField: null,
        lastActivity: now,
      };
    // Retool can change the selected ID a render before its details query finishes.
    const dataId = data.measure_id ?? data.id;
    const matches = dataId == null || String(dataId) === recordId;
    let record = records[recordId];
    if (!record) record = initialEditorRecord(matches ? data : {});
    else if (matches && record.incoming !== JSON.stringify(data)) {
      record =
        !dirty(record) && this.state.pending?.recordId !== recordId
          ? initialEditorRecord(data)
          : { ...record, incoming: JSON.stringify(data) };
    }
    if (records[recordId] === record && oldId === recordId) return;
    records[recordId] = record;
    this.commit(records, this.state.pending, recordId);
  }
  edit(
    recordId: string,
    key: string,
    value: unknown,
    error: string,
    dropdown: boolean,
    now: number,
  ) {
    const record = this.state.records[recordId];
    if (!record) return;
    const errors = { ...record.errors };
    if (error) errors[key] = error;
    else delete errors[key];
    this.commit({
      ...this.state.records,
      [recordId]: {
        ...record,
        draft: { ...record.draft, [key]: value },
        errors,
        revisions: { ...record.revisions, [key]: record.version + 1 },
        version: record.version + 1,
        dropdown,
        lastActivity: now,
        paused: false,
        message: "",
      },
    });
  }
  focus(recordId: string, field: string | null, now: number) {
    const record = this.state.records[recordId];
    if (!record || record.editingField === field) return;
    this.commit({
      ...this.state.records,
      [recordId]: { ...record, editingField: field, lastActivity: now },
    });
  }
  queue(recordId: string) {
    const record = this.state.records[recordId];
    if (!record || Object.keys(record.errors).length) return;
    this.commit({
      ...this.state.records,
      [recordId]: { ...record, manual: true, paused: false, message: "" },
    });
  }
  discard(recordId: string) {
    const record = this.state.records[recordId];
    if (!record || this.state.pending?.recordId === recordId) return;
    this.commit({
      ...this.state.records,
      [recordId]: {
        ...initialEditorRecord(record.base),
        incoming: record.incoming,
      },
    });
  }
  delay(settings: SaveSettings, now: number): number | null {
    const { activeId, records, pending } = this.state,
      record = records[activeId];
    if (
      settings.disabled ||
      pending ||
      !activeId ||
      !record ||
      !dirty(record) ||
      Object.keys(record.errors).length
    )
      return null;
    if (record.manual) return 0;
    if (
      !settings.autoSave ||
      record.paused ||
      (!settings.saveWhileFocused && record.editingField !== null)
    )
      return null;
    return Math.max(
      0,
      record.lastActivity +
        (record.dropdown
          ? validDelay(settings.debounceMs, 1000)
          : validDelay(settings.typingDebounceMs, 2500)) -
        now,
    );
  }
  start(
    settings: SaveSettings,
    now: number,
    requestId: string,
  ): EditorSaveRequest | null {
    if (this.delay(settings, now) !== 0) return null;
    const recordId = this.state.activeId,
      record = this.state.records[recordId];
    const request: EditorSaveRequest = copy({
      requestId,
      recordId,
      changeset: changedValues(record.base, record.draft),
      value: record.draft,
      original: record.base,
    });
    this.commit(
      {
        ...this.state.records,
        [recordId]: { ...record, manual: false, message: "" },
      },
      { ...request, revisions: { ...record.revisions } },
    );
    return request;
  }
  acknowledge(result: EditorData) {
    const pending = this.state.pending;
    if (
      !pending ||
      result?.requestId !== pending.requestId ||
      (result.success !== true && result.success !== false)
    )
      return;
    const record = this.state.records[pending.recordId];
    if (result.success === false) {
      this.commit(
        {
          ...this.state.records,
          [pending.recordId]: {
            ...record,
            paused: true,
            manual: false,
            message: String(
              result.error ||
                "Save failed. Your changes are retained. Retry Save.",
            ),
          },
        },
        null,
      );
      return;
    }
    const hasActual = Object.prototype.hasOwnProperty.call(
      result,
      "persistedValue",
    );
    const actual = hasActual ? result.persistedValue : pending.value;
    if (
      !actual ||
      typeof actual !== "object" ||
      Array.isArray(actual) ||
      (actual.measure_id != null &&
        String(actual.measure_id) !== pending.recordId)
    ) {
      this.commit(
        {
          ...this.state.records,
          [pending.recordId]: {
            ...record,
            paused: true,
            manual: false,
            message:
              "The saved result did not match this record. Your changes are retained. Retry Save.",
          },
        },
        null,
      );
      return;
    }
    const base = { ...pending.original, ...copy(actual) },
      draft = { ...record.draft };
    const missing = Object.keys(pending.changeset).filter(
      (key) => !Object.prototype.hasOwnProperty.call(actual, key),
    );
    for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
      // A later edit wins even when it reverts to the old value or the submitted value.
      if (
        (record.revisions[key] ?? 0) === (pending.revisions[key] ?? 0) &&
        !missing.includes(key)
      )
        draft[key] = base[key];
    }
    const remaining = Object.keys(changedValues(base, draft)).length;
    this.commit(
      {
        ...this.state.records,
        [pending.recordId]: {
          ...record,
          base,
          draft,
          paused: missing.length > 0,
          manual: remaining > 0 && record.manual,
          message: missing.length
            ? `Could not verify: ${missing.join(", ")}. Your changes are retained. Retry Save.`
            : remaining
              ? "Earlier changes saved; newer edits are queued."
              : "Saved",
        },
      },
      null,
    );
  }
}
