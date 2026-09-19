import type { EventDefinition, Profile, Tile } from './types.js';
export const MAX_PLAYERS = 20;
export const SIZE = 23;
const ORIGINAL_GRID = [
    '000000000000000000000', '011101110111111111110', '000101010000000000010',
    '010111011111111101110', '010000000000000101000', '011111011111110101110',
    '010000010100000101010', '010111110111111101010', '010100000000000001010',
    '010111110111111101010', '010000010100000001010', '011111110111011111010',
    '010000000001010000010', '011111011101111101110', '000001010100000001010',
    '011111010111110111010', '010000010000010100010', '011101110111110101110',
    '000101000100000101000', '011111011111111101110', '000000000000000000000',
];
// Preserve every existing tile. The extension is a side branch, not a shortcut to the boss.
export const LEGACY_GRID = Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) =>
    ORIGINAL_GRID[y]?.[x] === '1' || (x === 21 && y >= 1 && y <= 21) ||
    (y === 21 && x >= 1 && x <= 21) || (x === 20 && y === 9) ? '1' : '0').join(''));
export const GRID = [
    "00000000000000000000000",
    "01011111011101111101110",
    "01000101010101010001010",
    "01110101110111011111010",
    "00010100000000000000010",
    "01010101110111111101110",
    "01010001010100000101000",
    "01011111011101111101110",
    "01000000000001000000010",
    "01110111111101110111110",
    "01010100000100010100010",
    "01010111110111011101010",
    "01000001000100000001010",
    "01110111011101111111110",
    "00010100010001000000000",
    "01110101011111011101110",
    "01010101000000010100010",
    "01010101111111110111110",
    "01000101000001010000010",
    "01011101011101011101110",
    "01010000010100000101000",
    "01111111110111111101110",
    "00000000000000000000000"
];
export const tileKey = (x: number, y: number) => `${x},${y}`;
export const walkable = (x: number, y: number, grid = GRID) => Number.isInteger(x) && Number.isInteger(y) && grid[y]?.[x] === '1';
export function visibleTiles(p: Profile, events: Map<string, EventDefinition>, showEvents = false, grid = GRID): Tile[] {
    const tiles: Tile[] = [];
    for (let y = p.y - 1; y <= p.y + 1; y++)
        for (let x = p.x - 1; x <= p.x + 1; x++) {
            const event = events.get(tileKey(x, y));
            const tile: Tile = { x, y, wall: !walkable(x, y, grid) };
            if (showEvents && event) { tile.event = event.kind; tile.cleared = p.cleared.includes(event.id); }
            tiles.push(tile);
        }
    return tiles;
}
