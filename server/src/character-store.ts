import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export type CharacterRecord = {
  id: string;
  nicknameKey: string;
  nickname: string;
  stage: string;
  x: number;
  y: number;
  level: number;
  experience: number;
  job: string;
  createdAt: number;
  updatedAt: number;
};

export class CharacterStore {
  private db: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        nicknameKey TEXT UNIQUE NOT NULL,
        nickname TEXT NOT NULL,
        stage TEXT NOT NULL DEFAULT 'plaza',
        x REAL NOT NULL DEFAULT 400,
        y REAL NOT NULL DEFAULT 300,
        level INTEGER NOT NULL DEFAULT 1,
        experience INTEGER NOT NULL DEFAULT 0,
        job TEXT NOT NULL DEFAULT '무직',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      ) STRICT;
    `);
  }

  getOrCreate(nicknameKey: string, nickname: string): CharacterRecord {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO characters (id, nicknameKey, nickname, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(nicknameKey) DO NOTHING
    `).run(randomUUID(), nicknameKey, nickname, now, now);
    const row = this.db.prepare("SELECT * FROM characters WHERE nicknameKey = ?")
      .get(nicknameKey);
    if (!row) throw new Error("캐릭터를 불러오지 못했어.");
    return row as unknown as CharacterRecord;
  }

  saveMany(records: CharacterRecord[]): number {
    const now = Date.now();
    const statement = this.db.prepare(`
      UPDATE characters SET stage = ?, x = ?, y = ?, level = ?,
      experience = ?, job = ?, updatedAt = ? WHERE id = ?
    `);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const record of records) {
        const result = statement.run(record.stage, record.x, record.y, record.level,
          record.experience, record.job, now, record.id);
        if (Number(result.changes) !== 1) throw new Error("저장할 캐릭터를 찾지 못했어.");
      }
      this.db.exec("COMMIT");
      return now;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() { this.db.close(); }
}
