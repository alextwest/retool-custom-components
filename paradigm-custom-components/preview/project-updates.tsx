// Local fixture only: no Retool/database/workflow requests are made.
import React, { useState } from "react";
// @ts-expect-error The library does not currently install @types/react-dom.
import { createRoot } from "react-dom/client";
import { UpdatesSection } from "../src/ProjectUpdates";
import { resolveAppTheme } from "../src/theme";
import { Row } from "../src/projectUpdatesModel";

const users = [
  { full_name: "Alex West", email: "alex@example.com" },
  { full_name: "Morgan Lee", email: "morgan@example.com" },
  { full_name: "Taylor Chen", email: "taylor@example.com" },
];
const fixtures = [
  {
    id: "root-1",
    created_by: "Morgan Lee",
    created_at: "2026-11-03T15:20:00Z",
    update_text:
      "The site visit is complete. @Alex West please review the installation schedule before Friday.",
    source: "general_retool",
    mentioned_users: [users[0]],
  },
  {
    id: "reply-1",
    parent_update_id: "root-1",
    created_by: "Alex West",
    created_at: "2026-11-03T16:00:00Z",
    update_text:
      "Thanks @Morgan Lee — the revised drawings look good. We can proceed with the permit.",
    mentioned_users: [users[1]],
  },
  {
    id: "root-2",
    created_by: "Taylor Chen",
    created_at: "2026-11-02T17:00:00Z",
    update_text:
      "Design revisions are ready for review. The equipment schedule has been updated.",
    source: "teams_dev_channel",
  },
  {
    id: "root-3",
    created_by: "Morgan Lee",
    created_at: "2026-11-01T12:00:00Z",
    update_text:
      "Proposal sent to the property manager. Following up next week.",
    source: "teams_sales_channel",
  },
];
function Preview() {
  const [dark, setDark] = useState(true),
    [narrow, setNarrow] = useState(false),
    [fail, setFail] = useState(false);
  const [updates, setUpdates] = useState<Row[]>(fixtures),
    [result, setResult] = useState<Row>({});
  return (
    <div
      style={{
        height: "100vh",
        background: dark ? "#17191c" : "#f5f6fa",
        padding: "18px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "20px",
          color: dark ? "#ddd" : "#222",
          fontFamily: "system-ui",
          fontSize: "12px",
          marginBottom: "12px",
        }}
      >
        <strong>LOCAL PREVIEW · no live queries</strong>
        <label>
          <input
            type="checkbox"
            checked={dark}
            onChange={(e) => setDark(e.target.checked)}
          />{" "}
          Dark
        </label>
        <label>
          <input
            type="checkbox"
            checked={narrow}
            onChange={(e) => setNarrow(e.target.checked)}
          />{" "}
          Narrow
        </label>
        <label>
          <input
            type="checkbox"
            checked={fail}
            onChange={(e) => setFail(e.target.checked)}
          />{" "}
          Simulate failure
        </label>
      </div>
      <div
        className="project-updates"
        style={{
          ...resolveAppTheme({
            mode: dark ? "dark" : "light",
            primary: "#149bd0",
          }),
          height: "calc(100% - 36px)",
          maxWidth: narrow ? "420px" : "1060px",
          margin: "0 auto",
          borderRadius: "12px",
        }}
      >
        <UpdatesSection
          title="Maple Commons Updates"
          users={users}
          updates={updates}
          attachments={[
            {
              file_id: "f1",
              update_id: "root-1",
              file_name: "Installation schedule.pdf",
              file_size_bytes: 184000,
              sharepoint_web_url: "https://example.com/schedule.pdf",
            },
          ]}
          project={{ workstream_id: "demo", site_id: "site" }}
          contextId="demo"
          disabled={false}
          loading={false}
          maxAttachmentMB={20}
          postResult={result}
          onRefresh={() => {}}
          onPost={(request) => {
            if (fail) {
              setResult({
                requestId: request.requestId,
                success: false,
                error:
                  "Simulated upload failure. Your draft and files are retained.",
                retryOnly: false,
              });
              return;
            }
            setUpdates((rs) =>
              rs.some((r) => r.id === request.requestId)
                ? rs
                : [
                    ...rs,
                    {
                      id: request.requestId,
                      parent_update_id: request.parentUpdateId,
                      update_text: request.text,
                      source: request.tag,
                      created_by: "Alex West",
                      created_at: new Date().toISOString(),
                      mentioned_users: request.mentionedUsers,
                    },
                  ],
            );
            setResult({ requestId: request.requestId, success: true });
          }}
        />
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
