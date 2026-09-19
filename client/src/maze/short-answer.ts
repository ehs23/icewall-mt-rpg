import { button, field, node, type Send } from './ui';
export function shortAnswer(send: Send) {
    const form = node('form'), input = node('input');
    input.name = 'answer';
    input.maxLength = 500;
    input.required = true;
    input.autocomplete = 'off';
    const confirm = button('확인', () => { });
    confirm.type = 'submit';
    form.append(field('답안', input), confirm);
    form.addEventListener('submit', e => { e.preventDefault(); send('answer', { answer: input.value }); });
    return form;
}
