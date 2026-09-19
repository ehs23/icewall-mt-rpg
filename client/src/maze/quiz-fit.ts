// Resize the current quiz as one continuous view; answers stay in the same form.
export function installQuizFit(root: HTMLElement) {
    const mounted = new Map<HTMLElement, () => void>();
    let scanFrame = 0;
    const scan = () => {
        scanFrame = 0;
        for (const [panel, dispose] of mounted) if (!panel.isConnected) { dispose(); mounted.delete(panel); }
        for (const panel of root.querySelectorAll<HTMLElement>('.quiz-panel')) {
            if (mounted.has(panel)) continue;
            const viewport = panel.querySelector<HTMLElement>('.quiz-viewport')!;
            const content = panel.querySelector<HTMLElement>('.quiz-content')!;
            let frame = 0;
            const fit = () => {
                frame = 0;
                if (!panel.isConnected || !viewport.clientHeight || !viewport.clientWidth) return;
                content.style.transform = 'none';
                content.style.width = '100%';
                let low = 10, high = viewport.clientWidth < 400 ? 18 : 20;
                // First adjust text and spacing, keeping the answer confirmation fixed.
                for (let i = 0; i < 8; i++) {
                    const size = (low + high) / 2;
                    content.style.setProperty('--quiz-font', `${size}px`);
                    if (content.scrollHeight <= viewport.clientHeight && content.scrollWidth <= viewport.clientWidth) low = size;
                    else high = size;
                }
                content.style.setProperty('--quiz-font', `${low}px`);
                // Exceptionally long authored questions still remain on this single screen.
                const scale = Math.min(1, viewport.clientHeight / Math.max(1, content.scrollHeight), viewport.clientWidth / Math.max(1, content.scrollWidth));
                content.style.transform = `scale(${scale})`;
            };
            const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };
            const resize = new ResizeObserver(schedule); resize.observe(viewport);
            schedule();
            mounted.set(panel, () => { resize.disconnect(); cancelAnimationFrame(frame); });
        }
    };
    const observer = new MutationObserver(() => { if (!scanFrame) scanFrame = requestAnimationFrame(scan); });
    observer.observe(root, { childList: true, subtree: true });
    scan();
}
