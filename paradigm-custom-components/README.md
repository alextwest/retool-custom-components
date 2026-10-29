# Deploying theme support

This deployable library exports FileTree, CalendarWrapper, and AddressAutoComplete.

From this directory run `npm run deploy`, then select the new library version in your Retool app's Custom Component settings.

For EACH component instance, set **App theme** in the Inspector to the expression `{{ theme }}`. This binding is required: custom components cannot automatically read the parent app theme. Once bound, changing the app theme updates its colors and light/dark mode.

FileTree's background, header, selection, hover, text, and font fields remain optional overrides. Clear existing color/font values to follow the app theme; previously saved white backgrounds still override it.

No theme binding preserves a light appearance. Partial themes receive mode-appropriate fallback colors. Crew/event colors, file-type icons, and configured badge colors remain data colors.

Local validation: `npx retool-ccl build --skip-updates-check`. For the currently installed TypeScript version, run `npx tsc --noEmit --ignoreDeprecations 5.0` (the existing tsconfig specifies 6.0).
