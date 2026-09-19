import type { Monitor, Ranking, Snapshot } from './types';
import { button, node, type Send } from './ui';
import { professionLabel } from './professions';
import { drawView } from './vision';
export function monitoringPanel(send: Send, close: () => void) {
    const root = node('section', undefined, 'monitor-screen');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '전체 화면 플레이어 관찰');
    const head = node('header'), title = node('h2', '플레이어 관찰');
    const watchTab = button('플레이어', () => select('players'));
    const rankTab = button('탈출 순위', () => select('ranks'));
    head.append(title, watchTab, rankTab, button('닫기', close));
    const body = node('div', undefined, 'monitor-body');
    const grid = node('div', undefined, 'monitor-grid');
    const ranks = node('div', undefined, 'monitor-ranks');
    const empty = node('p', '접속 중인 플레이어가 없습니다.', 'monitor-empty');
    body.append(grid, ranks, empty);
    const footer = node('nav', undefined, 'monitor-navigation');
    footer.setAttribute('aria-label', '관찰 페이지');
    const back = button('이전', () => { page--; layout(); });
    const next = button('다음', () => { page++; layout(); });
    const pageLabel = node('span');
    footer.append(back, pageLabel, next);
    root.append(head, body, footer);
    type Card = { root: HTMLElement; canvas: HTMLCanvasElement; title: HTMLElement; job: HTMLElement; stats: HTMLElement; problem: HTMLElement; state: Snapshot; observer: ResizeObserver };
    const cards = new Map<string, Card>();
    let mode: 'players'|'ranks' = 'players', page = 0;
    let rankData: Ranking[] = [];
    function select(value: typeof mode) { mode = value; page = 0; layout(); }
    function layout() {
        const width = body.clientWidth, height = body.clientHeight;
        if (!width || !height) return;
        watchTab.setAttribute('aria-pressed', String(mode === 'players'));
        rankTab.setAttribute('aria-pressed', String(mode === 'ranks'));
        grid.hidden = mode !== 'players'; ranks.hidden = mode !== 'ranks';
        const maxRows = Math.max(1, Math.floor((height + 10) / 220));
        const maxColumns = Math.max(1, Math.floor((width + 10) / 210));
        const balancedColumns = Math.ceil(Math.sqrt(cards.size * width / Math.max(1, height)));
        const columns = Math.min(maxColumns, Math.max(1, cards.size), Math.max(1, balancedColumns, Math.ceil(cards.size / maxRows)));
        const capacity = mode === 'players' ? columns * maxRows : Math.max(1, Math.floor(height / 54));
        const total = mode === 'players' ? cards.size : rankData.length;
        const count = Math.max(1, Math.ceil(total / capacity));
        page = Math.max(0, Math.min(page, count - 1));
        pageLabel.textContent = `${page + 1} / ${count} · ${mode === 'players' ? '접속' : '탈출'} ${total}명`;
        back.disabled = page === 0; next.disabled = page === count - 1;
        empty.hidden = total > 0;
        empty.textContent = mode === 'players' ? '접속 중인 플레이어가 없습니다.' : '아직 탈출한 플레이어가 없습니다.';
        if (mode === 'players') {
            const shown = Math.min(capacity, Math.max(0, total - page * capacity));
            grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
            grid.style.gridTemplateRows = `repeat(${Math.max(1, Math.ceil(shown / columns))}, minmax(0, 1fr))`;
            let index = 0;
            for (const card of cards.values()) {
                const visible = index >= page * capacity && index < (page + 1) * capacity;
                const wasHidden = card.root.hidden;
                card.root.hidden = !visible; index++;
                if (visible && wasHidden) drawView(card.canvas, card.state, true);
            }
        } else {
            ranks.replaceChildren();
            for (const row of rankData.slice(page * capacity, (page + 1) * capacity)) {
                const item = node('div', undefined, 'rank-row');
                item.append(node('span', `${row.rank}위 · ${row.nickname} · ${Math.floor(row.elapsed / 60)}분 ${row.elapsed % 60}초`), button('삭제', () => {
                    if (window.confirm(`${row.nickname}님의 순위 기록을 삭제하시겠습니까?`)) send('admin.rankDelete', { key: row.key });
                }));
                ranks.append(item);
            }
        }
    }
    const update = (m: Monitor) => {
        let card = cards.get(m.key);
        if (!card) {
            const element = node('section', undefined, 'monitor-card');
            const title = node('strong'), job = node('span', undefined, 'monitor-job');
            const canvas = node('canvas'), stats = node('p', undefined, 'monitor-stats'), problem = node('p', undefined, 'monitor-problem');
            canvas.setAttribute('aria-label', `${m.snapshot.nickname}님의 현재 시야`);
            element.append(title, job, canvas, stats, problem); grid.append(element);
            const entry: Card = { root: element, canvas, title, job, stats, problem, state: m.snapshot, observer: new ResizeObserver(() => { if (!element.hidden && mode === 'players') drawView(canvas, entry.state, true); }) };
            card = entry; cards.set(m.key, card); card.observer.observe(canvas);
            layout();
        }
        card.state = m.snapshot;
        const p = m.snapshot, values = p.active?.playerStats ?? p.stats;
        card.title.textContent = `${p.nickname} · Lv.${p.level} · ${p.x + 1}열 ${p.y + 1}행`;
        card.job.textContent = professionLabel(p);
        card.stats.textContent = `체력 ${p.hp}/${p.stats.hp} · 공격 ${values.attack} · 방어 ${values.defense}\n치명타율 ${values.crit}% · 치명타 피해 ${values.critDamage}%`;
        card.problem.textContent = p.active ? `${p.active.kind === 'monster' ? '전투' : '문제'}: ${p.active.prompt}` : '탐험 중입니다.';
        card.problem.title = card.problem.textContent;
        if (!card.root.hidden && mode === 'players') drawView(card.canvas, p, true);
    };
    const remove = (key: string) => {
        const card = cards.get(key); card?.observer.disconnect(); card?.root.remove(); cards.delete(key); layout();
    };
    const resize = new ResizeObserver(layout); resize.observe(body);
    return {
        root, update, remove,
        rankings: (rows: Ranking[]) => { rankData = rows; if (mode === 'ranks') layout(); },
        destroy: () => { resize.disconnect(); for (const card of cards.values()) card.observer.disconnect(); cards.clear(); root.remove(); },
    };
}
