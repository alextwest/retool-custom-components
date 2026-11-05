type OfficeFile = {
  name: string;
  type: string;
  url?: string;
  officeUrl?: string;
};
const officeTypes: Record<string, { scheme: string; app: string }> =
  Object.fromEntries([
    ...["doc", "docx", "docm", "dot", "dotx", "dotm"].map((ext) => [
      ext,
      { scheme: "ms-word", app: "Word" },
    ]),
    ...["xls", "xlsx", "xlsm", "xlsb", "xlt", "xltx", "xltm"].map((ext) => [
      ext,
      { scheme: "ms-excel", app: "Excel" },
    ]),
    ...[
      "ppt",
      "pptx",
      "pptm",
      "pot",
      "potx",
      "potm",
      "pps",
      "ppsx",
      "ppsm",
    ].map((ext) => [ext, { scheme: "ms-powerpoint", app: "PowerPoint" }]),
  ]);
const extension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const officeType = (name: string) =>
  Object.prototype.hasOwnProperty.call(officeTypes, extension(name))
    ? officeTypes[extension(name)]
    : undefined;

/** Get a direct folder address from a folder's Graph webUrl or library-view URL. */
export function officeFolderUrl(
  raw: string | undefined,
  parent?: string,
  name?: string,
): string | undefined {
  const parse = (value: string) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      return undefined;
    url.pathname = url.pathname.replace(/^\/:f:\/r(?=\/)/i, "");
    if (/^\/:[a-z]:\//i.test(url.pathname)) return undefined;
    if (/\.aspx$/i.test(url.pathname)) {
      const folder =
        url.searchParams.get("id") || url.searchParams.get("RootFolder");
      if (!folder) return undefined;
      if (
        !folder.startsWith("/") ||
        folder.startsWith("//") ||
        folder.includes("\\")
      )
        return undefined;
      url.pathname = folder;
    }
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  };
  try {
    if (raw) {
      const direct = parse(raw);
      if (direct) return direct;
    }
  } catch {
    /* Use the known parent hierarchy if available. */
  }
  if (parent && name && !/[\\/]/.test(name) && name !== "." && name !== "..") {
    try {
      const base = parse(parent);
      return base ? `${base}/${encodeURIComponent(name)}` : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function officeDesktopApp(node: OfficeFile) {
  return node.type === "file" ? (officeType(node.name)?.app ?? null) : null;
}

/** Microsoft-documented Office launch schemes; ordinary web links remain available. */
export function officeDesktopLink(node: OfficeFile, parentFolderUrl?: string) {
  if (node.type !== "file") return null;
  const office = officeType(node.name);
  if (!office) return null;
  try {
    let url = new URL(node.officeUrl || node.url || "");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.pathname = url.pathname.replace(/^\/:[wxp]:\/r(?=\/)/i, "");
    if (
      !node.officeUrl &&
      (/\/Doc\.aspx$/i.test(url.pathname) || /^\/:[a-z]:\//i.test(url.pathname))
    ) {
      const parent = officeFolderUrl(parentFolderUrl);
      if (
        !parent ||
        new URL(parent).origin !== url.origin ||
        /[\\/]/.test(node.name)
      )
        return null;
      const viewerName = url.searchParams.get("file");
      if (viewerName && viewerName !== node.name) return null;
      url = new URL(`${parent}/${encodeURIComponent(node.name)}`);
    }
    const fileName = decodeURIComponent(url.pathname.split("/").pop() || "");
    if (officeType(fileName)?.scheme !== office.scheme) return null;
    url.searchParams.delete("web"); // Remove the SharePoint browser-opening hint only.
    url.hash = "";
    return {
      app: office.app,
      href: `${office.scheme}:ofe|u|${url.href.replace(/\|/g, "%7C")}`,
    };
  } catch {
    return null;
  }
}

export function fileOpenTarget(
  node: OfficeFile,
  parentFolderUrl: string | undefined,
  preferDesktop: boolean,
) {
  const desktop = officeDesktopLink(node, parentFolderUrl);
  const browserUrl = node.url || "";
  const viaDesktop = preferDesktop && !!desktop;
  return {
    openUrl: viaDesktop ? desktop!.href : browserUrl,
    browserUrl,
    desktopUrl: desktop?.href || "",
    openMode: viaDesktop ? "desktop" : "browser",
    app: desktop?.app || "",
  };
}
