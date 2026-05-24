import { z } from 'zod';

export const teamGitAuthMethodSchema = z.enum(['none', 'system', 'token']);

export type TeamGitAuthMethod = z.infer<typeof teamGitAuthMethodSchema>;

export const teamGitIdentitySchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
});

export type TeamGitIdentity = z.infer<typeof teamGitIdentitySchema>;

export const teamGitSetupContextSchema = z.object({
  gitAvailable: z.boolean(),
  repoDetected: z.boolean(),
  remoteUrl: z.string().nullable(),
  gitRemoteUrl: z.string().nullable(),
  identity: teamGitIdentitySchema,
  authMethod: teamGitAuthMethodSchema,
  canAccessRemote: z.boolean(),
  hasStoredToken: z.boolean(),
  canAutoEnable: z.boolean(),
  message: z.string().nullable(),
});

export type TeamGitSetupContext = z.infer<typeof teamGitSetupContextSchema>;

export function createDefaultTeamGitSetupContext(
  patch: Partial<TeamGitSetupContext> = {},
): TeamGitSetupContext {
  return {
    gitAvailable: false,
    repoDetected: false,
    remoteUrl: null,
    gitRemoteUrl: null,
    identity: { name: null, email: null },
    authMethod: 'none',
    canAccessRemote: false,
    hasStoredToken: false,
    canAutoEnable: false,
    message: null,
    ...patch,
  };
}
