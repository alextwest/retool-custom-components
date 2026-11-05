import { describe, expect, it } from "vitest";
import {
  attachmentDetails,
  filesForUpdate,
  buildThreads,
  emptyDraft,
  matchesThread,
  mentionParts,
  readUploads,
  recipients,
  safeUrl,
} from "./projectUpdatesModel";

describe("project update conversations", () => {
  it("matches attachment update IDs for roots and replies despite UUID casing or whitespace", () => {
    const files = [
      { update_id: " ABC ", file_name: "root.pdf" },
      { updateId: "reply", file_name: "reply.png" },
      { file_name: "unlinked.txt" },
    ];
    expect(filesForUpdate(files, "abc").map((f) => f.file_name)).toEqual([
      "root.pdf",
    ]);
    expect(filesForUpdate(files, "reply").map((f) => f.file_name)).toEqual([
      "reply.png",
    ]);
    expect(filesForUpdate(files, "")).toEqual([]);
  });
  it("uses a valid preview URL rather than treating a SharePoint page as an image", () => {
    const file = {
      file_name: "photo.jpg",
      sharepoint_web_url: "https://example.com/photo.aspx",
    };
    expect(attachmentDetails(file)).toMatchObject({
      href: "https://example.com/photo.aspx",
      thumbnail: null,
      extension: "jpg",
    });
    expect(
      attachmentDetails({
        ...file,
        thumbnail_url: "https://example.com/thumb.jpg",
      }).thumbnail,
    ).toBe("https://example.com/thumb.jpg");
    expect(
      attachmentDetails({
        ...file,
        sharepoint_web_url: "",
        web_url: "https://example.com/photo.jpg",
      }).href,
    ).toBe("https://example.com/photo.jpg");
  });
  const root = {
    id: "a",
    update_text: "Schedule reviewed",
    created_by: "Alex",
    created_at: "2026-11-01",
    source: "teams_dev_channel",
  };
  const reply = {
    id: "b",
    parent_update_id: "a",
    update_text: "Permit approved",
    created_by: "Morgan",
    created_at: "2026-11-02",
  };
  it("keeps nested replies and orphan conversations visible", () => {
    const nested = { id: "c", parent_update_id: "b" },
      orphan = { id: "d", parent_update_id: "missing" };
    const threads = buildThreads([nested, reply, root, orphan]);
    expect(threads.roots.map((r) => r.id)).toEqual(["a", "d"]);
    expect(threads.replies.get("a")).toEqual([nested, reply]);
  });
  it("does not hide circular or self-referencing data", () => {
    const threads = buildThreads([
      { id: "a", parent_update_id: "b" },
      { id: "b", parent_update_id: "a" },
      { id: "c", parent_update_id: "c" },
    ]);
    expect(threads.roots.map((r) => r.id)).toEqual(["a", "c"]);
    expect(threads.replies.get("a")?.map((r) => r.id)).toEqual(["b"]);
  });
  it("finds terms in replies, authors and attachment names across a thread", () => {
    const files = [{ update_id: "b", file_name: "Approved drawings.pdf" }];
    expect(matchesThread(root, [reply], files, "morgan drawings")).toBe(true);
    expect(matchesThread(root, [reply], files, "sales")).toBe(false);
  });
  it("highlights full names without swallowing following prose or matching partial names", () => {
    const parts = mentionParts("@Alex West Is this ready? @Alex Weston", [
      { full_name: "Alex West", email: "alex@example.com" },
    ]);
    expect(parts.filter((p) => p.mention).map((p) => p.text)).toEqual([
      "@Alex West",
    ]);
    expect(parts.map((p) => p.text).join("")).toBe(
      "@Alex West Is this ready? @Alex Weston",
    );
  });
  it("escapes names with punctuation when rendering legacy mentions", () => {
    expect(
      mentionParts("@A. [West] ready", [
        { full_name: "A. [West]", email: "a@example.com" },
      ])[0],
    ).toEqual({ text: "@A. [West]", mention: true });
  });
  it("deduplicates only selected, surviving recipients", () => {
    const d = emptyDraft();
    d.text = "@Alex West and @Alex West";
    d.mentions = [
      { start: 0, end: 10, full_name: "Alex West", email: "a@example.com" },
      { start: 15, end: 25, full_name: "Alex West", email: "a@example.com" },
    ];
    expect(recipients(d)).toEqual([
      { full_name: "Alex West", email: "a@example.com" },
    ]);
    expect(recipients({ ...d, text: "deleted" })).toEqual([]);
  });
  it("blocks script and relative attachment URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("/admin")).toBeNull();
    expect(safeUrl("https://example.com/file.pdf")).toBe(
      "https://example.com/file.pdf",
    );
  });
  it("rejects oversize files before reading their contents", async () => {
    await expect(
      readUploads([new File(["12345"], "f.txt")], [], 4),
    ).rejects.toThrow("limit");
  });
  it("deduplicates repeated picks and rejects filename collisions", async () => {
    const existing = [
      { name: "f.txt", sizeBytes: 3, type: "text/plain", base64Data: "MTIz" },
    ];
    await expect(
      readUploads([new File(["123"], "f.txt")], existing, 100),
    ).resolves.toEqual([]);
    await expect(
      readUploads([new File(["1234"], "F.txt")], existing, 100),
    ).rejects.toThrow("Rename");
  });
});
