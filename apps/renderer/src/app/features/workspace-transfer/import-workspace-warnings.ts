const POSTMAN_SCRIPT_WARNING = /^Postman scripts on "(.+)" were not imported\.?$/;

export interface ImportWarningGroup {
  readonly summary: string;
  readonly details: readonly string[];
}

/** Groups repetitive converter warnings into short summaries. */
export function summarizeImportWarnings(warnings: readonly string[]): ImportWarningGroup[] {
  const scriptNames: string[] = [];
  const other: string[] = [];
  for (const warning of warnings) {
    const match = POSTMAN_SCRIPT_WARNING.exec(warning.trim());
    if (match?.[1]) {
      scriptNames.push(match[1]);
      continue;
    }
    other.push(warning);
  }

  const groups: ImportWarningGroup[] = [];
  if (scriptNames.length === 1) {
    groups.push({
      summary: `Postman scripts on “${scriptNames[0]}” were not imported.`,
      details: [],
    });
  } else if (scriptNames.length > 1) {
    groups.push({
      summary: `Postman scripts on ${scriptNames.length} requests were not imported.`,
      details: scriptNames,
    });
  }
  for (const warning of other)
    groups.push({ summary: warning, details: [] });
  return groups;
}
