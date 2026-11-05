import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync(
  new URL("../retool/project-updates/postProjectUpdate.js", import.meta.url),
  "utf8",
);
const refreshScript = readFileSync(
  new URL(
    "../retool/project-updates/refreshProjectUpdates.js",
    import.meta.url,
  ),
  "utf8",
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function harness(kind = "update") {
  const request = {
    requestId: "09aedbc6-3b65-4c09-9caa-91cab0fe073a",
    kind,
    parentUpdateId: kind === "reply" ? "parent" : null,
    text: "@Alex West ready",
    tag: "teams_dev_channel",
    mentionedUsers: [{ full_name: "Alex West", email: "alex@example.com" }],
    files: [] as { name: string; sizeBytes: number; base64Data: string }[],
    project: {
      workstream_id: "workstream",
      site_id: "site",
      project_id: "project",
      project_name: "Demo",
    },
  };
  const state = () => {
    const s = {
      value: {} as any,
      setValue: vi.fn(async (v: any) => {
        s.value = structuredClone(v);
      }),
    };
    return s;
  };
  const row = {
    id: request.requestId,
    workstream_id: "workstream",
    project_id: "project",
    source: "teams_dev_channel",
    update_text: request.text,
    update_type: kind === "reply" ? "reply" : "general",
    mentioned_users: request.mentionedUsers,
  };
  const query = (value: unknown = []) => ({
    trigger: vi.fn(async (_?: any) => value),
  });
  const env = {
    customProjectUpdates: {
      postRequest: request,
    },
    updatesPostResult: state(),
    updatesPostCheckpoint: state(),
    formatDataAsArray: (v: unknown) => v,
    current_user: { email: "author@example.com", fullName: "Author" },
    url: { href: "https://example.com/app?old=1" },
    utils: { showNotification: vi.fn() },
    qCheckProjectFolderRegistry: query([
      { web_url: "https://example.com/folder" },
    ]),
    qNewProjectUpdate: query([row]),
    qNewUpdateReply: query([row]),
    qUploadUpdateFilesToSharePoint: query(),
    qLinkExistingUpdateFile: query(),
    qSendUpdateToTeamsDev: query(),
    workflowSendTeamsNotification: query(),
    qProjectUpdates: query(),
    qProjectReplies: query(),
    qProjectUpdateFiles: query(),
  };
  env.qProjectUpdateFiles.trigger.mockImplementation(async () =>
    request.files.map((file) => ({
      file_name: file.name,
      file_size_bytes: String(file.sizeBytes),
      update_id: row.id,
    })),
  );
  return {
    env,
    request,
    run: () =>
      new AsyncFunction(...Object.keys(env), script)(...Object.values(env)),
    refresh: () =>
      new AsyncFunction(...Object.keys(env), refreshScript)(
        ...Object.values(env),
      ),
  };
}
describe("single Retool posting handler", () => {
  it("sends a new Dev post as a Teams reply when the insert query returns an existing parent", async () => {
    const h = harness("update");
    h.env.qNewProjectUpdate.trigger.mockResolvedValue([
      {
        id: h.request.requestId,
        workstream_id: "workstream",
        project_id: "project",
        update_text: h.request.text,
        source: "teams_dev_channel",
        update_type: "reply",
        parent_update_id: "existing-dev-root",
        mentioned_users: h.request.mentionedUsers,
      },
    ]);
    await h.run();
    expect(h.env.qSendUpdateToTeamsDev.trigger).toHaveBeenCalledWith({
      additionalScope: expect.objectContaining({
        updateType: "reply",
        parentUpdateId: "existing-dev-root",
        updateId: h.request.requestId,
      }),
    });
    expect(h.env.qNewUpdateReply.trigger).not.toHaveBeenCalled();
  });
  it("links an unambiguous workflow receipt to the exact unlinked file row", async () => {
    const h = harness("reply");
    h.request.files = [
      { name: "photo.png", sizeBytes: 100, base64Data: "YQ==" },
    ];
    h.env.qUploadUpdateFilesToSharePoint.trigger.mockResolvedValue({
      data: {
        success: true,
        updateId: h.request.requestId,
        uploadedFiles: [
          {
            fileName: "photo.png",
            size: 100,
            webUrl: "https://example.com/photo.png",
            updateId: h.request.requestId,
            fileData: { "@microsoft.graph.downloadUrl": "do-not-persist-this" },
          },
        ],
      },
    });
    h.env.qProjectUpdateFiles.trigger.mockResolvedValueOnce([
      {
        file_id: "file-1",
        update_id: null,
        file_name: "photo.png",
        file_size_bytes: "100",
        sharepoint_web_url: "https://example.com/photo.png",
      },
    ]);
    h.env.qLinkExistingUpdateFile.trigger.mockResolvedValue([
      {
        file_id: "file-1",
        update_id: h.request.requestId,
        file_name: "photo.png",
        file_size_bytes: "100",
      },
    ]);
    const result = await h.run();
    expect(result.success).toBe(true);
    expect(h.env.qLinkExistingUpdateFile.trigger).toHaveBeenCalledWith({
      additionalScope: {
        fileId: "file-1",
        updateId: h.request.requestId,
        workstreamId: "workstream",
      },
    });
    expect(
      JSON.stringify(h.env.updatesPostCheckpoint.setValue.mock.calls),
    ).not.toContain("do-not-persist-this");
  });
  it("does not guess when two unlinked rows match the workflow receipt", async () => {
    const h = harness();
    h.request.files = [
      { name: "photo.png", sizeBytes: 100, base64Data: "YQ==" },
    ];
    h.env.qUploadUpdateFilesToSharePoint.trigger.mockResolvedValue({
      success: true,
      updateId: h.request.requestId,
      uploadedFiles: [
        {
          fileName: "photo.png",
          size: 100,
          webUrl: "https://example.com/photo.png",
        },
      ],
    });
    h.env.qProjectUpdateFiles.trigger.mockResolvedValue(
      ["file-1", "file-2"].map((file_id) => ({
        file_id,
        update_id: null,
        file_name: "photo.png",
        file_size_bytes: 100,
        sharepoint_web_url: "https://example.com/photo.png",
      })),
    );
    const result = await h.run();
    expect(result.success).toBe(false);
    expect(result.error).toContain("More than one unlinked record");
    expect(h.env.qLinkExistingUpdateFile.trigger).not.toHaveBeenCalled();
  });
  it("does not link a receipt reporting a different update ID", async () => {
    const h = harness();
    h.request.files = [
      { name: "photo.png", sizeBytes: 100, base64Data: "YQ==" },
    ];
    h.env.qUploadUpdateFilesToSharePoint.trigger.mockResolvedValue({
      success: true,
      updateId: "wrong-update",
      uploadedFiles: [
        {
          fileName: "photo.png",
          size: 100,
          webUrl: "https://example.com/photo.png",
        },
      ],
    });
    h.env.qProjectUpdateFiles.trigger.mockResolvedValue([
      {
        file_id: "file-1",
        update_id: null,
        file_name: "photo.png",
        file_size_bytes: 100,
        sharepoint_web_url: "https://example.com/photo.png",
      },
    ]);
    const result = await h.run();
    expect(result.success).toBe(false);
    expect(h.env.qLinkExistingUpdateFile.trigger).not.toHaveBeenCalled();
  });
  it("retains an uploaded file awaiting its metadata link and verifies it on retry without re-uploading", async () => {
    const h = harness();
    h.request.files = [
      { name: "photo.png", sizeBytes: 100, base64Data: "YQ==" },
    ];
    h.env.qProjectUpdateFiles.trigger.mockResolvedValueOnce([
      { file_name: "photo.png", file_size_bytes: "100", update_id: null },
    ]);
    await h.run();
    expect(h.env.updatesPostResult.value).toMatchObject({
      success: false,
      retryOnly: true,
    });
    expect(h.env.updatesPostResult.value.error).toContain(
      "no matching file linked",
    );
    expect(h.env.updatesPostCheckpoint.value.awaitingFileLink).toMatchObject({
      key: "photo.png-100",
      updateId: h.request.requestId,
    });
    expect(h.env.updatesPostCheckpoint.value.uploadedKeys).toEqual([]);
    await h.run();
    expect(h.env.qUploadUpdateFilesToSharePoint.trigger).toHaveBeenCalledTimes(
      1,
    );
    expect(h.env.qNewProjectUpdate.trigger).toHaveBeenCalledTimes(1);
    expect(h.env.updatesPostResult.value.success).toBe(true);
  });
  it("recovers a completed matching acknowledgment on refresh without reposting", async () => {
    const h = harness();
    h.env.updatesPostCheckpoint.value = {
      requestId: h.request.requestId,
      complete: true,
      busy: false,
    };
    await h.refresh();
    expect(h.env.updatesPostResult.value).toEqual({
      requestId: h.request.requestId,
      success: true,
    });
    expect(h.env.qNewProjectUpdate.trigger).not.toHaveBeenCalled();
    expect(h.env.workflowSendTeamsNotification.trigger).not.toHaveBeenCalled();
  });
  it.each([
    { complete: false, busy: false },
    { complete: true, busy: true },
    { complete: true, busy: false, requestId: "another-request" },
  ])(
    "does not clear an unfinished, active or unrelated post on refresh: %j",
    async (fields) => {
      const h = harness();
      h.env.updatesPostCheckpoint.value = {
        requestId: h.request.requestId,
        ...fields,
      };
      await h.refresh();
      expect(h.env.updatesPostResult.setValue).not.toHaveBeenCalled();
    },
  );
  it("posts selected recipients and sends both Dev and mention notifications", async () => {
    const h = harness();
    const result = await h.run();
    expect(result).toEqual({ requestId: h.request.requestId, success: true });
    expect(h.env.qNewProjectUpdate.trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalScope: expect.objectContaining({
          requestId: h.request.requestId,
          finalMentions: h.request.mentionedUsers,
        }),
      }),
    );
    expect(h.env.workflowSendTeamsNotification.trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalScope: expect.objectContaining({
          mentions: h.request.mentionedUsers,
        }),
      }),
    );
    expect(h.env.qSendUpdateToTeamsDev.trigger).toHaveBeenCalledTimes(1);
    expect(h.env.updatesPostResult.value.success).toBe(true);
  });
  it("routes replies with captured parent and structured mentions", async () => {
    const h = harness("reply");
    await h.run();
    expect(h.env.qNewProjectUpdate.trigger).not.toHaveBeenCalled();
    expect(h.env.qNewUpdateReply.trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalScope: expect.objectContaining({
          parentUpdateId: "parent",
          replyText: h.request.text,
          finalMentions: h.request.mentionedUsers,
        }),
      }),
    );
  });
  it("allows attachment-only posts and gates them on a project folder", async () => {
    const h = harness();
    h.request.text = "";
    h.request.files = [{ name: "a.pdf", sizeBytes: 2, base64Data: "YQ==" }];
    h.env.qCheckProjectFolderRegistry.trigger.mockResolvedValue([]);
    const result = await h.run();
    expect(result).toMatchObject({
      requestId: h.request.requestId,
      success: false,
    });
    expect(h.env.qNewProjectUpdate.trigger).not.toHaveBeenCalled();
    expect(h.env.updatesPostResult.value).toMatchObject({
      success: false,
      retryOnly: false,
    });
  });
  it("retains the insert and successful upload checkpoints when a later file fails", async () => {
    const h = harness();
    h.request.files = [
      { name: "a.pdf", sizeBytes: 1, base64Data: "YQ==" },
      { name: "b.pdf", sizeBytes: 1, base64Data: "Yg==" },
    ];
    h.env.qUploadUpdateFilesToSharePoint.trigger
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Upload failed"));
    await h.run();
    expect(h.env.updatesPostResult.value).toMatchObject({
      success: false,
      retryOnly: true,
    });
    expect(h.env.updatesPostCheckpoint.value.uploadedKeys).toEqual(["a.pdf-1"]);
    await h.run();
    expect(h.env.qNewProjectUpdate.trigger).toHaveBeenCalledTimes(1);
    expect(h.env.qUploadUpdateFilesToSharePoint.trigger).toHaveBeenCalledTimes(
      3,
    );
    expect(h.env.updatesPostResult.value.success).toBe(true);
  });
  it("does not resend a completed Dev step after a mention notification failure", async () => {
    const h = harness();
    h.env.workflowSendTeamsNotification.trigger.mockRejectedValueOnce(
      new Error("Notification unavailable"),
    );
    await h.run();
    await h.run();
    expect(h.env.qSendUpdateToTeamsDev.trigger).toHaveBeenCalledTimes(1);
    expect(h.env.qNewProjectUpdate.trigger).toHaveBeenCalledTimes(1);
    expect(h.env.workflowSendTeamsNotification.trigger).toHaveBeenCalledTimes(
      2,
    );
  });
  it("acknowledges saved posts when only refreshing the feed fails", async () => {
    const h = harness();
    h.env.qProjectUpdates.trigger.mockRejectedValueOnce(
      new Error("Refresh unavailable"),
    );
    await h.run();
    expect(h.env.updatesPostResult.value.success).toBe(true);
    expect(h.env.utils.showNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ notificationType: "warning" }),
    );
  });
});
