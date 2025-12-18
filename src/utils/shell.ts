/**
 * Escape a string for safe use in shell commands.
 * Uses single quotes with proper escaping of embedded single quotes.
 */
export function shellEscape(str: string): string {
  // Single-quote the string and escape any embedded single quotes
  // 'don'\''t' becomes a valid shell string for "don't"
  return "'" + str.replace(/'/g, "'\\''") + "'";
}
