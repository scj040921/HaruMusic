/** Give every favorite toggle the same brief, interruptible spring response. */
export function playFavoriteFeedback(target: EventTarget | null, liked: boolean): void {
  if (
    typeof window === 'undefined' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  if (!(target instanceof Element)) return;

  const control = target.closest<HTMLElement>('[data-favorite-control]') ?? target;
  const icon = control.matches('i, svg') ? control : control.querySelector<HTMLElement>('i, svg');
  if (!icon) return;

  icon.getAnimations().forEach((animation) => animation.cancel());
  icon.animate(
    [
      { transform: 'scale(1) rotate(0deg)', filter: 'drop-shadow(0 0 0 transparent)' },
      {
        transform: 'scale(0.72) rotate(-9deg)',
        filter: `drop-shadow(0 0 0 var(--accent, ${liked ? '#fa2d48' : 'transparent'}))`,
        offset: 0.28,
        easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)'
      },
      {
        transform: 'scale(1.26) rotate(5deg)',
        filter: `drop-shadow(0 0 ${liked ? '7px' : '0'} var(--accent, #fa2d48))`,
        offset: 0.62,
        easing: 'cubic-bezier(0.2, 1.55, 0.55, 1)'
      },
      { transform: 'scale(1) rotate(0deg)', filter: 'drop-shadow(0 0 0 transparent)' }
    ],
    { duration: 430, fill: 'none' }
  );
}
