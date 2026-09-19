import { randomInt } from 'node:crypto';
import type { Profile, Profession, Stats, StatName } from './types.js';
export const POINTS_PER_LEVEL = 2;
export const BASE: Stats = { hp: 20, attack: 5, defense: 3, crit: 0, critDamage: 100 };
export const PROFESSIONS: Record<Profession, string> = { Searcher: 'Webhacking', Translater: 'Reversing', Buffer: 'Pwnable', Tracker: 'Forensic' };
export const isStat = (s: unknown): s is StatName => typeof s === 'string' && Object.hasOwn(BASE, s);
export function fresh(key: string, nickname: string): Profile {
    return { key, nickname, x: 1, y: 1, level: 1, xp: 0, stats: { ...BASE }, hp: 20, points: 0, allocations: [], growthRolls: [], profession: null, advanced: false, visited: ['1,1'], cleared: [], active: null, startedAt: Date.now(), finishedAt: null, savedAt: 0 };
}
export function award(p: Profile, xp: number) {
    p.xp = Math.min(4900, p.xp + xp);
    const next = Math.min(50, 1 + Math.floor(p.xp / 100));
    p.points += Math.max(0, next - p.level) * POINTS_PER_LEVEL;
    p.level = next;
    p.hp = p.stats.hp;
}
export function spend(p: Profile, stat: StatName, random: (min: number, max: number) => number = randomInt) {
    if (p.points < 1) throw new Error('사용할 포인트가 없습니다.');
    const cap = stat === 'crit' ? 100 : stat === 'critDamage' ? 300 : stat === 'hp' ? 999 : 199;
    if (p.stats[stat] >= cap) throw new Error('이 능력치는 최대치입니다.');
    // Roll at the time of investment. Legacy pre-generated values are never reused.
    const offset = stat === 'hp' || stat === 'attack' || stat === 'defense' ? random(0, 3) - 1 : 0;
    const increase = stat === 'crit' ? 2 : stat === 'critDamage' ? 10 : (stat === 'hp' ? 15 : stat === 'attack' ? 5 : 4) + offset;
    p.growthRolls[p.allocations.length] = offset;
    p.stats[stat] = Math.min(cap, p.stats[stat] + increase);
    p.points--;
    p.allocations.push(stat);
    p.hp = p.stats.hp;
}
export function respec(p: Profile) {
    const count = p.allocations.length;
    p.stats = { ...BASE };
    p.points += count;
    p.allocations = [];
    p.growthRolls = [];
    p.hp = p.stats.hp;
}
export function chooseProfession(p: Profile, value: unknown) {
    if (p.level < 10 || p.profession)
        throw new Error('1차 전직은 10레벨부터 한 번만 선택하실 수 있습니다.');
    if (typeof value !== 'string' || !Object.hasOwn(PROFESSIONS, value))
        throw new Error('직업을 선택해 주세요.');
    p.profession = value as Profession;
}
export const skillLevel = (p: Profile) => p.profession ? Math.max(1, 1 + Math.floor((p.level - 10) / 5)) : 0;
// Administrative override only; ordinary users still use chooseProfession().
export function overrideProfession(p: Profile, value: unknown) {
    if (typeof value !== 'string')
        throw new Error('직업을 선택해 주세요.');
    if (value === 'none') {
        p.profession = null;
        p.advanced = false;
    }
    else {
        const job = Object.entries(PROFESSIONS).find(([first, second]) => value === first || value === second);
        if (!job)
            throw new Error('지원하지 않는 직업입니다.');
        p.profession = job[0] as Profession;
        p.advanced = value === job[1];
        const requiredLevel = p.advanced ? 25 : 10;
        if (p.level < requiredLevel) {
            p.points += (requiredLevel - p.level) * POINTS_PER_LEVEL;
            p.level = requiredLevel;
            p.xp = Math.max(p.xp, (requiredLevel - 1) * 100);
        }
    }
    if (p.active?.battle) {
        p.active.battle.effects = [];
        p.active.battle.cooldowns = { skill1: 0, skill2: 0 };
    }
}

export function enforceStatCaps(p: Profile) {
    const caps: Stats = { hp: 999, attack: 199, defense: 199, crit: 100, critDamage: 300 };
    for (const key of Object.keys(caps) as StatName[]) p.stats[key] = Math.min(p.stats[key], caps[key]);
    p.hp = Math.min(p.hp, p.stats.hp);
}
