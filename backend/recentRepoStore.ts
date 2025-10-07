import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import type { RecentRepository } from "../shared/git.js";

export class RecentRepoStore {
  private readonly dbPath: string;
  private readonly db: Database.Database;

  constructor(storageDir: string) {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    this.dbPath = path.join(storageDir, "recentRepos.db");
    this.db = new Database(this.dbPath);
    this.prepare();
  }

  private prepare() {
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS recent_repos (
          path TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          last_opened INTEGER NOT NULL
        )`
      )
      .run();
  }

  list(limit = 10): RecentRepository[] {
    const stmt = this.db.prepare(
      `SELECT path, name, last_opened as lastOpened
       FROM recent_repos
       ORDER BY last_opened DESC
       LIMIT ?`
    );

    return stmt.all(limit) as RecentRepository[];
  }

  touch(repoPath: string) {
    const name = path.basename(repoPath);
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO recent_repos(path, name, last_opened)
         VALUES(@path, @name, @lastOpened)
         ON CONFLICT(path) DO UPDATE SET
           name = excluded.name,
           last_opened = excluded.last_opened`
      )
      .run({ path: repoPath, name, lastOpened: now });
  }
}
