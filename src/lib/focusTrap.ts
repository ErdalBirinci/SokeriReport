const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keep Tab inside a modal, and restore focus to the opener on close.
 * Returns the cleanup function for a React effect.
 */
export function trapFocus(
  container: HTMLElement,
  opener: HTMLElement | null = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null,
): () => void {
  // The dialog may autofocus its first field before this effect runs, so the
  // caller captures the real opener during render.
  const restoreTo = opener && !container.contains(opener) ? opener : null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.getClientRects().length > 0 || element === document.activeElement,
    );
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeyDown);
  return () => {
    container.removeEventListener('keydown', onKeyDown);
    restoreTo?.focus?.();
  };
}
