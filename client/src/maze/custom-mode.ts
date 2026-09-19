import type { CustomMap } from './types';
import { button, field, node, type Send } from './ui';
export function customModeView(data: CustomMap, send: Send, reset: () => void) {
    const root = node('section', undefined, 'custom-mode');
    const header = node('header');
    header.append(node('h2', '미로 커스텀 모드'), button('게임으로 돌아가기', () => send('admin.custom', { enabled: false })));
    const description = node('p', '도구를 고른 뒤 칸을 눌러 편집해 주세요. 수정안은 자동 저장되며 전체 초기화 시 모두에게 적용됩니다. 새 미로는 출구 보스를 지정해 주세요.');
    const space = node('div', undefined, 'custom-map-space'), canvas = node('canvas');
    canvas.setAttribute('aria-label', '전체 미로 편집 지도. 아래 열·행 입력으로도 칸을 선택하실 수 있습니다.');
    space.append(canvas);
    const toolbar = node('div', undefined, 'custom-tools');
    const column = node('input'), row = node('input');
    for (const input of [column, row]) {
        input.type = 'number';
        input.min = '1';
        input.max = String(data.grid.length);
        input.step = '1';
        input.value = '2';
        input.required = true;
    }
    const tools = node('div', undefined, 'custom-tools');
    const tool = node('select');
    for (const [value, label] of [['select', '칸 선택'], ['wall', '벽 세우기'], ['passage', '벽 지우기'], ['boss', '출구 보스 지정']]) {
        const option = node('option', label); option.value = value; tool.append(option);
    }
    const sizeInput = node('input'); sizeInput.type = 'number'; sizeInput.min = '7'; sizeInput.max = '51'; sizeInput.step = '1'; sizeInput.value = String(data.grid.length);
    function replaceDraft(operation: string) {
        if (operation !== 'default' && !sizeInput.checkValidity()) { sizeInput.reportValidity(); return; }
        const message = operation === 'default' ? '수정안의 크기·벽·문제를 저장한 기본 미로로 되돌리시겠습니까?' : operation === 'blank' ? '입력한 크기로 바깥 테두리만 남기고 내부 벽과 모든 문제·몬스터를 지우시겠습니까?' : '미로 크기를 변경하시겠습니까? 범위 밖의 문제는 삭제되며 새 공간은 통로가 됩니다.';
        if (window.confirm(message + '\n진행 중인 게임에는 전체 초기화 시 적용됩니다.')) send('admin.layout', { operation, size: Number(sizeInput.value), confirm: 'REPLACE_DRAFT' });
    }
    tools.append(field('편집 도구', tool), field('가로·세로 크기', sizeInput),
        button('크기 변경', () => replaceDraft('resize')),
        button('기본값으로 적용', () => {
            if (window.confirm('현재 수정안의 크기·벽·문제·몬스터를 새 기본값으로 저장하시겠습니까? 기존 복원용 기본값은 교체되며 진행 중인 게임은 유지됩니다.'))
                send('admin.setDefault', { confirm: 'SET_DEFAULT' });
        }),
        button('기본 미로·내용 복원', () => replaceDraft('default')),
        button('미로 새로 재설계', () => replaceDraft('blank'), 'danger'));
    let selected = { x: 1, y: 1 }, geometry = { left: 0, top: 0, cell: 1 };
    const detail = node('p', undefined, 'custom-selection');
    const edit = button('선택 칸 편집', () => send('admin.edit', selected));
    const warp = button('선택 칸으로 워프', () => send('admin.warp', selected));
    const applyTool = button('선택 칸에 도구 적용', useTool);
    function useTool() {
        if (tool.value === 'select') return;
        const event = data.events.find(e => e.x === selected.x && e.y === selected.y);
        if (tool.value === 'wall' && event && !window.confirm('벽을 세우면 이 칸의 문제 또는 몬스터가 삭제됩니다. 계속하시겠습니까?')) return;
        if (tool.value === 'boss' && event && event.kind !== 'monster' && !window.confirm('이 칸의 문제를 출구 보스로 교체하시겠습니까?')) return;
        send('admin.layout', { operation: tool.value, ...selected });
    }
    toolbar.append(field('열', column), field('행', row), edit, applyTool, warp, button('전체 진행 초기화', reset, 'danger'));
    root.append(header, description, node('small', '객: 객관식 · 주: 주관식 · 몬: 몬스터 · 왕: 보스 · 시: 시작'), space, detail, tools, toolbar);
    function draw() {
        const rect = space.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0)
            return;
        const ratio = Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.round(rect.width * ratio);
        canvas.height = Math.round(rect.height * ratio);
        const ctx = canvas.getContext('2d')!;
        ctx.scale(ratio, ratio);
        ctx.fillStyle = '#050b12';
        ctx.fillRect(0, 0, rect.width, rect.height);
        const size = data.grid.length, cell = Math.min(rect.width, rect.height) / size;
        const left = (rect.width - cell * size) / 2, top = (rect.height - cell * size) / 2;
        geometry = { left, top, cell };
        const events = new Map(data.events.map(event => [`${event.x},${event.y}`, event]));
        data.grid.forEach((line, y) => [...line].forEach((tile, x) => {
            ctx.fillStyle = tile === '1' ? '#c2d4d5' : '#192a3d';
            ctx.fillRect(left + x * cell, top + y * cell, cell - 0.5, cell - 0.5);
            const event = events.get(`${x},${y}`);
            const label = x === 1 && y === 1 ? '시' : event?.boss ? '왕' : event?.kind === 'monster' ? '몬' : event?.kind === 'choice' ? '객' : event?.kind === 'text' ? '주' : '';
            if (label) {
                ctx.fillStyle = event?.kind === 'monster' ? '#8e283b' : '#234971';
                if (cell >= 12) {
                    ctx.font = `bold ${Math.min(16, cell - 2)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, left + (x + 0.5) * cell, top + (y + 0.5) * cell);
                }
                else {
                    ctx.beginPath();
                    ctx.arc(left + (x + 0.5) * cell, top + (y + 0.5) * cell, cell * 0.24, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }));
        ctx.strokeStyle = '#edb951';
        ctx.lineWidth = 3;
        ctx.strokeRect(left + selected.x * cell + 1, top + selected.y * cell + 1, cell - 2, cell - 2);
        const event = events.get(`${selected.x},${selected.y}`), isWall = data.grid[selected.y]?.[selected.x] !== '1';
        detail.textContent = `${selected.x + 1}열 ${selected.y + 1}행 · ${isWall ? '벽' : event?.prompt ?? '이벤트 없음'}`;
        warp.disabled = isWall;
        applyTool.disabled = tool.value === 'select';
        edit.disabled = isWall || (selected.x === 1 && selected.y === 1);
    }
    canvas.addEventListener('click', event => {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left - geometry.left) / geometry.cell), y = Math.floor((event.clientY - rect.top - geometry.top) / geometry.cell);
        if (x < 0 || y < 0 || x >= data.grid.length || y >= data.grid.length)
            return;
        selected = { x, y };
        column.value = String(x + 1);
        row.value = String(y + 1);
        draw();
        useTool();
    });
    for (const input of [column, row])
        input.addEventListener('change', () => {
            if (!column.checkValidity() || !row.checkValidity())
                return;
            selected = { x: Number(column.value) - 1, y: Number(row.value) - 1 };
            draw();
        });
    tool.addEventListener('change', draw);
    const observer = new ResizeObserver(draw);
    observer.observe(space);
    return { root, update: (next: CustomMap) => { data = next; sizeInput.value = String(data.grid.length); for (const input of [column, row]) input.max = String(data.grid.length); selected.x = Math.min(selected.x, data.grid.length - 1); selected.y = Math.min(selected.y, data.grid.length - 1); column.value = String(selected.x + 1); row.value = String(selected.y + 1); draw(); }, destroy: () => { observer.disconnect(); root.remove(); } };
}
