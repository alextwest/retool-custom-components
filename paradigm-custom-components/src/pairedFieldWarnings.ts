type FieldConfig = {
  label?: string;
  group?: string;
  hidden?: boolean;
  pairedField?: string;
  type?: string;
};

export function pairedFieldWarnings(
  draft: Record<string, unknown>,
  fields: Record<string, FieldConfig>,
) {
  const warnings: { group: string; message: string }[] = [];
  const seen = new Set<string>();
  const label = (key: string) =>
    fields[key]?.label ||
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const present = (value: unknown) =>
    value != null && (typeof value !== "string" || value.trim() !== "");
  for (const key of Object.keys(draft)) {
    const paired =
      fields[key]?.pairedField ||
      (key.endsWith("_amount")
        ? key === "incentive_amount" && "incentive_received_date" in draft
          ? "incentive_received_date"
          : key.replace(/_amount$/, "_date")
        : undefined);
    if (
      !paired ||
      !(paired in draft) ||
      fields[key]?.hidden ||
      fields[paired]?.hidden
    )
      continue;
    const identity = [key, paired].sort().join(":");
    if (seen.has(identity)) continue;
    seen.add(identity);
    const hasZeroAmount = [key, paired].some(
      (field) =>
        (field.endsWith("_amount") || fields[field]?.type === "number") &&
        present(draft[field]) &&
        Number(draft[field]) === 0,
    );
    if (hasZeroAmount) continue;
    if (present(draft[key]) === present(draft[paired])) continue;
    const filled = present(draft[key]) ? key : paired;
    const missing = filled === key ? paired : key;
    warnings.push({
      group: fields[missing]?.group || fields[filled]?.group || "Details",
      message: `${label(filled)} is entered, but ${label(missing)} is missing. Add the matching value if applicable.`,
    });
  }
  return warnings;
}
