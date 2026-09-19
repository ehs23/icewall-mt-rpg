import { effectiveBattleStats, effectiveEnemyStats, normalizeBattle } from './battle.js';
import { award } from './progression.js';
import type { EventDefinition, Profile, PublicEvent } from './types.js';
export function enterEvent(p: Profile, definition: EventDefinition | undefined, from: [
    number,
    number
]) {
    if (!definition || p.cleared.includes(definition.id))
        return;
    p.active = { definition: structuredClone(definition), from, retryAt: p.quizRetries?.[definition.id] };
    if (definition.kind === 'monster')
        p.active.battle = { monsterHp: definition.stats!.hp, turn: 1, effects: [], cooldowns: { skill1: 0, skill2: 0 }, log: ['전투가 시작되었습니다.'] };
}
export function completeEvent(p: Profile, skipped = false): boolean {
    const e = p.active?.definition;
    if (!e)
        return false;
    if (!p.cleared.includes(e.id)) {
        p.cleared.push(e.id);
        if (!skipped)
            award(p, e.xp);
    }
    p.active = null;
    return !!e.boss && !skipped;
}
export function answerQuiz(p: Profile, answer: unknown, now = Date.now()) {
    const e = p.active?.definition;
    if (!e || e.kind === 'monster' || typeof answer !== 'string' || answer.length > 500)
        throw new Error('답안을 입력해 주세요.');
    if ((p.active!.retryAt ?? 0) > now) throw new Error('오답 후 30초가 지나면 다시 제출하실 수 있습니다.');
    const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (normalize(answer) !== normalize(e.answer!)) {
        p.active!.retryAt = now + 30_000;
        (p.quizRetries ??= {})[e.id] = p.active!.retryAt;
        return false;
    }
    completeEvent(p);
    return true;
}
export function publicEvent(p: Profile): PublicEvent | null {
    const active = p.active;
    if (!active)
        return null;
    const e = active.definition;
    const output: PublicEvent = { id: e.id, kind: e.kind, prompt: e.prompt, choices: e.choices, boss: e.boss };
    output.retryAfterMs = Math.max(0, (active.retryAt ?? 0) - Date.now());
    if (e.stats && active.battle) {
        normalizeBattle(active.battle);
        const { hp, ...stats } = effectiveEnemyStats(p);
        output.monster = { ...stats, hpPercent: Math.max(0, Math.ceil(active.battle.monsterHp / hp * 100)) };
        const { monsterHp: _, ...battle } = active.battle;
        output.battle = battle;
        output.playerStats = effectiveBattleStats(p);
    }
    return output;
}

export function leaveQuiz(p: Profile) {
    const active = p.active;
    if (!active || active.definition.kind === 'monster') throw new Error('퀴즈 화면에서 사용해 주세요.');
    if (active.retryAt) (p.quizRetries ??= {})[active.definition.id] = active.retryAt;
    [p.x, p.y] = active.from;
    p.active = null;
}
