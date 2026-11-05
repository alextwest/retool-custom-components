// Replace qFileSelect's existing script. The current component opens files directly
// during the click; this handler loads folders and supports older component builds.
const node = JSON.parse(dynamicWidgetFileTree.selectedNode || "{}");

if (node.type === "folder" && node.sharepoint_id) {
  await qListFolderChildren.trigger({
    additionalScope: { folderItemId: node.sharepoint_id },
  });
}

if (node.type === "file" && !node.openHandled) {
  const target = node.openUrl || node.url;
  if (target) {
    try {
      await utils.openUrl(target, { newTab: true });
    } catch (error) {
      // A reported launch error can fall back. A browser's native Deny prompt
      // normally does not report an error, so the component also exposes Browser.
      const browserUrl = node.browserUrl || node.url;
      if (browserUrl && browserUrl !== target) {
        await utils.openUrl(browserUrl, { newTab: true });
      } else {
        throw error;
      }
    }
  }
}
