import { createTwoFilesPatch } from "diff";
import { COMPARE_TIMEOUT_MS } from "./compare";

/**
 * A unified patch of the exact texts (no ignore options, so it applies cleanly). Names get git's a/ and b/
 * prefixes so `git apply` takes it as is. "" when the texts are identical, null when diffing timed out.
 */
export function generatePatch(
  original: string,
  modified: string,
  oldName: string,
  newName: string,
  timeout = COMPARE_TIMEOUT_MS,
): string | null {
  if (original === modified) return "";
  const patch = createTwoFilesPatch(`a/${oldName}`, `b/${newName}`, original, modified, undefined, undefined, { timeout });
  if (patch === undefined) return null;
  // jsdiff starts with a "=====" separator line that git doesn't write.
  return patch.replace(/^=+\n/, "");
}

/** Download name for a patch: the modified file's name with its extension swapped for .patch. */
export function patchFileName(newName: string): string {
  const stem = newName.replace(/\.[^./]*$/, "");
  return `${stem || "changes"}.patch`;
}
