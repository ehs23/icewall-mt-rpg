export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (text !== undefined)
        el.textContent = text;
    if (className)
        el.className = className;
    return el;
}
export function button(text: string, click: () => void, className?: string) {
    const el = node('button', text, className);
    el.type = 'button';
    el.addEventListener('click', click);
    return el;
}
export function field(label: string, input: HTMLElement) { const row = node('label', undefined, 'field'); row.append(node('span', label), input); return row; }
export function closeable(title: string, close: () => void) {
    const overlay = node('section', undefined, 'overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    const panel = node('div', undefined, 'panel');
    const head = node('header');
    const x = button('×', close, 'close');
    x.setAttribute('aria-label', '닫기');
    head.append(node('h2', title), x);
    panel.append(head);
    overlay.append(panel);
    return { overlay, panel };
}
export type Send = (action: string, data?: Record<string, unknown>) => void;
export const statNames = { hp: '최대 체력', attack: '공격력', defense: '방어력', crit: '치명타율', critDamage: '치명타 피해' } as const;
export function statText(stats: Record<keyof typeof statNames, number>) { return `공격 ${stats.attack} · 방어 ${stats.defense} · 치명타 ${stats.crit}% · 치명타 피해 ${stats.critDamage}%`; }
