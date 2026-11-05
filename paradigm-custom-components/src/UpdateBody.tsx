import React, { useMemo } from "react";
import { Person } from "./mentions";
import { MessageNode, parseMessage } from "./messageContent";
import { mentionParts } from "./projectUpdatesModel";

/** Plain text and imported HTML share mention styling; HTML is rebuilt from safe nodes. */
export function UpdateBody({
  text,
  people,
}: {
  text: string;
  people: Person[];
}) {
  const parsed = useMemo(() => parseMessage(text), [text]);
  let position = 0;
  const ranges = mentionParts(
    parsed.text.replace(/\u00a0/g, " "),
    people,
  ).flatMap((part) => {
    const start = position;
    position += part.text.length;
    return part.mention ? [{ start, end: position }] : [];
  });
  const render = (
    nodes: MessageNode[],
    path = "body",
    marked = false,
  ): React.ReactNode[] =>
    nodes.map((node, i) => {
      const key = `${path}-${i}`;
      if (node.kind === "text") {
        if (marked)
          return <React.Fragment key={key}>{node.text}</React.Fragment>;
        let offset = 0;
        const parts: React.ReactNode[] = [];
        for (const range of ranges) {
          const start = Math.max(0, range.start - node.start),
            end = Math.min(node.text.length, range.end - node.start);
          if (end <= start) continue;
          if (start > offset) parts.push(node.text.slice(offset, start));
          parts.push(
            <mark key={`${key}-${start}`}>{node.text.slice(start, end)}</mark>,
          );
          offset = end;
        }
        parts.push(node.text.slice(offset));
        return <React.Fragment key={key}>{parts}</React.Fragment>;
      }
      const props: Record<string, unknown> = { key };
      if (node.tag === "a")
        Object.assign(props, {
          href: node.href,
          target: "_blank",
          rel: "noopener noreferrer",
        });
      if (node.colSpan) props.colSpan = node.colSpan;
      if (node.rowSpan) props.rowSpan = node.rowSpan;
      if (node.tag === "br" || node.tag === "hr")
        return React.createElement(node.tag, props);
      return React.createElement(
        node.tag,
        props,
        render(node.children, key, marked || node.tag === "mark"),
      );
    });
  return (
    <div className={`pu-body${parsed.html ? " pu-body-html" : ""}`}>
      {render(parsed.nodes)}
    </div>
  );
}
