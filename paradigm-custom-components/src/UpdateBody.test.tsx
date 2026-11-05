import React from "react";
// @ts-expect-error The library does not currently install @types/react-dom.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpdateBody } from "./UpdateBody";
import { messageText } from "./messageContent";
import { matchesThread } from "./projectUpdatesModel";
const people = [{ full_name: "Alex West", email: "alex@example.com" }];
const render = (text: string) =>
  renderToStaticMarkup(<UpdateBody text={text} people={people} />);

describe("plain text and HTML update/reply bodies", () => {
  it("keeps plain text, comparison symbols and line breaks as text", () => {
    const html = render("Budget < estimate & 2 > 1\n@Alex West ready");
    expect(html).not.toContain("pu-body-html");
    expect(html).toContain("Budget &lt; estimate &amp; 2 &gt; 1\n");
    expect(html).toContain("<mark>@Alex West</mark>");
  });
  it("renders the screenshot's paragraphs and nonbreaking-space spacer", () => {
    const html = render(
      "<p>testing</p><p>&nbsp;</p><p>power automate connection</p>",
    );
    expect(html).toContain("pu-body-html");
    expect(html).toContain("<p>testing</p>");
    expect(html).not.toContain("&lt;p&gt;");
    expect(messageText("<p>A&nbsp;&amp; B</p>")).toBe("A & B\n");
  });
  it("preserves safe formatting, lists and links while discarding all source attributes", () => {
    const html = render(
      '<p style="color:red" onclick="evil()"><strong>Ready</strong> <em>now</em></p><ul><li>First</li></ul><a href="https://example.com" target="_self" data-secret="x">Review</a>',
    );
    expect(html).toContain("<strong>Ready</strong>");
    expect(html).toContain("<em>now</em>");
    expect(html).toContain("<ul><li>First</li></ul>");
    expect(html).toContain(
      'href="https://example.com/" target="_blank" rel="noopener noreferrer"',
    );
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("data-secret");
  });
  it("highlights mentions split across inline HTML nodes and entities", () => {
    const html = render(
      "<p>@Alex <strong>West</strong> please review</p><p>@Alex&nbsp;West too</p>",
    );
    expect(html).toContain(
      "<mark>@Alex </mark><strong><mark>West</mark></strong>",
    );
    expect(html).toContain("<mark>@Alex\u00a0West</mark>");
  });
  it("renders imported Teams at tags as blue mentions without exposing IDs", () => {
    expect(render('<p><at id="0">Alex West</at> hello</p>')).toContain(
      "<p><mark>@Alex West</mark> hello</p>",
    );
  });
  it("drops active content and prevents unsafe links including encoded protocols", () => {
    const html = render(
      '<p>Safe</p><script>alert(1)</script><style>body{display:none}</style><iframe src="https://evil.example"></iframe><svg><a href="javascript:evil()">bad</a></svg><img src=x onerror=evil()><a href="java&#x73;cript:alert(1)">label</a><a href="data:text/html,test">other</a>',
    );
    for (const disallowed of [
      "<script",
      "<style",
      "<iframe",
      "<svg",
      "<img",
      "javascript:",
      "data:text",
      "evil()",
      "alert(1)",
    ])
      expect(html).not.toContain(disallowed);
    expect(html).toContain("<p>Safe</p>");
    expect(html).toContain("<span>label</span>");
  });
  it("does not reinterpret escaped markup as executable elements", () => {
    const html = render("<p>&lt;img src=x onerror=evil()&gt;</p>");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
  it("searches rendered message text across HTML tags and entities", () => {
    const root = {
      id: "root",
      update_text: "<p>Permit <b>approved</b> &amp; ready</p>",
    };
    expect(matchesThread(root, [], [], "permit approved &")).toBe(true);
    expect(matchesThread(root, [], [], "<p>")).toBe(false);
    expect(
      matchesThread(
        { ...root, update_text: "<p>Ready</p><script>hiddenneedle</script>" },
        [],
        [],
        "hiddenneedle",
      ),
    ).toBe(false);
  });
});
