import {
  captureFileSchema,
  captureFileV1Schema,
  captureFileV2Schema,
  type CaptureFile,
  type CaptureItem,
  type CaptureTreeItem,
  isCaptureItem,
} from './capture.schema';

function normalizeCaptureItems(items: readonly CaptureTreeItem[]): CaptureTreeItem[] {
  const mapItem = (item: CaptureTreeItem): CaptureTreeItem => {
    if (isCaptureItem(item)) {
      const session: CaptureItem = {
        ...item,
        traffic: item.traffic ?? [],
        trafficFilter: item.trafficFilter,
      };
      return session;
    }
    return {
      ...item,
      children: item.children.map(mapItem),
    };
  };
  return items.map(mapItem);
}

/**
 * Migrates a capture workspace file to the current schema (v3).
 */
export function migrateCaptureFile(raw: unknown): CaptureFile {
  const v3 = captureFileSchema.safeParse(raw);
  if (v3.success) {
    return captureFileSchema.parse({
      ...v3.data,
      items: normalizeCaptureItems(v3.data.items),
    });
  }

  const v2 = captureFileV2Schema.safeParse(raw);
  if (v2.success) {
    return captureFileSchema.parse({
      schemaVersion: 3,
      active: v2.data.active,
      items: normalizeCaptureItems(v2.data.items),
    });
  }

  const v1 = captureFileV1Schema.safeParse(raw);
  if (!v1.success) {
    return captureFileSchema.parse({ schemaVersion: 3, items: [] });
  }

  const items: CaptureTreeItem[] = v1.data.items.map((item) => ({
    ...item,
    traffic: [],
  }));

  return captureFileSchema.parse({
    schemaVersion: 3,
    active: v1.data.active,
    items,
  });
}
