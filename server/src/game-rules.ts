export type StageId = "plaza" | "forest";
export type Position = { stage: StageId; x: number; y: number };
export type Direction = { x: number; y: number };

export const MAX_PLAYERS = 15;
export const MAP_WIDTH = 800;
export const MAP_HEIGHT = 600;

export function nicknameIdentity(value: unknown) {
  if (typeof value !== "string") throw new Error("닉네임을 입력해 줘.");
  const nickname = value.normalize("NFC").trim();
  if (!/^[\p{L}\p{N}_ -]{1,12}$/u.test(nickname)) {
    throw new Error("닉네임은 한글·영문·숫자·공백·밑줄·하이픈으로 1~12자 입력해 줘.");
  }
  return { nickname, key: nickname.toLowerCase() };
}

export function parseDirection(value: unknown): Direction | undefined {
  if (!value || typeof value !== "object") return;
  const { x, y } = value as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number" ||
      !Number.isFinite(x) || !Number.isFinite(y)) return;
  // Clamp before normalization so even extremely large numbers remain safe.
  const dx = Math.max(-1, Math.min(1, x));
  const dy = Math.max(-1, Math.min(1, y));
  const length = Math.max(1, Math.hypot(dx, dy));
  return { x: dx / length, y: dy / length };
}

export function safePosition(value: { stage: string; x: number; y: number }): Position {
  return {
    stage: value.stage === "forest" ? "forest" : "plaza",
    x: Number.isFinite(value.x) ? Math.max(20, Math.min(780, value.x)) : 400,
    y: Number.isFinite(value.y) ? Math.max(45, Math.min(575, value.y)) : 300,
  };
}

export function stepPosition(position: Position, direction: Direction, dt: number,
  portalReady: boolean): { position: Position; changedStage: boolean } {
  const distance = 200 * Math.max(0, Math.min(100, dt)) / 1000;
  const next = safePosition({
    stage: position.stage,
    x: position.x + direction.x * distance,
    y: position.y + direction.y * distance,
  });
  const onRoad = next.y >= 260 && next.y <= 340;
  if (portalReady && onRoad && next.stage === "plaza" && next.x >= 768 && direction.x > 0) {
    return { position: { stage: "forest", x: 85, y: 300 }, changedStage: true };
  }
  if (portalReady && onRoad && next.stage === "forest" && next.x <= 32 && direction.x < 0) {
    return { position: { stage: "plaza", x: 715, y: 300 }, changedStage: true };
  }
  return { position: next, changedStage: false };
}
