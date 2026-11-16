import { nextTick, onBeforeUnmount, type Ref, watch } from 'vue';

import { registerOverlay } from '@/services/overlayStack';

export function useOverlayDialog(
  visible: () => boolean,
  panel: Ref<HTMLElement | null>,
  close: () => void
) {
  let entry: ReturnType<typeof registerOverlay> | undefined;
  let returnFocus: HTMLElement | null = null;
  let generation = 0;
  const focusable = () =>
    [
      ...(panel.value?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ) || [])
    ].filter((el) => el.getClientRects().length && !el.closest('[hidden], [inert]'));
  const keydown = (event: KeyboardEvent) => {
    if (!entry?.isTop()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      const elements = focusable();
      const first = elements[0],
        last = elements.at(-1);
      const outside = !panel.value?.contains(document.activeElement);
      if (
        !first ||
        outside ||
        (!event.shiftKey && document.activeElement === last) ||
        (event.shiftKey && document.activeElement === first)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
        if (!first) panel.value?.focus();
      }
    }
  };
  const cleanup = () => {
    generation++;
    entry?.remove();
    entry = undefined;
    document.removeEventListener('keydown', keydown, true);
    if (returnFocus?.isConnected && !returnFocus.closest('[inert]'))
      returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  };
  watch(
    visible,
    async (open) => {
      if (!open) {
        cleanup();
        return;
      }
      returnFocus = document.activeElement as HTMLElement | null;
      entry = registerOverlay(close);
      document.addEventListener('keydown', keydown, true);
      const current = ++generation;
      await nextTick();
      if (current === generation && visible())
        (focusable()[0] || panel.value)?.focus({ preventScroll: true });
    },
    { immediate: true }
  );
  onBeforeUnmount(cleanup);
}
