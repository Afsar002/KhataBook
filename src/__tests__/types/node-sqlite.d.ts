/**
 * Minimal ambient types for Node's built-in `node:sqlite` (Node ≥22.5),
 * used only by the search-index integration test. @types/node is deliberately
 * not installed so RN/Expo typings stay the single source of truth.
 */
declare module 'node:sqlite' {
  export interface StatementSync {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
