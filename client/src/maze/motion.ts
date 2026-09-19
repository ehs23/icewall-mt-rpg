import type { Snapshot, Tile } from './types';
export type MotionFrame = {
    x: number;
    y: number;
    bob: number;
    tiles: Tile[];
};
// Only the main view owns this short-lived loop. Monitoring cards stay synchronous.
export class MovementMotion {
    private frameId = 0;
    private current: MotionFrame | undefined;
    get frame() { return this.current; }
    get running() { return this.current !== undefined; }
    stop() {
        cancelAnimationFrame(this.frameId);
        this.current = undefined;
    }
    start(from: Snapshot, to: Snapshot, draw: () => void, done: () => void) {
        this.stop();
        if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) !== 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            done();
            return;
        }
        const tiles = new Map(from.tiles.map(tile => [`${tile.x},${tile.y}`, tile]));
        to.tiles.forEach(tile => tiles.set(`${tile.x},${tile.y}`, tile));
        const visible = [...tiles.values()];
        const started = performance.now();
        this.current = { x: from.x, y: from.y, bob: 0, tiles: visible };
        const step = (time: number) => {
            const t = Math.min(1, (time - started) / 220);
            const eased = t * t * (3 - 2 * t);
            this.current = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased, bob: Math.sin(t * Math.PI * 2) * 0.045, tiles: visible };
            draw();
            if (t < 1)
                this.frameId = requestAnimationFrame(step);
            else {
                this.current = undefined;
                done();
            }
        };
        this.frameId = requestAnimationFrame(step);
    }
}
