export type Stats = {
    hp: number;
    attack: number;
    defense: number;
    crit: number;
    critDamage: number;
};
export type StatName = keyof Stats;
export type Profession = 'Searcher' | 'Translater' | 'Buffer' | 'Tracker';
export type EventDefinition = {
    id: string;
    x: number;
    y: number;
    kind: 'choice' | 'text' | 'monster';
    prompt: string;
    choices?: string[];
    answer?: string;
    stats?: Stats;
    boss?: boolean;
    xp: number;
    revision: number;
};
export type CombatStat = Exclude<StatName, 'hp'>;
export type BattleEffect = { kind: 'buff' | 'guard' | 'debuff' | 'steal'; turns: number; amount: number; stat?: CombatStat };
export type Battle = {
    monsterHp: number;
    turn: number;
    cooldowns: { skill1: number; skill2: number };
    effects: BattleEffect[];
    quote?: string;
    log: string[];
};
export type ActiveEvent = {
    definition: EventDefinition;
    from: [
        number,
        number
    ];
    battle?: Battle;
    retryAt?: number;
};
export type Profile = {
    key: string;
    nickname: string;
    x: number;
    y: number;
    level: number;
    xp: number;
    stats: Stats;
    hp: number;
    points: number;
    allocations: StatName[];
    growthRolls: number[];
    profession: Profession | null;
    advanced: boolean;
    visited: string[];
    cleared: string[];
    quizRetries?: Record<string, number>;
    active: ActiveEvent | null;
    startedAt: number;
    finishedAt: number | null;
    savedAt: number;
};
export type Ranking = {
    key: string;
    nickname: string;
    finishedAt: number;
    elapsed: number;
    rank: number;
};
export type Tile = {
    x: number;
    y: number;
    wall: boolean;
    event?: string;
    cleared?: boolean;
};
export type PublicEvent = {
    retryAfterMs?: number;
    playerStats?: Stats;
    id: string;
    kind: EventDefinition['kind'];
    prompt: string;
    choices?: string[];
    boss?: boolean;
    monster?: Omit<Stats, 'hp'> & {
        hpPercent: number;
    };
    battle?: Omit<Battle, 'monsterHp'>;
};
export type Snapshot = {
    mazeSize?: number;
    revision: number;
    admin: boolean;
    customMode: boolean;
    nickname: string;
    x: number;
    y: number;
    level: number;
    xp: number;
    stats: Stats;
    hp: number;
    points: number;
    profession: Profession | null;
    advanced: boolean;
    skillLevel: number;
    tiles: Tile[];
    visited: string[];
    active: PublicEvent | null;
    savedAt: number;
    finishedAt: number | null;
    rank: number | null;
};
export type Monitor = {
    key: string;
    snapshot: Snapshot;
};
export type Command = {
    id: number;
    revision: number;
    action: string;
    data?: Record<string, unknown>;
};
export type CustomMap = {
    grid: string[];
    events: EventDefinition[];
};
