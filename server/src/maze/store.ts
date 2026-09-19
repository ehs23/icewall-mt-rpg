import { GRID, LEGACY_GRID } from './maze.js';
import { validateLayout, type Layout } from './layout.js';
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
        const existingWorld = !!this.db.prepare('SELECT id FROM maze_events_v1 LIMIT 1').get();
        // Freeze the old live geometry before changing the shipped preset.
        for (const key of ['live_grid_v1', 'draft_grid_v1'])
            this.db.prepare('INSERT OR IGNORE INTO maze_metadata_v1 VALUES (?,?)').run(key, JSON.stringify(existingWorld ? LEGACY_GRID : GRID));
        if (!existingWorld) {
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
            if (!this.db.prepare("SELECT value FROM maze_metadata_v1 WHERE key='maze_expansion_v4'").get()) {
                const defaults = initialEvents();
                const draft = this.drafts();
                for (const e of defaults.values()) if (e.kind === 'monster' && !draft.has(e.id)) draft.set(e.id, e);
                for (const e of draft.values()) {
                    const preset = defaults.get(e.id);
                    if (e.kind === 'monster' && preset?.kind === 'monster') e.xp = preset.xp;
                    else if (e.kind !== 'monster' && e.xp === 120) e.xp = 100;
                }
                for (const e of rebalanceMonsters(draft).values()) { e.revision++; this.putDraft(e); }
                this.db.prepare("INSERT INTO maze_metadata_v1 VALUES ('maze_expansion_v4','1')").run();
            }
            if (!this.db.prepare("SELECT value FROM maze_metadata_v1 WHERE key='maze_redesign_v5'").get()) {
                const previous = { grid: this.grid(true), events: [...this.drafts().values()], defaultLayout: this.db.prepare("SELECT value FROM maze_metadata_v1 WHERE key='default_layout_v1'").get()?.value };
                this.db.prepare("INSERT OR IGNORE INTO maze_metadata_v1 VALUES ('before_redesign_v5',?)").run(JSON.stringify(previous));
                const events = initialEvents();
                validateLayout({ grid: GRID, events }, true);
                this.db.exec('DELETE FROM maze_event_drafts_v1');
                for (const event of events.values()) this.putDraft(event);
                for (const [key, value] of [
                    ['draft_grid_v1', JSON.stringify(GRID)],
                    ['default_layout_v1', JSON.stringify({ grid: GRID, events: [...events.values()] })],
                    ['maze_redesign_v5', '1'],
                ]) this.db.prepare('INSERT INTO maze_metadata_v1 VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
            }
            this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
        // Capture the existing saved layout once, including the operator's own content.
        this.db.prepare("INSERT OR IGNORE INTO maze_metadata_v1 VALUES ('default_layout_v1',?)").run(JSON.stringify({ grid: this.grid(true), events: [...this.drafts().values()] }));
    }
    defaultLayout(): Layout {
        const row = this.db.prepare("SELECT value FROM maze_metadata_v1 WHERE key='default_layout_v1'").get()!;
        const value = JSON.parse(String(row.value)) as { grid: string[]; events: EventDefinition[] };
        return { grid: value.grid, events: new Map(value.events.map(e => [e.id, e])) };
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
            const grid = this.grid(true);
            validateLayout({ grid, events }, true);
            this.db.prepare("INSERT INTO maze_metadata_v1 VALUES ('live_grid_v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(grid));
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
    grid(draft = false): string[] {
        const row = this.db.prepare('SELECT value FROM maze_metadata_v1 WHERE key=?').get(draft ? 'draft_grid_v1' : 'live_grid_v1');
        return row ? JSON.parse(String(row.value)) : [...GRID];
    }
    saveLayout(layout: Layout) {
        validateLayout(layout);
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.prepare("INSERT INTO maze_metadata_v1 VALUES ('draft_grid_v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(layout.grid));
            this.db.exec('DELETE FROM maze_event_drafts_v1');
            for (const event of layout.events.values()) this.putDraft(event);
            this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
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
