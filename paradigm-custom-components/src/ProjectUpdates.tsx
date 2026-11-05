import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Retool } from "@tryretool/custom-component-support";
import { useAppTheme } from "./theme";
import { normalizePeople, Person } from "./mentions";
import { MentionInput } from "./MentionInput";
import { UpdateBody } from "./UpdateBody";
import {
  authorName,
  attachmentDetails,
  bodyText,
  buildThreads,
  Draft,
  emptyDraft,
  fileKey,
  filesForUpdate,
  matchesThread,
  readUploads,
  recipients,
  Row,
  rowId,
  rowPeople,
  rows,
  TAGS,
  tagValue,
} from "./projectUpdatesModel";
import "./ProjectUpdates.css";

type Request = {
  requestId: string;
  contextId: string;
  kind: string;
  parentUpdateId: string | null;
  text: string;
  tag: string;
  mentionedUsers: { full_name: string; email: string }[];
  files: {
    name: string;
    sizeBytes: number;
    type: string;
    base64Data: string;
  }[];
  project: Record<string, string>;
};
type Props = {
  users: unknown[];
  updates: Row[];
  attachments: Row[];
  project: Record<string, string>;
  contextId: string;
  title: string;
  disabled: boolean;
  loading: boolean;
  maxAttachmentMB: number;
  postResult: Row;
  onPost: (request: Request) => void;
  onRefresh: () => void;
  onPendingChange?: (pending: boolean) => void;
};

export const ProjectUpdates = () => {
  Retool.useComponentSettings({ defaultWidth: 12, defaultHeight: 100 });
  const theme = useAppTheme();
  const [users] = Retool.useStateArray({
    name: "users",
    initialValue: [],
    description:
      "All permitted mention users: {{ formatDataAsArray(qMentionUsers.data ?? {}) }}",
  });
  const [updates] = Retool.useStateArray({
    name: "updates",
    initialValue: [],
    description: "Root updates and any inline replies from qProjectUpdates.",
  });
  const [replies] = Retool.useStateArray({
    name: "replies",
    initialValue: [],
    description: "Reply rows from qProjectReplies. Duplicate IDs are merged.",
  });
  const [attachments] = Retool.useStateArray({
    name: "attachments",
    initialValue: [],
    description:
      "Required for saved file links: {{ formatDataAsArray(qProjectUpdateFiles.data ?? {}) }}. Include update_id, file_name and sharepoint_web_url; optional thumbnail_url for previews.",
  });
  const [project] = Retool.useStateObject({
    name: "project",
    initialValue: {},
    description:
      "Bind to {{ selectedProjectRow.value ?? {} }}. Captured in every submission.",
  });
  const [title] = Retool.useStateString({
    name: "title",
    initialValue: "Project Updates",
  });
  const [disabled] = Retool.useStateBoolean({
    name: "disabled",
    initialValue: false,
  });
  const [loading] = Retool.useStateBoolean({
    name: "loading",
    initialValue: false,
    description:
      "Read query loading state; post locking is automatic until postResult acknowledges the request.",
  });
  const [maxAttachmentMB] = Retool.useStateNumber({
    name: "maxAttachmentMB",
    initialValue: 20,
    description:
      "Total raw attachment size per post. Base64 adds about one-third. Match your upload query limits.",
  });
  const [postResult] = Retool.useStateObject({
    name: "postResult",
    initialValue: {},
    description:
      "Required: bind to {{ updatesPostResult.value }} or {{ postProjectUpdate.data ?? {} }}. The matching {requestId, success} acknowledgment ends Posting.",
  });
  const [, setPostRequest] = Retool.useStateObject({
    name: "postRequest",
    initialValue: {},
    inspector: "hidden",
  });
  const [, setHasPendingPost] = Retool.useStateBoolean({
    name: "hasPendingPost",
    initialValue: false,
    inspector: "hidden",
  });
  const post = Retool.useEventCallback({ name: "post" });
  const refresh = Retool.useEventCallback({ name: "refresh" });
  const normalizedProject = Object.fromEntries(
    Object.entries(project)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)]),
  );
  const contextId =
    normalizedProject.workstream_id ?? normalizedProject.project_id ?? "";
  const allRows = [
    ...new Map(
      [...rows(updates), ...rows(replies)]
        .filter((r) => rowId(r))
        .map((r) => [rowId(r), r]),
    ).values(),
  ].filter(
    (r) =>
      r.is_deleted !== true &&
      (!r.workstream_id || String(r.workstream_id) === contextId),
  );
  return (
    <div className="project-updates" style={theme}>
      <UpdatesSection
        key={contextId}
        users={users}
        updates={allRows}
        attachments={rows(attachments)}
        project={normalizedProject}
        contextId={contextId}
        title={title}
        disabled={disabled}
        loading={loading}
        maxAttachmentMB={maxAttachmentMB}
        postResult={postResult}
        onPost={(request) => {
          setPostRequest(request);
          post();
        }}
        onRefresh={refresh}
        onPendingChange={setHasPendingPost}
      />
    </div>
  );
};

export function UpdatesSection(props: Props) {
  const groupId = useId();
  const {
    updates,
    attachments,
    contextId,
    title,
    project,
    disabled,
    loading,
    maxAttachmentMB,
    postResult,
    onPost,
    onRefresh,
  } = props;
  const people = useMemo(() => normalizePeople(props.users), [props.users]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({
    new: emptyDraft(),
  });
  const [replying, setReplying] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<{
    request: Request;
    key: string;
  } | null>(null);
  useEffect(() => {
    props.onPendingChange?.(!!pending);
  }, [!!pending]);
  const postLock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = disabled || !!pending;
  const threads = buildThreads(updates);
  const updateDraft = (key: string, draft: Draft) =>
    setDrafts((ds) => ({ ...ds, [key]: draft }));
  // Observe acknowledgment fields individually, including hosts that update an object in place.
  const resultRequestId = postResult?.requestId;
  const resultSuccess = postResult?.success;
  const resultError = postResult?.error;
  useEffect(() => {
    if (!pending || resultRequestId !== pending.request.requestId) return;
    if (resultSuccess === true) {
      updateDraft(pending.key, emptyDraft(pending.request.tag));
      if (pending.key !== "new") setReplying(null);
      setNotice(
        pending.request.kind === "reply" ? "Reply posted." : "Update posted.",
      );
      setPending(null);
      postLock.current = false;
      setError("");
    } else if (resultSuccess === false) {
      setError(
        String(
          resultError ||
            "The post could not be completed. Your draft and attachments are retained.",
        ),
      );
    }
  }, [resultRequestId, resultSuccess, resultError, pending]);
  const postDraft = (key: string, tag: string) => {
    const draft = drafts[key] ?? emptyDraft(tag);
    if (
      postLock.current ||
      disabled ||
      !contextId ||
      (!draft.text.trim() && !draft.files.length)
    )
      return;
    postLock.current = true;
    setError("");
    setNotice("");
    const request: Request = {
      requestId: crypto.randomUUID(),
      contextId,
      kind: key === "new" ? "update" : "reply",
      parentUpdateId: key === "new" ? null : key,
      text: draft.text.trim(),
      tag: draft.tag,
      mentionedUsers: recipients(draft),
      files: draft.files,
      project: { ...project },
    };
    setPending({ request, key });
    onPost(request);
  };
  const retry = () => {
    if (!pending) return;
    setError("");
    onPost(pending.request);
  };
  const editFailed = () => {
    if (postResult.retryOnly === true) return;
    postLock.current = false;
    setPending(null);
    setError("");
  };
  const status =
    pending && !error
      ? "Posting… Waiting for Retool to complete the request."
      : "";
  const visibleCount = threads.roots.filter((root) =>
    matchesThread(
      root,
      threads.replies.get(rowId(root)) ?? [],
      attachments,
      search,
    ),
  ).length;
  return (
    <>
      <header className="pu-header">
        <div>
          <h2>{title}</h2>
          <p>Updates, conversations and project files in one place.</p>
        </div>
        <button
          className="pu-icon-button"
          type="button"
          aria-label="Refresh updates"
          title="Refresh updates"
          onClick={onRefresh}
          disabled={loading}
        >
          ↻
        </button>
      </header>
      <section className="pu-new" aria-label="New update">
        <DraftComposer
          draft={drafts.new}
          users={people}
          disabled={busy || !contextId}
          maxAttachmentMB={maxAttachmentMB}
          onChange={(d) => updateDraft("new", d)}
          onSubmit={() => postDraft("new", drafts.new.tag)}
        />
      </section>
      {!contextId && (
        <p className="pu-notice">Select a project to post updates.</p>
      )}
      <div role="status" aria-live="polite" className="pu-status">
        {status || notice}
      </div>
      {error && (
        <div className="pu-error" role="alert">
          <p>{error}</p>
          <div>
            <button type="button" onClick={retry} disabled={disabled}>
              Retry same post
            </button>
            {postResult.retryOnly !== true && (
              <button type="button" onClick={editFailed}>
                Edit draft
              </button>
            )}
          </div>
        </div>
      )}
      <div className="pu-search-row">
        <label className="pu-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label="Search all updates and replies"
            placeholder="Search all updates, replies, people and files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span className="pu-count">
          {visibleCount} {visibleCount === 1 ? "conversation" : "conversations"}
        </span>
      </div>
      {loading && (
        <p className="pu-notice" role="status">
          Loading updates…
        </p>
      )}
      <div className="pu-groups">
        {TAGS.map((tag) => {
          const roots = threads.roots.filter(
            (r) =>
              tagValue(r) === tag.value &&
              matchesThread(
                r,
                threads.replies.get(rowId(r)) ?? [],
                attachments,
                search,
              ),
          );
          const expanded = !!search.trim() || !collapsed[tag.value];
          return (
            <section className="pu-group" key={tag.value}>
              <button
                type="button"
                className="pu-group-heading"
                aria-expanded={expanded}
                aria-controls={`${groupId}-${tag.value}`}
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [tag.value]: !c[tag.value] }))
                }
                disabled={!!search.trim()}
              >
                <span
                  className={`pu-tag-dot pu-tag-${tag.label.toLowerCase()}`}
                />
                <strong>{tag.label}</strong>
                <span className="pu-group-count">{roots.length}</span>
                <span className="pu-chevron" aria-hidden="true">
                  {expanded ? "⌄" : "›"}
                </span>
              </button>
              {expanded && (
                <div
                  id={`${groupId}-${tag.value}`}
                  className="pu-group-content"
                >
                  {roots.length ? (
                    roots.map((root) => {
                      const id = rowId(root),
                        children = threads.replies.get(id) ?? [],
                        isReplying = replying === id;
                      return (
                        <article className="pu-card" key={id}>
                          <UpdateContent
                            row={root}
                            files={filesForUpdate(attachments, id)}
                            users={people}
                          />
                          {children.length > 0 && (
                            <div className="pu-replies">
                              {children.map((reply) => (
                                <div className="pu-reply" key={rowId(reply)}>
                                  <UpdateContent
                                    row={reply}
                                    files={filesForUpdate(
                                      attachments,
                                      rowId(reply),
                                    )}
                                    users={people}
                                    reply
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            className="pu-reply-toggle"
                            type="button"
                            aria-expanded={isReplying}
                            disabled={busy}
                            onClick={() => {
                              setReplying(isReplying ? null : id);
                              if (!drafts[id])
                                updateDraft(id, emptyDraft(tag.value));
                            }}
                          >
                            <ReplyIcon />
                            {isReplying ? "Close reply" : "Reply"}
                            {!isReplying &&
                            drafts[id] &&
                            (drafts[id].text || drafts[id].files.length)
                              ? " · draft"
                              : ""}
                          </button>
                          {isReplying && (
                            <DraftComposer
                              draft={drafts[id] ?? emptyDraft(tag.value)}
                              users={people}
                              disabled={busy}
                              maxAttachmentMB={maxAttachmentMB}
                              reply
                              onChange={(d) => updateDraft(id, d)}
                              onSubmit={() => postDraft(id, tag.value)}
                              onCancel={() => setReplying(null)}
                            />
                          )}
                        </article>
                      );
                    })
                  ) : (
                    <p className="pu-empty">
                      {search.trim()
                        ? "No matching conversations in this section."
                        : `No ${tag.label.toLowerCase()} updates yet.`}
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function ReplyIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="m9 5-6 6 6 6M3 11h11a6 6 0 0 1 6 6v2" />
    </svg>
  );
}
function AttachIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}

function DraftComposer({
  draft,
  users,
  disabled,
  maxAttachmentMB,
  onChange,
  onSubmit,
  reply = false,
  onCancel,
}: {
  draft: Draft;
  users: Person[];
  disabled: boolean;
  maxAttachmentMB: number;
  onChange: (d: Draft) => void;
  onSubmit: () => void;
  reply?: boolean;
  onCancel?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    alive = useRef(true),
    readingLock = useRef(false);
  const [reading, setReading] = useState(false),
    [fileError, setFileError] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const blocked = disabled || reading;
  const chooseFiles = async (selected: File[]) => {
    if (readingLock.current || disabled) return;
    readingLock.current = true;
    setReading(true);
    setFileError("");
    try {
      const uploads = await readUploads(
        selected,
        draft.files,
        (Number.isFinite(maxAttachmentMB) && maxAttachmentMB > 0
          ? maxAttachmentMB
          : 20) *
          1024 *
          1024,
      );
      if (alive.current)
        onChange({ ...draft, files: [...draft.files, ...uploads] });
    } catch (e) {
      if (alive.current)
        setFileError(
          e instanceof Error ? e.message : "Could not read the selected files.",
        );
    } finally {
      readingLock.current = false;
      if (alive.current) setReading(false);
    }
  };
  return (
    <div className={`pu-draft${reply ? " pu-draft-reply" : ""}`}>
      <MentionInput
        value={draft.text}
        mentions={draft.mentions}
        users={users}
        disabled={blocked}
        placeholder={
          reply
            ? "Write a reply… Type @ to mention someone"
            : "Write an update… Type @ to mention someone"
        }
        onChange={(text, mentions) => onChange({ ...draft, text, mentions })}
        onSubmit={() => {
          if (!blocked) onSubmit();
        }}
      />
      {!!draft.files.length && (
        <ul className="pu-pending-files" aria-label="Attached files">
          {draft.files.map((f) => (
            <li key={fileKey(f)}>
              {/^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(f.type) ? (
                <img
                  className="pu-pending-thumbnail"
                  src={`data:${f.type};base64,${f.base64Data}`}
                  alt=""
                />
              ) : (
                <AttachIcon />
              )}
              <span title={f.name}>
                {f.name}
                <small>{fileSize(f.sizeBytes)}</small>
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                disabled={blocked}
                onClick={() =>
                  onChange({
                    ...draft,
                    files: draft.files.filter(
                      (other) => fileKey(other) !== fileKey(f),
                    ),
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {fileError && (
        <p className="pu-file-error" role="alert">
          {fileError}
        </p>
      )}
      <div className="pu-composer-actions">
        {!reply && (
          <label className="pu-tag-select">
            Update tag
            <select
              aria-label="Update tag"
              value={draft.tag}
              disabled={blocked}
              onChange={(e) => onChange({ ...draft, tag: e.target.value })}
            >
              {TAGS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value === "teams_dev_channel"
                    ? "Dev · Posts to Teams"
                    : t.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          disabled={blocked}
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            e.target.value = "";
            void chooseFiles(selected);
          }}
        />
        <button
          type="button"
          className="pu-attach"
          disabled={blocked}
          onClick={() => input.current?.click()}
        >
          <AttachIcon />
          {reading ? "Reading files…" : "Attach Files"}
        </button>
        <div className="pu-submit-actions">
          {reply && (
            <button
              className="pu-cancel"
              type="button"
              onClick={onCancel}
              disabled={blocked}
            >
              Cancel
            </button>
          )}
          <button
            className="pu-primary"
            type="button"
            onClick={onSubmit}
            disabled={blocked || (!draft.text.trim() && !draft.files.length)}
          >
            {reply ? "Post Reply" : "Post Update"}
          </button>
        </div>
      </div>
      <p className="pu-composer-hint">
        {draft.tag === "teams_dev_channel" ? "Dev updates post to Teams. " : ""}
        Attachments upload to the project’s SharePoint folder.{" "}
        <span>Type @ to mention · Ctrl/⌘ + Enter to post</span>
      </p>
    </div>
  );
}
function fileSize(size: unknown) {
  const n = Number(size);
  return Number.isFinite(n) && n >= 0
    ? n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(1)} MB`
      : `${Math.ceil(n / 1024)} KB`
    : "";
}
export function SavedAttachment({ file }: { file: Row }) {
  const { name, extension, href, thumbnail } = attachmentDetails(file);
  const [brokenPreview, setBrokenPreview] = useState(false);
  useEffect(() => {
    setBrokenPreview(false);
  }, [thumbnail]);
  const content = (
    <>
      <span className="pu-file-preview">
        {thumbnail && !brokenPreview ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBrokenPreview(true)}
          />
        ) : (
          <span className="pu-file-type">
            {extension.toUpperCase().slice(0, 6) || "FILE"}
          </span>
        )}
      </span>
      <span className="pu-file-info">
        <strong>{name}</strong>
        <small>
          {[
            fileSize(file.file_size_bytes ?? file.sizeBytes),
            href ? "Open file" : "Link unavailable",
          ]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </span>
      {href && (
        <span className="pu-file-open" aria-hidden="true">
          ↗
        </span>
      )}
    </>
  );
  return (
    <li>
      {href ? (
        <a
          className="pu-file-card"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${name}`}
        >
          {content}
        </a>
      ) : (
        <div className="pu-file-card">{content}</div>
      )}
    </li>
  );
}
function UpdateContent({
  row,
  files,
  users,
  reply,
}: {
  row: Row;
  files: Row[];
  users: Person[];
  reply?: boolean;
}) {
  const date = new Date(String(row.created_at ?? ""));
  return (
    <>
      <div className="pu-card-meta">
        {reply && (
          <span className="pu-thread-arrow" aria-hidden="true">
            ↳
          </span>
        )}
        <strong>{authorName(row)}</strong>
        {!Number.isNaN(date.getTime()) && (
          <time dateTime={date.toISOString()}>
            {date.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        )}
        {!reply && (
          <span className="pu-tag-badge">
            {TAGS.find((t) => t.value === tagValue(row))?.label}
          </span>
        )}
      </div>
      <UpdateBody text={bodyText(row)} people={rowPeople(row, users)} />
      {!!files.length && (
        <ul className="pu-saved-files" aria-label="Update attachments">
          {files.map((file, i) => (
            <SavedAttachment
              key={String(file.file_id ?? file.id ?? i)}
              file={file}
            />
          ))}
        </ul>
      )}
    </>
  );
}
