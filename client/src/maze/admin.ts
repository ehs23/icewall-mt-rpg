import { monitoringPanel } from './monitor';
export { monitoringPanel };
import type { EventDefinition, Snapshot, Stats } from './types';
import { button, closeable, field, node, statNames, type Send } from './ui';
export type EditorData = {
    x: number;
    y: number;
    definition: EventDefinition | null;
};
function statsInputs(stats: Stats, monster: boolean) {
    const root = node('div');
    const inputs = new Map<keyof Stats, HTMLInputElement>();
    for (const key of Object.keys(statNames) as (keyof Stats)[]) {
        const input = node('input');
        input.type = 'number';
        input.step = key === 'crit' ? '0.5' : '1';
        input.min = key === 'critDamage' ? '100' : key === 'hp' || key === 'attack' ? '1' : '0';
        input.max = key === 'hp' ? '999' : key === 'crit' ? '100' : key === 'critDamage' ? (monster ? '200' : '300') : (monster ? '199' : '499');
        input.value = String(stats[key]);
        input.required = true;
        inputs.set(key, input);
        root.append(field(statNames[key], input));
    }
    return { root, read: () => Object.fromEntries([...inputs].map(([k, v]) => [k, Number(v.value)])) };
}
export function eventEditor(data: EditorData, send: Send, close: () => void) {
    const { overlay, panel } = closeable(`칸 편집 · ${data.x + 1}열 ${data.y + 1}행`, close);
    if (data.x === 1 && data.y === 1) {
        panel.append(node('p', '시작 칸에는 이벤트를 배치하실 수 없습니다.'));
        return overlay;
    }
    const form = node('form'), kind = node('select');
    for (const [value, label] of [['empty', '이벤트 없음'], ['choice', '객관식 퀴즈'], ['text', '주관식 퀴즈'], ['monster', '몬스터 배틀']]) {
        const option = node('option', label);
        option.value = value;
        kind.append(option);
    }
    kind.value = data.definition?.kind ?? 'choice';
    if (data.x === 19 && data.y === 19) {
        kind.value = 'monster';
        kind.disabled = true;
    }
    const prompt = node('textarea');
    prompt.maxLength = 2000;
    prompt.required = true;
    prompt.value = data.definition?.prompt ?? '';
    prompt.rows = 3;
    const details = node('div');
    let read = (): Record<string, unknown> => ({});
    const rebuild = () => {
        details.replaceChildren();
        prompt.required = kind.value !== 'empty';
        prompt.disabled = kind.value === 'empty';
        if (kind.value === 'empty') {
            details.append(node('p', '저장하시면 이 칸의 이벤트를 제거합니다.'));
            read = () => ({});
        }
        else if (kind.value === 'monster') {
            const inputs = statsInputs(data.definition?.stats ?? { hp: 30, attack: 6, defense: 3, crit: 0, critDamage: 100 }, true);
            details.append(inputs.root);
            read = () => ({ stats: inputs.read() });
        }
        else if (kind.value === 'text') {
            const answer = node('input');
            answer.maxLength = 500;
            answer.required = true;
            answer.value = data.definition?.kind === 'text' ? data.definition.answer ?? '' : '';
            details.append(field('정답', answer));
            read = () => ({ answer: answer.value });
        }
        else {
            const count = node('select');
            [3, 4, 5].forEach(n => { const option = node('option', `${n}개`); option.value = String(n); count.append(option); });
            count.value = String(data.definition?.choices?.length ?? 3);
            const choices = node('div'), answer = node('select');
            let fields: HTMLInputElement[] = [];
            const redraw = () => {
                const values = fields.length ? fields.map(f => f.value) : data.definition?.choices ?? [];
                const selected = answer.value || data.definition?.answer || '0';
                choices.replaceChildren();
                answer.replaceChildren();
                fields = [];
                for (let i = 0; i < Number(count.value); i++) {
                    const input = node('input');
                    input.maxLength = 500;
                    input.required = true;
                    input.value = values[i] ?? '';
                    fields.push(input);
                    choices.append(field(`보기 ${i + 1}`, input));
                    const option = node('option', `${i + 1}번`);
                    option.value = String(i);
                    answer.append(option);
                }
                answer.value = Number(selected) < fields.length ? selected : '0';
            };
            count.addEventListener('change', redraw);
            redraw();
            details.append(field('보기 개수', count), choices, field('정답 번호', answer));
            read = () => ({ choices: fields.map(f => f.value), answer: answer.value });
        }
    };
    kind.addEventListener('change', rebuild);
    rebuild();
    const save = button('수정안 저장', () => { });
    save.type = 'submit';
    form.append(field('유형', kind), field('문제 내용 또는 몬스터 이름', prompt), details, save);
    form.addEventListener('submit', e => { e.preventDefault(); send('admin.save', { x: data.x, y: data.y, kind: kind.value, prompt: prompt.value, ...read() }); });
    panel.append(form, node('small', '수정안으로 저장됩니다. 전체 초기화를 누르면 모든 계정에 적용되며 진행 기록도 초기화됩니다.'));
    return overlay;
}
export function adminStats(p: Snapshot, send: Send, close: () => void) {
    const { overlay, panel } = closeable('운영자 본인 능력치', close);
    const form = node('form'), inputs = statsInputs(p.stats, false);
    const level = node('input');
    level.type = 'number';
    level.min = '1';
    level.max = '50';
    level.step = '1';
    level.value = String(p.level);
    level.required = true;
    const save = button('본인에게 적용', () => { });
    save.type = 'submit';
    form.append(field('테스트 레벨', level), inputs.root, save);
    form.addEventListener('submit', e => { e.preventDefault(); send('admin.stats', { stats: inputs.read(), level: Number(level.value) }); });
    panel.append(form);
    const professionForm = node('form'), target = node('input'), profession = node('select');
    target.value = p.nickname;
    target.maxLength = 12;
    target.required = true;
    const jobs = [['none', '전직 전'], ['Searcher', 'Searcher'], ['Webhacking', 'Webhacking'], ['Translater', 'Translater'], ['Reversing', 'Reversing'], ['Buffer', 'Buffer'], ['Pwnable', 'Pwnable'], ['Tracker', 'Tracker'], ['Forensic', 'Forensic']];
    for (const [value, name] of jobs) {
        const option = node('option', name);
        option.value = value;
        profession.append(option);
    }
    const second: Record<string, string> = { Searcher: 'Webhacking', Translater: 'Reversing', Buffer: 'Pwnable', Tracker: 'Forensic' };
    profession.value = p.profession ? (p.advanced ? second[p.profession] : p.profession) : 'none';
    const apply = button('직업 변경 적용', () => { });
    apply.type = 'submit';
    professionForm.append(node('h3', '운영자 자유 전직'), field('대상 닉네임', target), field('직업', profession), node('small', '본인 또는 저장된 다른 계정을 지정하실 수 있습니다. 필요한 경우 10·25레벨까지 함께 올립니다.'), apply);
    professionForm.addEventListener('submit', event => { event.preventDefault(); send('admin.profession', { nickname: target.value, profession: profession.value }); });
    panel.append(professionForm);
    return overlay;
}
