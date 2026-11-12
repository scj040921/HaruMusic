<template>
  <Teleport to="body"
    ><div
      v-if="visible"
      ref="screen"
      class="startup-intro"
      role="dialog"
      aria-modal="true"
      aria-label="HaruMusic 开屏"
      @keydown.esc="dismiss"
    >
      <div class="intro-aurora" aria-hidden="true" />
      <div ref="mark" class="intro-mark">
        <img src="/icon.png" alt="" />
        <h1>HaruMusic</h1>
        <p>让音乐，自然流动。</p>
      </div>
      <button ref="skip" class="intro-skip" @click="dismiss">
        进入音乐 <i class="ri-arrow-right-line" aria-hidden="true" />
      </button></div
  ></Teleport>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
const visible = ref(!sessionStorage.getItem('haru-intro-seen'));
const screen = ref<HTMLElement>(),
  mark = ref<HTMLElement>(),
  skip = ref<HTMLButtonElement>();
let animations: Animation[] = [];
let app: HTMLElement | null = null;
let previousInert = false;
let previousFocus: HTMLElement | null = null;
function dismiss() {
  animations.forEach((a) => a.cancel());
  animations = [];
  visible.value = false;
  sessionStorage.setItem('haru-intro-seen', '1');
  if (app) app.inert = previousInert;
  previousFocus?.focus({ preventScroll: true });
}
onMounted(async () => {
  if (!visible.value) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    dismiss();
    return;
  }
  await nextTick();
  app = document.getElementById('app');
  previousInert = app?.inert || false;
  if (app) app.inert = true;
  previousFocus = document.activeElement as HTMLElement;
  skip.value?.focus({ preventScroll: true });
  if (!screen.value || !mark.value) {
    dismiss();
    return;
  }
  const reveal = mark.value.animate(
    [
      { opacity: 0, transform: 'translateY(24px) scale(.82)' },
      { opacity: 1, transform: 'translateY(-4px) scale(1.025)', offset: 0.7 },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ],
    { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
  );
  const leave = screen.value.animate([{ opacity: 1 }, { opacity: 0 }], {
    delay: 480,
    duration: 180,
    fill: 'forwards'
  });
  animations = [reveal, leave];
  leave.finished.then(dismiss).catch(() => {});
});
onBeforeUnmount(dismiss);
</script>
<style scoped>
.startup-intro {
  position: fixed;
  inset: 0;
  z-index: 1000001;
  display: grid;
  place-items: center;
  background: #08090b;
  color: #fff;
  overflow: hidden;
}
.intro-aurora {
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(ellipse at 30% 40%, #f42d482b, transparent 55%),
    radial-gradient(ellipse at 70% 65%, #638d9e32, transparent 60%);
  pointer-events: none;
}
.intro-mark {
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 24px;
}
.intro-mark img {
  width: 112px;
  height: 112px;
  border-radius: 32px;
  box-shadow:
    0 24px 32px #0006,
    0 0 32px #fff1;
}
.intro-mark h1 {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.04em;
  margin: 0;
}
.intro-mark p {
  font-size: 15px;
  color: #ffffffa6;
  margin: 0;
}
.intro-skip {
  position: absolute;
  bottom: calc(32px + var(--safe-area-inset-bottom, 0px));
  right: 24px;
  min-height: 48px;
  padding: 12px 24px;
  border-radius: 999px;
  border: 1px solid #fff3;
  background: #ffffff10;
  color: #fff;
  font-size: 15px;
}
.intro-skip:active {
  transform: scale(0.95);
}
.intro-skip:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 4px;
}
</style>
