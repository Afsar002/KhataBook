/**
 * Shared helpers for the global search screen.
 */

/** Default cap for how many rows each entity search returns. */
export const SEARCH_LIMIT = 30;

/**
 * Escapes SQLite LIKE wildcards (`%`, `_`, `\`) so user input matches
 * literally instead of acting as wildcards. Callers pair this with
 * `LIKE ? ESCAPE '\'` in SQL.
 */
export function likeParam(query: string): string {
  return `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}
