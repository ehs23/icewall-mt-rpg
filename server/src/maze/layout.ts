import { GRID, tileKey, walkable } from './maze.js';
import { initialEvents } from './content.js';
import type { EventDefinition } from './types.js';
export type Layout = { grid: string[]; events: Map<string, EventDefinition> };
export function validSize(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 7 || value > 51)
        throw new Error('미로 크기는 7~51 사이의 정수로 입력해 주세요.');
    return value;
}
export function blankGrid(size: number) {
    validSize(size);
    return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => x === 0 || y === 0 || x === size - 1 || y === size - 1 ? '0' : '1').join(''));
}
export function validateLayout({ grid, events }: Layout, publish = false) {
    const size = validSize(grid.length);
    if (grid.some((row, y) => row.length !== size || !/^[01]+$/.test(row) || row[0] !== '0' || row[size - 1] !== '0' || ((y === 0 || y === size - 1) && row.includes('1'))) || !walkable(1, 1, grid))
        throw new Error('바깥 테두리는 벽이어야 하며 시작 칸은 통로여야 합니다.');
    for (const e of events.values()) if (!walkable(e.x, e.y, grid) || e.id !== tileKey(e.x, e.y) || e.id === '1,1' || (e.boss && e.kind !== 'monster'))
        throw new Error('문제와 보스는 시작 칸을 제외한 통로에 배치해 주세요.');
    const bosses = [...events.values()].filter(e => e.boss);
    if (bosses.length > 1 || (publish && bosses.length !== 1)) throw new Error('출구 보스를 한 곳에 지정해 주세요.');
    if (!publish) return;
    const visited = new Set(['1,1']), queue = [[1, 1]];
    for (const [x, y] of queue) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = tileKey(nx, ny);
        if (walkable(nx, ny, grid) && !visited.has(key)) { visited.add(key); queue.push([nx, ny]); }
    }
    if (visited.size !== grid.join('').split('').filter(c => c === '1').length)
        throw new Error('시작점에서 갈 수 없는 통로가 있습니다. 벽을 수정하여 연결해 주세요.');
}
export function editLayout(current: Layout, data: Record<string, unknown>, baseline: Layout = { grid: GRID, events: initialEvents() }): Layout {
    let grid = [...current.grid], events = new Map([...current.events].map(([id, e]) => [id, structuredClone(e)]));
    const operation = data.operation;
    if (operation === 'default' || operation === 'blank' || operation === 'resize') {
        if (data.confirm !== 'REPLACE_DRAFT') throw new Error('수정안 변경을 확인해 주세요.');
        if (operation === 'default') { grid = [...baseline.grid]; events = new Map([...baseline.events].map(([id, event]) => [id, structuredClone(event)])); }
        else {
            const size = validSize(data.size);
            grid = blankGrid(size);
            if (operation === 'blank') events.clear();
            else {
                grid = grid.map((row, y) => [...row].map((tile, x) => x > 0 && y > 0 && x < size - 1 && y < size - 1 ? current.grid[y]?.[x] ?? '1' : tile).join(''));
                for (const [id, e] of events) if (!walkable(e.x, e.y, grid)) events.delete(id);
            }
        }
    } else {
        const { x, y } = data;
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y) || x <= 0 || y <= 0 || x >= grid.length - 1 || y >= grid.length - 1 || (x === 1 && y === 1))
            throw new Error('바깥 테두리와 시작 칸은 변경하실 수 없습니다.');
        const key = tileKey(x, y);
        if (operation === 'wall' || operation === 'passage') {
            const row = [...grid[y]]; row[x] = operation === 'wall' ? '0' : '1'; grid[y] = row.join('');
            if (operation === 'wall') events.delete(key);
        } else if (operation === 'boss') {
            if (!walkable(x, y, grid)) throw new Error('출구로 사용할 통로를 선택해 주세요.');
            for (const e of events.values()) e.boss = false;
            const prior = events.get(key);
            const template = [...initialEvents().values()].find(e => e.boss)!;
            events.set(key, { ...(prior?.kind === 'monster' ? prior : template), id: key, x, y, boss: true, revision: (prior?.revision ?? 0) + 1 });
        } else throw new Error('지원하지 않는 편집 도구입니다.');
    }
    validateLayout({ grid, events });
    return { grid, events };
}
