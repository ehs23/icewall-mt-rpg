import Phaser from "phaser";
import { Client } from "@colyseus/sdk";
import "./style.css";

type StageId = "plaza" | "forest";
type PlayerData = {
  nickname: string; stage: StageId; x: number; y: number;
  level: number; experience: number; job: string; savedAt: number;
};
type WorldState = {
  online: number;
  players: {
    get(id: string): PlayerData | undefined;
    forEach(callback: (player: PlayerData, id: string) => void): void;
  };
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <section id="login-screen" class="login-screen">
    <form id="login-form" class="login-card">
      <span class="eyebrow">우리들의 RPG</span>
      <h1>모험을 이어가자</h1>
      <p class="login-description">같은 닉네임으로 지난 모험을 이어가.</p>
      <label for="nickname">닉네임</label>
      <input id="nickname" maxlength="24" autocomplete="off"
        placeholder="닉네임 1~12자" required />
      <button id="login-button" type="submit">모험 시작</button>
      <p id="login-status" class="status" role="status" aria-live="polite"></p>
      <small>닉네임만으로 접속하는 테스트 버전이야.</small>
    </form>
  </section>

  <main id="game-screen" class="game-screen" hidden>
    <div id="game"></div>
    <div class="hud" aria-label="게임 정보">
      <section class="hud-stage hud-panel">
        <h1 id="stage-label">접속 중…</h1>
        <span id="population"></span>
      </section>
      <button id="logout" class="hud-logout">저장하고 나가기</button>
      <section class="hud-character hud-panel">
        <strong id="character-name"></strong>
        <span id="character-stats"></span>
        <span id="saved-at">저장 확인 중…</span>
      </section>
      <p id="game-status" class="hud-message" role="status" aria-live="polite">캐릭터를 불러오는 중…</p>
      <div id="touch-pad" class="pad" aria-label="이동 버튼">
        <button data-key="ArrowUp" aria-label="위로 이동">↑</button>
        <div>
          <button data-key="ArrowLeft" aria-label="왼쪽 이동">←</button>
          <button data-key="ArrowDown" aria-label="아래로 이동">↓</button>
          <button data-key="ArrowRight" aria-label="오른쪽 이동">→</button>
        </div>
      </div>
    </div>
  </main>
`;

function element<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}
const loginScreen = element<HTMLElement>("login-screen");
const gameScreen = element<HTMLElement>("game-screen");
const loginForm = element<HTMLFormElement>("login-form");
const nickname = element<HTMLInputElement>("nickname");
const loginButton = element<HTMLButtonElement>("login-button");
const loginStatus = element<HTMLElement>("login-status");
const gameStatus = element<HTMLElement>("game-status");
const logoutButton = element<HTMLButtonElement>("logout");
const stageLabel = element<HTMLElement>("stage-label");
const population = element<HTMLElement>("population");
const savedAtLabel = element<HTMLElement>("saved-at");
const characterName = element<HTMLElement>("character-name");
const characterStats = element<HTMLElement>("character-stats");

// Override VITE_SERVER_URL when deploying. Default also works over a local LAN
// once the development servers are explicitly exposed on that LAN.
const serverUrl = import.meta.env.VITE_SERVER_URL || `http://${location.hostname}:2567`;
const client = new Client(serverUrl);
type ConnectedRoom = Awaited<ReturnType<typeof client.joinOrCreate>>;
let room: ConnectedRoom | undefined;
let game: Phaser.Game | undefined;
let connecting = false;
let loggingOut = false;
let logoutTimer: number | undefined;
let saveError = false;
let savedBeforeError = 0;
let stageNoticeTimer: number | undefined;
const pressed = new Set<string>();

// Keep the drawing surface inside the visible browser area, including when
// a mobile keyboard or address bar changes the available height.
function resizeViewport() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
}
window.addEventListener("resize", resizeViewport);
window.visualViewport?.addEventListener("resize", resizeViewport);
resizeViewport();
const viewportObserver = new ResizeObserver(() => {
  if (gameScreen.hidden || !game?.isBooted) return;
  const bounds = gameScreen.getBoundingClientRect();
  if (bounds.width > 0 && bounds.height > 0) {
    game.scale.resize(Math.round(bounds.width), Math.round(bounds.height));
  }
});
viewportObserver.observe(gameScreen);

const stageName = (stage: StageId) => stage === "forest" ? "바람숲" : "메인 광장";
const currentState = () => room?.state as WorldState | undefined;
const currentPlayer = () => room ? currentState()?.players?.get(room.sessionId) : undefined;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function clearLogoutTimer() {
  if (logoutTimer !== undefined) window.clearTimeout(logoutTimer);
  logoutTimer = undefined;
}

function returnToLogin(message: string) {
  clearLogoutTimer();
  window.clearTimeout(stageNoticeTimer);
  room = undefined;
  pressed.clear();
  loggingOut = false;
  game?.destroy(true);
  game = undefined;
  gameScreen.hidden = true;
  loginScreen.hidden = false;
  loginButton.disabled = false;
  nickname.disabled = false;
  loginStatus.textContent = message;
  nickname.focus();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (connecting || room) return;
  const name = nickname.value.normalize("NFC").trim();
  if (!/^[\p{L}\p{N}_ -]{1,12}$/u.test(name)) {
    loginStatus.textContent = "닉네임은 한글·영문·숫자·공백·밑줄·하이픈으로 1~12자 입력해 줘.";
    return;
  }
  connecting = true;
  loginButton.disabled = true;
  nickname.disabled = true;
  loginStatus.textContent = "캐릭터를 불러오는 중…";
  try {
    const joined = await client.joinOrCreate("world", { nickname: name });
    room = joined;
    loggingOut = false;
    saveError = false;
    pressed.clear();

    joined.onMessage("saveError", (message: string) => {
      if (room !== joined) return;
      saveError = true;
      savedBeforeError = currentPlayer()?.savedAt ?? 0;
      gameStatus.textContent = message;
      loggingOut = false;
      logoutButton.disabled = false;
      clearLogoutTimer();
    });
    joined.onError((errorCode, message) => {
      if (room === joined) gameStatus.textContent = `연결 오류 ${errorCode}: ${message ?? ""}`;
    });
    joined.onLeave((closeCode) => {
      if (room !== joined) return;
      const normalLogout = loggingOut && closeCode === 4000;
      returnToLogin(normalLogout ? "저장했어. 같은 닉네임으로 이어서 할 수 있어."
        : "연결이 종료됐어. 같은 닉네임으로 다시 접속해 줘.");
    });

    loginScreen.hidden = true;
    gameScreen.hidden = false;
    gameStatus.textContent = "캐릭터를 불러오는 중…";
    stageLabel.textContent = "접속 중…";
    logoutButton.disabled = false;
    game = new Phaser.Game({
      type: Phaser.AUTO, parent: "game",
      width: gameScreen.clientWidth, height: gameScreen.clientHeight,
      backgroundColor: "#24384b",
      scale: { mode: Phaser.Scale.RESIZE },
      scene: AdventureScene,
    });
  } catch (error) {
    loginStatus.textContent = `접속 실패: ${errorText(error)}`;
    if (room) {
      const failedRoom = room;
      room = undefined;
      void failedRoom.leave();
      returnToLogin(`화면을 열지 못했어: ${errorText(error)}`);
    }
  } finally {
    connecting = false;
    loginButton.disabled = false;
    nickname.disabled = false;
  }
});

logoutButton.onclick = () => {
  if (!room || loggingOut) return;
  pressed.clear();
  loggingOut = true;
  logoutButton.disabled = true;
  gameStatus.textContent = "캐릭터를 저장하는 중…";
  try {
    room.send("move", { x: 0, y: 0 });
    room.send("logout");
    logoutTimer = window.setTimeout(() => {
      loggingOut = false;
      logoutButton.disabled = false;
      gameStatus.textContent = "저장 응답이 늦어지고 있어. 연결을 확인하고 다시 눌러 줘.";
    }, 10000);
  } catch (error) {
    loggingOut = false;
    logoutButton.disabled = false;
    gameStatus.textContent = `연결을 확인해 줘: ${errorText(error)}`;
  }
};

const movementKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyW", "KeyA", "KeyS", "KeyD"]);
window.addEventListener("keydown", (event) => {
  if (!room || loggingOut || !movementKeys.has(event.code)) return;
  if (event.target instanceof HTMLInputElement) return;
  event.preventDefault();
  pressed.add(event.code);
});
window.addEventListener("keyup", (event) => pressed.delete(event.code));
function releaseMovement() {
  pressed.clear();
  try { room?.send("move", { x: 0, y: 0 }); } catch { /* Disconnect callback handles UI. */ }
}
window.addEventListener("blur", releaseMovement);
document.addEventListener("visibilitychange", () => { if (document.hidden) releaseMovement(); });
document.querySelectorAll<HTMLButtonElement>("[data-key]").forEach((button) => {
  const key = button.dataset.key!;
  button.onpointerdown = (event) => {
    if (!room || loggingOut) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pressed.add(key);
  };
  button.onpointerup = () => pressed.delete(key);
  button.onpointercancel = () => pressed.delete(key);
  button.onlostpointercapture = () => pressed.delete(key);
});

class AdventureScene extends Phaser.Scene {
  private avatars = new Map<string, Phaser.GameObjects.Container>();
  private scenery?: Phaser.GameObjects.Container;
  private displayedStage?: StageId;
  private lastSent = 0;

  create() {
    this.game.canvas.setAttribute("aria-label", "RPG 게임 지도. 방향키나 WASD로 이동할 수 있어.");
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    });
  }

  private fitCamera() {
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const camera = this.cameras.main;
    // Server coordinates stay 800 x 600. Cover the viewport without stretching
    // avatars; on narrow screens the camera follows the player across the map.
    camera.setViewport(0, 0, width, height);
    camera.setZoom(Math.max(width / 800, height / 600));
    camera.setBounds(0, 0, 800, 600);
    const own = currentPlayer();
    camera.centerOn(own?.x ?? 400, own?.y ?? 300);
  }

  private drawStage(stage: StageId) {
    this.cameras.main.stopFollow();
    this.scenery?.destroy();
    for (const avatar of this.avatars.values()) avatar.destroy();
    this.avatars.clear();
    this.displayedStage = stage;
    pressed.clear();
    const forest = stage === "forest";
    this.cameras.main.setBackgroundColor(forest ? "#173e32" : "#283b4d");
    this.scenery = this.add.container(0, 0).setDepth(-10);
    const ground = this.add.graphics();
    ground.lineStyle(1, forest ? 0x24503c : 0x354b5e, 0.8);
    for (let x = 0; x <= 800; x += 40) ground.lineBetween(x, 0, x, 600);
    for (let y = 0; y <= 600; y += 40) ground.lineBetween(0, y, 800, y);
    ground.fillStyle(forest ? 0x77684a : 0x64758a);
    ground.fillRect(forest ? 0 : 330, 260, forest ? 460 : 470, 80);
    ground.fillStyle(forest ? 0x365d3e : 0x465d74);
    ground.fillCircle(400, 300, 90);
    ground.lineStyle(3, forest ? 0x597f51 : 0x8298af);
    ground.strokeCircle(400, 300, 90);
    ground.fillStyle(0x91efbe, 0.85);
    ground.fillRect(forest ? 0 : 768, 260, 32, 80);
    this.scenery.add(ground);
    const portal = this.add.text(forest ? 90 : 710, 235,
      forest ? "← 광장으로" : "숲으로 →", {
        fontFamily: "sans-serif", fontSize: "18px", color: "#d8ffe7",
      }).setOrigin(0.5);
    this.scenery.add(portal);
    stageLabel.textContent = stageName(stage);
    if (!loggingOut && !saveError) {
      const message = `${stageName(stage)}에 도착했어.`;
      gameStatus.textContent = message;
      window.clearTimeout(stageNoticeTimer);
      stageNoticeTimer = window.setTimeout(() => {
        if (gameStatus.textContent === message) gameStatus.textContent = "";
      }, 2500);
    }
  }

  update(time: number, delta: number) {
    const activeRoom = room;
    const state = currentState();
    const own = currentPlayer();
    if (!activeRoom || !own || !state) return;
    if (this.displayedStage !== own.stage) this.drawStage(own.stage);
    const present = new Set<string>();
    state.players.forEach((player, id) => {
      // Server StateView already filters; this also prevents transition flashes.
      if (player.stage !== own.stage) return;
      present.add(id);
      let avatar = this.avatars.get(id);
      if (!avatar) {
        const self = id === activeRoom.sessionId;
        const body = this.add.circle(0, 0, 14, self ? 0xa3f5b5 : 0x8bbcff)
          .setStrokeStyle(2, 0xffffff);
        const label = this.add.text(0, -32, player.nickname, {
          fontFamily: "sans-serif", fontSize: "15px", color: "#ffffff",
          backgroundColor: "#142333", padding: { x: 5, y: 3 },
        }).setOrigin(0.5);
        avatar = this.add.container(player.x, player.y, [body, label]);
        this.avatars.set(id, avatar);
        if (self) this.cameras.main.startFollow(avatar, false, 1, 1);
      }
      const blend = 1 - Math.exp(-delta / 45);
      avatar.x += (player.x - avatar.x) * blend;
      avatar.y += (player.y - avatar.y) * blend;
    });
    for (const [id, avatar] of this.avatars) {
      if (!present.has(id)) { avatar.destroy(); this.avatars.delete(id); }
    }
    characterName.textContent = own.nickname;
    characterStats.textContent = `Lv. ${own.level} · ${own.job} · 경험치 ${own.experience}`;
    population.textContent = `현재 ${present.size}명 · 전체 ${state.online}/15`;
    savedAtLabel.textContent = saveError ? "저장 실패 · 재시도 중" :
      `마지막 저장 ${new Date(own.savedAt).toLocaleTimeString("ko-KR")}`;
    if (saveError && own.savedAt > savedBeforeError) {
      saveError = false;
      gameStatus.textContent = "캐릭터가 다시 정상적으로 저장되고 있어.";
    }
    if (time - this.lastSent < 50) return;
    this.lastSent = time;
    const right = pressed.has("ArrowRight") || pressed.has("KeyD");
    const left = pressed.has("ArrowLeft") || pressed.has("KeyA");
    const down = pressed.has("ArrowDown") || pressed.has("KeyS");
    const up = pressed.has("ArrowUp") || pressed.has("KeyW");
    try {
      activeRoom.send("move", loggingOut ? { x: 0, y: 0 } :
        { x: Number(right) - Number(left), y: Number(down) - Number(up) });
    } catch {
      pressed.clear();
      gameStatus.textContent = "서버 연결을 확인하는 중…";
    }
  }
}

nickname.focus();
