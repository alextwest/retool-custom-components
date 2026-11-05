import { describe, expect, it } from "vitest";
import {
  fileOpenTarget,
  officeDesktopLink,
  officeFolderUrl,
} from "./officeDesktopLink";
describe("Office desktop document links", () => {
  it("selects the desktop as the default and preserves its browser fallback", () => {
    const node = {
      type: "file",
      name: "scope.docx",
      url: "https://example.sharepoint.com/Docs/scope.docx",
    };
    expect(fileOpenTarget(node, undefined, true)).toMatchObject({
      openUrl: `ms-word:ofe|u|${node.url}`,
      browserUrl: node.url,
      openMode: "desktop",
    });
    expect(fileOpenTarget(node, undefined, false)).toMatchObject({
      openUrl: node.url,
      openMode: "browser",
    });
  });
  it("automatically chooses web when no desktop URL can be built, including folders and PDFs", () => {
    for (const node of [
      {
        type: "folder",
        name: "Project",
        url: "https://example.sharepoint.com/Docs/Project",
      },
      {
        type: "file",
        name: "plan.pdf",
        url: "https://example.sharepoint.com/Docs/plan.pdf",
      },
      {
        type: "file",
        name: "scope.docx",
        url: "https://example.sharepoint.com/_layouts/15/Doc.aspx?file=scope.docx",
      },
    ])
      expect(fileOpenTarget(node, undefined, true)).toMatchObject({
        openUrl: node.url,
        openMode: "browser",
      });
  });
  it("resolves the reported Excel viewer URL using the actual parent folder instead of hiding Desktop", () => {
    const name = "TBD-MF-26-001A Alex test 2 Master Audit & Tracker.xlsx";
    const viewer =
      "https://pardigmpartners.sharepoint.com/:x:/r/sites/Projects/_layouts/15/Doc.aspx?sourcedoc=%7BE9BE57E0-89DD-402A-B8FD-FD8595EE7019%7D&file=TBD-MF-26-001A%20Alex%20test%202%20Master%20Audit%20%26%20Tracker.xlsx&action=default&mobileredirect=true";
    const parent =
      "https://pardigmpartners.sharepoint.com/sites/Projects/Shared%20Documents/2.%20Project%20Files/MF%20Folder/TBD-MF-26-001A%20Alex%20test%202";
    const node = { type: "file", name, url: viewer };
    expect(officeDesktopLink(node, parent)).toEqual({
      app: "Excel",
      href: `ms-excel:ofe|u|${parent}/${encodeURIComponent(name)}`,
    });
    expect(node.url).toBe(viewer);
  });
  it("normalizes resource-path sharing wrappers without needing a parent URL", () => {
    expect(
      officeDesktopLink({
        type: "file",
        name: "scope.docx",
        url: "https://example.sharepoint.com/:w:/r/sites/Projects/Docs/scope.docx?web=1",
      })?.href,
    ).toBe(
      "ms-word:ofe|u|https://example.sharepoint.com/sites/Projects/Docs/scope.docx",
    );
  });
  it("carries nested folder paths and resolves encoded library-view folder URLs", () => {
    const root = officeFolderUrl(
      "https://example.sharepoint.com/:f:/r/sites/Projects/Docs/Project?web=1",
    );
    const child = officeFolderUrl(undefined, root, "Lighting Docs");
    expect(child).toBe(
      "https://example.sharepoint.com/sites/Projects/Docs/Project/Lighting%20Docs",
    );
    expect(
      officeFolderUrl(
        "https://example.sharepoint.com/sites/Projects/Docs/Forms/AllItems.aspx?id=%2Fsites%2FProjects%2FDocs%2FA%20%23%20B",
      ),
    ).toBe("https://example.sharepoint.com/sites/Projects/Docs/A%20%23%20B");
    expect(
      officeDesktopLink(
        {
          type: "file",
          name: "deck.pptx",
          url: "https://example.sharepoint.com/:p:/r/sites/Projects/_layouts/15/Doc.aspx?file=deck.pptx",
        },
        child,
      )?.href,
    ).toBe(`ms-powerpoint:ofe|u|${child}/deck.pptx`);
  });
  it("refuses to guess paths across origins or for a different viewer filename", () => {
    const node = {
      type: "file",
      name: "scope.docx",
      url: "https://example.sharepoint.com/:w:/r/sites/P/_layouts/15/Doc.aspx?file=other.docx",
    };
    expect(
      officeDesktopLink(node, "https://example.sharepoint.com/sites/P/Docs"),
    ).toBeNull();
    expect(
      officeDesktopLink(
        { ...node, url: node.url.replace("other.docx", "scope.docx") },
        "https://another.sharepoint.com/sites/P/Docs",
      ),
    ).toBeNull();
    expect(
      officeFolderUrl(
        "https://example.sharepoint.com/Forms/AllItems.aspx?id=https://other.example/Docs",
      ),
    ).toBeUndefined();
  });
  it.each([
    ["scope.docx", "ms-word", "Word"],
    ["budget.XLSX", "ms-excel", "Excel"],
    ["review.pptx", "ms-powerpoint", "PowerPoint"],
  ])("builds a desktop link for %s", (name, scheme, app) => {
    expect(
      officeDesktopLink({
        type: "file",
        name,
        url: `https://example.sharepoint.com/Docs/${name}?web=1`,
      }),
    ).toEqual({
      app,
      href: `${scheme}:ofe|u|https://example.sharepoint.com/Docs/${name}`,
    });
  });
  it("preserves encoded names and query parameters required to access the file", () => {
    expect(
      officeDesktopLink({
        type: "file",
        name: "Project scope.docx",
        url: "https://example.sharepoint.com/Docs/Project%20scope.docx?token=abc&web=1",
      })?.href,
    ).toBe(
      "ms-word:ofe|u|https://example.sharepoint.com/Docs/Project%20scope.docx?token=abc",
    );
  });
  it("accepts a separate direct Office URL while preserving the node's browser link", () => {
    const node = {
      type: "file",
      name: "scope.docx",
      url: "https://example.sharepoint.com/_layouts/15/Doc.aspx?sourcedoc=123",
      officeUrl: "https://example.sharepoint.com/Docs/scope.docx",
    };
    expect(officeDesktopLink(node)?.href).toContain(
      "ofe|u|https://example.sharepoint.com/Docs/scope.docx",
    );
    expect(node.url).toContain("Doc.aspx");
  });
  it.each([
    {
      type: "folder",
      name: "Project",
      url: "https://example.sharepoint.com/Docs/Project",
    },
    {
      type: "file",
      name: "scope.pdf",
      url: "https://example.sharepoint.com/Docs/scope.pdf",
    },
    { type: "file", name: "scope.docx", url: "javascript:alert(1)" },
    { type: "file", name: "scope.docx", url: "file:///C:/scope.docx" },
    {
      type: "file",
      name: "scope.docx",
      url: "https://example.sharepoint.com/_layouts/15/Doc.aspx?id=123",
    },
    {
      type: "file",
      name: "scope.docx",
      url: "https://example.sharepoint.com/Docs/budget.xlsx",
    },
    {
      type: "file",
      name: "file.constructor",
      url: "https://example.sharepoint.com/Docs/file.constructor",
    },
    {
      type: "file",
      name: "file.__proto__",
      url: "https://example.sharepoint.com/Docs/file.__proto__",
    },
  ])(
    "does not invent an app or Explorer launch for unsupported targets: %j",
    (node) => {
      expect(officeDesktopLink(node)).toBeNull();
    },
  );
  it("encodes pipe characters so a filename cannot inject Office URI commands", () => {
    expect(
      officeDesktopLink({
        type: "file",
        name: "scope|copy.docx",
        url: "https://example.sharepoint.com/Docs/scope|copy.docx",
      })?.href,
    ).toContain("scope%7Ccopy.docx");
  });
});
