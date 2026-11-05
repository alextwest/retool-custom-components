import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
const script = readFileSync(
  new URL("./fileTreeFileSelect.js", import.meta.url),
  "utf8",
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function setup(node) {
  const env = {
    dynamicWidgetFileTree: { selectedNode: JSON.stringify(node) },
    qListFolderChildren: { trigger: vi.fn() },
    utils: { openUrl: vi.fn() },
  };
  return {
    ...env,
    run: () =>
      new AsyncFunction(...Object.keys(env), script)(...Object.values(env)),
  };
}
it("does not launch a file again when the component already handled the native row click", async () => {
  const h = setup({
    type: "file",
    url: "https://example.com/file.docx",
    openUrl: "ms-word:ofe|u|https://example.com/file.docx",
    openHandled: true,
  });
  await h.run();
  expect(h.utils.openUrl).not.toHaveBeenCalled();
  expect(h.qListFolderChildren.trigger).not.toHaveBeenCalled();
});
it("supports older components by opening their preferred desktop URL once", async () => {
  const h = setup({
    type: "file",
    url: "https://example.com/file.docx",
    openUrl: "ms-word:ofe|u|https://example.com/file.docx",
  });
  await h.run();
  expect(h.utils.openUrl).toHaveBeenCalledExactlyOnceWith(
    "ms-word:ofe|u|https://example.com/file.docx",
    { newTab: true },
  );
});
it("uses the browser for a browser-preference selection", async () => {
  const h = setup({
    type: "file",
    url: "https://example.com/file.docx",
    openUrl: "https://example.com/file.docx",
  });
  await h.run();
  expect(h.utils.openUrl).toHaveBeenCalledExactlyOnceWith(
    "https://example.com/file.docx",
    { newTab: true },
  );
});
it("falls back for an explicitly reported launch error", async () => {
  const h = setup({
    type: "file",
    url: "https://example.com/file.docx",
    openUrl: "ms-word:ofe|u|https://example.com/file.docx",
  });
  h.utils.openUrl.mockRejectedValueOnce(new Error("Launch blocked"));
  await h.run();
  expect(h.utils.openUrl).toHaveBeenNthCalledWith(
    2,
    "https://example.com/file.docx",
    { newTab: true },
  );
});
it("does not guess a denial and open a second window when the opener returns no status", async () => {
  const h = setup({
    type: "file",
    url: "https://example.com/file.docx",
    openUrl: "ms-word:ofe|u|https://example.com/file.docx",
  });
  h.utils.openUrl.mockResolvedValue(undefined);
  await h.run();
  expect(h.utils.openUrl).toHaveBeenCalledTimes(1);
});
it("still loads folder children without opening a browser or claiming an Explorer launch", async () => {
  const h = setup({
    type: "folder",
    sharepoint_id: "folder-1",
    url: "https://example.com/folder",
  });
  await h.run();
  expect(h.qListFolderChildren.trigger).toHaveBeenCalledExactlyOnceWith({
    additionalScope: { folderItemId: "folder-1" },
  });
  expect(h.utils.openUrl).not.toHaveBeenCalled();
});
