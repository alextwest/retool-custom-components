import React from "react";
// @ts-expect-error The library does not currently install @types/react-dom.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SavedAttachment, UpdatesSection } from "./ProjectUpdates";

vi.mock("@tryretool/custom-component-support", () => ({ Retool: {} }));
// Server rendering does not run layout effects; the browser measures the caret.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useLayoutEffect: actual.useEffect };
});
describe("full updates section rendering", () => {
  it("renders a clickable attachment card with an image thumbnail when supplied", () => {
    const html = renderToStaticMarkup(
      <SavedAttachment
        file={{
          file_name: "site.jpg",
          sharepoint_web_url: "https://example.com/site",
          thumbnail_url: "https://example.com/site-thumb.jpg",
          file_size_bytes: 2048,
        }}
      />,
    );
    expect(html).toContain('aria-label="Open site.jpg"');
    expect(html).toContain('src="https://example.com/site-thumb.jpg"');
    expect(html).toContain("2 KB");
    expect(html).toContain("Open file");
  });
  it("keeps a document link without a thumbnail and identifies missing links", () => {
    const linked = renderToStaticMarkup(
      <SavedAttachment
        file={{
          file_name: "scope.pdf",
          sharepoint_web_url: "https://example.com/scope.pdf",
        }}
      />,
    );
    expect(linked).toContain("PDF");
    expect(linked).toContain('href="https://example.com/scope.pdf"');
    const missing = renderToStaticMarkup(
      <SavedAttachment
        file={{ file_name: "scope.pdf", thumbnail_url: "javascript:alert(1)" }}
      />,
    );
    expect(missing).toContain("Link unavailable");
    expect(missing).not.toContain("<img");
  });
  it("keeps read-only refresh available when posting disables the editor", () => {
    const html = renderToStaticMarkup(
      <UpdatesSection
        title="Updates"
        contextId="workstream"
        project={{ workstream_id: "workstream" }}
        users={[]}
        updates={[]}
        attachments={[]}
        disabled={true}
        loading={false}
        maxAttachmentMB={20}
        postResult={{}}
        onPost={() => {}}
        onRefresh={() => {}}
      />,
    );
    const refreshButton = html.match(
      /<button[^>]*aria-label="Refresh updates"[^>]*>/,
    )?.[0];
    expect(refreshButton).toBeDefined();
    expect(refreshButton).not.toContain("disabled");
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });
  it("renders all tag groups, reply mentions and safe attachment links in one section", () => {
    const html = renderToStaticMarkup(
      <UpdatesSection
        title="Maple Commons Updates"
        contextId="workstream"
        project={{ workstream_id: "workstream" }}
        users={[]}
        updates={[
          {
            id: "root",
            update_text: "Schedule reviewed",
            source: "general_retool",
            created_by: "Morgan",
          },
          {
            id: "reply",
            parent_update_id: "root",
            update_text: "@Alex West please review",
            mentioned_users: [
              { full_name: "Alex West", email: "alex@example.com" },
            ],
          },
        ]}
        attachments={[
          {
            update_id: "reply",
            file_name: "scope.pdf",
            sharepoint_web_url: "https://example.com/scope.pdf",
          },
          {
            update_id: "root",
            file_name: "untrusted.txt",
            sharepoint_web_url: "javascript:alert(1)",
          },
        ]}
        disabled={false}
        loading={false}
        maxAttachmentMB={20}
        postResult={{}}
        onPost={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(html).toContain("Maple Commons Updates");
    expect(html).toContain("Search all updates and replies");
    for (const tag of ["General", "Dev", "Sales"])
      expect(html).toContain(`>${tag}<`);
    expect(html).toContain("Post Update");
    expect(html).toContain("<mark>@Alex West</mark>");
    expect(html).toContain('href="https://example.com/scope.pdf"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Attach Files");
    expect(html).toContain('type="file" multiple=""');
  });
});
