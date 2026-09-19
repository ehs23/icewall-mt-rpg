import { SECOND_JOBS, professionLabel } from './professions';
import type { Snapshot } from './types';
import { button, closeable, node, statNames, type Send } from './ui';
export function characterPanel(p: Snapshot, send: Send, close: () => void) {
    const { overlay, panel } = closeable(p.level < 10 ? '능력치' : '능력치와 전직', close);
    panel.append(node('p', `Lv.${p.level} · 경험치 ${p.xp} · 남은 포인트 ${p.points}`));
    for (const stat of Object.keys(statNames) as (keyof typeof statNames)[]) {
        const row = node('div', undefined, 'stat-row');
        const add = button('+', () => send('stat', { stat }));
        add.setAttribute('aria-label', `${statNames[stat]} 올리기`);
        add.disabled = p.points === 0 || !!p.active?.battle;
        row.append(node('span', `${statNames[stat]} ${p.stats[stat]}${stat === 'crit' || stat === 'critDamage' ? '%' : ''}`), add);
        panel.append(row);
    }
    panel.append(node('small', '레벨업마다 2포인트를 받습니다. 포인트당 체력 +19~21, 공격 +7~9, 방어 +4~6, 치명타율 +2%, 치명타 피해 +10%입니다.'));
    const reset = button('포인트 재분배', () => send('respec'), 'secondary');
    reset.disabled = !!p.active?.battle;
    panel.append(reset);
    if (p.level < 10) return overlay;
    panel.append(node('h3', p.profession ? professionLabel(p) : '1차 전직을 할 수 있습니다.'));
    if (!p.profession) {
        panel.append(node('small', '선택하신 직업은 변경하실 수 없습니다.'));
        for (const job of Object.keys(SECOND_JOBS)) {
            const btn = button(job, () => {
                if (window.confirm(`${job} 직업을 선택하시겠습니까? 이후 변경하실 수 없습니다.`)) send('profession', { profession: job });
            });
            btn.disabled = !!p.active?.battle;
            panel.append(btn);
        }
    } else if (p.level >= 25 && !p.advanced) {
        panel.append(node('small', '2차 전직을 할 수 있습니다.'));
        const btn = button(`2차 전직: ${SECOND_JOBS[p.profession]}`, () => send('advance'));
        btn.disabled = !!p.active?.battle;
        panel.append(btn);
    }
    const descriptions = {
        Searcher: '강타: 공격력의 130~150%로 공격합니다.',
        Translater: '방어·반사: 시전 반격과 다음 행동까지 받은 피해를 30%로 줄이고, 경감 전 피해의 20%를 반사합니다.',
        Buffer: '강화: 공격·방어를 55~71% 높입니다. 시전 후 두 번의 행동까지 유지됩니다.',
        Tracker: '회피·회복: 이번 반격을 회피하고 최대 체력의 4~6%를 회복합니다.',
    };
    if (p.profession) panel.append(node('small', descriptions[p.profession]));
    panel.append(node('p', p.profession ? `첫 번째 슬롯 · 스킬 Lv.${p.skillLevel} · 재사용 대기 1턴` : '🔒 첫 번째 슬롯 · 1차 전직 시 해제'));
    if (p.level >= 25 && p.profession)
        panel.append(node('p', p.advanced ? '두 번째 슬롯 · Non3 · 재사용 대기 2턴' : '🔒 두 번째 슬롯 · 2차 전직 시 해제'));
    return overlay;
}
