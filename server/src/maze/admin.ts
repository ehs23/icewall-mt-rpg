import { createHash, timingSafeEqual } from 'node:crypto';
import { walkable, tileKey } from './maze.js';
import type { EventDefinition, Stats } from './types.js';
const attempts = new Map<string, {
    count: number;
    until: number;
}>();
export function authenticate(nickname: unknown, password: unknown, ip: string) {
    if (typeof nickname !== 'string')
        throw new Error('닉네임을 입력해 주세요.');
    const name = nickname.normalize('NFC').trim();
    if (!/^[\p{L}\p{N}_ -]{1,12}$/u.test(name))
        throw new Error('닉네임은 한글·영문·숫자·공백·밑줄·하이픈으로 1~12자 입력해 주세요.');
    const key = name.toLowerCase(), admin = key === 'taf';
    if (admin) {
        const now = Date.now();
        for (const [k, v] of attempts)
            if (v.until < now)
                attempts.delete(k);
        const entry = attempts.get(ip) ?? { count: 0, until: now + 60000 };
        if (entry.count >= 5)
            throw new Error('비밀번호 입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.');
        const hash = (s: string) => createHash('sha256').update(s).digest();
        if (typeof password !== 'string' || password.length > 128 || !timingSafeEqual(hash(password), hash(process.env.ADMIN_PASSWORD || '1234'))) {
            entry.count++;
            attempts.set(ip, entry);
            throw new Error('운영자 비밀번호를 확인해 주세요.');
        }
        attempts.delete(ip);
    }
    return { key, nickname: admin ? 'TAF' : name, admin };
}
export function parseStats(data: unknown, monster: boolean): Stats {
    if (!data || typeof data !== 'object')
        throw new Error('능력치를 입력해 주세요.');
    const s = data as Record<string, unknown>;
    const result = {} as Stats;
    for (const [key, min, max] of [['hp', 1, 999], ['attack', 1, 199], ['defense', 0, 199], ['crit', 0, 100], ['critDamage', 100, monster ? 200 : 300]] as const) {
        const value = s[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (key === 'crit' ? !Number.isInteger(value * 2) : !Number.isInteger(value)))
            throw new Error(`${key}의 입력 범위를 확인해 주세요.`);
        result[key] = value;
    }
    return result;
}
export function parseDefinition(data: Record<string, unknown>, previous?: EventDefinition, grid?: string[]): EventDefinition {
    const { x, y, kind, prompt } = data;
    if (typeof x !== 'number' || typeof y !== 'number' || !walkable(x, y, grid) || (x === 1 && y === 1))
        throw new Error('시작 지점을 제외한 통로를 선택해 주세요.');
    if (!['choice', 'text', 'monster'].includes(String(kind)) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000)
        throw new Error('문제 유형과 내용을 확인해 주세요.');
    const boss = previous?.boss === true;
    if (boss && kind !== 'monster')
        throw new Error('탈출구에는 보스 전투만 배치하실 수 있습니다.');
    const e: EventDefinition = { id: tileKey(x, y), x, y, kind: kind as EventDefinition['kind'], prompt: prompt.trim(), boss, xp: kind === 'monster' ? (previous?.kind === 'monster' ? previous.xp : 200) : 120, revision: (previous?.revision ?? 0) + 1 };
    if (kind === 'monster')
        e.stats = parseStats(data.stats, true);
    else {
        if (typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 500)
            throw new Error('정답을 입력해 주세요.');
        e.answer = data.answer.trim();
        if (kind === 'choice') {
            if (!Array.isArray(data.choices) || data.choices.length < 3 || data.choices.length > 5 || data.choices.some(c => typeof c !== 'string' || !c.trim() || c.length > 500))
                throw new Error('보기는 3~5개이며 각 내용을 입력해 주세요.');
            e.choices = data.choices as string[];
            if (!/^\d$/.test(e.answer) || Number(e.answer) >= e.choices.length)
                throw new Error('정답 보기를 선택해 주세요.');
        }
    }
    return e;
}
