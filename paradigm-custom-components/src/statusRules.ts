export type ClearRule = { canClear: boolean; reason?: string };

// User verified that statuses can clear once related dates and amounts are cleared.
export const statusRules: Record<string, ClearRule | null> = {
  dev_status: { canClear: true },
  contract_status: { canClear: true },
  delivery_status: { canClear: true },
  hold_status: { canClear: true },
  permit_status: { canClear: true },
};

export function statusDependencyReason(
  key: string,
  draft: Record<string, unknown>,
  fields: Record<string, { group?: string; type?: string }>,
): string | null {
  const related: Record<string, string[]> = {
    dev_status: [
      "reviewed_date",
      "reviewed_amount",
      "submitted_date",
      "submitted_amount",
    ],
    contract_status: [
      "signed_date",
      "signed_amount",
      "incentive_received_date",
      "incentive_amount",
    ],
    delivery_status: ["scheduled_start_date", "scheduled_end_date"],
  };
  const populated = Object.keys(draft).some((field) => {
    const sameSection =
      fields[key]?.group && fields[field]?.group === fields[key].group;
    const isDateOrAmount =
      /_(date|amount)$/.test(field) || fields[field]?.type === "date";
    return (
      isDateOrAmount &&
      (sameSection || related[key]?.includes(field)) &&
      draft[field] != null &&
      draft[field] !== "" &&
      !(field.endsWith("_amount") && Number(draft[field]) === 0)
    );
  });
  return populated
    ? "Clear the related dates and amounts in this section before clearing this status."
    : null;
}

export function statusClearReason(
  key: string,
  persistedValue: unknown,
  label: string,
  required: boolean,
  verifiedRules: Record<string, ClearRule>,
): string | null {
  if (required) return `${label} is required. Select another status instead.`;
  const rule = verifiedRules[key] ?? statusRules[key];
  if (!rule || typeof rule.canClear !== "boolean") {
    return `Clearing ${label} is unavailable until its database workflow rules have been verified. Select another status instead.`;
  }
  if (persistedValue != null && !rule.canClear) {
    return `${label} ${rule.reason || "cannot be cleared because of the current project workflow rules. Select another status instead."}`;
  }
  return null;
}

export function reconcileSave(
  original: Record<string, any>,
  submitted: Record<string, any>,
  persisted: Record<string, any>,
) {
  const changed = Object.keys(submitted).filter(
    (key) => JSON.stringify(original[key]) !== JSON.stringify(submitted[key]),
  );
  const missing = changed.filter(
    (key) => !Object.prototype.hasOwnProperty.call(persisted, key),
  );
  const mismatched = changed.filter(
    (key) =>
      !missing.includes(key) &&
      JSON.stringify(persisted[key]) !== JSON.stringify(submitted[key]),
  );
  // RETURNING m.* may contain columns outside the editor's configured data shape.
  const actual = Object.fromEntries(
    Object.entries(persisted).filter(([key]) =>
      Object.prototype.hasOwnProperty.call(submitted, key),
    ),
  );
  return {
    missing,
    mismatched,
    value: { ...submitted, ...actual },
    baseline: { ...original, ...actual },
  };
}
