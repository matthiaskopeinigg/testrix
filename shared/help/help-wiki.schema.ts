import { z } from 'zod';

const boundedText = (max: number) => z.string().max(max);

export const helpWikiBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('paragraph'),
    text: boundedText(8_000),
  }),
  z.object({
    type: z.literal('subheading'),
    text: boundedText(256),
  }),
  z.object({
    type: z.literal('list'),
    items: z.array(boundedText(1_024)).min(1).max(32),
  }),
  z.object({
    type: z.literal('tip'),
    title: boundedText(128).optional(),
    text: boundedText(4_000),
  }),
  z.object({
    type: z.literal('note'),
    title: boundedText(128).optional(),
    text: boundedText(4_000),
  }),
]);

export type HelpWikiBlock = z.infer<typeof helpWikiBlockSchema>;

export const helpWikiSectionSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  label: boundedText(128),
  icon: boundedText(64),
  title: boundedText(256),
  description: boundedText(512),
  blocks: z.array(helpWikiBlockSchema).min(1).max(48),
});

export type HelpWikiSection = z.infer<typeof helpWikiSectionSchema>;

export const helpWikiGroupSchema = z.object({
  id: z.string().min(1),
  label: boundedText(64),
  order: z.number().int().min(0),
});

export type HelpWikiGroup = z.infer<typeof helpWikiGroupSchema>;

export const helpWikiCatalogSchema = z.object({
  groups: z.array(helpWikiGroupSchema).min(1),
  sections: z.array(helpWikiSectionSchema).min(1),
});

export type HelpWikiCatalog = z.infer<typeof helpWikiCatalogSchema>;
