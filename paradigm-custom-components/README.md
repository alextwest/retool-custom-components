# Deploying theme support

This deployable library exports FileTree, CalendarWrapper, and AddressAutoComplete.

It also exports KeyValueEditor, UpdatesComposer, and **ProjectUpdates**. For the complete updates/feed/replies component with attachments and tags, follow [the Retool integration guide](retool/project-updates/README.md). The single posting handler and replacement SQL queries are in the same folder. Standalone composer setup is in [UPDATES_COMPOSER.md](UPDATES_COMPOSER.md).

KeyValueEditor now supports editing during saves, queued batches, and idle autosave. See [nonblocking autosave setup](retool/KEY_VALUE_EDITOR_AUTOSAVE.md), including the required save acknowledgment and record-navigation guard.

FileTree's development version defaults Office files to desktop opening from the arrow and supplies the preferred URL for row events, with a Browser fallback and per-browser preference. See [desktop opening setup, row-handler patch, and synced-folder limitations](retool/FILE_TREE_DESKTOP_OPEN.md).

From this directory run `npm run deploy`, then select the new library version in your Retool app's Custom Component settings.

For EACH component instance, set **App theme** in the Inspector to the expression `{{ theme }}`. This binding is required: custom components cannot automatically read the parent app theme. Once bound, changing the app theme updates its colors and light/dark mode.

FileTree's background, header, selection, hover, text, and font fields remain optional overrides. Clear existing color/font values to follow the app theme; previously saved white backgrounds still override it.

No theme binding preserves a light appearance. Partial themes receive mode-appropriate fallback colors. Crew/event colors, file-type icons, and configured badge colors remain data colors.

Local validation: `npx retool-ccl build --skip-updates-check`. For the currently installed TypeScript version, run `npx tsc --noEmit --ignoreDeprecations 5.0` (the existing tsconfig specifies 6.0).

MultiSelectCascader provides hierarchical multiselect filtering with search and tags. See [measure status setup and layout limitations](retool/MULTISELECT_CASCADER.md).
