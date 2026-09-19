import type { EventDefinition, Profile, Tile } from './types.js';
export const MAX_PLAYERS = 20;
export const SIZE = 21;
export const GRID = [
    '000000000000000000000', '011101110111111111110', '000101010000000000010',
    '010111011111111101110', '010000000000000101000', '011111011111110101110',
    '010000010100000101010', '010111110111111101010', '010100000000000001010',
    '010111110111111101010', '010000010100000001010', '011111110111011111010',
    '010000000001010000010', '011111011101111101110', '000001010100000001010',
    '011111010111110111010', '010000010000010100010', '011101110111110101110',
    '000101000100000101000', '011111011111111101110', '000000000000000000000',
];
export const tileKey = (x: number, y: number) => `${x},${y}`;
export const walkable = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && GRID[y]?.[x] === '1';
export function visibleTiles(p: Profile, events: Map<string, EventDefinition>, showEvents = false): Tile[] {
    const tiles: Tile[] = [];
    for (let y = p.y - 1; y <= p.y + 1; y++)
        for (let x = p.x - 1; x <= p.x + 1; x++) {
            const event = events.get(tileKey(x, y));
            const tile: Tile = { x, y, wall: !walkable(x, y) };
            if (showEvents && event) { tile.event = event.kind; tile.cleared = p.cleared.includes(event.id); }
            tiles.push(tile);
        }
    return tiles;
}
