import { parseDocument } from "htmlparser2";

export type MessageTag =
  | "p"
  | "div"
  | "span"
  | "br"
  | "hr"
  | "strong"
  | "b"
  | "em"
  | "i"
  | "u"
  | "s"
  | "del"
  | "blockquote"
  | "pre"
  | "code"
  | "ul"
  | "ol"
  | "li"
  | "a"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "table"
  | "thead"
  | "tbody"
  | "tfoot"
  | "tr"
  | "td"
  | "th"
  | "mark";
export type MessageNode =
  | { kind: "text"; text: string; start: number }
  | {
      kind: "element";
      tag: MessageTag;
      children: MessageNode[];
      href?: string;
      colSpan?: number;
      rowSpan?: number;
    };
const allowed = new Set<MessageTag>([
  "p",
  "div",
  "span",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "mark",
]);
const blocked = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "template",
  "head",
  "noscript",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "img",
  "video",
  "audio",
  "source",
  "link",
  "meta",
  "base",
]);
const blockTags = new Set([
  "p",
  "div",
  "br",
  "hr",
  "blockquote",
  "pre",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
]);
const htmlPattern = new RegExp(
  `<\\/?(?:${[...allowed, ...blocked, "html", "body", "at", "strike"].join("|")})\\b[^>]*>`,
  "i",
);
export function messageHref(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return ["https:", "http:", "mailto:"].includes(url.protocol)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
const spanCount = (value: string | undefined) =>
  value && /^\d{1,2}$/.test(value) && Number(value) > 0
    ? Number(value)
    : undefined;

/** Parse inert markup into a small React-safe AST. No HTML or source attributes are injected. */
export function parseMessage(text: string) {
  if (!htmlPattern.test(text))
    return {
      html: false,
      text,
      nodes: [{ kind: "text" as const, text, start: 0 }] as MessageNode[],
    };
  type ParserNode = ReturnType<typeof parseDocument>["children"][number];
  const clean = (node: ParserNode, depth = 0): MessageNode[] => {
    if (node.type === "text")
      return [{ kind: "text", text: node.data, start: 0 }];
    if (!("name" in node) || !("children" in node) || depth > 80) return [];
    const name = node.name.toLowerCase();
    if (blocked.has(name)) return [];
    const children = node.children.flatMap((child) => clean(child, depth + 1));
    if (name === "at") {
      const first = children.find((child) => child.kind === "text");
      if (!(first?.kind === "text" && first.text.trimStart().startsWith("@")))
        children.unshift({ kind: "text", text: "@", start: 0 });
      return [{ kind: "element", tag: "mark", children }];
    }
    const tag = (name === "strike" ? "s" : name) as MessageTag;
    if (!allowed.has(tag)) return children;
    if (tag === "a") {
      const href = messageHref(node.attribs.href);
      return [
        {
          kind: "element",
          tag: href ? "a" : "span",
          children,
          ...(href ? { href } : {}),
        },
      ];
    }
    return [
      {
        kind: "element",
        tag,
        children,
        ...(["td", "th"].includes(tag)
          ? {
              colSpan: spanCount(node.attribs.colspan),
              rowSpan: spanCount(node.attribs.rowspan),
            }
          : {}),
      },
    ];
  };
  const nodes = parseDocument(text, { decodeEntities: true }).children.flatMap(
    (node) => clean(node),
  );
  let readable = "";
  const index = (items: MessageNode[]) =>
    items.forEach((node) => {
      if (node.kind === "text") {
        node.start = readable.length;
        readable += node.text;
        return;
      }
      index(node.children);
      if (blockTags.has(node.tag)) readable += "\n";
      else if (["td", "th"].includes(node.tag)) readable += "\t";
    });
  index(nodes);
  return { html: true, text: readable, nodes };
}
export const messageText = (value: string) =>
  parseMessage(value).text.replace(/\u00a0/g, " ");
