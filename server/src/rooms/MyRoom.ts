import { Room, type Client } from "colyseus";
import { Schema, MapSchema, StateView, type, view } from "@colyseus/schema";
import { fileURLToPath } from "node:url";
import { CharacterStore, type CharacterRecord } from "../character-store.js";
import { MAX_PLAYERS, nicknameIdentity, parseDirection, safePosition,
  stepPosition, type Direction, type StageId } from "../game-rules.js";

class Player extends Schema {
  @type("string") nickname = "";
  @type("string") stage = "plaza";
  @type("number") x = 400;
  @type("number") y = 300;
  @type("number") level = 1;
  @type("number") experience = 0;
  @type("string") job = "무직";
  @type("number") savedAt = 0;
}

class WorldState extends Schema {
  @view() @type({ map: Player }) players = new MapSchema<Player>();
  @type("number") online = 0;
}

const store = new CharacterStore(process.env.CHARACTER_DB_PATH ||
  fileURLToPath(new URL("../../data/characters.sqlite", import.meta.url)));

// One process hosts one shared world. The full world must not overflow into
// another independent room when joinOrCreate receives a sixteenth player.
let activeWorld: MyRoom | undefined;

type Session = {
  record: CharacterRecord;
  direction: Direction;
  receivedAt: number;
  nextPortalAt: number;
};

export class MyRoom extends Room {
  maxClients = MAX_PLAYERS;
  maxMessagesPerSecond = 60;
  state = new WorldState();
  private characterSessions = new Map<string, Session>();

  onCreate() {
    if (activeWorld) throw new Error("현재 서버 정원 15명이 모두 접속 중이야. 잠시 후 다시 접속해 줘.");
    activeWorld = this;

    this.onMessage("move", (client, payload: unknown) => {
      const session = this.characterSessions.get(client.sessionId);
      const direction = parseDirection(payload);
      if (!session || !direction) return;
      session.direction = direction;
      session.receivedAt = Date.now();
    });

    this.onMessage("logout", (client) => {
      if (!this.saveCharacters([client.sessionId])) return;
      // Only close the connection after the database commit succeeds.
      client.leave(4000);
    });

    this.setSimulationInterval((dt) => this.movePlayers(dt), 1000 / 30);
    this.clock.setInterval(() => this.saveCharacters(), 30000);
  }

  onAuth(_client: Client, options: { nickname?: unknown } = {}) {
    const identity = nicknameIdentity(options.nickname);
    for (const session of this.characterSessions.values()) {
      if (session.record.nicknameKey === identity.key) {
        throw new Error("이 닉네임은 이미 접속 중이야. 기존 화면에서 로그아웃해 줘.");
      }
    }
    return identity;
  }

  onJoin(client: Client) {
    const identity = client.auth as { nickname: string; key: string };
    // Recheck at admission, since simultaneous auth requests can both pass.
    for (const session of this.characterSessions.values()) {
      if (session.record.nicknameKey === identity.key) {
        throw new Error("이 닉네임은 이미 접속 중이야.");
      }
    }
    const record = store.getOrCreate(identity.key, identity.nickname);
    const player = new Player();
    Object.assign(player, safePosition(record), {
      nickname: record.nickname, level: record.level,
      experience: record.experience, job: record.job, savedAt: record.updatedAt,
    });
    this.characterSessions.set(client.sessionId, {
      record, direction: { x: 0, y: 0 }, receivedAt: 0, nextPortalAt: Date.now() + 1000,
    });
    this.state.players.set(client.sessionId, player);
    client.view = new StateView();
    client.view.add(player);
    this.state.online = this.state.players.size;
    this.refreshStageViews();
  }

  private refreshStageViews() {
    for (const client of this.clients) {
      const own = this.state.players.get(client.sessionId);
      if (!own || !client.view) continue;
      this.state.players.forEach((other) => {
        const visible = own.stage === other.stage;
        if (visible && !client.view!.has(other)) client.view!.add(other);
        if (!visible && client.view!.has(other)) client.view!.remove(other);
      });
    }
  }

  private movePlayers(dt: number) {
    const now = Date.now();
    this.state.players.forEach((player, id) => {
      const session = this.characterSessions.get(id);
      if (!session || now - session.receivedAt > 300) return;
      const result = stepPosition({ stage: player.stage as StageId, x: player.x, y: player.y },
        session.direction, dt, now >= session.nextPortalAt);
      Object.assign(player, result.position);
      if (result.changedStage) {
        session.nextPortalAt = now + 1000;
        session.direction = { x: 0, y: 0 };
        this.refreshStageViews();
        this.saveCharacters([id]);
      }
    });
  }

  private saveCharacters(ids = [...this.characterSessions.keys()]): boolean {
    const records: CharacterRecord[] = [];
    for (const id of ids) {
      const session = this.characterSessions.get(id);
      const player = this.state.players.get(id);
      if (!session || !player) continue;
      records.push({ ...session.record, stage: player.stage, x: player.x, y: player.y,
        level: player.level, experience: player.experience, job: player.job });
    }
    if (!records.length) return true;
    try {
      const savedAt = store.saveMany(records);
      for (const id of ids) {
        const player = this.state.players.get(id);
        if (player) player.savedAt = savedAt;
      }
      return true;
    } catch (error) {
      console.error("Character save failed:", error);
      for (const client of this.clients) {
        if (ids.includes(client.sessionId)) client.send("saveError",
          "저장에 실패했어. 서버 저장 공간을 확인하고 다시 시도해 줘.");
      }
      return false;
    }
  }

  onLeave(client: Client) {
    this.saveCharacters([client.sessionId]);
    const player = this.state.players.get(client.sessionId);
    if (player) {
      for (const other of this.clients) {
        if (other.view?.has(player)) other.view.remove(player);
      }
    }
    this.state.players.delete(client.sessionId);
    this.characterSessions.delete(client.sessionId);
    this.state.online = this.state.players.size;
  }

  onBeforeShutdown() {
    this.saveCharacters();
    return this.disconnect();
  }

  onDispose() {
    this.saveCharacters();
    if (activeWorld === this) activeWorld = undefined;
  }
}
