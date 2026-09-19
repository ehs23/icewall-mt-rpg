import { BattleMotion, acceptedBattle, type BattleIntent } from './maze/battle-motion';
import { availablePromotion, professionLabel } from './maze/professions';
import { installQuizFit } from './maze/quiz-fit';
import { installPagination } from './maze/pagination';
import { MovementMotion } from './maze/motion';
import { customModeView } from './maze/custom-mode';
import { Client } from '@colyseus/sdk';
import './style.css';
import type { CustomMap, Monitor, Ranking, Snapshot } from './maze/types';
import { closeable, node, type Send } from './maze/ui';
import { drawMinimap, drawView, type MapGeometry } from './maze/vision';
import { bindControls } from './maze/controls';
import { renderEvent } from './maze/event-screen';
import { characterPanel } from './maze/character';
import { adminStats, eventEditor, monitoringPanel, type EditorData } from './maze/admin';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
 <section id="login-screen"><form id="login-form" class="login-card">
  <span class="eyebrow">MAZE / QUIZ / BATTLE</span><h1>미로의 끝을 향해</h1><p>같은 닉네임으로 지난 탐험을 이어가실 수 있습니다.</p>
  <label class="field">닉네임<input id="nickname" maxlength="12" autocomplete="username" required placeholder="닉네임을 입력해 주세요." /></label>
  <label class="field" id="password-field" hidden>운영자 비밀번호<input id="password" type="password" maxlength="128" autocomplete="current-password" /></label>
  <button id="login-button" type="submit">탐험 시작</button><p id="login-status" role="status" aria-live="polite"></p>
 </form></section>
 <main id="game-screen" hidden>
  <canvas id="world" aria-label="주변 칸을 클릭하거나 터치하여 이동하는 미로"></canvas>
  <div class="top-left hud"><strong id="identity"></strong><span id="location"></span><span id="save-time"></span></div>
  <div class="top-right hud"><canvas id="minimap" aria-label="지나온 칸만 표시하는 지도"></canvas><span>탐험 지도</span></div>
  <div class="bottom-hud"><div><strong id="health"></strong><span id="job"></span></div><div class="toolbar"><button id="character">능력치·전직</button><button id="watch" hidden>플레이어 관찰</button><button id="admin-stats" hidden>운영자 설정</button><button id="custom-mode" hidden>미로 커스텀</button><button id="reset-maze" hidden>전체 초기화</button><button id="logout">저장하고 나가기</button></div></div>
  <div id="events"></div><div id="dialogs"></div><div id="finish"></div>
  <p id="notice" role="status" aria-live="polite" hidden></p>
 </main>`;
installPagination(app);
installQuizFit(app);
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const login = el<HTMLElement>('login-screen'), game = el<HTMLElement>('game-screen'), world = el<HTMLCanvasElement>('world'), minimap = el<HTMLCanvasElement>('minimap');
const nickname = el<HTMLInputElement>('nickname'), password = el<HTMLInputElement>('password');
// Production serves the page and WebSocket endpoint through the same HTTPS host.
const url = import.meta.env.VITE_SERVER_URL || (import.meta.env.PROD
    ? location.origin
    : `${location.protocol}//${location.hostname}:2567`);
const client = new Client(url);
type ConnectedRoom = Awaited<ReturnType<typeof client.joinOrCreate>>;
let room: ConnectedRoom | undefined, state: Snapshot | undefined, geometry: MapGeometry = { cx: 0, cy: 0, cell: 1 };
const motion = new MovementMotion();
const battleMotion = new BattleMotion();
let battleIntent: BattleIntent | undefined;
let queuedBattleSnapshot: Snapshot | undefined;
let battlePresentationGeneration = 0;
let battlePresentationPending = false;
function cancelBattlePresentation() {
    battlePresentationGeneration++;
    battlePresentationPending = false;
    battleIntent = undefined;
    queuedBattleSnapshot = undefined;
    battleMotion.cancel();
}
let customData: CustomMap | undefined;
let customView: ReturnType<typeof customModeView> | undefined;
let nextSendAt = 0;
let connecting = false, pending: number | null = null, sequence = 0, commandTimer: number | undefined, noticeTimer: number | undefined, eventSignature = '', dialog: 'stats' | 'editor' | 'adminStats' | null = null;
let monitor: ReturnType<typeof monitoringPanel> | undefined;
const observed = new Map<string, Monitor>();
let rankings: Ranking[] = [];
let finishShown: number | null = null;
let noticeFade: Animation | undefined;
let promotionNoticeActive = false;
let deferredNotice: string | undefined;
function showNotice(message: string, promotion = false) {
    if (promotionNoticeActive && !promotion) { deferredNotice = message; return; }
    promotionNoticeActive = promotion;
    const area = el<HTMLElement>('notice');
    window.clearTimeout(noticeTimer);
    noticeFade?.cancel();
    noticeFade = undefined;
    area.textContent = message;
    area.hidden = false;
    noticeTimer = window.setTimeout(() => {
        const fade = area.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 300, easing: 'ease-out', fill: 'forwards',
        });
        noticeFade = fade;
        fade.onfinish = () => {
            if (noticeFade !== fade) return;
            area.hidden = true;
            fade.cancel();
            noticeFade = undefined;
            promotionNoticeActive = false;
            const next = deferredNotice;
            deferredNotice = undefined;
            if (next) showNotice(next);
        };
    }, 2000);
}
function draw() {
    if (state && !game.hidden && !monitor) {
        if (state.customMode)
            return;
        geometry = drawView(world, state, false, motion.frame);
        drawMinimap(minimap, state);
    }
}
function closeDialog() { dialog = null; el('dialogs').replaceChildren(); }
function closeMonitor() { monitor?.destroy(); monitor = undefined; game.classList.remove('has-monitor'); draw(); }
function clean(message: string) {
    cancelBattlePresentation();
    promotionNoticeActive = false;
    deferredNotice = undefined;
    window.clearTimeout(noticeTimer);
    noticeFade?.cancel();
    noticeFade = undefined;
    el('notice').hidden = true;
    motion.stop();
    customView?.destroy();
    customView = undefined;
    customData = undefined;
    room = undefined;
    state = undefined;
    pending = null;
    window.clearTimeout(commandTimer);
    closeDialog();
    closeMonitor();
    observed.clear();
    rankings = [];
    eventSignature = '';
    finishShown = null;
    sequence = 0;
    el('events').replaceChildren();
    el('finish').replaceChildren();
    game.hidden = true;
    login.hidden = false;
    el('login-status').textContent = message;
    el<HTMLButtonElement>('login-button').disabled = false;
    connecting = false;
}
const send: Send = (action, data = {}) => {
    if (!room || !state || pending !== null || motion.running || battlePresentationPending || Date.now() < nextSendAt)
        return;
    nextSendAt = Date.now() + (action === 'battle' ? 460 : action === 'answer' ? 810 : 190);
    const id = ++sequence;
    pending = id;
    if (action === 'battle' && state.active?.battle && ['attack', 'skill1', 'skill2'].includes(String(data.action))) {
        battleIntent = { before: state, action: data.action as BattleIntent['action'], stat: typeof data.stat === 'string' ? data.stat : undefined };
    }
    room.send('command', { id, revision: state.revision, action, data });
    // Never resend a timed-out mutation: reconnect loads the committed server result.
    window.clearTimeout(commandTimer);
    commandTimer = window.setTimeout(() => {
        if (pending === id) {
            showNotice('서버 응답을 기다리고 있습니다. 연결이 끊기면 같은 닉네임으로 다시 접속해 주세요.');
        }
    }, 8000);
};
function update(p: Snapshot) {
    if (battlePresentationPending) {
        if (!queuedBattleSnapshot || p.revision >= queuedBattleSnapshot.revision) queuedBattleSnapshot = p;
        return;
    }
    if (battleIntent && acceptedBattle(battleIntent, p)) {
        const intent = battleIntent;
        battleIntent = undefined;
        queuedBattleSnapshot = p;
        battlePresentationPending = true;
        const generation = battlePresentationGeneration;
        void battleMotion.play(el('events'), intent, p).catch(() => {}).finally(() => {
            if (generation !== battlePresentationGeneration) return;
            battlePresentationPending = false;
            const latest = queuedBattleSnapshot;
            queuedBattleSnapshot = undefined;
            if (room && latest) update(latest);
        });
        return;
    }
    const previous = state;
    state = p;
    const promotion = availablePromotion(p);
    if (promotion && (!previous || promotion !== availablePromotion(previous)))
        showNotice(`${promotion}차 전직을 할 수 있습니다. 능력치 창을 열어 주세요.`, true);
    el('character').textContent = p.level < 10 ? '능력치' : '능력치·전직';
    if (previous && !p.customMode && !previous.customMode && Math.abs(previous.x - p.x) + Math.abs(previous.y - p.y) === 1) {
        motion.start(previous, p, draw, () => { if (state)
            update(state); });
    }
    if (p.customMode) {
        motion.stop();
        closeMonitor();
        if (customData && !customView) {
            customView = customModeView(customData, send, resetMaze);
            game.append(customView.root);
        }
        el('events').hidden = true;
    }
    else {
        customView?.destroy();
        customView = undefined;
        el('events').hidden = motion.running;
    }
    el('identity').textContent = `${p.nickname} · Lv.${p.level}${p.admin ? ' · 운영자' : ''}`;
    el('location').textContent = `미로 · ${p.x + 1}열 ${p.y + 1}행`;
    el('save-time').textContent = p.savedAt ? `저장 ${new Date(p.savedAt).toLocaleTimeString('ko-KR')}` : '저장 대기 중입니다.';
    el('health').textContent = `체력 ${p.hp} / ${p.stats.hp}`;
    el('job').textContent = `${professionLabel(p)} · 포인트 ${p.points}`;
    el('watch').hidden = !p.admin;
    el('admin-stats').hidden = !p.admin;
    el('custom-mode').hidden = !p.admin;
    el('reset-maze').hidden = !p.admin;
    const signature = p.active ? JSON.stringify([p.active, p.active.kind === 'monster' ? [p.hp, p.stats, p.profession, p.advanced, p.skillLevel] : null]) : '';
    if (!motion.running && signature !== eventSignature) {
        eventSignature = signature;
        el('events').replaceChildren(...(p.active ? [renderEvent(p, send)] : []));
    }
    if (dialog === 'stats' && JSON.stringify([previous?.stats, previous?.points, previous?.profession, previous?.advanced, previous?.level]) !== JSON.stringify([p.stats, p.points, p.profession, p.advanced, p.level]))
        el('dialogs').replaceChildren(characterPanel(p, send, closeDialog));
    if (dialog === 'adminStats' && previous && (previous.level !== p.level || previous.profession !== p.profession || previous.advanced !== p.advanced))
        el('dialogs').replaceChildren(adminStats(p, send, closeDialog));
    if (p.finishedAt && p.rank && finishShown !== p.finishedAt) {
        finishShown = p.finishedAt;
        showFinish(p.rank);
    }
    const rankLabel = el('finish').querySelector('.finish-rank');
    if (rankLabel)
        rankLabel.textContent = p.rank ? `${p.rank}위로 미로를 탈출하셨습니다.` : '운영자가 순위 기록을 삭제했습니다. 계속 탐험하실 수 있습니다.';
    draw();
}
function showFinish(rank: number) { const { overlay, panel } = closeable('축하합니다!', () => el('finish').replaceChildren()); panel.append(node('p', `${rank}위로 미로를 탈출하셨습니다.`, 'finish-rank'), node('p', '창을 닫으시면 남은 미로를 계속 탐험하실 수 있습니다.')); el('finish').replaceChildren(overlay); }
nickname.addEventListener('input', () => {
    const admin = nickname.value.normalize('NFC').trim().toLowerCase() === 'taf';
    el('password-field').hidden = !admin;
    password.required = admin;
    if (!admin)
        password.value = '';
});
el<HTMLFormElement>('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (connecting)
        return;
    connecting = true;
    el<HTMLButtonElement>('login-button').disabled = true;
    el('login-status').textContent = '접속 중입니다…';
    try {
        const joined = await client.joinOrCreate('world', { nickname: nickname.value, password: password.value });
        room = joined;
        password.value = '';
        joined.onMessage('snapshot', (p: Snapshot) => {
            if (room === joined)
                update(p);
        });
        joined.onMessage('ack', (data: {
            id: number;
        }) => {
            if (room === joined && pending === data.id) {
                pending = null;
                battleIntent = undefined;
                window.clearTimeout(commandTimer);
            }
        });
        joined.onMessage('notice', (message: string) => showNotice(message));
        joined.onMessage('saved', (time: number) => {
            if (state) {
                state.savedAt = time;
                el('save-time').textContent = `저장 ${new Date(time).toLocaleTimeString('ko-KR')}`;
            }
        });
        joined.onMessage('monitor', (m: Monitor) => { observed.set(m.key, m); monitor?.update(m); });
        joined.onMessage('monitor.remove', (key: string) => { observed.delete(key); monitor?.remove(key); });
        joined.onMessage('rankings', (rows: Ranking[]) => { rankings = rows; monitor?.rankings(rows); });
        joined.onMessage('editor', (data: EditorData) => { dialog = 'editor'; el('dialogs').replaceChildren(eventEditor(data, send, closeDialog)); });
        joined.onMessage('customMap', (data: CustomMap) => {
            if (room !== joined)
                return;
            customData = data;
            customView?.update(data);
        });
        joined.onMessage('reset', () => {
            if (room !== joined)
                return;
            cancelBattlePresentation();
            promotionNoticeActive = false;
            deferredNotice = undefined;
            motion.stop();
            state = undefined;
            pending = null;
            nextSendAt = 0;
            window.clearTimeout(commandTimer);
            closeDialog();
            eventSignature = '';
            finishShown = null;
            el('events').replaceChildren();
            el('finish').replaceChildren();
        });
        joined.onMessage('finish', () => { });
        joined.onError((_code, message) => showNotice(message || '서버 연결에 문제가 발생했습니다.'));
        joined.onLeave(code => {
            if (room === joined)
                clean(code === 4000 ? '저장 후 종료되었습니다.' : '연결이 종료되었습니다. 같은 닉네임으로 다시 접속해 주세요.');
        });
        login.hidden = true;
        game.hidden = false;
        connecting = false;
        joined.send('ready');
    }
    catch (error) {
        clean(error instanceof Error ? error.message : '접속하지 못했습니다. 서버 주소와 실행 상태를 확인해 주세요.');
    }
});
el('character').addEventListener('click', () => {
    if (!state)
        return;
    dialog = 'stats';
    el('dialogs').replaceChildren(characterPanel(state, send, closeDialog));
});
el('admin-stats').addEventListener('click', () => {
    if (!state?.admin)
        return;
    dialog = 'adminStats';
    el('dialogs').replaceChildren(adminStats(state, send, closeDialog));
});
el('watch').addEventListener('click', () => {
    if (!state?.admin)
        return;
    if (monitor) {
        closeMonitor();
        return;
    }
    monitor = monitoringPanel(send, closeMonitor);
    game.append(monitor.root);
    game.classList.add('has-monitor');
    for (const m of observed.values())
        monitor.update(m);
    monitor.rankings(rankings);
    draw();
});
function resetMaze() {
    if (!state?.admin)
        return;
    if (window.confirm('저장된 미로 수정안을 모든 계정에 적용하고 레벨·능력치·직업·위치·탐험·문제·전투·순위를 초기화하시겠습니까? 오프라인 계정도 포함되며 닉네임은 유지됩니다.'))
        send('admin.reset', { confirm: 'RESET_ALL' });
}
el('reset-maze').addEventListener('click', resetMaze);
el('custom-mode').addEventListener('click', () => { if (state?.admin)
    send('admin.custom', { enabled: true }); });
el('logout').addEventListener('click', () => send('logout'));
bindControls(world, () => state, () => geometry, () => pending !== null || dialog !== null || motion.running || !!state?.customMode, send);
const observer = new ResizeObserver(draw);
observer.observe(world);
observer.observe(minimap);
function viewport() { document.documentElement.style.setProperty('--app-height', `${Math.round(window.visualViewport?.height ?? window.innerHeight)}px`); draw(); }
window.addEventListener('resize', viewport);
window.visualViewport?.addEventListener('resize', viewport);
viewport();
