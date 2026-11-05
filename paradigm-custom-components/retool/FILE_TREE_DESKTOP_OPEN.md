# FileTree desktop opening

## Implemented in the development library

FileTree now defaults the **arrow** to desktop opening for supported Word, Excel and PowerPoint files. The separate per-file Desktop button has been removed. A **Browser** fallback remains beside files whose default action is desktop. `showDesktopOffice` keeps its existing state name but is labeled **Allow Office desktop apps** in the Inspector; switch it off to force ordinary browser opening.

Users can choose **Open Office files in → Desktop app / Browser** above the tree. The preference is stored in localStorage for that browser/profile when storage is allowed; otherwise it lasts for the mounted session. It does not change another user's preference or their Windows file associations. The default for users without a stored preference is Desktop app.

**For row clicks, replace `qFileSelect` with [fileTreeFileSelect.js](fileTreeFileSelect.js).** Files now open directly inside the component's click handler: the filename is a native anchor with the same href as the working arrow, and clicking another part of the row opens that target synchronously. Opening through a later Retool query/utility callback is no longer required. The component publishes `selectedNode.openHandled: true` to indicate that the click's file-launch action is already owned by the component. This indicates a requested native action, not proof that the external app opened.

The updated `qFileSelect` skips these handled file clicks, preserves folder-child loading, and retains a compatibility path for older component builds without the flag. Remove any additional file-opening handlers that still open `node.url` unconditionally, or the browser may launch as well. The metadata still includes `openUrl`, `browserUrl`, `desktopUrl`, `openMode`, and `desktopApp`; the original `selectedNode.url` and `selectedFileUrl` remain the cloud URL for compatibility. A minimal handler for this build can contain only the folder-loading branch; file launching is entirely inside FileTree.

After a desktop attempt, a small **If Word/Excel/PowerPoint didn't open, open in browser** link appears. Browsers do not expose a reliable result indicating that Office is absent or that the user clicked Deny on the external-app prompt. There is no timer-based fallback: it could open both the app and the website when a user takes longer to respond. Users can use the visible Browser link and select Browser as their remembered preference. The UI requests a desktop launch; it does not report that Office opened successfully without confirmation.

The node must have a direct HTTPS document URL:

```json
{
  "name": "Project scope.docx",
  "type": "file",
  "url": "https://tenant.sharepoint.com/sites/Projects/Shared%20Documents/Project%20scope.docx"
}
```

For SharePoint Office viewer links such as `/:x:/r/sites/Projects/_layouts/15/Doc.aspx?sourcedoc=...&file=...`, FileTree now builds the actual desktop document URL from the containing folder's address plus the encoded filename. Parent folder addresses are carried through the tree, including nested folders whose own URL is absent. Direct folder URLs, `/:f:/r/...` resource paths and library-view `?id=/sites/...` / `?RootFolder=...` URLs are supported. Resource-path Office wrappers such as `/:w:/r/sites/.../scope.docx` are normalized directly. This follows [Microsoft's parent-folder URL guidance](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/tutorials/launch-experience).

You can still supply a separate `officeUrl` containing the actual HTTPS document path as an explicit override. The Browser fallback continues using the original `url`. If a supported Office file has insufficient path information, the default target falls back directly to the browser. Files whose viewer URL identifies a different filename or a different origin from the parent folder are not guessed. PDFs and folder arrows keep browser actions; selecting a folder row still loads its children through the existing event handler.

The links use Microsoft's documented `ms-word:ofe|u|...`, `ms-excel:ofe|u|...`, and `ms-powerpoint:ofe|u|...` schemes. These request editing the cloud file in the associated Office product, not downloading an independent copy. Users need the desktop application installed, access to the SharePoint document, and browser/device policy allowing the external-app launch. A browser confirmation may appear. The link generation, handler routing and rendered actions were unit-tested; actual prompt/refusal behavior on managed devices still needs a pilot. Folder/OneDrive limitations below are unchanged by this UI update.

Reference: [Office URI schemes](https://learn.microsoft.com/en-us/office/client-developer/office-uri-schemes).

## PDFs and the user's default app

Microsoft's **Open → Open in app** feature inside OneDrive/SharePoint supports non-Office formats, including PDFs, and chooses the user's default application. It requires the OneDrive sync client and Files On-Demand. That Microsoft-controlled handoff is not equivalent to opening a normal HTTPS link from the Retool iframe. FileTree does not claim an ordinary PDF web URL launches the local default app and does not hardcode Adobe when another viewer may be preferred.

Reference: [Open a OneDrive or SharePoint file in the desktop app](https://support.microsoft.com/en-us/sharepoint/sync/open-a-onedrive-or-sharepoint-file-in-the-desktop-app-instead-of-the-browser).

## Opening the synced project folder in File Explorer

A OneDrive shortcut makes the folder accessible locally, but it does not supply FileTree with a reliable device-specific path. Users can have different Windows profiles, sync roots, account arrangements and renamed/moved shortcuts. The component does not infer a path from the current user's email or issue an ordinary `file://` link as if that would reliably launch Explorer from a cloud web app.

For the stated managed-Windows environment with both Edge and Chrome, a proper one-click route would be a company-managed local protocol handler/browser integration. It would receive an approved project/file identifier, resolve it to the user's configured synced location, and use Windows to open the folder or file. Files opened that way can respect Windows file associations, including Adobe or another PDF viewer. IT needs to own deployment, allowed SharePoint roots, per-user path mappings and launch permissions. No local helper, extension, registry change or device policy has been installed by this component change.

Microsoft also documents an Edge-only **View in File Explorer** policy/SharePoint configuration. It uses WebDAV rather than the existing OneDrive shortcut, is not a Chrome solution, and Microsoft recommends OneDrive sync instead. It is not implemented as a generic folder button here.

References: [OneDrive shared-folder shortcuts](https://support.microsoft.com/en-us/onedrive/add-shortcuts-to-shared-folders-in-onedrive), [View SharePoint files with File Explorer in Edge](https://learn.microsoft.com/en-us/sharepoint/sharepoint-view-in-edge), [ConfigureViewInFileExplorer policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/configureviewinfileexplorer).
