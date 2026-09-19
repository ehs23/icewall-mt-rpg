import type { Snapshot } from './types';
import { button, node, type Send } from './ui';
import { multipleChoice } from './multiple-choice';
import { shortAnswer } from './short-answer';
import { installCooldown } from './quiz-cooldown';
import { monsterBattle } from './monsters';
let formSequence = 0;
export function renderEvent(p: Snapshot, send: Send) {
    const e = p.active!;
    const overlay = node('section', undefined, `overlay event-overlay ${e.kind === 'monster' ? 'battle-overlay' : 'quiz-overlay'}`);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '칸 이벤트');
    const shell = node('div', undefined, `event-shell${p.admin ? ' with-skip' : ''}`);
    const panel = node('div', undefined, `panel ${e.kind === 'monster' ? 'battle-panel' : 'quiz-panel'}`);
    const header = node('header', undefined, 'event-header');
    header.append(node('strong', e.kind === 'monster' ? '몬스터 배틀' : e.kind === 'choice' ? '객관식 퀴즈' : '주관식 퀴즈'));
    if (e.kind === 'monster') {
        header.append(button('저장하고 나가기', () => send('logout')));
        if (p.admin) header.append(button('운영자 설정', () => document.getElementById('admin-stats')?.click()));
        panel.append(header, monsterBattle(p, send));
    } else {
        header.append(button('문제 나가기', () => send('quiz.leave')));
        const viewport = node('div', undefined, 'quiz-viewport');
        const content = node('div', undefined, 'quiz-content');
        const form = e.kind === 'choice' ? multipleChoice(e, send) : shortAnswer(send);
        form.id = `quiz-answer-${++formSequence}`;
        const confirm = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirm.setAttribute('form', form.id);
        confirm.classList.add('quiz-confirm');
        content.append(node('h2', e.prompt), form);
        viewport.append(content);
        // The confirm button remains full-size outside the fitted question body.
        panel.append(header, viewport, confirm);
        installCooldown(overlay, form, confirm, e.retryAfterMs ?? 0);
    }
    shell.append(panel);
    if (p.admin) shell.append(button('건너뛰기', () => send('admin.skip'), 'event-skip secondary'));
    overlay.append(shell);
    return overlay;
}
