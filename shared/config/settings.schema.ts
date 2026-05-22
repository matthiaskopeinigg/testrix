import { z } from 'zod';

import { ANIMATION_SPEED_IDS } from './animation-speed';
import { COLLECTION_FOLDER_CLICK_BEHAVIOR_IDS } from './collection-folder-click-behavior';
import { COLLECTION_SIBLING_SORT_IDS } from './collection-sibling-sort';
import { LOG_LEVEL_IDS } from './log-level';
import { APPEARANCE_THEME_IDS } from '../theme/theme-catalog';
import { UI_FONT_IDS } from '../theme/ui-font-catalog';
import {
  UI_FONT_SIZE_IDS,
  UI_FONT_WEIGHT_IDS,
  UI_LINE_HEIGHT_IDS,
} from '../theme/ui-typography-catalog';
import { editorKeyboardSettingsSchema, editorSettingsSchema } from './editor-settings.schema';
import { httpSettingsPatchSchema, httpSettingsSchema } from './http-settings.schema';
import { httpMethodDisplaySchema } from './http-method-display';
import { workspaceEditorLayoutSchema } from './workspace-editor-layout.schema';

const metaSettingsSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
});

const generalSchema = z.object({
  configFolderPath: z.string().nullable(),
  language: z.string(),
  openLastProjectOnStartup: z.boolean(),
});

const appearanceSchema = z.object({
  theme: z.enum(APPEARANCE_THEME_IDS),
  density: z.enum(['comfortable', 'compact']),
  /** Interface typeface for the whole app (body + headings). */
  uiFont: z.enum(UI_FONT_IDS),
  uiFontSize: z.enum(UI_FONT_SIZE_IDS),
  uiFontWeight: z.enum(UI_FONT_WEIGHT_IDS),
  uiLineHeight: z.enum(UI_LINE_HEIGHT_IDS),
});

const privacySchema = z.object({
  telemetryEnabled: z.boolean(),
});

const updatesSchema = z.object({
  checkOnStartup: z.boolean(),
  channel: z.enum(['stable', 'beta']),
  ignoredOfferVersion: z.string().nullable(),
});

const uiSchema = z.object({
  closeSidebarPanelOnOutsideClick: z.boolean(),
  /** Global motion speed (`html[data-animation-speed]`). `none` disables transitions and animations. */
  animationSpeed: z.enum(ANIMATION_SPEED_IDS),
  /** When false, sets `html[data-tooltips="disabled"]` for `txTooltip` hosts. */
  showIconTooltips: z.boolean(),
  /** When false, sets `html[data-chrome-blur="disabled"]` (titlebar frosted glass). */
  useTranslucentChrome: z.boolean(),
  /** When true, reopen the last sidebar panel on launch (reserved for future shell restore). */
  restoreLastSidebarPanel: z.boolean(),
});

const loggingSchema = z.object({
  enabled: z.boolean(),
  level: z.enum(LOG_LEVEL_IDS),
  writeToFile: z.boolean(),
  writeToConsole: z.boolean(),
  includeTimestamps: z.boolean(),
  redactSecrets: z.boolean(),
  logIpcInDev: z.boolean(),
  maxFileSizeMb: z.number().int().min(1).max(50),
  retainedFiles: z.number().int().min(1).max(10),
});

const dataConfigSchema = z.object({
  validateOnStartup: z.boolean(),
  prettyPrintJson: z.boolean(),
  backupBeforeWrite: z.boolean(),
  autoReloadOnExternalChange: z.boolean(),
});

const treeSidebarSettingsSchema = z.object({
  expandFolderOnDrag: z.boolean(),
  animateMove: z.boolean(),
  animateExpand: z.boolean(),
  siblingSort: z.enum(COLLECTION_SIBLING_SORT_IDS),
  foldersFirst: z.boolean(),
  /** When true, folder and variable descriptions appear as subtitles in the sidebar tree. */
  showDescriptions: z.boolean(),
});

const collectionsTreeDisplaySchema = treeSidebarSettingsSchema.extend({
  /** When true, folder and request tags appear in the collections sidebar tree. */
  showTags: z.boolean(),
});

export type TreeSidebarSettings = z.infer<typeof treeSidebarSettingsSchema>;

const collectionsSettingsSchema = collectionsTreeDisplaySchema.extend({
  folderClickBehavior: z.enum(COLLECTION_FOLDER_CLICK_BEHAVIOR_IDS),
  /** Folder and request tab section navigation (sidebar list vs titlebar tabs). */
  editorLayout: workspaceEditorLayoutSchema,
  /** Where HTTP verbs are shown (collections tree rows and/or workspace tabs). */
  displayHttpMethod: httpMethodDisplaySchema,
});

const environmentsSettingsSchema = treeSidebarSettingsSchema;

const testSuiteTreeDisplaySchema = treeSidebarSettingsSchema.extend({
  /** When true, folder and flow tags appear in the test suite sidebar tree. */
  showTags: z.boolean(),
});

export type TestSuiteSettings = z.infer<typeof testSuiteTreeDisplaySchema>;

export const settingsFileSchema = z.object({
  schemaVersion: z.literal(1),
  meta: metaSettingsSchema,
  general: generalSchema,
  appearance: appearanceSchema,
  privacy: privacySchema,
  updates: updatesSchema,
  ui: uiSchema,
  logging: loggingSchema,
  dataConfig: dataConfigSchema,
  collections: collectionsSettingsSchema,
  environments: environmentsSettingsSchema,
  testSuite: testSuiteTreeDisplaySchema,
  editor: editorSettingsSchema,
  http: httpSettingsSchema,
});

export type SettingsFile = z.infer<typeof settingsFileSchema>;

export const settingsPatchSchema = z
  .object({
    general: generalSchema.partial().optional(),
    appearance: appearanceSchema.partial().optional(),
    privacy: privacySchema.partial().optional(),
    updates: updatesSchema.partial().optional(),
    ui: uiSchema.partial().optional(),
    logging: loggingSchema.partial().optional(),
    dataConfig: dataConfigSchema.partial().optional(),
    collections: collectionsSettingsSchema.partial().optional(),
    environments: environmentsSettingsSchema.partial().optional(),
    testSuite: testSuiteTreeDisplaySchema.partial().optional(),
    editor: z
      .object({
        keyboard: editorKeyboardSettingsSchema.partial().optional(),
      })
      .partial()
      .optional(),
    http: httpSettingsPatchSchema.optional(),
  })
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
