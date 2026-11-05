import { describe, expect, it } from "vitest";
import {
  changedValues,
  KeyValueSaveQueue,
  SaveSettings,
} from "./keyValueSaveQueue";

const settings: SaveSettings = {
  autoSave: true,
  disabled: false,
  debounceMs: 1000,
  typingDebounceMs: 2500,
  saveWhileFocused: true,
};
const setup = () => {
  const q = new KeyValueSaveQueue();
  q.select("a", { notes: "original", cost: 0, status: "Old" }, 0);
  return q;
};
const current = (q: KeyValueSaveQueue, id = "a") => q.getSnapshot().records[id];
const start = (q: KeyValueSaveQueue, id = "one") => {
  q.queue(q.getSnapshot().activeId);
  return q.start(settings, 10000, id)!;
};
describe("nonblocking key value save queue", () => {
  it("batches changes after a quiet period even while the input remains focused", () => {
    const q = setup();
    q.focus("a", "notes", 0);
    q.edit("a", "notes", "new", "", false, 100);
    q.edit("a", "cost", 200, "", false, 500);
    expect(q.delay(settings, 1000)).toBe(2000);
    expect(q.start(settings, 2999, "early")).toBeNull();
    expect(q.start(settings, 3000, "one")?.changeset).toEqual({
      notes: "new",
      cost: 200,
    });
  });
  it("supports waiting until blur when saveWhileFocused is off", () => {
    const q = setup(),
      s = { ...settings, saveWhileFocused: false };
    q.focus("a", "notes", 0);
    q.edit("a", "notes", "new", "", false, 100);
    expect(q.delay(s, 10000)).toBeNull();
    q.focus("a", null, 10000);
    expect(q.delay(s, 10000)).toBe(2500);
  });
  it("coalesces rapid dropdown changes into one request", () => {
    const q = setup();
    q.edit("a", "status", "One", "", true, 100);
    q.edit("a", "status", "Two", "", true, 500);
    expect(q.delay(settings, 600)).toBe(900);
    expect(q.start(settings, 1500, "one")?.changeset).toEqual({
      status: "Two",
    });
  });
  it("keeps inputs' latest draft while permitting only one in-flight request", () => {
    const q = setup();
    q.edit("a", "notes", "first", "", false, 0);
    const sent = start(q);
    q.edit("a", "notes", "second", "", false, 1);
    q.edit("a", "cost", 50, "", false, 2);
    expect(current(q).draft).toMatchObject({ notes: "second", cost: 50 });
    expect(sent.value.notes).toBe("first");
    expect(sent.changeset).toEqual({ notes: "first" });
    expect(q.start(settings, 20000, "overlap")).toBeNull();
    q.acknowledge({ requestId: "one", success: true });
    const next = q.start(settings, 20000, "two")!;
    expect(next.original.notes).toBe("first");
    expect(next.changeset).toEqual({ notes: "second", cost: 50 });
  });
  it("does not lose a revert to the old baseline while its replacement is saving", () => {
    const q = setup();
    q.edit("a", "notes", "first", "", false, 0);
    start(q);
    q.edit("a", "notes", "original", "", false, 1);
    expect(changedValues(current(q).base, current(q).draft)).toEqual({});
    q.acknowledge({ requestId: "one", success: true });
    expect(changedValues(current(q).base, current(q).draft)).toEqual({
      notes: "original",
    });
    expect(q.start(settings, 20000, "two")?.changeset).toEqual({
      notes: "original",
    });
  });
  it("uses field revisions when newer edits end at the same value that was submitted", () => {
    const q = setup();
    q.edit("a", "status", "New", "", true, 0);
    start(q);
    q.edit("a", "status", "Other", "", true, 1);
    q.edit("a", "status", "New", "", true, 2);
    q.acknowledge({
      requestId: "one",
      success: true,
      persistedValue: { notes: "original", cost: 0, status: "Database value" },
    });
    expect(current(q).base.status).toBe("Database value");
    expect(current(q).draft.status).toBe("New");
  });
  it("adopts authoritative trigger-normalized values for fields that were not edited again", () => {
    const q = setup();
    q.edit("a", "status", null, "", true, 0);
    start(q);
    q.acknowledge({
      requestId: "one",
      success: true,
      persistedValue: { notes: "original", cost: 0, status: "Preserved" },
    });
    expect(current(q).draft.status).toBe("Preserved");
    expect(q.delay(settings, 20000)).toBeNull();
  });
  it("does not mark missing persisted fields saved or retry them forever", () => {
    const q = setup();
    q.edit("a", "notes", "new", "", false, 0);
    start(q);
    q.acknowledge({
      requestId: "one",
      success: true,
      persistedValue: { cost: 0, status: "Old" },
    });
    expect(current(q).draft.notes).toBe("new");
    expect(current(q).base.notes).toBe("original");
    expect(current(q).message).toContain("Could not verify: notes");
    expect(q.delay(settings, 20000)).toBeNull();
  });
  it("retains all changes on failure and retries only on explicit save or another edit", () => {
    const q = setup();
    q.edit("a", "notes", "first", "", false, 0);
    start(q);
    q.edit("a", "cost", 50, "", false, 1);
    q.acknowledge({ requestId: "one", success: false, error: "Unavailable" });
    expect(q.delay(settings, 20000)).toBeNull();
    q.queue("a");
    expect(q.start(settings, 20000, "two")?.changeset).toEqual({
      notes: "first",
      cost: 50,
    });
  });
  it("ignores unmatched or incomplete acknowledgments", () => {
    const q = setup();
    q.edit("a", "notes", "first", "", false, 0);
    start(q);
    q.acknowledge({ requestId: "old", success: true });
    q.acknowledge({ requestId: "one" });
    expect(q.getSnapshot().pending?.requestId).toBe("one");
  });
  it("does not overwrite an active draft with query refreshes", () => {
    const q = setup();
    q.edit("a", "notes", "first", "", false, 0);
    start(q);
    q.edit("a", "notes", "second", "", false, 1);
    q.select("a", { notes: "first", cost: 100, status: "Old" }, 2);
    expect(current(q).draft.notes).toBe("second");
    q.acknowledge({
      requestId: "one",
      success: true,
      persistedValue: { notes: "first", cost: 100, status: "Old" },
    });
    expect(current(q).draft).toMatchObject({ notes: "second", cost: 100 });
  });
  it("routes a delayed acknowledgment to its record after selection changes", () => {
    const q = setup();
    q.edit("a", "notes", "first", "", false, 0);
    start(q);
    q.edit("a", "notes", "second", "", false, 1);
    q.select("b", { measure_id: "b", notes: "record b" }, 2);
    q.edit("b", "notes", "new b", "", false, 3);
    q.acknowledge({ requestId: "one", success: true });
    expect(current(q, "b").draft.notes).toBe("new b");
    expect(current(q).draft.notes).toBe("second");
    q.select("a", { notes: "first", cost: 0, status: "Old" }, 4);
    expect(current(q).draft.notes).toBe("second");
  });
  it("does not render a previous measure's data under a newly selected ID", () => {
    const q = new KeyValueSaveQueue();
    q.select("b", { measure_id: "a", notes: "Wrong record" }, 0);
    expect(current(q, "b").draft).toEqual({});
    q.select("b", { measure_id: "b", notes: "Correct" }, 1);
    expect(current(q, "b").draft.notes).toBe("Correct");
  });
  it("lets a manual save queued during a request run afterward even with autosave off", () => {
    const q = setup(),
      s = { ...settings, autoSave: false, saveWhileFocused: false };
    q.edit("a", "notes", "first", "", false, 0);
    q.queue("a");
    q.start(s, 1, "one");
    q.edit("a", "notes", "second", "", false, 2);
    q.queue("a");
    q.acknowledge({ requestId: "one", success: true });
    expect(q.start(s, 3, "two")?.changeset).toEqual({ notes: "second" });
  });
  it("keeps invalid intermediate input cached without sending it", () => {
    const q = setup();
    q.edit("a", "notes", "{", "Enter valid JSON", false, 0);
    q.queue("a");
    expect(q.delay(settings, 10000)).toBeNull();
    q.edit("a", "notes", { valid: true }, "", false, 1);
    expect(q.start(settings, 10000, "one")?.changeset.notes).toEqual({
      valid: true,
    });
  });
  it("does not discard a snapshot that may already be committing", () => {
    const q = setup();
    q.edit("a", "notes", "first", "", false, 0);
    start(q);
    q.discard("a");
    expect(current(q).draft.notes).toBe("first");
    expect(q.getSnapshot().pending).not.toBeNull();
  });
});
