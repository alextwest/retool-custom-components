import React from "react";
// @ts-expect-error The library does not currently install @types/react-dom.
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { KeyValueEditor } from "./KeyValueEditor";

const fixture = vi.hoisted(() => ({
  data: { measure_id: "measure-1", notes: "original", source_id: "read only" },
}));
vi.mock("./theme", () => ({ useAppTheme: () => ({}) }));
vi.mock("@tryretool/custom-component-support", () => ({
  Retool: {
    useStateObject: ({ name, initialValue }: any) => [
      name === "data"
        ? fixture.data
        : name === "fields"
          ? { notes: { label: "Notes" }, source_id: { label: "Source ID" } }
          : initialValue,
      vi.fn(),
    ],
    useStateString: ({ name, initialValue }: any) => [
      name === "recordId" ? "measure-1" : initialValue,
      vi.fn(),
    ],
    useStateBoolean: ({ initialValue }: any) => [initialValue, vi.fn()],
    useStateNumber: ({ initialValue }: any) => [initialValue, vi.fn()],
    useEventCallback: () => vi.fn(),
  },
}));
vi.mock("./keyValueSaveQueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./keyValueSaveQueue")>();
  return {
    ...actual,
    KeyValueSaveQueue: class extends actual.KeyValueSaveQueue {
      constructor() {
        super();
        this.select("measure-1", fixture.data, 0);
        this.edit("measure-1", "notes", "first", "", false, 0);
        this.queue("measure-1");
        this.start(
          {
            autoSave: false,
            disabled: false,
            debounceMs: 1000,
            typingDebounceMs: 2500,
            saveWhileFocused: true,
          },
          1,
          "one",
        );
        this.edit("measure-1", "notes", "newer typing", "", false, 2);
      }
    },
  };
});
it("keeps editable inputs enabled with their newer values while a snapshot is saving", () => {
  const html = renderToStaticMarkup(<KeyValueEditor />);
  const notes = html.match(/<input[^>]*aria-label="Notes"[^>]*>/)?.[0];
  expect(notes).toBeDefined();
  expect(notes).not.toContain("disabled");
  expect(notes).toContain('value="newer typing"');
  expect(html.match(/<input[^>]*aria-label="Source ID"[^>]*>/)?.[0]).toContain(
    "disabled",
  );
  expect(html).toContain("New edits queued");
  expect(html).toContain("Queue changes");
});
