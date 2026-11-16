import { type DialogOptions, useDialog } from 'naive-ui';
import { onBeforeUnmount } from 'vue';

import { registerOverlay } from '@/services/overlayStack';

/** Give native Back the same topmost-confirmation semantics as Escape. */
export function useManagedDialog() {
  const dialog = useDialog();
  const active = new Set<() => void>();
  onBeforeUnmount(() => {
    for (const close of [...active]) close();
  });
  return {
    warning(options: DialogOptions) {
      const instance = dialog.warning({
        ...options,
        zIndex: 10000004,
        onAfterLeave: () => {
          entry?.remove();
          active.delete(close);
          options.onAfterLeave?.();
        }
      });
      const close = () => {
        entry?.remove();
        active.delete(close);
        instance.destroy();
      };
      const entry = registerOverlay(close);
      active.add(close);
      return instance;
    }
  };
}
