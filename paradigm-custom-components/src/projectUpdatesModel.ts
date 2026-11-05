import { Mention, Person, normalizePeople } from "./mentions";
import { messageText } from "./messageContent";

export type Row = Record<string, unknown>;
export type Upload = {
  name: string;
  sizeBytes: number;
  type: string;
  base64Data: string;
};
export type Draft = {
  text: string;
  mentions: Mention[];
  files: Upload[];
  tag: string;
};
export const TAGS = [
  { label: "General", value: "general_retool" },
  { label: "Dev", value: "teams_dev_channel" },
  { label: "Sales", value: "teams_sales_channel" },
];
export const emptyDraft = (tag = TAGS[0].value): Draft => ({
  text: "",
  mentions: [],
  files: [],
  tag,
});
export function rows(value: unknown): Row[] {
  if (typeof value === "string") {
    try {
      return rows(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return Array.isArray(value)
    ? value.filter(
        (r): r is Row => !!r && typeof r === "object" && !Array.isArray(r),
      )
    : [];
}
export const rowId = (row: Row) => String(row.id ?? row.update_id ?? "");
export const parentId = (row: Row) =>
  row.parent_update_id == null ? "" : String(row.parent_update_id);
export const bodyText = (row: Row) => String(row.update_text ?? row.text ?? "");
export const authorName = (row: Row) =>
  String(row.created_by_name ?? row.author_name ?? row.created_by ?? "Unknown");
export function tagValue(row: Row) {
  const tag = String(row.source ?? row.tag ?? "general_retool");
  return (
    TAGS.find(
      (t) => t.value === tag || t.label.toLowerCase() === tag.toLowerCase(),
    )?.value ?? TAGS[0].value
  );
}
export const recipients = (draft: Draft): Person[] => [
  ...new Map(
    draft.mentions
      .filter((m) => draft.text.slice(m.start, m.end) === `@${m.full_name}`)
      .map((m) => [
        m.email.toLowerCase(),
        { full_name: m.full_name, email: m.email },
      ]),
  ).values(),
];
export const fileKey = (file: { name: string; sizeBytes: number }) =>
  `${file.name}-${file.sizeBytes}`;
export function safeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function filesForUpdate(files: Row[], id: string) {
  const key = id.trim().toLowerCase();
  if (!key) return [];
  return files.filter(
    (file) =>
      String(file.update_id ?? file.updateId ?? "")
        .trim()
        .toLowerCase() === key,
  );
}
export function attachmentDetails(file: Row) {
  const name = String(file.file_name ?? file.name ?? "File");
  const extension = String(
    file.file_extension ?? name.split(".").slice(1).pop() ?? "",
  )
    .replace(/^\./, "")
    .toLowerCase();
  const href =
    [file.sharepoint_web_url, file.web_url, file.url, file.download_url]
      .map(safeUrl)
      .find(Boolean) ?? null;
  const image =
    /^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(
      String(file.mime_type ?? file.type ?? ""),
    ) || /^(png|jpe?g|gif|webp|avif|bmp)$/.test(extension);
  // SharePoint web URLs are pages, not embeddable image previews.
  const thumbnail =
    [
      file.thumbnail_url,
      file.thumbnailUrl,
      ...(image ? [file.download_url, file.sharepoint_download_url] : []),
    ]
      .map(safeUrl)
      .find(Boolean) ?? null;
  return { name, extension, href, thumbnail };
}
export function mentionParts(text: string, people: Person[]) {
  const names = [
    ...new Set(people.map((p) => p.full_name).filter(Boolean)),
  ].sort((a, b) => b.length - a.length);
  if (!names.length) return [{ text, mention: false }];
  const pattern = new RegExp(
    `@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}_])`,
    "gu",
  );
  const parts: { text: string; mention: boolean }[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > start)
      parts.push({ text: text.slice(start, match.index), mention: false });
    parts.push({ text: match[0], mention: true });
    start = match.index! + match[0].length;
  }
  if (start < text.length)
    parts.push({ text: text.slice(start), mention: false });
  return parts;
}
export function rowPeople(row: Row, directory: Person[]) {
  // Directory fallback renders legacy plain-text mentions without inferring notification recipients.
  return [
    ...normalizePeople(rows(row.mentioned_users).flatMap((r) => r)),
    ...directory,
  ];
}
export function buildThreads(updates: Row[]) {
  const byId = new Map(
    updates.map((r) => [rowId(r), r]).filter(([id]) => !!id) as [string, Row][],
  );
  const roots: Row[] = [],
    replies = new Map<string, Row[]>();
  for (const row of updates) {
    let root = row;
    const path: string[] = [];
    while (true) {
      const id = rowId(root),
        cycleIndex = path.indexOf(id);
      if (cycleIndex >= 0) {
        root = byId.get(path.slice(cycleIndex).sort()[0])!;
        break;
      }
      path.push(id);
      const parent = byId.get(parentId(root));
      if (!parent) break;
      root = parent;
    }
    const rootId = rowId(root);
    if (rootId === rowId(row)) roots.push(row);
    else replies.set(rootId, [...(replies.get(rootId) ?? []), row]);
  }
  const time = (r: Row) => {
    const n = Date.parse(String(r.created_at ?? ""));
    return Number.isFinite(n) ? n : 0;
  };
  roots.sort((a, b) => time(b) - time(a));
  replies.forEach((rs) => rs.sort((a, b) => time(a) - time(b)));
  return { roots, replies };
}
export function matchesThread(
  root: Row,
  replies: Row[],
  attachments: Row[],
  search: string,
) {
  const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const ids = new Set(
    [root, ...replies].map((r) => rowId(r).trim().toLowerCase()),
  );
  const text =
    [root, ...replies]
      .map(
        (r) =>
          `${messageText(bodyText(r))} ${authorName(r)} ${String(r.created_at ?? "")} ${tagValue(r)} ${rows(
            r.mentioned_users,
          )
            .map((p) => `${p.full_name} ${p.email}`)
            .join(" ")}`,
      )
      .join(" ") +
    " " +
    attachments
      .filter((f) =>
        ids.has(
          String(f.update_id ?? f.updateId ?? "")
            .trim()
            .toLowerCase(),
        ),
      )
      .map((f) => String(f.file_name ?? f.name ?? ""))
      .join(" ");
  return words.every((word) => text.toLowerCase().includes(word));
}
export async function readUploads(
  files: File[],
  existing: Upload[],
  maxBytes: number,
): Promise<Upload[]> {
  const keys = new Set(existing.map(fileKey));
  const fresh = files.filter((f) => {
    const key = fileKey({ name: f.name, sizeBytes: f.size });
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
  const names = new Set(existing.map((f) => f.name.toLowerCase()));
  for (const file of fresh) {
    if (names.has(file.name.toLowerCase()))
      throw new Error(
        `Two attachments are named ${file.name}. Rename one before attaching it so SharePoint does not overwrite it.`,
      );
    names.add(file.name.toLowerCase());
  }
  if (
    existing.reduce((n, f) => n + f.sizeBytes, 0) +
      fresh.reduce((n, f) => n + f.size, 0) >
    maxBytes
  )
    throw new Error(
      `Attachments exceed the ${Math.round(maxBytes / 1024 / 1024)} MB total limit.`,
    );
  return Promise.all(
    fresh.map(
      (file) =>
        new Promise<Upload>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () =>
            reject(
              new Error(`Could not read ${file.name}. Please select it again.`),
            );
          reader.onabort = () =>
            reject(new Error(`Reading ${file.name} was cancelled.`));
          reader.onload = () =>
            resolve({
              name: file.name,
              sizeBytes: file.size,
              type: file.type || "application/octet-stream",
              base64Data: String(reader.result).split(",")[1] ?? "",
            });
          reader.readAsDataURL(file);
        }),
    ),
  );
}
