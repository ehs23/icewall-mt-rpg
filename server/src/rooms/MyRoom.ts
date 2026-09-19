import { saveDefaultPreset } from '../maze/default-preset.js';
import { Room, type Client } from 'colyseus';
import { fileURLToPath } from 'node:url';
import { editLayout } from '../maze/layout.js';
import { MazeStore } from '../maze/store.js';
import { MAX_PLAYERS, tileKey, walkable, visibleTiles } from '../maze/maze.js';
import { authenticate, parseDefinition, parseStats } from '../maze/admin.js';
import { enforceStatCaps, overrideProfession, chooseProfession, isStat, respec, skillLevel, spend } from '../maze/progression.js';
import { leaveQuiz, answerQuiz, completeEvent, enterEvent, publicEvent } from '../maze/events.js';
import { battleTurn } from '../maze/battle.js';
import type { Command, Profile, Snapshot } from '../maze/types.js';
const store = new MazeStore(process.env.CHARACTER_DB_PATH || fileURLToPath(new URL('../../data/characters.sqlite', import.meta.url)));
let activeWorld: MyRoom | undefined;
type Session = {
    profile: Profile;
    admin: boolean;
    revision: number;
    lastId: number;
    nextActionAt: number;
    ready: boolean;
    customMode: boolean;
};
export class MyRoom extends Room {
    maxClients = MAX_PLAYERS;
    maxMessagesPerSecond = 40;
    private sessions = new Map<string, Session>();
    private definitions = store.events();
    private draftDefinitions = store.drafts();
    private ranks = store.rankings();
    private grid = store.grid();
    private draftGrid = store.grid(true);
    onCreate() {
        if (activeWorld)
            throw new Error('서버 정원이 가득 찼습니다. 잠시 후 다시 접속해 주세요.');
        activeWorld = this;
        this.autoDispose = false;
        this.onMessage('ready', client => {
            const s = this.sessions.get(client.sessionId);
            if (!s || s.ready)
                return;
            s.ready = true;
            this.sendOwn(client, s);
            if (s.admin) {
                client.send('rankings', this.ranks);
                for (const other of this.sessions.values())
                    if (!other.admin)
                        client.send('monitor', { key: other.profile.key, snapshot: this.snapshot(other) });
            }
        });
        this.onMessage('command', (client, data: unknown) => this.command(client, data));
        this.clock.setInterval(() => {
            try {
                store.save([...this.sessions.values()].map(s => s.profile));
                for (const client of this.clients) {
                    const s = this.sessions.get(client.sessionId);
                    if (s?.ready)
                        client.send('saved', s.profile.savedAt);
                }
            }
            catch (e) {
                console.error('Maze autosave failed', e);
                for (const c of this.clients)
                    c.send('notice', '자동저장에 실패했습니다. 연결을 유지하고 운영자에게 알려 주세요.');
            }
        }, 30000);
    }
    onAuth(_client: Client, options: {
        nickname?: unknown;
        password?: unknown;
    } = {}, context?: {
        ip?: string;
    }) {
        const identity = authenticate(options.nickname, options.password, context?.ip || 'local');
        if ([...this.sessions.values()].some(s => s.profile.key === identity.key))
            throw new Error('같은 닉네임이 이미 접속 중입니다. 기존 화면에서 나가 주세요.');
        if (!identity.admin && [...this.sessions.values()].filter(s => !s.admin).length >= 19)
            throw new Error('플레이어 19명이 접속 중입니다. 운영자용 한 자리는 별도로 예약되어 있습니다.');
        return identity;
    }
    onJoin(client: Client) {
        const auth = client.auth as {
            key: string;
            nickname: string;
            admin: boolean;
        };
        if ([...this.sessions.values()].some(s => s.profile.key === auth.key))
            throw new Error('이미 접속 중인 닉네임입니다.');
        if (!auth.admin && [...this.sessions.values()].filter(s => !s.admin).length >= 19)
            throw new Error('플레이어 정원이 가득 찼습니다.');
        const s: Session = { profile: store.load(auth.key, auth.nickname), admin: auth.admin, revision: 0, lastId: 0, nextActionAt: 0, ready: false, customMode: false };
        enforceStatCaps(s.profile);
        store.save([s.profile]);
        this.sessions.set(client.sessionId, s);
        this.monitor(s);
    }
    private snapshot(s: Session): Snapshot {
        const p = s.profile;
        return { mazeSize: this.grid.length, revision: s.revision, admin: s.admin, customMode: s.admin && s.customMode, nickname: p.nickname, x: p.x, y: p.y, level: p.level, xp: p.xp, stats: { ...p.stats }, hp: p.hp, points: p.points, profession: p.profession, advanced: p.advanced, skillLevel: skillLevel(p), tiles: visibleTiles(p, this.definitions, s.admin, this.grid), visited: [...p.visited], active: publicEvent(p), savedAt: p.savedAt, finishedAt: p.finishedAt, rank: this.ranks.find(r => r.key === p.key)?.rank ?? null };
    }
    private sendOwn(client: Client, s: Session) { client.send('snapshot', this.snapshot(s)); }
    private forAdmin(type: string, data: unknown) {
        for (const client of this.clients) {
            const s = this.sessions.get(client.sessionId);
            if (s?.admin && s.ready)
                client.send(type, data);
        }
    }
    private monitor(s: Session) {
        if (!s.admin)
            this.forAdmin('monitor', { key: s.profile.key, snapshot: { ...this.snapshot(s), visited: [] } });
    }
    private refreshRanks() {
        this.ranks = store.rankings();
        this.forAdmin('rankings', this.ranks);
        for (const c of this.clients) {
            const s = this.sessions.get(c.sessionId);
            if (s?.ready)
                this.sendOwn(c, s);
        }
    }
    private command(client: Client, value: unknown) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !s.ready)
            return;
        if (!value || typeof value !== 'object')
            return;
        const cmd = value as Command;
        if (!Number.isSafeInteger(cmd.id) || cmd.id <= 0 || typeof cmd.action !== 'string')
            return;
        if (cmd.id <= s.lastId) {
            client.send('ack', { id: cmd.id });
            return;
        }
        s.lastId = cmd.id;
        const before = structuredClone(s.profile);
        let logout = false, changed = false;
        try {
            if (cmd.revision !== s.revision)
                throw new Error('화면을 갱신했습니다. 다시 선택해 주세요.');
            const data = cmd.data && typeof cmd.data === 'object' ? cmd.data : {};
            const now = Date.now();
            if (now < s.nextActionAt && cmd.action !== 'sync' && cmd.action !== 'logout')
                throw new Error('처리 중입니다. 잠시 후 다시 선택해 주세요.');
            s.nextActionAt = now + (cmd.action === 'answer' ? 800 : cmd.action === 'battle' ? 450 : 180);
            const p = s.profile;
            switch (cmd.action) {
                case 'sync': break;
                case 'move': {
                    if (s.customMode)
                        throw new Error('커스텀 모드에서는 칸을 선택하여 편집해 주세요.');
                    if (p.active)
                        throw new Error('진행 중인 문제나 전투를 먼저 완료해 주세요.');
                    const { x, y } = data;
                    if (typeof x !== 'number' || typeof y !== 'number' || Math.abs(x - p.x) + Math.abs(y - p.y) !== 1 || !walkable(x, y, this.grid))
                        throw new Error('상하좌우의 인접한 통로를 선택해 주세요.');
                    const from: [
                        number,
                        number
                    ] = [p.x, p.y];
                    p.x = x;
                    p.y = y;
                    const key = tileKey(x, y);
                    if (!p.visited.includes(key))
                        p.visited.push(key);
                    enterEvent(p, this.definitions.get(key), from);
                    changed = true;
                    break;
                }
                case 'quiz.leave':
                    leaveQuiz(p);
                    changed = true;
                    break;
                case 'answer':
                    if (!answerQuiz(p, data.answer)) client.send('notice', '정답이 아닙니다. 30초 후 다시 도전해 주세요.');
                    changed = true;
                    break;
                case 'battle': {
                    const result = battleTurn(p, data.action, data.stat);
                    changed = true;
                    if (result === 'win') {
                        const finalHit = p.active!.battle!.log.join(' ');
                        const boss = completeEvent(p);
                        if (boss && !s.admin && !p.finishedAt) {
                            store.finish(p);
                            this.refreshRanks();
                            client.send('finish', { rank: this.ranks.find(r => r.key === p.key)?.rank });
                        }
                        client.send('notice', `${boss ? '수호자를 물리치셨습니다.' : '전투에서 승리하셨습니다.'} ${finalHit}`);
                    }
                    else if (result === 'lose') {
                        const from = p.active!.from;
                        p.x = from[0];
                        p.y = from[1];
                        p.active = null;
                        p.hp = p.stats.hp;
                        client.send('notice', '전투에서 패배하여 직전 칸으로 돌아왔습니다. 능력치를 재분배하거나 다른 길에서 성장한 후 다시 도전해 주세요.');
                    }
                    break;
                }
                case 'stat':
                    if (p.active?.battle)
                        throw new Error('전투 중에는 능력치를 변경하실 수 없습니다.');
                    if (!isStat(data.stat))
                        throw new Error('능력치를 선택해 주세요.');
                    spend(p, data.stat);
                    changed = true;
                    break;
                case 'respec':
                    if (p.active?.battle)
                        throw new Error('전투 중에는 재분배하실 수 없습니다.');
                    respec(p);
                    changed = true;
                    break;
                case 'profession':
                    if (p.active?.battle)
                        throw new Error('전투 중에는 전직하실 수 없습니다.');
                    chooseProfession(p, data.profession);
                    changed = true;
                    break;
                case 'advance':
                    if (p.active?.battle || p.level < 25 || !p.profession || p.advanced)
                        throw new Error('2차 전직 조건을 확인해 주세요.');
                    p.advanced = true;
                    changed = true;
                    break;
                case 'logout':
                    store.save([p]);
                    logout = true;
                    break;
                case 'admin.warp': {
                    this.requireAdmin(s);
                    const { x, y } = data;
                    if (typeof x !== 'number' || typeof y !== 'number' || !walkable(x, y, this.grid)) throw new Error('이동할 통로 칸을 선택해 주세요.');
                    if (p.active) throw new Error('진행 중인 이벤트를 완료하거나 건너뛴 뒤 워프해 주세요.');
                    const from: [number, number] = [p.x, p.y];
                    p.x = x; p.y = y;
                    const key = tileKey(x, y);
                    if (!p.visited.includes(key)) p.visited.push(key);
                    s.customMode = false;
                    enterEvent(p, this.definitions.get(key), from);
                    changed = true;
                    break;
                }
                case 'admin.custom': {
                    this.requireAdmin(s);
                    if (typeof data.enabled !== 'boolean')
                        throw new Error('모드 설정을 확인해 주세요.');
                    s.customMode = data.enabled;
                    s.revision++;
                    this.sendCustomMap(client, s);
                    break;
                }
                case 'admin.reset': {
                    this.requireAdmin(s);
                    if (data.confirm !== 'RESET_ALL')
                        throw new Error('전체 초기화를 확인해 주세요.');
                    const reset = store.resetAll();
                    this.definitions = reset.events;
                    this.grid = store.grid();
                    this.draftGrid = store.grid(true);
                    this.draftDefinitions = new Map([...reset.events].map(([id, event]) => [id, structuredClone(event)]));
                    for (const other of this.sessions.values()) {
                        other.profile = reset.profiles.get(other.profile.key)!;
                        other.revision++;
                        other.nextActionAt = 0;
                    }
                    this.ranks = [];
                    for (const c of this.clients) {
                        const other = this.sessions.get(c.sessionId);
                        if (!other?.ready)
                            continue;
                        c.send('reset', {});
                        this.sendOwn(c, other);
                        this.monitor(other);
                        c.send('notice', '운영자가 저장된 수정안을 적용하고 모든 계정의 진행과 순위를 초기화했습니다.');
                    }
                    this.forAdmin('rankings', this.ranks);
                    break;
                }
                case 'admin.profession': {
                    this.requireAdmin(s);
                    const key = typeof data.nickname === 'string' && data.nickname.trim()
                        ? data.nickname.normalize('NFC').trim().toLowerCase() : p.key;
                    const target = [...this.sessions.values()].find(other => other.profile.key === key);
                    const profile = target?.profile ?? store.findProfile(key);
                    if (!profile)
                        throw new Error('저장된 닉네임을 찾을 수 없습니다.');
                    if (target === s) {
                        overrideProfession(p, data.profession);
                        changed = true;
                    }
                    else {
                        const next = structuredClone(profile);
                        overrideProfession(next, data.profession);
                        store.save([next]);
                        if (target) {
                            target.profile = next;
                            target.revision++;
                            for (const c of this.clients)
                                if (this.sessions.get(c.sessionId) === target)
                                    this.sendOwn(c, target);
                            this.monitor(target);
                        }
                    }
                    client.send('notice', '직업을 변경했습니다. 필요한 전직 레벨보다 낮으면 레벨도 함께 올렸습니다.');
                    break;
                }
                case 'admin.setDefault': {
                    this.requireAdmin(s);
                    if (!s.customMode || data.confirm !== 'SET_DEFAULT') throw new Error('커스텀 모드에서 기본값 저장을 확인해 주세요.');
                    saveDefaultPreset(process.env.CHARACTER_DB_PATH || fileURLToPath(new URL('../../data/characters.sqlite', import.meta.url)), { grid: this.draftGrid, events: this.draftDefinitions });
                    client.send('notice', '현재 제작한 미로와 문제 내용을 기본값으로 저장했습니다.');
                    break;
                }
                case 'admin.layout': {
                    this.requireAdmin(s);
                    if (!s.customMode) throw new Error('미로 커스텀 모드에서 사용해 주세요.');
                    const layout = editLayout({ grid: this.draftGrid, events: this.draftDefinitions }, data, store.defaultLayout());
                    store.saveLayout(layout);
                    this.draftGrid = layout.grid;
                    this.draftDefinitions = layout.events;
                    this.sendCustomMap(client, s);
                    client.send('notice', '미로 수정안을 저장했습니다. 전체 초기화 시 적용됩니다.');
                    break;
                }
                case 'admin.edit': {
                    this.requireAdmin(s);
                    const { x, y } = data;
                    if (typeof x !== 'number' || typeof y !== 'number' || (!s.customMode && Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 1) || !walkable(x, y, this.draftGrid))
                        throw new Error('현재 시야 안의 통로를 길게 눌러 주세요.');
                    client.send('editor', { x, y, definition: this.draftDefinitions.get(tileKey(x, y)) ?? null });
                    break;
                }
                case 'admin.save': {
                    this.requireAdmin(s);
                    const { x, y } = data;
                    if (typeof x !== 'number' || typeof y !== 'number' || (!s.customMode && Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 1))
                        throw new Error('현재 시야 안의 칸만 편집하실 수 있습니다.');
                    const key = tileKey(x, y);
                    if (data.kind === 'empty') {
                        if (!walkable(x, y, this.draftGrid) || key === '1,1' || this.draftDefinitions.get(key)?.boss)
                            throw new Error('시작 칸과 출구 보스는 삭제하실 수 없습니다.');
                        store.deleteDraft(key);
                        this.draftDefinitions.delete(key);
                    }
                    else {
                        const e = parseDefinition(data, this.draftDefinitions.get(key), this.draftGrid);
                        store.putDraft(e);
                        this.draftDefinitions.set(e.id, e);
                    }
                    this.sendCustomMap(client, s);
                    client.send('notice', '수정안을 저장했습니다. 전체 초기화를 누르면 모든 사용자에게 적용됩니다.');
                    break;
                }
                case 'admin.skip':
                    this.requireAdmin(s);
                    completeEvent(p, true);
                    changed = true;
                    break;
                case 'admin.stats':
                    this.requireAdmin(s);
                    p.stats = parseStats(data.stats, false);
                    p.hp = p.stats.hp;
                    if (typeof data.level !== 'number' || !Number.isInteger(data.level) || data.level < 1 || data.level > 50)
                        throw new Error('레벨은 1~50으로 입력해 주세요.');
                    p.level = data.level;
                    p.xp = (p.level - 1) * 100;
                    p.points = Math.max(0, (p.level - 1) * 2 - p.allocations.length);
                    changed = true;
                    break;
                case 'admin.rankDelete':
                    this.requireAdmin(s);
                    if (typeof data.key !== 'string')
                        throw new Error('삭제할 기록을 선택해 주세요.');
                    store.deleteRank(data.key);
                    this.refreshRanks();
                    break;
                default: throw new Error('지원하지 않는 요청입니다.');
            }
            if (changed) {
                // Only ordinary movement waits for the 30-second flush; all progression and active events commit immediately.
                if (cmd.action !== 'move' || p.active)
                    store.save([p]);
                s.revision++;
            }
        }
        catch (e) {
            // Restore memory if a validation or persistence failure interrupted this action.
            if (s.profile.finishedAt === before.finishedAt)
                s.profile = before;
            const message = e instanceof Error ? e.message : '요청 처리에 실패했습니다.';
            client.send('notice', message);
        }
        this.sendOwn(client, s);
        if (changed)
            this.monitor(s);
        client.send('ack', { id: cmd.id });
        if (logout)
            client.leave(4000);
    }
    private sendCustomMap(client: Client, s: Session) {
        if (s.admin && s.customMode)
            client.send('customMap', { grid: this.draftGrid, events: [...this.draftDefinitions.values()] });
    }
    private requireAdmin(s: Session) {
        if (!s.admin)
            throw new Error('운영자만 사용할 수 있는 기능입니다.');
    }
    onLeave(client: Client) {
        const s = this.sessions.get(client.sessionId);
        if (!s)
            return;
        try {
            store.save([s.profile]);
        }
        catch (e) {
            console.error('Maze disconnect save failed', e);
        }
        this.sessions.delete(client.sessionId);
        if (!s.admin)
            this.forAdmin('monitor.remove', s.profile.key);
    }
    onBeforeShutdown() {
        try {
            store.save([...this.sessions.values()].map(s => s.profile));
        }
        catch (e) {
            console.error('Maze shutdown save failed', e);
        }
        return this.disconnect();
    }
    onDispose() {
        if (activeWorld === this)
            activeWorld = undefined;
    }
}
