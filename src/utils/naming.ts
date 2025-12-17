const VALID_CHARS = /[^a-z0-9-]/g;
const MULTIPLE_HYPHENS = /-+/g;

export function sanitizeName(input: string): string {
  let result = input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(VALID_CHARS, "")
    .replace(MULTIPLE_HYPHENS, "-")
    .replace(/^-+|-+$/g, "");

  if (result.length === 0) {
    throw new Error(
      `Invalid name: "${input}" contains no valid characters for git branches or filesystem paths`
    );
  }

  return result;
}
