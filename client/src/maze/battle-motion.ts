import type { Snapshot } from './types';
export type BattleAction = 'attack' | 'skill1' | 'skill2';
export type BattleIntent = { before: Snapshot; action: BattleAction; stat?: string };
export function acceptedBattle(intent: BattleIntent, next: Snapshot) {
    const prior = intent.before.active;
    return !!prior?.battle && next.revision > intent.before.revision &&
        (!next.active || (next.active.id === prior.id && (next.active.battle?.turn ?? 0) > prior.battle.turn));
}
const names = { attack: '공격력', defense: '방어력', crit: '치명타율', critDamage: '치명타 피해' };
const quotes = {
    Searcher: ['돋보기는 사실 흉기야', '나는 회장의 자질을 가지고 있어'],
    Translater: ['무슨 상관이지?', '찾았다 너의 핵심'],
    Buffer: ['자기 자신에게만 버프라니;;', '적의 기능은 이제 당신 것입니다'],
    Tracker: ['공격이 보이네', '너는 무엇으로 이루어져 있니'],
};
// One local presentation at a time; no state mutation, network traffic, or monitoring hooks.
export class BattleMotion {
    running = false;
    private animations = new Set<Animation>();
    private layer?: HTMLElement;
    private arena?: HTMLElement;
    private controls?: HTMLElement;
    private generation = 0;
    constructor() {
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
    }
    cancel() {
        this.generation++;
        for (const animation of this.animations) animation.cancel();
        this.animations.clear();
        this.layer?.remove();
        this.arena?.classList.remove('battle-animating');
        if (this.controls) this.controls.inert = false;
        this.layer = this.arena = this.controls = undefined;
        this.running = false;
    }
    async play(root: HTMLElement, intent: BattleIntent, result: Snapshot) {
        this.cancel();
        if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const arena = root.querySelector<HTMLElement>('.battle-arena');
        const player = arena?.querySelector<HTMLElement>('.player-shape');
        const enemy = arena?.querySelector<HTMLElement>('.monster-shape');
        if (!arena || !player || !enemy) return;
        const token = this.generation;
        const live = () => token === this.generation && arena.isConnected;
        this.running = true;
        this.arena = arena;
        arena.classList.add('battle-animating');
        this.controls = root.querySelector<HTMLElement>('.battle-actions') ?? undefined;
        if (this.controls) this.controls.inert = true;
        const layer = document.createElement('div');
        layer.className = 'battle-fx-layer';
        layer.setAttribute('aria-hidden', 'true');
        this.layer = layer;
        arena.append(layer);
        const rect = arena.getBoundingClientRect();
        const center = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 }; };
        const a = center(player), b = center(enemy), dx = b.x - a.x, dy = b.y - a.y;
        const tween = async (el: HTMLElement, frames: Keyframe[], duration: number, delay = 0) => {
            if (!live()) return;
            const animation = el.animate(frames, { duration, delay, easing: 'ease-out', fill: 'both' });
            this.animations.add(animation);
            await animation.finished.catch(() => {});
            // Keep terminal frames until the authoritative snapshot replaces the old view.
        };
        const fx = (kind: string, at: { x: number; y: number }, text = '') => {
            const el = document.createElement('span'); el.className = `battle-fx fx-${kind}`;
            el.textContent = text; el.style.left = `${at.x}px`; el.style.top = `${at.y}px`; layer.append(el); return el;
        };
        const pulse = (kind: string, at: { x: number; y: number }, text = '', duration = 420) => tween(fx(kind, at, text), [
            { opacity: 0, transform: 'translate(-50%, -50%) scale(.25) rotate(-25deg)' },
            { opacity: 1, offset: .35, transform: 'translate(-50%, -50%) scale(1) rotate(0deg)' },
            { opacity: 0, transform: 'translate(-50%, -50%) scale(1.5) rotate(15deg)' },
        ], duration);
        const bolt = (kind: string, from: typeof a, to: typeof a, text = '', delay = 0) => tween(fx(kind, from, text), [
            { opacity: 0, transform: 'translate(-50%, -50%) scale(.5)' },
            { opacity: 1, offset: .15 },
            { opacity: 1, offset: .8 },
            { opacity: 0, transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(1.1)` },
        ], 340, delay);
        const shake = (el: HTMLElement, delay = 0) => tween(el, [
            { transform: 'translateX(0)' }, { transform: 'translateX(-7px)', offset: .25 },
            { transform: 'translateX(6px)', offset: .5 }, { transform: 'translateX(-3px)', offset: .75 }, { transform: 'translateX(0)' },
        ], 180, delay);
        const job = intent.before.profession;
        const kind = intent.action === 'attack' ? 'attack' : `${job}-${intent.action}`;
        const message = root.querySelector<HTMLElement>('.battle-commands p');
        if (message) message.textContent = intent.action === 'attack' ? '공격합니다.' : (job ? quotes[job]?.[intent.action === 'skill1' ? 0 : 1] : undefined) ?? '스킬을 사용합니다.';
        try {
            switch (kind) {
                case 'attack':
                    await Promise.all([
                        tween(player, [{ transform: 'translate(0,0)' }, { transform: `translate(${dx * .22}px,${dy * .22}px)`, offset: .45 }, { transform: 'translate(0,0)' }], 330),
                        bolt('slash', a, b, '／'), shake(enemy, 270),
                    ]); break;
                case 'Searcher-skill1':
                    await tween(fx('lens', { x: b.x, y: b.y - 45 }), [{ opacity: 0, transform: 'translate(-50%,-50%) scale(1.7) rotate(-40deg)' }, { opacity: 1, transform: 'translate(-50%,calc(-50% + 45px)) scale(.9) rotate(15deg)' }], 300);
                    await Promise.all([pulse('impact', b, '✦', 230), shake(enemy)]); break;
                case 'Searcher-skill2':
                    await pulse('crown', a, '♛', 230);
                    await Promise.all([bolt('gold', a, b, '◆'), pulse('cleave', b, '╱'), shake(enemy, 220)]); break;
                case 'Translater-skill1':
                    await pulse('shield', a, '⬡', 330); break;
                case 'Translater-skill2':
                    await pulse('crosshair', b, '⌖', 350);
                    await Promise.all([pulse('break', b, `${names[intent.stat as keyof typeof names] ?? '능력치'} ↓`, 250), shake(enemy)]); break;
                case 'Buffer-skill1':
                    await Promise.all([pulse('power', { x: a.x - 22, y: a.y }, '↑'), pulse('armor', { x: a.x + 22, y: a.y }, '↑')]); break;
                case 'Buffer-skill2':
                    await bolt('control', a, b, '⌁');
                    await Promise.all([tween(enemy, [{ transform: 'rotate(0)' }, { transform: 'rotate(22deg) scale(.8)', offset: .45 }, { transform: 'rotate(0)' }], 250), pulse('control-ring', b, '↶', 250)]); break;
                case 'Tracker-skill1':
                    await Promise.all([
                        tween(player, [{ opacity: 1, transform: 'translateX(0)' }, { opacity: .3, transform: 'translateX(-24px)', offset: .5 }, { opacity: 1, transform: 'translateX(0)' }], 450),
                        pulse('ghost', a, '●', 300), pulse('heal', { x: a.x + 25, y: a.y - 20 }, '+', 450),
                    ]); break;
                case 'Tracker-skill2':
                    await Promise.all([0, 1, 2].map(i => bolt('drain', { x: b.x, y: b.y + i * 10 - 10 }, a, '●', i * 60)));
                    await pulse('gain', a, `${names[intent.stat as keyof typeof names] ?? '능력치'} ↑`, 200); break;
            }
            if (!live()) return;
            const won = !result.active && result.x === intent.before.x && result.y === intent.before.y;
            if (won) {
                await tween(enemy, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.3)' }], 220);
            } else if (kind !== 'Buffer-skill2') {
                const guarded = kind === 'Translater-skill1' || intent.before.active?.battle?.effects.some(e => e.kind === 'guard');
                const weakened = result.active?.battle?.effects.some(e => e.kind === 'debuff' && e.stat === 'attack') && result.active.monster?.attack === 0;
                if (kind === 'Tracker-skill1') {
                    await bolt('miss', b, { x: a.x + 30, y: a.y }, '빗나감');
                } else if (!weakened) {
                    await bolt('enemy', b, a, '◆');
                    if (guarded) await Promise.all([pulse('shield', a, '⬡', 200), bolt('reflect', a, b, '◆')]);
                    else await shake(player);
                }
            }
        } finally {
            if (token === this.generation) this.cancel();
        }
    }
}
