import type { JwtSigningProfile, JwtToolState } from '@shared/config';
import { createDefaultJwtSigningProfile, jwtSigningProfileSchema } from '@shared/config';

function newProfileId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `jwt-profile-${Date.now()}`;
}

/** Returns the active signing profile, or null when missing. */
export function findActiveJwtProfile(state: JwtToolState): JwtSigningProfile | null {
  const id = state.activeProfileId;
  return state.profiles.find((profile) => profile.id === id) ?? state.profiles[0] ?? null;
}

/** Creates a new profile and selects it. */
export function addJwtProfile(
  state: JwtToolState,
  name = 'New profile',
): JwtToolState {
  const profile = createDefaultJwtSigningProfile(newProfileId(), name);
  return {
    ...state,
    profiles: [...state.profiles, profile],
    activeProfileId: profile.id,
  };
}

/** Duplicates the active profile. */
export function duplicateJwtProfile(state: JwtToolState): JwtToolState {
  const active = findActiveJwtProfile(state);
  if (!active) {
    return addJwtProfile(state);
  }
  const copy = jwtSigningProfileSchema.parse({
    ...active,
    id: newProfileId(),
    name: `${active.name} copy`,
  });
  return {
    ...state,
    profiles: [...state.profiles, copy],
    activeProfileId: copy.id,
  };
}

/** Deletes the active profile (keeps at least one). */
export function deleteActiveJwtProfile(state: JwtToolState): JwtToolState {
  if (state.profiles.length <= 1) {
    return state;
  }
  const remaining = state.profiles.filter((profile) => profile.id !== state.activeProfileId);
  return {
    ...state,
    profiles: remaining,
    activeProfileId: remaining[0]?.id ?? 'default',
  };
}

/** Patches fields on the active profile. */
export function patchActiveJwtProfile(
  state: JwtToolState,
  patch: Partial<Omit<JwtSigningProfile, 'id'>>,
): JwtToolState {
  const activeId = findActiveJwtProfile(state)?.id;
  if (!activeId) {
    return state;
  }
  return {
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === activeId
        ? jwtSigningProfileSchema.parse({ ...profile, ...patch, id: profile.id })
        : profile,
    ),
  };
}
