import { collectionsFileSchema } from '../config/collections.schema';
import { environmentsFileSchema } from '../config/environments.schema';
import { workspaceExportEnvelopeSchema } from '../collaboration/workspace-export.schema';
import { createEmptyTestrixBundle, type TestrixBundleV1 } from './testrix-bundle.schema';

/**
 * Maps legacy `workspace-export.schema` envelopes into a native Testrix bundle.
 */
export function parseLegacyEnvelope(parsed: unknown, appVersion = ''): TestrixBundleV1 | null {
  const envelopeResult = workspaceExportEnvelopeSchema.safeParse(parsed);
  if (!envelopeResult.success) {
    return null;
  }
  const envelope = envelopeResult.data;
  const bundle = createEmptyTestrixBundle(appVersion);
  bundle.exportedAt = envelope.exportedAt;

  switch (envelope.kind) {
    case 'collections': {
      const collections = collectionsFileSchema.safeParse(envelope.payload);
      if (collections.success) {
        bundle.collections = collections.data;
      }
      break;
    }
    case 'environments': {
      const environments = environmentsFileSchema.safeParse(envelope.payload);
      if (environments.success) {
        bundle.environments = environments.data;
      }
      break;
    }
    case 'collection-subtree': {
      const nodes = envelope.payload;
      if (Array.isArray(nodes)) {
        const now = new Date().toISOString();
        const collections = collectionsFileSchema.safeParse({
          schemaVersion: 1,
          meta: { createdAt: now, updatedAt: now },
          nodes,
        });
        if (collections.success) {
          bundle.collections = collections.data;
        }
      }
      break;
    }
    default:
      return null;
  }

  const hasData =
    bundle.collections != null ||
    bundle.environments != null;
  return hasData ? bundle : null;
}
