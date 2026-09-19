import type { MapGeometry } from './vision';
import type { Snapshot } from './types';
import type { Send } from './ui';
export function bindControls(canvas: HTMLCanvasElement, getState: () => Snapshot | undefined, getGeometry: () => MapGeometry, isBusy: () => boolean, send: Send) {
    let press: {
        id: number;
        x: number;
        y: number;
        tileX: number;
        tileY: number;
        long: boolean;
    } | undefined;
    let timer: number | undefined;
    const clear = () => { window.clearTimeout(timer); press = undefined; };
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
        if (press || isBusy() || e.button !== 0)
            return;
        const p = getState();
        if (!p)
            return;
        const rect = canvas.getBoundingClientRect(), g = getGeometry();
        const x = p.x + Math.floor((e.clientX - rect.left - g.cx) / g.cell + 0.5), y = p.y + Math.floor((e.clientY - rect.top - g.cy) / g.cell + 0.5);
        press = { id: e.pointerId, x: e.clientX, y: e.clientY, tileX: x, tileY: y, long: false };
        canvas.setPointerCapture(e.pointerId);
        if (p.admin)
            timer = window.setTimeout(() => { if (press) {
                press.long = true;
                send('admin.edit', { x, y });
            } }, 600);
    });
    canvas.addEventListener('pointermove', e => { if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12)
        clear(); });
    canvas.addEventListener('pointerup', e => {
        const saved = press;
        if (!saved || saved.id !== e.pointerId)
            return;
        clear();
        const p = getState();
        if (!p || saved.long || isBusy() || p.active)
            return;
        if (Math.abs(saved.tileX - p.x) + Math.abs(saved.tileY - p.y) === 1)
            send('move', { x: saved.tileX, y: saved.tileY });
    });
    canvas.addEventListener('pointercancel', clear);
    canvas.addEventListener('lostpointercapture', clear);
    window.addEventListener('blur', clear);
}
