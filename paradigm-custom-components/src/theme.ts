import React from "react";
import { Retool } from "@tryretool/custom-component-support";

/** Bind appTheme to {{ theme }} in each component's Retool Inspector. */
export function useAppTheme(): React.CSSProperties {
  const [appTheme] = Retool.useStateObject({
    name: "appTheme",
    label: "App theme",
    description: "Bind to {{ theme }} to follow the app's colors and light/dark mode.",
    initialValue: {},
  });
  return resolveAppTheme(appTheme);
}

export function resolveAppTheme(theme: Record<string, unknown>): React.CSSProperties {
  const dark = String(theme.mode ?? "light").toLowerCase() === "dark";
  const value = (key: string, fallback: string) =>
    typeof theme[key] === "string" && theme[key] ? theme[key] as string : fallback;
  const font = theme.defaultFont as { name?: unknown } | undefined;
  const text = dark ? "#f3f4f6" : "#111827";
  const surface = value("surfacePrimary", dark ? "#242424" : "#ffffff");
  const primary = value("primary", dark ? "#60a5fa" : "#2563eb");
  const hex = /^#([0-9a-f]{6})$/i.exec(primary);
  const rgb = hex ? [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16) / 255) : null;
  const luminance = rgb?.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const onPrimary = luminance && (0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2]) > 0.179 ? "#111827" : "#ffffff";
  const style = {
    "--app-canvas": value("canvas", dark ? "#171717" : "#f8f9fb"),
    "--app-surface": surface,
    "--app-secondary": value("surfaceSecondary", dark ? "#303030" : "#f9fafb"),
    "--app-text": value("text", text),
    "--app-muted": value("textSecondary", dark ? "#b0b7c3" : "#6b7280"),
    "--app-border": value("border", dark ? "#4b5563" : "#d1d5db"),
    "--app-primary": primary,
    "--app-on-primary": onPrimary,
    "--app-selected": `color-mix(in srgb, ${primary} 18%, ${surface})`,
    "--app-danger": value("danger", dark ? "#f87171" : "#dc2626"),
    "--app-warning": value("warning", dark ? "#fbbf24" : "#b45309"),
    "--app-success": value("success", dark ? "#4ade80" : "#16a34a"),
    "--app-error-bg": dark ? "#452222" : "#fef2f2",
    "--app-success-bg": dark ? "#183c29" : "#dcfce7",
    "--app-font": typeof font?.name === "string" ? font.name : "Inter, system-ui, sans-serif",
    color: "var(--app-text)",
    fontFamily: typeof font?.name === "string" ? font.name : "Inter, system-ui, sans-serif",
    colorScheme: dark ? "dark" : "light",
  };
  return style as React.CSSProperties;
}
