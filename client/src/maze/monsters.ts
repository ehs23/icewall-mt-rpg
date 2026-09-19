import type { Snapshot } from './types';
import { button, node, statText, type Send } from './ui';
function bar(value: number, max: number) { const meter = node('progress'); meter.max = max; meter.value = value; meter.setAttribute('aria-label', '남은 체력'); return meter; }
export function monsterBattle(p: Snapshot, send: Send) {
    const e = p.active!, monster = e.monster!, wrap = node('div', undefined, 'battle');
    const enemy = node('section', undefined, 'enemy');
    enemy.append( node('strong', e.prompt), bar(monster.hpPercent, 100), node('small', statText({ ...monster, hp: 0 })));
    const player = node('section', undefined, 'fighter');
    player.append( node('strong', `${p.nickname} · Lv.${p.level}`), node('span', `체력 ${p.hp} / ${p.stats.hp}`), bar(p.hp, p.stats.hp), node('small', statText(e.playerStats ?? p.stats)));
    const actions = node('div', undefined, 'battle-actions');
    actions.append(button('공격', () => send('battle', { action: 'attack' })));
    const titles = { Searcher: ['강타', '체력 절반 공격'], Translater: ['방어·반사', '핵심 약화'], Buffer: ['공격·방어 강화', '자신 공격 유도'], Tracker: ['회피·회복', '능력치 강탈'] };
    const target = node('select');
    target.setAttribute('aria-label', '2차 스킬 대상 능력치');
    for (const [value, label] of [['attack', '공격력'], ['defense', '방어력'], ['crit', '치명타율'], ['critDamage', '치명타 피해']]) {
        const option = node('option', label); option.value = value!; target.append(option);
    }
    for (const slot of [1, 2] as const) {
        const key = slot === 1 ? 'skill1' : 'skill2';
        const learned = !!p.profession && p.level >= (slot === 1 ? 10 : 25) && (slot === 1 || p.advanced);
        const wait = e.battle?.cooldowns?.[key] ?? 0;
        const title = learned ? `${titles[p.profession!][slot - 1]} · ${slot === 1 ? `Lv.${p.skillLevel}` : 'Non3'}${wait ? ` · ${wait}턴 후` : ''}` : `🔒 ${slot}차 스킬`;
        const skill = button(title, () => send('battle', { action: key, stat: target.value }));
        skill.title = '사용한 행동은 대기시간에 포함되지 않습니다. 공격이나 다른 스킬을 사용하면 남은 턴이 줄어듭니다.';
        skill.disabled = !learned || wait > 0;
        actions.append(skill);
    }
    if (p.advanced && p.level >= 25 && (p.profession === 'Translater' || p.profession === 'Tracker')) actions.append(target);
    const arena = node('div', undefined, 'battle-arena');
    const enemySprite = node('div', '◆', 'monster-shape battle-sprite');
    const playerSprite = node('div', '●', 'player-shape battle-sprite');
    enemySprite.setAttribute('aria-hidden', 'true');
    playerSprite.setAttribute('aria-hidden', 'true');
    arena.append(enemy, enemySprite, playerSprite, player);
    const commands = node('div', undefined, 'battle-commands');
    const message = node('p', e.battle?.log.join(' ') ?? '어떤 행동을 하시겠습니까?');
    const effectNames = { buff: '강화', guard: '방어·반사', debuff: '약화', steal: '강탈' };
    const effects = e.battle?.effects ?? [];
    if (effects.length) message.append(node('small', ` 적용 중: ${effects.map(effect => `${effectNames[effect.kind]} ${effect.turns}턴`).join(' · ')}`));
    commands.append(message, actions);
    wrap.append(arena, commands);
    return wrap;
}
