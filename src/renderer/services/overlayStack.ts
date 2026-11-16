type Overlay = { close: () => void };
const overlays: Overlay[] = [];

export function registerOverlay(close: () => void) {
  const overlay = { close };
  overlays.push(overlay);
  return {
    isTop: () => overlays.at(-1) === overlay,
    remove: () => {
      const index = overlays.indexOf(overlay);
      if (index >= 0) overlays.splice(index, 1);
    }
  };
}

/** Native Back dismisses the foremost sheet before navigating the player/page. */
export function dismissTopOverlay(): boolean {
  const overlay = overlays.at(-1);
  if (!overlay) return false;
  overlay.close();
  return true;
}
