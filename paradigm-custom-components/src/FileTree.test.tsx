import React from "react";
// @ts-expect-error The library does not currently install @types/react-dom.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { FileTree } from "./FileTree";
const fixture = vi.hoisted(() => ({ showDesktop: true }));
beforeEach(() => {
  fixture.showDesktop = true;
});
vi.mock("./theme", () => ({ useAppTheme: () => ({}) }));
vi.mock("@tryretool/custom-component-support", () => ({
  Retool: {
    useStateString: ({ name, initialValue }: any) => [
      name === "treeData"
        ? JSON.stringify({
            name: "Project",
            type: "folder",
            url: "https://example.sharepoint.com/Docs",
            children: [
              {
                name: "scope.docx",
                type: "file",
                url: "https://example.sharepoint.com/Docs/scope.docx",
              },
              {
                name: "plan.pdf",
                type: "file",
                url: "https://example.sharepoint.com/Docs/plan.pdf",
              },
              {
                name: "Lighting Docs",
                type: "folder",
                children: [
                  {
                    name: "summary.pptx",
                    type: "file",
                    url: "https://example.sharepoint.com/:p:/r/sites/Projects/_layouts/15/Doc.aspx?sourcedoc=123&file=summary.pptx",
                  },
                ],
              },
              {
                name: "missing.docx",
                type: "file",
                url: "https://other.sharepoint.com/_layouts/15/Doc.aspx?file=missing.docx",
              },
            ],
          })
        : name === "columns"
          ? "[]"
          : initialValue,
      vi.fn(),
    ],
    useStateBoolean: ({ name, initialValue }: any) => [
      name === "showDesktopOffice" ? fixture.showDesktop : initialValue,
      vi.fn(),
    ],
    useStateNumber: ({ initialValue }: any) => [initialValue, vi.fn()],
    useEventCallback: () => vi.fn(),
  },
}));
it("hides desktop actions when the Inspector switch is off and preserves browser actions", () => {
  fixture.showDesktop = false;
  const html = renderToStaticMarkup(<FileTree />);
  expect(html).not.toContain("ms-word:");
  expect(html).not.toContain("ms-powerpoint:");
  expect(html).not.toContain("Desktop opening unavailable");
  expect(html).toContain('aria-label="Open scope.docx in browser"');
});
it("uses the arrow for Office desktop opening and retains an explicit browser fallback", () => {
  const html = renderToStaticMarkup(<FileTree />);
  expect(html).toContain(
    'href="ms-word:ofe|u|https://example.sharepoint.com/Docs/scope.docx"',
  );
  expect(html).toContain('aria-label="Open scope.docx in Word desktop"');
  expect(html).toContain('aria-label="Open scope.docx in browser"');
  expect(html).toContain('aria-label="Open plan.pdf in browser"');
  expect(html).toContain('aria-label="Open Project in browser"');
  expect(html).not.toContain("acrobat:");
  expect(html).not.toContain("file://");
  expect(html).toContain(
    'href="ms-powerpoint:ofe|u|https://example.sharepoint.com/Docs/Lighting%20Docs/summary.pptx"',
  );
  expect(html).toContain('aria-label="Open missing.docx in browser"');
  expect(html).toContain('aria-label="Open Office files in"');
  expect(html).toMatch(
    /<a href="ms-word:ofe\|u\|https:\/\/example\.sharepoint\.com\/Docs\/scope\.docx"[^>]*aria-label="Open scope\.docx"/,
  );
  expect(html).not.toContain(">Desktop</");
});
