import type { Profession, Snapshot } from './types';
export const SECOND_JOBS: Record<Profession, string> = {
    Searcher: 'Webhacking', Translater: 'Reversing', Buffer: 'Pwnable', Tracker: 'Forensic',
};
export function availablePromotion(p: Pick<Snapshot, 'level'|'profession'|'advanced'>): 0|1|2 {
    if (p.level >= 10 && !p.profession) return 1;
    if (p.level >= 25 && p.profession && !p.advanced) return 2;
    return 0;
}
export function professionLabel(p: Pick<Snapshot, 'level'|'profession'|'advanced'>): string {
    if (p.level < 10 || !p.profession) return '전직 전';
    return p.level >= 25 && p.advanced ? SECOND_JOBS[p.profession] : p.profession;
}
