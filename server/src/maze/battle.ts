import { randomInt } from 'node:crypto';
import { skillLevel } from './progression.js';
import type { Battle, Profile, Stats, CombatStat } from './types.js';
type Random = (min: number, max: number) => number;
export type HitResult = { raw: number; damage: number; blocked: number; critical: boolean };
export const QUOTES = {
    Searcher: ['돋보기는 사실 흉기야', '나는 회장의 자질을 가지고 있어'],
    Translater: ['무슨 상관이지?', '찾았다 너의 핵심'],
    Buffer: ['자기 자신에게만 버프라니;;', '적의 기능은 이제 당신 것입니다'],
    Tracker: ['공격이 보이네', '너는 무엇으로 이루어져 있니'],
};
export function normalizeBattle(b: Battle) {
    b.cooldowns ??= { skill1: 0, skill2: 0 };
    b.effects ??= [];
    // Legacy buffs are safely expired when loading an older saved battle.
    return b;
}
export function defend(raw: number, defense: number, defenseWeight = 1) {
    raw = Math.max(0, Math.round(raw));
    if (!raw) return 0;
    defense = Math.max(0, defense * defenseWeight);
    return Math.max(1, raw - (defense > 0 ? Math.max(1, Math.round(raw * defense / (30 + defense))) : 0));
}
export function calculateHit(attacker: Stats, defender: Stats, random: Random = randomInt, defenseWeight = 1): HitResult {
    const spread = Math.round(attacker.attack * 0.1);
    const base = attacker.attack + random(-spread, spread + 1);
    const critical = random(0, 10000) < Math.round(Math.min(100, attacker.crit) * 100);
    const raw = Math.max(0, Math.round(base * (critical ? attacker.critDamage / 100 : 1)));
    const damage = defend(raw, defender.defense, defenseWeight);
    return { raw, damage, blocked: raw - damage, critical };
}
export function effectiveBattleStats(p: Profile): Stats {
    const stats = { ...p.stats };
    for (const e of p.active?.battle ? normalizeBattle(p.active.battle).effects : []) {
        if (e.kind === 'buff') {
            stats.attack = Math.round(stats.attack * (1 + e.amount / 100));
            stats.defense = Math.round(stats.defense * (1 + e.amount / 100));
        }
        if (e.kind === 'steal' && e.stat) stats[e.stat] += e.amount;
    }
    return stats;
}
export function effectiveEnemyStats(p: Profile): Stats {
    const stats = { ...p.active!.definition.stats! };
    for (const e of normalizeBattle(p.active!.battle!).effects)
        if ((e.kind === 'debuff' || e.kind === 'steal') && e.stat) stats[e.stat] = Math.max(0, stats[e.stat] - e.amount);
    return stats;
}
function describeHit(label: string, hit: HitResult) {
    return `${label}${hit.critical ? '·치명타' : ''}: ${hit.damage} 피해 (방어 −${hit.blocked})`;
}
export function battleTurn(p: Profile, action: unknown, target?: unknown, random: Random = randomInt): 'win' | 'lose' | 'ongoing' {
    const active = p.active, battle = active?.battle;
    if (!battle || !active.definition.stats) throw new Error('진행 중인 전투가 없습니다.');
    normalizeBattle(battle);
    const skill = action === 'skill1' || action === 'skill2' ? action : undefined;
    if (action !== 'attack' && !skill) throw new Error('사용할 수 없는 스킬입니다.');
    if (skill && (!p.profession || p.level < 10 || (skill === 'skill2' && (!p.advanced || p.level < 25)))) throw new Error('전직 후 사용하실 수 있습니다.');
    if (skill && battle.cooldowns[skill] > 0) throw new Error('스킬 재사용을 기다려 주세요.');
    const selective = skill === 'skill2' && (p.profession === 'Translater' || p.profession === 'Tracker');
    if (selective && !['attack', 'defense', 'crit', 'critDamage'].includes(String(target))) throw new Error('대상 능력치를 선택해 주세요.');
    const oldEffects = new Set(battle.effects);
    battle.log = [];
    battle.quote = skill ? QUOTES[p.profession!][skill === 'skill1' ? 0 : 1] : undefined;
    if (battle.quote) battle.log.push(battle.quote);
    let evade = false, selfHit = false;
    const damageEnemy = (damage: number, label: string) => { battle.monsterHp = Math.max(0, battle.monsterHp - damage); battle.log.push(`${label}: ${damage} 피해`); };
    const level = skillLevel(p);
    if (!skill) {
        const hit = calculateHit(effectiveBattleStats(p), effectiveEnemyStats(p), random);
        damageEnemy(hit.damage, hit.critical ? '치명타 공격' : '공격');
    } else {
        battle.cooldowns[skill] = skill === 'skill1' ? 1 : 2;
        if (skill === 'skill1') {
            const kind = p.profession === 'Buffer' ? 'buff' : p.profession === 'Translater' ? 'guard' : undefined;
            if (kind) battle.effects = battle.effects.filter(e => e.kind !== kind);
            switch (p.profession) {
                case 'Searcher': {
                    const stats = effectiveBattleStats(p);
                    stats.attack = Math.round(stats.attack * (1.3 + (level - 1) * 0.025));
                    const hit = calculateHit(stats, effectiveEnemyStats(p), random);
                    damageEnemy(hit.damage, '강타'); break;
                }
                case 'Translater': battle.effects.push({ kind: 'guard', turns: 1, amount: 30 }); break;
                case 'Buffer': battle.effects.push({ kind: 'buff', turns: 2, amount: 55 + (level - 1) * 2 }); break;
                case 'Tracker': {
                    evade = true;
                    const heal = Math.min(p.stats.hp - p.hp, Math.max(3, Math.round(p.stats.hp * (0.04 + (level - 1) * 0.0025))));
                    p.hp += heal;
                    battle.log.push(`체력을 ${heal} 회복했습니다.`); break;
                }
            }
        } else {
            battle.effects = battle.effects.filter(e => e.kind !== 'debuff' && e.kind !== 'steal');
            switch (p.profession) {
                case 'Searcher': damageEnemy(defend(Math.round(battle.monsterHp / 2), effectiveEnemyStats(p).defense), '남은 체력의 절반 공격'); break;
                case 'Translater': battle.effects.push({ kind: 'debuff', turns: 1, stat: target as CombatStat, amount: 100 }); break;
                case 'Buffer': selfHit = true; break;
                case 'Tracker': {
                    const stat = target as CombatStat;
                    battle.effects.push({ kind: 'steal', turns: 1, stat, amount: Math.round(effectiveEnemyStats(p)[stat] * 0.3) }); break;
                }
            }
        }
    }
    if (battle.monsterHp > 0) {
        const enemy = effectiveEnemyStats(p);
        if (selfHit) {
            const hit = calculateHit(enemy, enemy, random);
            damageEnemy(hit.damage, '몬스터 자신 공격');
        } else if (evade) battle.log.push('상대 공격을 회피했습니다.');
        else {
            const hit = calculateHit(enemy, effectiveBattleStats(p), random, 1.5);
            if (battle.effects.some(e => e.kind === 'guard')) {
                const received = Math.round(hit.damage * 0.3);
                p.hp = Math.max(0, p.hp - received);
                battle.log.push(`방어 태세: ${received} 피해를 받았습니다.`);
                damageEnemy(defend(Math.round(hit.damage * 0.2), enemy.defense), '반사');
            } else {
                p.hp = Math.max(0, p.hp - hit.damage);
                battle.log.push(describeHit('반격', hit));
            }
        }
    }
    // Only counters that existed before this action tick. Casting never consumes its own duration.
    for (const key of ['skill1', 'skill2'] as const) if (key !== skill) battle.cooldowns[key] = Math.max(0, battle.cooldowns[key] - 1);
    for (const e of battle.effects) if (oldEffects.has(e)) e.turns--;
    battle.effects = battle.effects.filter(e => e.turns > 0);
    battle.turn++;
    return p.hp <= 0 ? 'lose' : battle.monsterHp <= 0 ? 'win' : 'ongoing';
}
