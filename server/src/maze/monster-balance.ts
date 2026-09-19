import { GRID } from './maze.js';
import type { EventDefinition, Stats } from './types.js';
// Balanced HP/attack/defense investment is the reference; unusual builds can respec.
// Boss and advanced skills retain their specified effects; monsters never scale per player.
const TIERS: [number, Stats][] = [
    [7, { hp: 90, attack: 18, defense: 6, crit: 0, critDamage: 100 }],
    [12, { hp: 180, attack: 36, defense: 12, crit: 4, critDamage: 115 }],
    [18, { hp: 310, attack: 62, defense: 18, crit: 6, critDamage: 120 }],
    [25, { hp: 460, attack: 90, defense: 22, crit: 8, critDamage: 125 }],
    [28, { hp: 540, attack: 110, defense: 26, crit: 10, critDamage: 130 }],
    [50, { hp: 850, attack: 175, defense: 55, crit: 15, critDamage: 150 }],
];
export function rebalanceMonsters(events: Map<string, EventDefinition>) {
    const parents = new Map<string, string>([['1,1', '']]);
    const queue: [number, number][] = [[1, 1]];
    for (const [x, y] of queue) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
        if (GRID[ny]?.[nx] === '1' && !parents.has(key)) { parents.set(key, `${x},${y}`); queue.push([nx, ny]); }
    }
    for (const e of events.values()) {
        if (e.kind !== 'monster') continue;
        let xp = 0, at = parents.get(`${e.x},${e.y}`);
        while (at) { xp += events.get(at)?.xp ?? 0; at = parents.get(at); }
        const level = Math.min(50, 1 + Math.floor(xp / 100));
        const upper = TIERS.findIndex(([l]) => l >= level);
        const [hiLevel, hi] = TIERS[upper < 0 ? TIERS.length - 1 : upper];
        const [loLevel, lo] = upper <= 0 ? [1, { hp: 12, attack: 3, defense: 0, crit: 0, critDamage: 100 }] : TIERS[upper - 1];
        const ratio = Math.max(0, Math.min(1, (level - loLevel) / Math.max(1, hiLevel - loLevel)));
        const stats = {} as Stats;
        for (const key of ['hp', 'attack', 'defense', 'crit', 'critDamage'] as const) stats[key] = Math.round(lo[key] + (hi[key] - lo[key]) * ratio);
        if (e.boss) {
            stats.hp = Math.min(999, Math.max(650, Math.round(stats.hp * 1.2)));
            stats.attack = Math.min(199, Math.max(120, stats.attack + 10));
            stats.defense = Math.max(28, stats.defense);
        }
        e.stats = stats;
    }
    return events;
}
