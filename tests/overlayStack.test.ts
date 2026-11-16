import { describe, expect, it, vi } from 'vitest';

import { dismissTopOverlay, registerOverlay } from '../src/renderer/services/overlayStack';

describe('overlay back navigation', () => {
  it('dismisses the top sheet before its parent and tolerates repeated cleanup', () => {
    const parentClose = vi.fn(),
      childClose = vi.fn();
    const parent = registerOverlay(() => {
      parentClose();
      parent.remove();
    });
    const child = registerOverlay(() => {
      childClose();
      child.remove();
    });
    expect(parent.isTop()).toBe(false);
    expect(dismissTopOverlay()).toBe(true);
    expect(childClose).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
    child.remove();
    expect(parent.isTop()).toBe(true);
    expect(dismissTopOverlay()).toBe(true);
    expect(parentClose).toHaveBeenCalledOnce();
    expect(dismissTopOverlay()).toBe(false);
  });

  it('removes an unmounted parent without losing an open child', () => {
    const parent = registerOverlay(vi.fn());
    const close = vi.fn();
    const child = registerOverlay(close);
    parent.remove();
    expect(child.isTop()).toBe(true);
    expect(dismissTopOverlay()).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    child.remove();
    expect(dismissTopOverlay()).toBe(false);
  });
});
