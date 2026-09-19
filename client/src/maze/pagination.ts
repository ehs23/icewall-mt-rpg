import { button, node } from './ui';

// CSS columns flow long forms into horizontal pages. Wheel/touch scrolling is
// disabled by the clipped viewport, while every field remains in its original form.
function paginate(surface: HTMLElement) {
    const viewport = node('div', undefined, 'page-viewport');
    const flow = node('div', undefined, 'page-flow');
    const footer = node('nav', undefined, 'page-navigation');
    footer.setAttribute('aria-label', '화면 페이지');
    let page = 0, count = 1, frame = 0, measuring = false;
    const label = node('span'); label.setAttribute('aria-live', 'polite');
    const back = button('이전', () => show(page - 1));
    const next = button('다음', () => show(page + 1));
    footer.append(back, label, next);
    // Keep dialog headings/close controls visible on every page.
    const heading = surface.firstElementChild?.tagName === 'HEADER' ? surface.firstElementChild : null;
    const moveChildren = () => {
        for (const child of [...surface.childNodes]) {
            if (child !== heading && child !== viewport && child !== footer) flow.append(child);
        }
    };
    moveChildren(); viewport.append(flow); surface.append(viewport, footer);
    surface.classList.add('paged-surface');
    function show(index: number) {
        page = Math.max(0, Math.min(index, count - 1));
        flow.style.transform = `translateX(${-page * (viewport.clientWidth + 24)}px)`;
        const text = `${page + 1} / ${count}`;
        if (label.textContent !== text) label.textContent = text;
        back.disabled = page === 0; next.disabled = page === count - 1;
    }
    function measure() {
        frame = 0;
        if (!surface.isConnected || !viewport.clientWidth || !viewport.clientHeight) return;
        measuring = true;
        moveChildren();
        count = Math.max(1, Math.ceil((flow.scrollWidth + 24) / (viewport.clientWidth + 24)));
        show(page);
        measuring = false;
    }
    const schedule = () => { if (!measuring && !frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule); resize.observe(viewport);
    const changes = new MutationObserver(schedule);
    changes.observe(surface, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    const reveal = (target: EventTarget | null) => {
        if (!(target instanceof HTMLElement) || !flow.contains(target)) return;
        const offset = target.getBoundingClientRect().left - flow.getBoundingClientRect().left;
        show(Math.floor((offset + 1) / (viewport.clientWidth + 24)));
    };
    surface.addEventListener('invalid', e => reveal(e.target), true);
    surface.addEventListener('focusin', e => reveal(e.target));
    schedule();
    return () => { resize.disconnect(); changes.disconnect(); cancelAnimationFrame(frame); };
}
export function installPagination(root: HTMLElement) {
    const mounted = new Map<HTMLElement, () => void>();
    let frame = 0;
    const scan = () => {
        frame = 0;
        for (const [surface, dispose] of mounted) if (!surface.isConnected) { dispose(); mounted.delete(surface); }
        for (const surface of root.querySelectorAll<HTMLElement>('.panel:not(.battle-panel):not(.quiz-panel), .login-card, .admin-drawer')) {
            if (!mounted.has(surface)) mounted.set(surface, paginate(surface));
        }
    };
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(scan); });
    observer.observe(root, { childList: true, subtree: true });
    scan();
}
