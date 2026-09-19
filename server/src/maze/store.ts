import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { rebalanceMonsters } from './monster-balance.js';
import { fresh, POINTS_PER_LEVEL } from './progression.js';
import { initialEvents } from './content.js';
import type { EventDefinition, Profile, Ranking } from './types.js';
export class MazeStore {
    private db: DatabaseSync;
    constructor(filename: string) {
        if (filename !== ':memory:')
            mkdirSync(dirname(filename), { recursive: true });
        this.db = new DatabaseSync(filename);
        // Versioned tables preserve all legacy RPG characters without converting their progress.
        this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;
   CREATE TABLE IF NOT EXISTS maze_profiles_v1 (key TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS maze_events_v1 (id TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS maze_event_drafts_v1 (id TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS maze_metadata_v1 (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS maze_ranks_v1 (sequence INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, nickname TEXT NOT NULL, finishedAt INTEGER NOT NULL, elapsed INTEGER NOT NULL);`);
        if (!(this.db.prepare('SELECT id FROM maze_events_v1 LIMIT 1').get())) {
            this.db.exec('BEGIN IMMEDIATE');
            try {
                for (const e of initialEvents().values())
                    this.putEvent(e);
                this.db.exec('COMMIT');
            }
            catch (e) {
                this.db.exec('ROLLBACK');
                throw e;
            }
        }
        // One-time migration: preserve existing customized live events as the draft.
        // The marker and copy commit together, including when the process restarts.
        this.db.exec('BEGIN IMMEDIATE');
        try {
            if (!this.db.prepare("SELECT value FROM maze_metadata_v1 WHERE key='draft_initialized'").get()) {
                this.db.exec('DELETE FROM maze_event_drafts_v1; INSERT INTO maze_event_drafts_v1 SELECT * FROM maze_events_v1;');
                this.db.prepare("INSERT INTO maze_metadata_v1 VALUES ('draft_initialized','1')").run();
            }
            // Update the draft exactly once. Customized prompts, answers, positions and XP survive.
            // Publishing remains exclusively tied to the operator's reset action.
            if (!this.db.prepare("SELECT value FROM maze_metadata_v1 WHERE key='skill_balance_v2'").get()) {
                const draft = rebalanceMonsters(this.drafts());
                for (const event of draft.values()) if (event.kind === 'monster') {
                    event.revision++;
                    this.putDraft(event);
                }
                this.db.prepare("INSERT INTO maze_metadata_v1 VALUES ('skill_balance_v2','1')").run();
            }
            // One transaction and one marker prevent duplicate compensation on restart.
            if (!this.db.prepare("SELECT value FROM maze_metadata_v1 WHERE key='growth_balance_v3'").get()) {
                for (const row of this.db.prepare('SELECT data FROM maze_profiles_v1').all()) {
                    const p = JSON.parse(String(row.data)) as Profile;
                    p.points += Math.max(0, p.level - 1) * (POINTS_PER_LEVEL - 1);
                    const oldHp = p.stats.hp;
                    for (const stat of p.allocations) {
                        const delta = stat === 'hp' ? 15 : stat === 'attack' ? 5 : stat === 'defense' ? 2 : 0;
                        if (delta) p.stats[stat] = Math.min(stat === 'hp' ? 999 : 499, p.stats[stat] + delta);
                    }
                    p.hp = Math.min(p.stats.hp, p.hp + p.stats.hp - oldHp);
                    this.write(p);
                }
                for (const event of rebalanceMonsters(this.drafts()).values()) if (event.kind === 'monster') {
                    event.revision++;
                    this.putDraft(event);
                }
                this.db.prepare("INSERT INTO maze_metadata_v1 VALUES ('growth_balance_v3','1')").run();
            }
            this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
    load(key: string, nickname: string): Profile {
        const row = this.db.prepare('SELECT data FROM maze_profiles_v1 WHERE key=?').get(key);
        if (row)
            return JSON.parse(row.data as string) as Profile;
        const profile = fresh(key, nickname);
        this.save([profile]);
        return profile;
    }
    findProfile(key: string): Profile | undefined {
        const row = this.db.prepare('SELECT data FROM maze_profiles_v1 WHERE key=?').get(key);
        return row ? JSON.parse(String(row.data)) as Profile : undefined;
    }
    resetAll(): { profiles: Map<string, Profile>; events: Map<string, EventDefinition> } {
        const now = Date.now();
        const reset = new Map<string, Profile>();
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const events = this.drafts();
            if (!events.get('19,19')?.boss || events.get('19,19')?.kind !== 'monster') throw new Error('수정안에 출구 보스가 필요합니다.');
            // Publish the complete saved draft and reset every account atomically.
            this.db.exec('DELETE FROM maze_events_v1; INSERT INTO maze_events_v1 SELECT * FROM maze_event_drafts_v1;');
            for (const row of this.db.prepare('SELECT data FROM maze_profiles_v1').all()) {
                const old = JSON.parse(String(row.data)) as Profile;
                const next = fresh(old.key, old.nickname);
                next.startedAt = now;
                next.savedAt = now;
                this.write(next);
                reset.set(next.key, next);
            }
            this.db.exec('DELETE FROM maze_ranks_v1');
            this.db.exec('COMMIT');
            return { profiles: reset, events };
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    drafts(): Map<string, EventDefinition> {
        return new Map(this.db.prepare('SELECT id,data FROM maze_event_drafts_v1').all().map(row => [String(row.id), JSON.parse(String(row.data))]));
    }
    putDraft(e: EventDefinition) {
        this.db.prepare('INSERT INTO maze_event_drafts_v1 VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(e.id, JSON.stringify(e));
    }
    deleteDraft(id: string) {
        this.db.prepare('DELETE FROM maze_event_drafts_v1 WHERE id=?').run(id);
    }
    close() { this.db.close(); }
    private write(p: Profile) { this.db.prepare('INSERT INTO maze_profiles_v1 VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(p.key, JSON.stringify(p)); }
    save(profiles: Profile[]) {
        const now = Date.now();
        this.db.exec('BEGIN IMMEDIATE');
        try {
            for (const p of profiles)
                this.write({ ...p, savedAt: now });
            this.db.exec('COMMIT');
            for (const p of profiles)
                p.savedAt = now;
        }
        catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }
    events(): Map<string, EventDefinition> { return new Map(this.db.prepare('SELECT id,data FROM maze_events_v1').all().map(row => [String(row.id), JSON.parse(String(row.data))])); }
    putEvent(e: EventDefinition) { this.db.prepare('INSERT INTO maze_events_v1 VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(e.id, JSON.stringify(e)); }
    finish(p: Profile) {
        if (p.finishedAt !== null)
            return;
        const now = Date.now(), next = { ...p, finishedAt: now, savedAt: now };
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.prepare('INSERT INTO maze_ranks_v1(key,nickname,finishedAt,elapsed) VALUES (?,?,?,?)').run(p.key, p.nickname, now, Math.floor((now - p.startedAt) / 1000));
            this.write(next);
            this.db.exec('COMMIT');
            Object.assign(p, next);
        }
        catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }
    rankings(): Ranking[] { return this.db.prepare('SELECT key,nickname,finishedAt,elapsed FROM maze_ranks_v1 ORDER BY sequence').all().map((r, i) => ({ ...r, rank: i + 1 }) as Ranking); }
    deleteRank(key: string) { this.db.prepare('DELETE FROM maze_ranks_v1 WHERE key=?').run(key); }
}
