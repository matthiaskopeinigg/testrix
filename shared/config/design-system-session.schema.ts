import { z } from 'zod';

/** Design System pillar ids (dev `/dev` route). */
export const DESIGN_SYSTEM_PILLAR_IDS = [
  'style-guide',
  'brand',
  'components',
  'patterns',
  'ui-kit',
] as const;

export const designSystemPillarSchema = z.enum(DESIGN_SYSTEM_PILLAR_IDS);

export type DesignSystemPillarId = z.infer<typeof designSystemPillarSchema>;

export const workspaceDesignSystemSchema = z.object({
  activePillar: designSystemPillarSchema.default('style-guide'),
  activeSectionId: z.string().min(1).default('sg-typography'),
  expandedPillars: z.array(designSystemPillarSchema).default([...DESIGN_SYSTEM_PILLAR_IDS]),
  debugEnabled: z.boolean().default(false),
});

export type WorkspaceDesignSystemState = z.infer<typeof workspaceDesignSystemSchema>;

/** Default Design System session slice for a new workspace session. */
export function createDefaultWorkspaceDesignSystem(): WorkspaceDesignSystemState {
  return workspaceDesignSystemSchema.parse({});
}
