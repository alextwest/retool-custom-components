import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Retool } from "@tryretool/custom-component-support";
import { useAppTheme } from "./theme";
import {
  Mention,
  Person,
  mentionQuery,
  normalizePeople,
  reconcileMentions,
} from "./mentions";
import "./UpdatesComposer.css";

export const UpdatesComposer = () => {
  Retool.useComponentSettings({ defaultWidth: 12, defaultHeight: 40 });
  const theme = useAppTheme();
  const [users] = Retool.useStateArray({
    name: "users",
    initialValue: [],
    description:
      "Mention directory: array of {full_name, email}. Bind to your user query (all users).",
  });
  const [value, setValue] = Retool.useStateString({
    name: "value",
    initialValue: "",
    description:
      "Plain-text draft. Bind existing posting queries to this value.",
  });
  const [, setMentionedUsers] = Retool.useStateArray({
    name: "mentionedUsers",
    initialValue: [],
    inspector: "hidden",
  });
  const [, setSubmission] = Retool.useStateObject({
    name: "submission",
    initialValue: {},
    inspector: "hidden",
  });
  const [contextId] = Retool.useStateString({
    name: "contextId",
    initialValue: "",
    description:
      "Project ID for updates, or parent update ID for replies. Changing it clears the draft.",
  });
  const [resetKey] = Retool.useStateString({
    name: "resetKey",
    initialValue: "",
    description: "Change only after a successful post to clear the draft.",
  });
  const [placeholder] = Retool.useStateString({
    name: "placeholder",
    initialValue: "Write an update… Type @ to mention someone",
  });
  const [submitLabel] = Retool.useStateString({
    name: "submitLabel",
    initialValue: "Post Update",
  });
  const [showSubmit] = Retool.useStateBoolean({
    name: "showSubmit",
    initialValue: true,
  });
  const [disabled] = Retool.useStateBoolean({
    name: "disabled",
    initialValue: false,
  });
  const [loading] = Retool.useStateBoolean({
    name: "loading",
    initialValue: false,
  });
  const submit = Retool.useEventCallback({ name: "submit" });
  const change = Retool.useEventCallback({ name: "change" });
  const editor = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const previous = useRef(value);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 12, top: 45 });
  const id = useId();
  const candidate = mentionQuery(value, caret);
  const query =
    candidate &&
    !mentions.some((m) => m.start === candidate.start && m.end <= caret)
      ? candidate
      : null;
  const people = normalizePeople(users)
    .filter(
      (p) =>
        !query ||
        `${p.full_name} ${p.email}`
          .toLowerCase()
          .includes(query.search.toLowerCase()),
    )
    .slice(0, 30);
  const open = focused && !dismissed && !!query && !disabled && !loading;
  const busy = disabled || loading;

  useEffect(() => {
    if (previous.current !== value) {
      const before = previous.current;
      setMentions((ms) => reconcileMentions(before, value, ms));
      previous.current = value;
    }
  }, [value]);
  useEffect(() => {
    const unique = new Map(
      mentions.map((m) => [
        m.email.toLowerCase(),
        { full_name: m.full_name, email: m.email },
      ]),
    );
    setMentionedUsers([...unique.values()]);
  }, [mentions]);
  const initialContext = useRef({ contextId, resetKey });
  useEffect(() => {
    if (
      initialContext.current.contextId === contextId &&
      initialContext.current.resetKey === resetKey
    )
      return;
    initialContext.current = { contextId, resetKey };
    previous.current = "";
    setValue("");
    setMentions([]);
    setDismissed(true);
    setCaret(0);
  }, [contextId, resetKey]);
  useEffect(() => {
    setActive(0);
  }, [query?.search, users]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (
        !editor.current ||
        !mirror.current ||
        !marker.current ||
        !root.current
      )
        return;
      mirror.current.scrollTop = editor.current.scrollTop;
      mirror.current.scrollLeft = editor.current.scrollLeft;
      const rect = marker.current.getBoundingClientRect();
      const frame = root.current.getBoundingClientRect();
      const height = list.current?.offsetHeight ?? 220;
      const top = rect.bottom - frame.top + 5;
      setPosition({
        left: Math.max(
          4,
          Math.min(
            rect.left - frame.left,
            frame.width - Math.min(340, frame.width - 8) - 4,
          ),
        ),
        top: Math.max(4, Math.min(top, frame.height - height - 4)),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (root.current) observer.observe(root.current);
    window.addEventListener("resize", place);
    editor.current?.addEventListener("scroll", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      editor.current?.removeEventListener("scroll", place);
    };
  }, [open, value, caret, people.length]);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const edit = (text: string, nextCaret: number) => {
    const before = previous.current;
    setMentions((ms) => reconcileMentions(before, text, ms));
    previous.current = text;
    setValue(text);
    setCaret(nextCaret);
    setDismissed(false);
    change();
  };
  const pick = (person: Person) => {
    if (!query) return;
    const token = `@${person.full_name}`;
    const next =
      value.slice(0, query.start) + token + " " + value.slice(query.end);
    const nextMentions = reconcileMentions(value, next, mentions);
    setMentions([
      ...nextMentions,
      { ...person, start: query.start, end: query.start + token.length },
    ]);
    previous.current = next;
    setValue(next);
    setDismissed(true);
    change();
    const end = query.start + token.length + 1;
    setCaret(end);
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(end, end);
    });
  };
  const post = () => {
    if (busy || !value.trim()) return;
    const unique = [
      ...new Map(
        mentions.map((m) => [
          m.email.toLowerCase(),
          { full_name: m.full_name, email: m.email },
        ]),
      ).values(),
    ];
    setSubmission({
      requestId: crypto.randomUUID(),
      contextId,
      text: value,
      mentionedUsers: unique,
    });
    submit();
  };
  return (
    <div className="updates-composer" style={theme} ref={root}>
      <div className="updates-editor-wrap">
        <textarea
          ref={editor}
          value={value}
          placeholder={placeholder}
          disabled={busy}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={open ? id : undefined}
          aria-expanded={open}
          aria-activedescendant={
            open && people[active] ? `${id}-${active}` : undefined
          }
          onChange={(e) => edit(e.target.value, e.target.selectionStart)}
          onSelect={(e) => {
            setCaret(e.currentTarget.selectionStart);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setDismissed(true);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (open && ["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              setActive(
                (a) =>
                  (a +
                    (e.key === "ArrowDown" ? 1 : -1) +
                    Math.max(1, people.length)) %
                  Math.max(1, people.length),
              );
            } else if (open && e.key === "Enter" && people[active]) {
              e.preventDefault();
              pick(people[active]);
            } else if (open && e.key === "Escape") {
              e.preventDefault();
              setDismissed(true);
            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              post();
            }
          }}
        />
        <div className="updates-mirror" ref={mirror} aria-hidden="true">
          {value.slice(0, caret)}
          <span ref={marker}>\u200b</span>
          {value.slice(caret)}
          {"\n"}
        </div>
      </div>
      <div className="updates-footer">
        <span>Type @ to mention · Ctrl/⌘ + Enter to post</span>
        {showSubmit && (
          <button type="button" disabled={busy || !value.trim()} onClick={post}>
            {loading ? "Posting…" : submitLabel}
          </button>
        )}
      </div>
      {open && (
        <div
          className="updates-people"
          ref={list}
          style={position}
          id={id}
          role="listbox"
          aria-label="People to mention"
        >
          <div className="updates-people-title">People</div>
          {people.length ? (
            people.map((person, index) => (
              <div
                key={person.email}
                role="option"
                id={`${id}-${index}`}
                aria-selected={active === index}
                className="updates-person"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(person)}
              >
                <span className="updates-avatar">
                  {person.full_name
                    .split(/\s+/)
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="updates-person-text">
                  <strong>{person.full_name}</strong>
                  <small>{person.email}</small>
                </span>
              </div>
            ))
          ) : (
            <div className="updates-empty">No matching people</div>
          )}
        </div>
      )}
    </div>
  );
};
