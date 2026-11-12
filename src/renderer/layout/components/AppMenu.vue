<template>
  <div>
    <!-- menu -->
    <div
      class="app-menu"
      :class="{
        'app-menu-expanded': settingsStore.setData.isMenuExpanded,
        'android-hig-tabs': isAndroidApp && isMobile
      }"
    >
      <div class="app-menu-header">
        <button
          class="app-menu-logo"
          type="button"
          :aria-label="
            settingsStore.setData.isMenuExpanded
              ? t('comp.haruHome.collapseSidebar')
              : t('comp.haruHome.expandSidebar')
          "
          :aria-expanded="settingsStore.setData.isMenuExpanded"
          @click="toggleMenu"
        >
          <img class="haru-mark" src="@/assets/logo.png" alt="" aria-hidden="true" />
          <span v-if="settingsStore.setData.isMenuExpanded" class="haru-name">HaruMusic</span>
        </button>
      </div>
      <div
        ref="menuListRef"
        class="app-menu-list"
        @pointerdown="startSliderDrag"
        @pointermove="moveSliderDrag"
        @pointerup="finishSliderDrag"
        @pointercancel="cancelSliderDrag"
        @lostpointercapture="handleLostSliderCapture"
        @click.capture="guardSliderClick"
        @dragstart.prevent
      >
        <span
          v-if="isAndroidApp && isMobile"
          class="liquid-tab-slider"
          :class="{ 'is-dragging': sliderDragging }"
          :style="sliderStyle"
          aria-hidden="true"
        />
        <div v-for="item in visibleMenus" :key="item.path" class="app-menu-item">
          <n-tooltip
            :delay="200"
            :disabled="settingsStore.setData.isMenuExpanded || isMobile"
            placement="bottom"
          >
            <template #trigger>
              <router-link
                :draggable="false"
                class="app-menu-item-link"
                :class="{ 'is-active': isChecked(item) }"
                :aria-label="t(item.meta.title)"
                :aria-current="isChecked(item) ? 'page' : undefined"
                :to="item.path"
              >
                <i
                  class="iconfont app-menu-item-icon"
                  :style="iconStyle(item)"
                  :class="item.meta.icon"
                ></i>
                <span
                  v-if="settingsStore.setData.isMenuExpanded || (isAndroidApp && isMobile)"
                  class="app-menu-item-text ml-3"
                  >{{ t(item.meta.title) }}</span
                >
              </router-link>
            </template>
            <div v-if="!settingsStore.setData.isMenuExpanded">{{ t(item.meta.title) }}</div>
          </n-tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import { useSettingsStore } from '@/store';
import { isAndroidApp, isMobile } from '@/utils';
import { nearestTab, stepLiquidSpring } from '@/utils/liquidSpring';

const props = defineProps({
  size: {
    type: String,
    default: '26px'
  },
  color: {
    type: String,
    default: 'var(--haru-nav-icon)'
  },
  selectColor: {
    type: String,
    default: 'var(--haru-nav-active)'
  },
  menus: {
    type: Array as any,
    default: () => []
  }
});

const route = useRoute();
const router = useRouter();
const path = ref(route.path);
const settingsStore = useSettingsStore();
const menuListRef = ref<HTMLElement | null>(null);
const sliderDragging = ref(false);
const sliderStyle = ref<Record<string, string>>({ opacity: '0' });
let sliderFrame = 0;
let menuResizeObserver: ResizeObserver | null = null;
const handleSliderResize = () => {
  cancelSliderDrag();
  updateLiquidSlider();
};
const visibleMenus = computed(() =>
  isAndroidApp && isMobile.value
    ? props.menus.filter((item: any) => item.path !== '/album')
    : props.menus
);
const lens = { x: 0, width: 0, stretch: 0, vx: 0, vw: 0, vs: 0 };
let target = { x: 0, width: 0, stretch: 0 };
let drag: {
  id: number;
  start: number;
  y: number;
  origin: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  moved: boolean;
} | null = null;
let suppressClick = false;
let initialized = false;
let lensTop = 0;
let lensHeight = 0;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tabRects = () => {
  const list = menuListRef.value;
  if (!list) return [];
  const bounds = list.getBoundingClientRect();
  return [...list.querySelectorAll<HTMLElement>('.app-menu-item-link')].map((link) => {
    const rect = link.getBoundingClientRect();
    return {
      x: rect.left - bounds.left,
      width: rect.width,
      top: rect.top - bounds.top,
      height: rect.height
    };
  });
};
function paintLens() {
  sliderStyle.value = {
    opacity: '1',
    left: '0px',
    top: lensTop + 'px',
    width: lens.width + 'px',
    height: lensHeight + 'px',
    transform:
      'translate3d(' +
      lens.x +
      'px,0,0) scale(' +
      (1 + lens.stretch) +
      ',' +
      (1 - Math.abs(lens.stretch) * 0.48) +
      ')',
    borderRadius: 24 - Math.min(8, Math.abs(lens.stretch) * 40) + 'px'
  };
}
function springLens() {
  cancelAnimationFrame(sliderFrame);
  if (reducedMotion()) {
    Object.assign(lens, target, { vx: 0, vw: 0, vs: 0 });
    paintLens();
    return;
  }
  let previous = performance.now();
  const tick = (now: number) => {
    const dt = (now - previous) / 1000;
    previous = now;
    const x = stepLiquidSpring(lens.x, lens.vx, target.x, dt);
    const w = stepLiquidSpring(lens.width, lens.vw, target.width, dt);
    const shape = stepLiquidSpring(lens.stretch, lens.vs, target.stretch, dt);
    Object.assign(lens, {
      x: x.position,
      vx: x.velocity,
      width: w.position,
      vw: w.velocity,
      stretch: shape.position,
      vs: shape.velocity
    });
    paintLens();
    if (
      Math.abs(lens.x - target.x) +
        Math.abs(lens.width - target.width) +
        Math.abs(lens.vx) +
        Math.abs(lens.vw) +
        Math.abs(lens.stretch) * 100 +
        Math.abs(lens.vs) * 100 >
      0.08
    )
      sliderFrame = requestAnimationFrame(tick);
    else {
      Object.assign(lens, target, { vx: 0, vw: 0, vs: 0 });
      paintLens();
      sliderFrame = 0;
    }
  };
  sliderFrame = requestAnimationFrame(tick);
}
function updateLiquidSlider(animate = false) {
  if (!isAndroidApp || !isMobile.value || drag) return;
  const index = visibleMenus.value.findIndex((item: any) => item.path === route.path);
  const rect = tabRects()[index];
  if (!rect || !rect.width) {
    sliderStyle.value = { opacity: '0' };
    return;
  }
  lensTop = rect.top;
  lensHeight = rect.height;
  target = { x: rect.x, width: rect.width, stretch: 0 };
  if (!initialized || !animate) {
    cancelAnimationFrame(sliderFrame);
    Object.assign(lens, target, { vx: 0, vw: 0, vs: 0 });
    initialized = true;
    paintLens();
  } else springLens();
}
watch(
  () => route.path,
  async (value) => {
    path.value = value;
    if (drag) cancelSliderDrag();
    await nextTick();
    updateLiquidSlider(true);
  }
);
function startSliderDrag(event: PointerEvent) {
  if (!isAndroidApp || !isMobile.value || !event.isPrimary || event.button !== 0) return;
  suppressClick = false;
  drag = {
    id: event.pointerId,
    start: event.clientX,
    y: event.clientY,
    origin: lens.x,
    lastX: event.clientX,
    lastTime: event.timeStamp,
    velocity: 0,
    moved: false
  };
}
function moveSliderDrag(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.start;
  if (
    !drag.moved &&
    Math.abs(event.clientY - drag.y) > Math.abs(dx) &&
    Math.abs(event.clientY - drag.y) > 8
  ) {
    cancelSliderDrag();
    return;
  }
  if (!drag.moved && Math.abs(dx) < 8) return;
  if (!drag.moved) {
    drag.moved = true;
    sliderDragging.value = true;
    menuListRef.value?.setPointerCapture(event.pointerId);
    cancelAnimationFrame(sliderFrame);
  }
  event.preventDefault();
  const elapsed = Math.max(8, event.timeStamp - drag.lastTime);
  drag.velocity = (event.clientX - drag.lastX) / elapsed;
  drag.lastX = event.clientX;
  drag.lastTime = event.timeStamp;
  const rects = tabRects();
  const min = rects[0]?.x || 0,
    max = rects.at(-1)?.x || min;
  const raw = drag.origin + dx;
  lens.x = raw < min ? min + (raw - min) * 0.18 : raw > max ? max + (raw - max) * 0.18 : raw;
  lens.stretch = reducedMotion()
    ? 0
    : Math.min(0.22, Math.abs(drag.velocity) * 0.065 + Math.abs(dx) * 0.0003);
  lens.vx = Math.max(-900, Math.min(900, drag.velocity * 600));
  lens.vs = 0;
  paintLens();
}
function finishSliderDrag(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return;
  const moved = drag.moved;
  drag = null;
  sliderDragging.value = false;
  if (!moved) return;
  suppressClick = true;
  const rects = tabRects();
  const index = nearestTab(
    lens.x + lens.width / 2,
    rects.map((r) => r.x + r.width / 2)
  );
  const rect = rects[index];
  if (rect) {
    target = { x: rect.x, width: rect.width, stretch: 0 };
    springLens();
    void router.push(visibleMenus.value[index].path);
  }
  if (menuListRef.value?.hasPointerCapture(event.pointerId))
    menuListRef.value.releasePointerCapture(event.pointerId);
}
function cancelSliderDrag() {
  const id = drag?.id;
  const moved = drag?.moved;
  drag = null;
  sliderDragging.value = false;
  if (moved) {
    suppressClick = true;
    updateLiquidSlider(true);
  }
  if (id !== undefined && menuListRef.value?.hasPointerCapture(id))
    menuListRef.value.releasePointerCapture(id);
}
function handleLostSliderCapture(event: PointerEvent) {
  // Touch starts with implicit capture on the icon/link. Transferring capture
  // to the list emits a bubbling loss on that child; it is not a cancellation.
  if (event.target === menuListRef.value && drag?.id === event.pointerId) cancelSliderDrag();
}
function guardSliderClick(event: MouseEvent) {
  if (!suppressClick || event.detail === 0) return;
  suppressClick = false;
  event.preventDefault();
  event.stopPropagation();
}

onMounted(async () => {
  await nextTick();
  updateLiquidSlider();
  if (typeof ResizeObserver !== 'undefined' && menuListRef.value) {
    menuResizeObserver = new ResizeObserver(() => updateLiquidSlider());
    menuResizeObserver.observe(menuListRef.value);
  }
  window.addEventListener('resize', handleSliderResize);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(sliderFrame);
  menuResizeObserver?.disconnect();
  window.removeEventListener('resize', handleSliderResize);
});

const { t } = useI18n();

const isChecked = (item: any) => {
  return path.value === item.path;
};

const iconStyle = (item: any) => {
  const style = {
    fontSize: props.size,
    color: isChecked(item) ? props.selectColor : props.color
  };
  return style;
};

const toggleMenu = () => {
  settingsStore.setSetData({
    isMenuExpanded: !settingsStore.setData.isMenuExpanded
  });
};
</script>

<style lang="scss" scoped>
.haru-mark {
  display: block;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  object-fit: contain;
}
.app-menu {
  --haru-nav-icon: #84928b;
  --haru-nav-active: #315f55;
  width: 84px;
  padding: 0 10px;
}
.app-menu-expanded {
  width: 196px;
}
.app-menu-header {
  display: flex;
  align-items: center;
  padding: 0 13px 20px;
}
.app-menu-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.app-menu-logo:focus-visible,
.app-menu-item-link:focus-visible {
  outline: 2px solid #4b8173;
  outline-offset: 2px;
}
.app-menu-list {
  max-height: calc(100vh - 130px);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
}
.app-menu-item {
  margin-bottom: 5px;
}
.app-menu-item-link {
  display: flex;
  align-items: center;
  height: 45px;
  padding: 0 18px;
  border-radius: 10px;
  color: #7d8885;
  text-decoration: none;
  white-space: nowrap;
}
.app-menu-item-link:hover {
  background: #edf2f0;
}
.app-menu-item-link.is-active {
  background: #e5efeb;
  color: #315f55;
}
.app-menu-item-icon {
  width: 24px;
  text-align: center;
  flex-shrink: 0;
  transition: transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
}
.app-menu-item-link:active .app-menu-item-icon {
  transform: scale(0.94);
}
@media (hover: hover) and (pointer: fine) {
  .app-menu-item-link:hover .app-menu-item-icon {
    transform: translateX(2px);
  }
}
.app-menu-logo {
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.app-menu-logo:active {
  transform: scale(0.96);
}
.haru-name {
  color: #284c41;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
:global(.dark) .haru-name {
  color: #d1e7de;
}
.app-menu-item-text {
  font-size: 13px;
  font-weight: 600;
}
:global(.dark) .app-menu {
  --haru-nav-icon: #9fb0a8;
  --haru-nav-active: #b8dacc;
}
:global(.dark) .app-menu-item-link:hover {
  background: #252a29;
}
:global(.dark) .app-menu-item-link.is-active {
  background: #283c36;
  color: #a8d4c4;
}
@media (prefers-reduced-motion: reduce) {
  .app-menu-logo,
  .app-menu-item-icon {
    transition: none;
  }
  .app-menu-logo:active,
  .app-menu-item-link:active .app-menu-item-icon,
  .app-menu-item-link:hover .app-menu-item-icon {
    transform: none;
  }
}

.mobile {
  .app-menu {
    max-width: 100%;
    width: 100vw;
    position: relative;
    bottom: 0;
    left: 0;
    z-index: 99999;
    @apply bg-light dark:bg-black border-none border-gray-200 dark:border-gray-700;

    &-header {
      display: none;
    }

    &-list {
      @apply flex justify-between px-4;
      max-height: none !important; /* 移动端不限制高度 */
      overflow: visible !important; /* 移动端不需要滚动 */
    }

    &-item {
      &-link {
        @apply my-2 w-auto px-2;
        width: auto !important;
        margin-top: 8px;
        margin-bottom: 8px;
      }
    }

    &-expanded {
      @apply w-full;
    }
  }
}

.app-menu.android-hig-tabs {
  --haru-nav-icon: #77777c;
  --haru-nav-active: #fa2d48;
  width: 100%;
  padding: 0;

  .app-menu-list {
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    justify-content: space-around;
    align-items: stretch;
    gap: 4px;
    position: relative;
    padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px));
  }

  .app-menu-item {
    position: relative;
    z-index: 1;
    flex: 1 1 0;
    min-width: 0;
    margin: 0;
  }

  .app-menu-item-link {
    min-height: 56px;
    height: auto;
    width: 100% !important;
    margin: 0;
    padding: 4px 2px;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    border-radius: 14px;
    background: transparent;
    color: #77777c;
    transition:
      color 180ms cubic-bezier(0.2, 0.86, 0.28, 1),
      transform 220ms cubic-bezier(0.2, 0.86, 0.28, 1);
  }

  .app-menu-item-link.is-active,
  .app-menu-item-link.is-active:hover {
    background: transparent;
    color: #fa2d48;
  }

  .app-menu-item-link:active {
    transform: scale(0.94);
  }

  .app-menu-item-icon {
    width: 24px;
    height: 24px;
    line-height: 24px;
    font-size: 21px !important;
    color: currentColor !important;
  }

  .app-menu-item-text {
    display: block;
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    color: currentColor;
    font-size: 10px;
    font-weight: 500;
    line-height: 14px;
    text-overflow: ellipsis;
  }
}

.app-menu.android-hig-tabs .liquid-tab-slider {
  position: absolute;
  z-index: 0;
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 22px;
  background:
    radial-gradient(ellipse at 24% 10%, rgba(255, 255, 255, 0.22), transparent 62%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04));
  box-shadow:
    0 4px 14px rgba(80, 72, 70, 0.1),
    0 1px 0 rgba(255, 255, 255, 0.72) inset,
    0 -1px 0 rgba(255, 255, 255, 0.2) inset;
  backdrop-filter: blur(18px) saturate(1.55);
  -webkit-backdrop-filter: blur(18px) saturate(1.55);
  pointer-events: none;
  opacity: 0;
  will-change: transform;
}

.app-menu.android-hig-tabs .liquid-tab-slider.is-dragging {
  backdrop-filter: blur(12px) saturate(1.65);
}

:global(.dark) .app-menu.android-hig-tabs .liquid-tab-slider {
  border-color: rgba(255, 255, 255, 0.2);
  background:
    radial-gradient(ellipse at 24% 10%, rgba(255, 255, 255, 0.25), transparent 62%),
    linear-gradient(145deg, rgba(92, 92, 98, 0.2), rgba(40, 40, 44, 0.12));
  box-shadow:
    0 5px 16px rgba(0, 0, 0, 0.22),
    0 1px 0 rgba(255, 255, 255, 0.2) inset;
}

:global(.dark) .app-menu.android-hig-tabs {
  --haru-nav-icon: #a1a1a6;
  --haru-nav-active: #ff5268;

  .app-menu-item-link,
  .app-menu-item-link.is-active {
    color: var(--haru-nav-icon);
  }

  .app-menu-item-link.is-active,
  .app-menu-item-link.is-active:hover {
    color: var(--haru-nav-active);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-menu.android-hig-tabs .app-menu-item-link {
    transition: none;
  }

  .app-menu.android-hig-tabs .liquid-tab-slider {
    transition: none;
  }

  .app-menu.android-hig-tabs .app-menu-item-link:active {
    transform: none;
  }
}
</style>
