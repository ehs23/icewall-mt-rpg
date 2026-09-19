import type { MotionFrame } from './motion';
import type { Snapshot } from './types';
export type MapGeometry = {
    cx: number;
    cy: number;
    cell: number;
};
export function drawView(canvas: HTMLCanvasElement, p: Snapshot, mini = false, motion?: MotionFrame): MapGeometry {
    const rect = canvas.getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(1, rect.height), ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#050b12';
    ctx.fillRect(0, 0, width, height);
    const cell = mini ? Math.min(width, height) / 4.7 : Math.min(width / 5.4, Math.max(100, height - 160) / 4.8, 100);
    const cx = width / 2, cy = mini ? height / 2 : height / 2 + 10;
    // The fringe intentionally uses generic outlines, never undiscovered wall or event data.
    ctx.strokeStyle = '#17202a';
    ctx.lineWidth = 1;
    for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
            ctx.strokeRect(cx + (dx - 0.5) * cell, cy + (dy - 0.5) * cell, cell, cell);
    const cameraX = motion?.x ?? p.x, cameraY = motion?.y ?? p.y;
    for (const tile of motion?.tiles ?? p.tiles) {
        const x = cx + (tile.x - cameraX - 0.5) * cell, y = cy + (tile.y - cameraY - 0.5) * cell;
        ctx.fillStyle = tile.wall ? '#172535' : '#b5c7c8';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        if (!tile.wall) {
            ctx.fillStyle = '#8caaac';
            ctx.fillRect(x + cell * 0.15, y + cell * 0.86, cell * 0.7, 2);
        }
        if (p.admin && tile.event && !tile.cleared) {
            ctx.fillStyle = tile.event === 'monster' ? '#8e283b' : '#234971';
            ctx.font = `bold ${Math.max(11, cell * 0.23)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tile.event === 'monster' ? '⚔' : tile.event === 'choice' ? '객' : '주', x + cell / 2, y + cell / 2);
        }
    }
    const fog = ctx.createRadialGradient(cx, cy, cell * 1.45, cx, cy, cell * 2.22);
    fog.addColorStop(0, 'rgba(5,11,18,0)');
    fog.addColorStop(0.65, 'rgba(5,11,18,0.90)');
    fog.addColorStop(1, 'rgba(5,11,18,1)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#146e88';
    ctx.beginPath();
    ctx.arc(cx, cy + (motion?.bob ?? 0) * cell, cell * 0.20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c5f4ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    return { cx, cy, cell };
}
export function drawMinimap(canvas: HTMLCanvasElement, p: Snapshot) {
    const width = canvas.clientWidth || 126, ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * ratio;
    canvas.height = width * ratio;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, width);
    const cell = width / 21;
    ctx.fillStyle = '#fff';
    for (const key of p.visited) {
        const [x, y] = key.split(',').map(Number);
        ctx.fillRect(x * cell, y * cell, Math.max(1, cell - 0.4), Math.max(1, cell - 0.4));
    }
    ctx.fillStyle = '#46d8ff';
    ctx.fillRect(p.x * cell, p.y * cell, cell, cell);
}
