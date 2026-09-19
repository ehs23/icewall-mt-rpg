// The server owns the persisted deadline. This timer only presents the remaining time.
export function installCooldown(root: HTMLElement, form: HTMLFormElement, confirm: HTMLButtonElement, remaining: number) {
    if (remaining <= 0) return;
    const deadline = performance.now() + remaining;
    const update = () => {
        const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
        confirm.disabled = seconds > 0;
        confirm.textContent = seconds ? `${seconds}초 후 다시 제출하실 수 있습니다.` : '확인';
        return seconds;
    };
    form.addEventListener('submit', event => {
        if (performance.now() < deadline) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    update();
    const timer = window.setInterval(() => {
        if (!root.isConnected || !update()) window.clearInterval(timer);
    }, 200);
}
