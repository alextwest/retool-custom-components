import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Mention, Person, mentionQuery, reconcileMentions } from "./mentions";

type Props = {
  value: string;
  mentions: Mention[];
  users: Person[];
  disabled?: boolean;
  placeholder: string;
  onChange: (value: string, mentions: Mention[]) => void;
  onSubmit: () => void;
};

/** Shared by the full updates section's update and reply editors. */
export function MentionInput({
  value,
  mentions,
  users,
  disabled,
  placeholder,
  onChange,
  onSubmit,
}: Props) {
  const editor = useRef<HTMLTextAreaElement>(null),
    mirror = useRef<HTMLDivElement>(null),
    marker = useRef<HTMLSpanElement>(null),
    list = useRef<HTMLDivElement>(null);
  const id = useId();
  const [caret, setCaret] = useState(0),
    [focus, setFocus] = useState(false),
    [dismissed, setDismissed] = useState(false),
    [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 230 });
  const candidate = mentionQuery(value, caret);
  const query =
    candidate &&
    !mentions.some((m) => m.start === candidate.start && m.end <= caret)
      ? candidate
      : null;
  const people = users
    .filter(
      (p) =>
        !query ||
        `${p.full_name} ${p.email}`
          .toLowerCase()
          .includes(query.search.toLowerCase()),
    )
    .slice(0, 30);
  const open = focus && !disabled && !dismissed && !!query;
  useEffect(() => {
    setActive(0);
  }, [query?.search, users]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!editor.current || !mirror.current || !marker.current) return;
      mirror.current.scrollTop = editor.current.scrollTop;
      mirror.current.scrollLeft = editor.current.scrollLeft;
      const r = marker.current.getBoundingClientRect();
      const maxHeight = Math.max(80, Math.min(230, window.innerHeight - 16));
      const height = Math.min(list.current?.offsetHeight ?? 230, maxHeight);
      const below = r.bottom + 5;
      const top =
        below + height <= window.innerHeight - 8
          ? below
          : Math.max(8, r.top - height - 5);
      setPosition({
        top,
        left: Math.max(
          8,
          Math.min(
            r.left,
            window.innerWidth - Math.min(340, window.innerWidth - 16) - 8,
          ),
        ),
        maxHeight,
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (editor.current) observer.observe(editor.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, value, caret, people.length]);
  useEffect(() => {
    const option = list.current?.querySelector<HTMLElement>(
      `[aria-selected="true"]`,
    );
    if (option && list.current) {
      const top = option.offsetTop,
        bottom = top + option.offsetHeight;
      if (top < list.current.scrollTop) list.current.scrollTop = top;
      else if (bottom > list.current.scrollTop + list.current.clientHeight)
        list.current.scrollTop = bottom - list.current.clientHeight;
    }
  }, [active]);
  const pick = (person: Person) => {
    if (!query) return;
    const token = `@${person.full_name}`,
      next = value.slice(0, query.start) + token + " " + value.slice(query.end);
    onChange(next, [
      ...reconcileMentions(value, next, mentions),
      { ...person, start: query.start, end: query.start + token.length },
    ]);
    const end = query.start + token.length + 1;
    setCaret(end);
    setDismissed(true);
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(end, end);
    });
  };
  // Overlay only selected ranges, so normal text remains visually unchanged.
  const highlighted: React.ReactNode[] = [];
  let start = 0;
  [...mentions]
    .sort((a, b) => a.start - b.start)
    .forEach((m, i) => {
      if (m.start < start || value.slice(m.start, m.end) !== `@${m.full_name}`)
        return;
      highlighted.push(
        value.slice(start, m.start),
        <mark key={i}>{value.slice(m.start, m.end)}</mark>,
      );
      start = m.end;
    });
  highlighted.push(value.slice(start), "\n");
  const syncScroll = () => {
    if (mirror.current && editor.current) {
      mirror.current.scrollTop = editor.current.scrollTop;
      mirror.current.scrollLeft = editor.current.scrollLeft;
    }
  };
  return (
    <div className="pu-mention-input">
      <div
        className="pu-text-highlight"
        aria-hidden="true"
        onScroll={syncScroll}
        ref={(el) => {
          // Highlight layer shares the editor's scroll offset independently of the caret mirror.
          if (el && editor.current) {
            el.scrollTop = editor.current.scrollTop;
            el.scrollLeft = editor.current.scrollLeft;
          }
        }}
      >
        {highlighted}
      </div>
      <textarea
        ref={editor}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={
          open && people[active] ? `${id}-${active}` : undefined
        }
        onChange={(e) => {
          const next = e.target.value;
          onChange(next, reconcileMentions(value, next, mentions));
          setCaret(e.target.selectionStart);
          setDismissed(false);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          setDismissed(true);
        }}
        onScroll={(e) => {
          syncScroll();
          const layer = e.currentTarget.previousElementSibling;
          if (layer) {
            layer.scrollTop = e.currentTarget.scrollTop;
            layer.scrollLeft = e.currentTarget.scrollLeft;
          }
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
          } else if (
            open &&
            e.key === "Enter" &&
            !e.ctrlKey &&
            !e.metaKey &&
            people[active]
          ) {
            e.preventDefault();
            pick(people[active]);
          } else if (open && e.key === "Escape") {
            e.preventDefault();
            setDismissed(true);
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="pu-caret-mirror" ref={mirror} aria-hidden="true">
        {value.slice(0, caret)}
        <span ref={marker}>{"\u200b"}</span>
        {value.slice(caret)}
        {"\n"}
      </div>
      {open && (
        <div
          className="pu-people"
          style={position}
          role="listbox"
          aria-label="People to mention"
          id={id}
          ref={list}
        >
          <div className="pu-people-heading">People</div>
          {people.length ? (
            people.map((p, i) => (
              <div
                className="pu-person"
                key={p.email}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
              >
                <span className="pu-avatar">
                  {p.full_name
                    .split(/\s+/)
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span>
                  <strong>{p.full_name}</strong>
                  <small>{p.email}</small>
                </span>
              </div>
            ))
          ) : (
            <div className="pu-no-people">No matching people</div>
          )}
        </div>
      )}
    </div>
  );
}
