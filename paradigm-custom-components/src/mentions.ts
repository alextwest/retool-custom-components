export type Person = { full_name: string; email: string };
export type Mention = Person & { start: number; end: number };

export function mentionQuery(text: string, caret: number) {
  const match = /(?:^|[\s(])@([^@\n\r]{0,60})$/.exec(text.slice(0, caret));
  return match
    ? { start: caret - match[1].length - 1, end: caret, search: match[1] }
    : null;
}

// Preserve only selected mentions whose exact text survives an edit.
export function reconcileMentions(
  before: string,
  after: string,
  mentions: Mention[],
) {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let oldEnd = before.length,
    newEnd = after.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  return mentions
    .flatMap((m) => {
      if (m.end <= start) return [m];
      if (m.start >= oldEnd)
        return [
          {
            ...m,
            start: m.start + newEnd - oldEnd,
            end: m.end + newEnd - oldEnd,
          },
        ];
      return [];
    })
    .filter(
      (m) =>
        after.slice(m.start, m.end) === `@${m.full_name}` &&
        (m.start === 0 || /[\s(]/.test(after[m.start - 1])) &&
        !/[\p{L}\p{N}_]/u.test(after[m.end] ?? ""),
    );
}

export function normalizePeople(rows: unknown[]): Person[] {
  const people = new Map<string, Person>();
  rows.forEach((row) => {
    if (!row || typeof row !== "object") return;
    const r = row as Record<string, unknown>;
    const name = r.full_name ?? r.name ?? r.label;
    const email = r.email ?? r.value;
    if (
      typeof name === "string" &&
      name.trim() &&
      typeof email === "string" &&
      email.trim()
    )
      people.set(email.toLowerCase(), {
        full_name: name.trim(),
        email: email.trim(),
      });
  });
  return [...people.values()];
}
