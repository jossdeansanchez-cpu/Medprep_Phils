// Shared constants and types for personal exam presets.
//
// Kept out of src/app/exams/presets/actions.ts on purpose: that file is
// "use server", and such a module may only export async functions — a plain
// const or type there makes the whole module unimportable from the client.

/** Bounds mirror the CHECK constraint and the RPC guards in migration 0035. */
export const PRESET_MIN_QUESTIONS = 5;
export const PRESET_MAX_QUESTIONS = 100;
export const PRESET_MAX_PER_STUDENT = 20;

/** Result of a preset create/update, as consumed by useActionState. */
export type PresetFormState = { error?: string; ok?: boolean };
