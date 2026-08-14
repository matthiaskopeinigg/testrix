/** Top-level Design System pillars shown in the `/dev` page nav. */
export type DesignSystemPillar =
  | 'style-guide'
  | 'brand'
  | 'components'
  | 'patterns'
  | 'ui-kit';

export type DesignSystemSectionId = string;

/** Persisted Design System navigation (`SessionFile.workspace.designSystem`). */
export interface DesignSystemViewState {
  readonly activePillar: DesignSystemPillar;
  readonly activeSectionId: DesignSystemSectionId;
  readonly expandedPillars: readonly DesignSystemPillar[];
  readonly debugEnabled: boolean;
}

export interface DesignSystemNavGroup {
  readonly pillar: DesignSystemPillar;
  readonly label: string;
  readonly sections: readonly DesignSystemNavSection[];
}

export interface DesignSystemNavSection {
  readonly id: DesignSystemSectionId;
  readonly label: string;
  readonly description: string;
}

export interface DesignTokenEntry {
  readonly name: string;
  readonly cssVar: string;
  readonly category: 'color' | 'spacing' | 'radius' | 'layout' | 'motion' | 'typography';
  readonly description?: string;
}

export interface DesignSystemComponentEntry {
  readonly id: string;
  readonly label: string;
  readonly selector: string;
  readonly importPath: string;
  readonly description: string;
  readonly supportsDebug: boolean;
  readonly kind?: 'component' | 'utility';
}

export interface DesignSystemPatternEntry {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly scssPartial?: string;
  readonly relatedComponentIds: readonly string[];
}
