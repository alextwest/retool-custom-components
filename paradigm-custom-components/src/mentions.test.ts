import { describe, expect, it } from "vitest";
import { mentionQuery, normalizePeople, reconcileMentions } from "./mentions";

describe("mention editing", () => {
  const text = "Hi @Alex West, hello";
  const mentions = [
    { full_name: "Alex West", email: "alex@example.com", start: 3, end: 13 },
  ];
  it("finds a mention at the caret in the middle of a draft", () => {
    expect(mentionQuery("Hi @Alex and more", 8)).toEqual({
      start: 3,
      end: 8,
      search: "Alex",
    });
    expect(mentionQuery("alex@example.com", 16)).toBeNull();
    expect(mentionQuery("Hi @Alex\nnext", 13)).toBeNull();
  });
  it("moves selected mention ranges when text is inserted before them", () => {
    expect(reconcileMentions(text, "Well, " + text, mentions)[0]).toMatchObject(
      { start: 9, end: 19 },
    );
  });
  it("removes recipients when their selected mention is edited or deleted", () => {
    expect(reconcileMentions(text, "Hi @Al West, hello", mentions)).toEqual([]);
    expect(reconcileMentions(text, "Hi , hello", mentions)).toEqual([]);
  });
  it("preserves mentions when typing immediately after them", () => {
    expect(reconcileMentions(text, "Hi @Alex West! , hello", mentions)).toEqual(
      mentions,
    );
  });
  it("drops selected recipients when typing a name continuation at its boundary", () => {
    expect(
      reconcileMentions(text, "Hi @Alex Westman, hello", mentions),
    ).toEqual([]);
  });
  it("accepts the AI app directory format and deduplicates by email", () => {
    expect(
      normalizePeople([
        { label: "Alex", value: "a@example.com" },
        { full_name: "Alex West", email: "a@example.com" },
        null,
      ]),
    ).toEqual([{ full_name: "Alex West", email: "a@example.com" }]);
  });
});
