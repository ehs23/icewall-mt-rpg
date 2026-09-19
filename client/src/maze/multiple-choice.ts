import { button, node, type Send } from './ui';
import type { PublicEvent } from './types';
export function multipleChoice(event: PublicEvent, send: Send) {
    const form = node('form');
    const group = node('fieldset');
    group.append(node('legend', '정답 하나를 선택해 주세요.'));
    event.choices?.forEach((text, i) => { const input = node('input'); input.type = 'radio'; input.name = 'answer'; input.value = String(i); input.required = true; const label = node('label', undefined, 'choice'); label.append(input, node('span', `${i + 1}. ${text}`)); group.append(label); });
    const confirm = button('확인', () => { });
    confirm.type = 'submit';
    form.append(group, confirm);
    form.addEventListener('submit', e => { e.preventDefault(); const answer = new FormData(form).get('answer'); if (typeof answer === 'string')
        send('answer', { answer }); });
    return form;
}
