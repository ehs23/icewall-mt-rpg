import { DatabaseSync } from 'node:sqlite';
import { validateLayout, type Layout } from './layout.js';
// Update only the restoration preset; never initialize or migrate game data here.
export function saveDefaultPreset(filename: string, layout: Layout) {
    validateLayout(layout);
    const db = new DatabaseSync(filename);
    try {
        db.exec('PRAGMA busy_timeout=3000');
        db.prepare("INSERT INTO maze_metadata_v1 VALUES ('default_layout_v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .run(JSON.stringify({ grid: layout.grid, events: [...layout.events.values()] }));
    } finally { db.close(); }
}
