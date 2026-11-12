<template>
  <!-- 移动端使用专用布局（平板模式下使用 PC 布局） -->
  <mobile-layout v-if="isPhone && !settingsStore.setData?.tabletMode" :is-phone="isPhone" />

  <!-- PC 端 / 浏览器移动端 / 平板模式 保持原有布局 -->
  <div
    v-else
    class="layout-page"
    :class="{
      mobile: settingsStore.isMobile,
      liquid: liquidMode,
      'desktop-editorial-shell': isElectron && !settingsStore.isMobile
    }"
    :style="layoutStyle"
  >
    <div id="layout-main" class="layout-main">
      <title-bar />
      <div class="layout-main-page">
        <!-- 侧边菜单栏 -->
        <nav
          v-if="liquidMode && !settingsStore.isMobile"
          class="liquid-sidebar"
          :class="{ 'is-collapsed': sidebarCollapsed }"
          aria-label="主导航"
        >
          <div class="liquid-brand">
            <span class="liquid-brand-icon">♫</span><span v-if="!sidebarCollapsed">HaruMusic</span>
            <button
              class="sidebar-toggle"
              type="button"
              :aria-label="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
              :aria-expanded="!sidebarCollapsed"
              :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
              @click="toggleSidebar"
            >
              <i :class="sidebarCollapsed ? 'ri-menu-unfold-line' : 'ri-menu-fold-line'" />
            </button>
          </div>
          <div v-if="!sidebarCollapsed" class="liquid-nav-label">音乐</div>
          <router-link
            v-for="item in menuStore.menus"
            :key="item.path"
            :to="item.path"
            class="liquid-nav-link"
            exact-active-class="active"
            :title="sidebarCollapsed ? t(item.meta.title) : undefined"
            ><i class="iconfont" :class="item.meta.icon" /><span>{{
              sidebarCollapsed ? '' : t(item.meta.title)
            }}</span></router-link
          >
          <template v-if="isElectron"
            ><div v-if="!sidebarCollapsed" class="liquid-nav-label" style="margin-top: 22px">
              资料库
            </div>
            <router-link
              to="/local-music"
              class="liquid-nav-link"
              exact-active-class="active"
              title="本地音乐"
              ><i class="ri-folder-music-line" /><span v-if="!sidebarCollapsed"
                >本地音乐</span
              ></router-link
            ><router-link
              to="/downloads"
              class="liquid-nav-link"
              exact-active-class="active"
              title="下载管理"
              ><i class="ri-download-cloud-2-line" /><span v-if="!sidebarCollapsed"
                >下载管理</span
              ></router-link
            ><router-link
              to="/playlist/import"
              class="liquid-nav-link"
              exact-active-class="active"
              title="导入歌单"
              ><i class="ri-import-line" /><span v-if="!sidebarCollapsed"
                >导入歌单</span
              ></router-link
            ></template
          >
          <div v-if="!sidebarCollapsed" class="liquid-sidebar-foot">
            <span>让音乐，留在此刻。</span>
          </div>
        </nav>
        <app-menu v-else-if="!settingsStore.isMobile" class="menu" :menus="menuStore.menus" />
        <div class="main">
          <!-- 搜索栏 -->
          <div class="layout-toolbar">
            <search-bar class="search-bar" /><button
              v-if="!settingsStore.isMobile"
              class="mode-switch"
              type="button"
              @click="toggleLiquidMode"
            >
              {{ liquidMode ? '关闭 Liquid Glass' : '切换 Liquid Glass' }}
            </button>
          </div>
          <!-- 主页面路由 -->
          <div
            class="main-content"
            :native-scrollbar="false"
            :class="{ 'mobile-content': !shouldShowMobileMenu }"
          >
            <router-view
              v-slot="{ Component }"
              class="main-page"
              :class="route.meta.noScroll && !settingsStore.isMobile ? 'pr-3' : ''"
            >
              <keep-alive :include="keepAliveInclude">
                <component :is="Component" />
              </keep-alive>
            </router-view>
          </div>
          <play-bottom v-if="!liquidMode" />
          <!-- 移动端底部菜单（浏览器模拟移动端时使用） -->
          <app-menu v-if="shouldShowMobileMenu" class="menu mobile-menu" :menus="menuStore.menus" />
        </div>
      </div>
      <!-- 底部音乐播放 -->
      <template v-if="!settingsStore.isMiniMode">
        <play-bar
          :liquid="liquidMode"
          v-if="!settingsStore.isMobile"
          v-show="isPlay && !playerStore.musicFull"
          :style="playerStore.musicFull ? 'bottom: 0;' : ''"
        />
        <mobile-play-bar
          v-else
          v-show="isPlay"
          :style="settingsStore.isMobile && playerStore.musicFull ? 'bottom: 0;' : ''"
        />
      </template>
    </div>
    <update-modal v-if="isElectron" />
    <playlist-drawer v-model="showPlaylistDrawer" :song-id="currentSongId" />
    <sleep-timer-top v-if="!settingsStore.isMobile" />
    <!-- 播放列表抽屉 -->
    <playing-list-drawer />
  </div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onMounted, provide, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import PlayBottom from '@/components/common/PlayBottom.vue';
import UpdateModal from '@/components/common/UpdateModal.vue';
import SleepTimerTop from '@/components/player/SleepTimerTop.vue';
import homeRouter from '@/router/home';
import otherRouter from '@/router/other';
import { useMenuStore } from '@/store/modules/menu';
import { usePlayerStore } from '@/store/modules/player';
import { useSettingsStore } from '@/store/modules/settings';
import { isElectron } from '@/utils';

// 关键布局组件同步导入（始终可见，避免加载闪烁）
import AppMenu from './components/AppMenu.vue';
import SearchBar from './components/SearchBar.vue';
import TitleBar from './components/TitleBar.vue';
// 移动端专用布局
import MobileLayout from './MobileLayout.vue';

const keepAliveInclude = computed(() => {
  const allRoutes = [...homeRouter, ...otherRouter];

  return allRoutes
    .filter((item) => {
      return item.meta?.keepAlive;
    })
    .map((item) => {
      return typeof item.name === 'string'
        ? item.name.charAt(0).toUpperCase() + item.name.slice(1)
        : '';
    })
    .filter(Boolean);
});

// 非关键组件保持异步加载
const PlayBar = defineAsyncComponent(() => import('@/components/player/PlayBar.vue'));
const MobilePlayBar = defineAsyncComponent(() => import('@/components/player/MobilePlayBar.vue'));
const PlayingListDrawer = defineAsyncComponent(
  () => import('@/components/player/PlayingListDrawer.vue')
);
const PlaylistDrawer = defineAsyncComponent(() => import('@/components/common/PlaylistDrawer.vue'));

const { t } = useI18n();
const liquidMode = ref(false);
const sidebarCollapsed = ref(false);
try {
  liquidMode.value = localStorage.getItem('haru-liquid-mode') === 'true';
  // Migrate removed UI mode without changing any music or source settings.
  if (localStorage.getItem('haru-salt-mode') === 'true') {
    liquidMode.value = true;
    localStorage.setItem('haru-liquid-mode', 'true');
  }
  localStorage.removeItem('haru-salt-mode');
  sidebarCollapsed.value = localStorage.getItem('haru-sidebar-collapsed') === 'true';
} catch {
  /* Storage can be unavailable. */
}
const toggleLiquidMode = () => {
  liquidMode.value = !liquidMode.value;
  document.documentElement.classList.toggle('liquid-mode', liquidMode.value);
  try {
    localStorage.setItem('haru-liquid-mode', String(liquidMode.value));
  } catch {
    /* Keep the session choice usable. */
  }
};
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  try {
    localStorage.setItem('haru-sidebar-collapsed', String(sidebarCollapsed.value));
  } catch {
    /* Keep the session choice usable. */
  }
};
onMounted(() => document.documentElement.classList.toggle('liquid-mode', liquidMode.value));
const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();
const menuStore = useMenuStore();
const liquidTone = computed(() => {
  const color = playerStore.playMusic?.primaryColor;
  return typeof color === 'string' && typeof CSS !== 'undefined' && CSS.supports('color', color)
    ? color
    : '#FA2D48';
});
const layoutStyle = computed(() => ({
  '--content-sidebar-width': `${settingsStore.setData?.isMenuExpanded ? 196 : 84}px`,
  ...(liquidMode.value
    ? {
        '--liquid-tone': liquidTone.value,
        '--sidebar-width': sidebarCollapsed.value ? '76px' : '260px'
      }
    : {})
}));

const isPlay = computed(() => playerStore.playMusic && playerStore.playMusic.id);
const route = useRoute();

// 判断当前路由是否应该在移动端显示AppMenu
const shouldShowMobileMenu = computed(() => {
  // 过滤出在menus中定义的路径
  const menuPaths = menuStore.menus.map((item: any) => item.path);
  // 检查当前路由路径是否在menus中
  return menuPaths.includes(route.path) && settingsStore.isMobile && !playerStore.musicFull;
});

provide('shouldShowMobileMenu', shouldShowMobileMenu);

// 使用 settingsStore.isMobile 进行移动端检测而不是 Capacitor 设备检测
const isPhone = computed(() => settingsStore.isMobile);

onMounted(() => {
  settingsStore.initializeSettings();
  settingsStore.initializeTheme();

  // Mini 模式下点了"添加到歌单"会记录歌曲并恢复主窗口，这里接力打开抽屉（#504）
  const pendingSongId = localStorage.getItem('pendingAddToPlaylistSongId');
  if (pendingSongId) {
    localStorage.removeItem('pendingAddToPlaylistSongId');
    nextTick(() => {
      openPlaylistDrawer(Number(pendingSongId));
    });
  }
});

const showPlaylistDrawer = ref(false);
const currentSongId = ref<number | undefined>();

// 提供一个方法来打开歌单抽屉
const openPlaylistDrawer = (songId: number, isOpen: boolean = true) => {
  currentSongId.value = songId;
  showPlaylistDrawer.value = isOpen;
  playerStore.setMusicFull(false);
  playerStore.setPlayListDrawerVisible(!isOpen);
};

// 将方法提供给全局
provide('openPlaylistDrawer', openPlaylistDrawer);
</script>

<style lang="scss" scoped>
.layout-toolbar {
  display: flex;
  align-items: flex-start;
  min-width: 0;
}
.search-bar {
  flex: 1;
  min-width: 0;
}
.mode-switch {
  flex: none;
  margin: 4px 20px 0 0;
  padding: 9px 13px;
  border: 1px solid rgba(120, 120, 120, 0.22);
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  background: color-mix(in srgb, var(--surface-secondary) 82%, var(--canvas));
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.65);
  cursor: pointer;
  transition:
    transform 0.32s cubic-bezier(0.2, 1.5, 0.4, 1),
    background 0.2s;
}
.mode-switch:active {
  transform: scale(0.94);
}
.mode-switch:focus-visible,
.liquid-nav-link:focus-visible {
  outline: 2px solid #f0576c;
  outline-offset: 3px;
}
.liquid-sidebar {
  position: relative;
  isolation: isolate;
  width: var(--sidebar-width, 260px);
  flex: none;
  display: flex;
  flex-direction: column;
  padding: 26px 18px 24px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.24), var(--surface-glass) 58%);
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(34px) saturate(175%);
  overflow: auto;
  transition:
    width 420ms cubic-bezier(0.22, 1, 0.36, 1),
    padding 420ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 240ms ease;
  box-shadow: inset -1px 0 rgba(255, 255, 255, 0.42);
}
.liquid-sidebar.is-collapsed {
  --sidebar-width: 76px;
  align-items: stretch;
  padding-inline: 10px;
}
.liquid-sidebar::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  content: '';
  pointer-events: none;
  background: radial-gradient(
    ellipse 320px 260px at 8% 0%,
    color-mix(in srgb, var(--liquid-tone) 8%, transparent),
    transparent 76%
  );
}
.liquid-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  margin: 0 8px 42px;
  font-size: 21px;
  font-weight: 750;
  letter-spacing: -0.05em;
}
.liquid-sidebar.is-collapsed .liquid-brand {
  flex-direction: column;
  justify-content: flex-start;
  gap: 8px;
  margin-inline: 0;
  margin-bottom: 24px;
}
.sidebar-toggle {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin-left: auto;
  flex: none;
  border: 0;
  border-radius: 12px;
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;
  transition:
    color 180ms ease,
    background-color 180ms ease,
    transform 320ms cubic-bezier(0.2, 1.45, 0.35, 1);
}
.sidebar-toggle i {
  font-size: 19px;
}
.sidebar-toggle:hover {
  color: var(--text-primary);
  background: rgba(127, 127, 127, 0.09);
}
.sidebar-toggle:active {
  transform: scale(0.9);
}
.liquid-sidebar.is-collapsed .sidebar-toggle {
  margin: 0;
}
.liquid-brand-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 14px;
  color: white;
  background: linear-gradient(145deg, #303034, #141416);
  font-size: 24px;
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.24),
    0 4px 12px rgba(0, 0, 0, 0.16);
}
.liquid-nav-label {
  margin: 0 12px 10px;
  font-size: 12px;
  font-weight: 700;
  color: #929292;
}
.liquid-nav-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  transition:
    transform 0.3s cubic-bezier(0.2, 1.45, 0.35, 1),
    background-color 0.2s ease,
    color 0.18s ease;
}
.liquid-sidebar.is-collapsed .liquid-nav-link {
  justify-content: center;
  padding-inline: 0;
}
.liquid-sidebar.is-collapsed .liquid-nav-link i {
  font-size: 20px;
}
.liquid-nav-link::before {
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 18px;
  border-radius: 0 4px 4px 0;
  background: var(--accent);
  content: '';
  opacity: 0;
  transform: translate(-1px, -50%) scaleY(0.5);
  transition:
    opacity 0.18s ease,
    transform 0.3s cubic-bezier(0.2, 1.45, 0.35, 1);
}
.liquid-nav-link:hover {
  transform: translateX(2px);
  background: rgba(127, 127, 127, 0.07);
}
.liquid-nav-link i {
  color: var(--text-secondary);
  font-size: 19px;
  transition:
    color 0.18s ease,
    transform 0.3s cubic-bezier(0.2, 1.45, 0.35, 1);
}
.liquid-nav-link.active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-secondary));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent);
}
.liquid-nav-link.active::before {
  opacity: 1;
  transform: translate(0, -50%) scaleY(1);
}
.liquid-nav-link.active i {
  color: var(--accent);
  transform: scale(1.04);
}
.liquid-nav-link:active {
  transform: translateX(1px) scale(0.975);
}
.liquid-sidebar-foot {
  margin: auto 12px 0;
  padding-top: 20px;
  border-top: 1px solid rgba(127, 127, 127, 0.14);
  color: #999;
  font-size: 12px;
}
.liquid-sidebar > * {
  position: relative;
  z-index: 1;
}
:global(.dark) .liquid-sidebar {
  background: var(--surface-glass);
  border-color: rgba(255, 255, 255, 0.07);
}
:global(.dark) .liquid-nav-link {
  color: #aaa;
}
:global(.dark) .liquid-nav-link.active {
  color: #fff;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-secondary));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
}
.liquid .main {
  padding-top: 14px;
}
.layout-page.liquid {
  background-color: var(--canvas);
  background-image:
    radial-gradient(
      ellipse 780px 520px at 94% 0%,
      color-mix(in srgb, var(--liquid-tone) 6%, transparent),
      transparent 72%
    ),
    radial-gradient(
      ellipse 620px 420px at 52% 100%,
      color-mix(in srgb, var(--liquid-tone) 3%, transparent),
      transparent 74%
    );
}
.liquid .main,
.liquid .main-content {
  background: transparent;
}
.liquid :deep(.main-page) {
  background-color: transparent !important;
}
.liquid :deep(.tabs-track) {
  display: none !important;
}
.liquid :deep(.search-inner) {
  border-radius: 10px;
  background: var(--surface-secondary);
  border: 0;
  box-shadow: none;
}
.liquid :deep(.search-input) {
  font-size: 15px;
}
.liquid :deep(.hot-search-card) {
  padding: 12px 8px;
  gap: 12px;
  border-radius: 0;
  background: transparent !important;
  border-bottom: 1px solid var(--divider);
  box-shadow: none !important;
}
.liquid :deep(.search-page-container section > .grid) {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.liquid :deep(.search-history-card) {
  background: var(--surface-secondary);
  border-radius: 99px;
}
.liquid :deep(.sticky-tabs) {
  background: color-mix(in srgb, var(--canvas) 94%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--divider) 72%, transparent);
}
.liquid :deep(.list-card),
.liquid :deep(.home-list-card),
.liquid :deep(.hot-search-card) {
  transform-origin: center;
  transition:
    transform 0.3s cubic-bezier(0.2, 1.45, 0.35, 1),
    background-color 0.2s ease,
    color 0.18s ease;
}
.liquid :deep(.list-card:active),
.liquid :deep(.home-list-card:active),
.liquid :deep(.hot-search-card:active) {
  transform: scale(0.975);
}
.liquid :deep(.liquid-settings-nav) {
  background: color-mix(in srgb, var(--canvas) 92%, transparent) !important;
  border-color: color-mix(in srgb, var(--divider) 72%, transparent) !important;
}
.liquid :deep(.settings-tab) {
  border-radius: 14px;
  transition:
    transform 0.28s cubic-bezier(0.2, 1.45, 0.35, 1),
    color 0.18s ease,
    background-color 0.18s ease;
}
.liquid :deep(.settings-tab:active) {
  transform: scale(0.96);
}
.liquid :deep(.settings-tab-active) {
  color: var(--accent) !important;
}
.liquid :deep(.settings-tab-active::after) {
  background: var(--accent) !important;
  height: 3px;
  transition:
    left 0.3s cubic-bezier(0.2, 1.45, 0.35, 1),
    right 0.3s cubic-bezier(0.2, 1.45, 0.35, 1);
}
.liquid :deep(.home-heading h1) {
  font-size: 45px;
  letter-spacing: -0.055em;
}
.liquid :deep(.home-heading) {
  padding-top: 24px;
}
.liquid :deep(.desktop-editorial .home-heading h1) {
  font-size: 34px;
  letter-spacing: -0.04em;
}
.liquid :deep(.desktop-editorial .home-heading) {
  padding-top: 32px;
}
.liquid :deep(.desktop-editorial) {
  background-color: transparent !important;
}
.liquid :deep(.hero-section) {
  display: none;
}
.liquid :deep(.home-list-card .cover-art) {
  border-radius: 8px;
}
.liquid :deep(.home-list-card h3) {
  font-size: 14px;
  font-weight: 650;
}
.liquid :deep(.home-list-card p) {
  margin-top: 3px;
  font-size: 13px;
}
.liquid :deep(.home-list-card [class*='backdrop-blur']) {
  backdrop-filter: none;
}
.liquid :deep(.music-play-bar) {
  position: fixed;
  left: calc(var(--sidebar-width, 260px) + (100vw - var(--sidebar-width, 260px)) / 2);
  right: auto;
  bottom: max(24px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  animation: none !important;
  width: min(880px, calc(100vw - var(--sidebar-width, 260px) - 48px));
  height: 72px;
  padding: 8px 20px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 28px;
  background: var(--surface-glass);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.18),
    inset 0 1px rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(30px) saturate(180%);
}
@media (max-width: 900px) {
  .liquid :deep(.music-play-bar) {
    left: calc(var(--sidebar-width, 260px) + (100vw - var(--sidebar-width, 260px)) / 2);
    bottom: max(16px, env(safe-area-inset-bottom));
    width: min(600px, calc(100vw - var(--sidebar-width, 260px) - 32px));
    height: 68px;
    padding-inline: 16px;
  }
}
:global(.dark) .liquid :deep(.music-play-bar) {
  background: var(--surface-glass);
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.liquid :deep(.music-play-bar .music-content) {
  width: auto;
  flex: 1;
  min-width: 70px;
}
.liquid :deep(.music-play-bar .music-buttons) {
  flex: none;
  margin-inline: 10px;
  justify-content: flex-end;
}
.liquid :deep(.music-play-bar .music-buttons-play) {
  background: transparent;
  color: var(--text-primary);
}
.liquid :deep(.music-play-bar .music-buttons-play .icon) {
  font-size: 30px;
}
.liquid :deep(.music-play-bar .music-time .n-slider) {
  width: 100%;
}
.liquid :deep(.music-play-bar .music-time) {
  position: absolute;
  left: 82px;
  right: 28px;
  top: auto;
  bottom: 4px;
  width: auto;
}
.liquid :deep(.music-buttons > button) {
  transition: transform 0.32s cubic-bezier(0.2, 1.5, 0.4, 1);
}
.liquid :deep(.music-buttons > button:active) {
  transform: scale(0.88);
}
:global(.liquid-mode) {
  --radius-control: 14px;
  --radius-surface: 22px;
}
:global(.liquid-mode button),
:global(.liquid-mode input:not([type='checkbox']):not([type='radio']):not([type='range'])),
:global(.liquid-mode select),
:global(.liquid-mode textarea) {
  border-radius: var(--radius-control);
}
:global(.liquid-mode button:not(:disabled)) {
  transition:
    transform 0.28s cubic-bezier(0.2, 1.45, 0.35, 1),
    color 0.18s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;
}
:global(.liquid-mode button:not(:disabled):active) {
  transform: scale(0.96);
}
:global(.liquid-mode .n-dialog),
:global(.liquid-mode .n-modal),
:global(.liquid-mode .n-drawer-content),
:global(.liquid-mode .n-popover),
:global(.liquid-mode .n-popover-shared) {
  border-radius: var(--radius-surface);
}
:global(.liquid-mode .n-popover-shared),
:global(.liquid-mode .n-dialog) {
  overflow: hidden;
}
@media (prefers-reduced-motion: reduce) {
  .mode-switch,
  .liquid-sidebar,
  .liquid-nav-link,
  .sidebar-toggle,
  :global(.liquid-mode button:not(:disabled)),
  :global(.liquid-mode button:not(:disabled):active),
  .liquid :deep(.music-buttons > button) {
    transition: none;
    transform: none;
  }
}
:global(.liquid-mode .playlist-panel-header) {
  background: var(--canvas) !important;
  backdrop-filter: none !important;
  border-color: var(--divider) !important;
}
:global(.liquid-mode .playlist-panel) {
  background: var(--canvas) !important;
  box-shadow: none !important;
  border: 1px solid var(--divider);
}
:global(.liquid-mode .n-input) {
  background: var(--surface-secondary);
  border-radius: 10px;
}
:global(.liquid-mode .n-card),
:global(.liquid-mode .n-list) {
  box-shadow: none !important;
}

/* Desktop reading column: keep artwork and rows on a shared editorial grid. */
.desktop-editorial-shell :deep(.sticky-page-content),
.desktop-editorial-shell :deep(.search-content),
.desktop-editorial-shell :deep(.search-result-content),
.desktop-editorial-shell :deep(.toplist-content),
.desktop-editorial-shell :deep(.music-list-content),
.desktop-editorial-shell :deep(.local-music-content),
.desktop-editorial-shell :deep(.download-content),
.desktop-editorial-shell :deep(.settings-content),
.desktop-editorial-shell :deep(.library-overview) {
  width: 100%;
  max-width: 1040px;
  margin-inline: auto;
  padding-inline: 32px;
}
.desktop-editorial-shell :deep(.sticky-page-content > .page-padding),
.desktop-editorial-shell :deep(.sticky-page-content .sticky-tabs .page-padding),
.desktop-editorial-shell :deep(.search-result-content .page-padding-x),
.desktop-editorial-shell :deep(.music-list-content .page-padding-x),
.desktop-editorial-shell :deep(.local-music-content .page-padding-x),
.desktop-editorial-shell :deep(.download-content .page-padding-x) {
  padding-inline: 0;
}
.desktop-editorial-shell :deep(.sticky-page-content > .page-padding:first-child),
.desktop-editorial-shell :deep(.search-content > div:first-child),
.desktop-editorial-shell :deep(.toplist-content > div:first-child) {
  padding-top: 32px;
  padding-bottom: 24px;
  margin-bottom: 0;
  border-bottom: 1px solid var(--divider);
}
.desktop-editorial-shell :deep(.sticky-page-content h1),
.desktop-editorial-shell :deep(.search-content h1),
.desktop-editorial-shell :deep(.search-result-content h1),
.desktop-editorial-shell :deep(.toplist-content h1),
.desktop-editorial-shell :deep(.liquid-settings-nav h1),
.desktop-editorial-shell :deep(.music-list-content h1),
.desktop-editorial-shell :deep(.local-music-content h1),
.desktop-editorial-shell :deep(.download-content h1) {
  font-size: 34px;
  line-height: 1.15;
  letter-spacing: -0.04em;
  font-weight: 700;
}
.desktop-editorial-shell :deep(.sticky-tabs) {
  box-shadow: none !important;
  border-bottom: 1px solid var(--divider);
  background: var(--canvas);
}
.desktop-editorial-shell :deep(.sticky-tabs > div) {
  background: var(--canvas);
  border: 0;
}
.desktop-editorial-shell :deep(.sticky-page-content > .page-padding:last-child) {
  padding-top: 24px;
}
.desktop-editorial-shell :deep(.search-content section > .grid) {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.desktop-editorial-shell :deep(.hot-search-card) {
  padding: 16px 8px;
  border-radius: 0;
  border-bottom: 1px solid var(--divider);
  background: transparent !important;
  box-shadow: none;
}
.desktop-editorial-shell :deep(.hot-search-card > span:first-child) {
  color: var(--text-secondary);
  font-style: normal;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.desktop-editorial-shell :deep(.search-result-content .action-bar) {
  background: var(--canvas) !important;
  backdrop-filter: none !important;
}
.desktop-editorial-shell :deep(.local-music-content .hero-bg),
.desktop-editorial-shell :deep(.download-content .hero-bg),
.desktop-editorial-shell :deep(.music-list-content .cover-glow) {
  display: none;
}
.desktop-editorial-shell :deep(.music-list-content .cover-container),
.desktop-editorial-shell :deep(.local-music-content .cover-container),
.desktop-editorial-shell :deep(.download-content .cover-container) {
  box-shadow: none !important;
  --tw-ring-shadow: 0 0 #0000;
}
.desktop-editorial-shell :deep(.list-card [class*='backdrop-blur']),
.desktop-editorial-shell :deep(.toplist-card [class*='backdrop-blur']) {
  backdrop-filter: none;
}
.desktop-editorial-shell :deep(.list-card > div:first-child),
.desktop-editorial-shell :deep(.toplist-card > div:first-child) {
  box-shadow: none !important;
  border-radius: 12px;
}
.desktop-editorial-shell :deep(.list-card h3),
.desktop-editorial-shell :deep(.toplist-card h3) {
  font-size: 15px;
  font-weight: 600;
}
.desktop-editorial-shell :deep(.liquid-settings-nav) {
  width: 100%;
  max-width: 1040px;
  margin-inline: auto;
  padding: 32px 32px 8px;
  background: var(--canvas);
  border-color: var(--divider);
}
.desktop-editorial-shell :deep(.library-overview) {
  gap: 32px;
  padding-top: 32px;
}
.desktop-editorial-shell :deep(.library-overview > .flex-item) {
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.desktop-editorial-shell :deep(.library-overview > .flex-item + .flex-item) {
  border-left: 1px solid var(--divider);
  padding-left: 32px;
}
/* A single lead cover anchors discovery pages; smaller covers support it. */
.desktop-editorial-shell :deep(.album-editorial-grid),
.desktop-editorial-shell :deep(.playlist-editorial-grid),
.desktop-editorial-shell :deep(.chart-editorial-grid),
.desktop-editorial-shell :deep(.podcast-feature-grid),
.desktop-editorial-shell :deep(.podcast-category-grid) {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
  align-items: start;
}
.desktop-editorial-shell :deep(.toplist-grid-container) {
  padding-top: 24px;
}
.desktop-editorial-shell :deep(.album-editorial-grid > :first-child),
.desktop-editorial-shell :deep(.playlist-editorial-grid > :first-child),
.desktop-editorial-shell :deep(.chart-editorial-grid > :first-child),
.desktop-editorial-shell :deep(.podcast-feature-grid > :first-child),
.desktop-editorial-shell :deep(.podcast-category-grid > :first-child) {
  grid-column: span 2;
  grid-row: span 2;
}
.desktop-editorial-shell :deep(.album-editorial-grid > :first-child h3),
.desktop-editorial-shell :deep(.playlist-editorial-grid > :first-child h3),
.desktop-editorial-shell :deep(.chart-editorial-grid > :first-child h3),
.desktop-editorial-shell :deep(.podcast-feature-grid > :first-child h3),
.desktop-editorial-shell :deep(.podcast-category-grid > :first-child h3) {
  font-size: 17px;
  line-height: 24px;
  font-weight: 650;
}
.desktop-editorial-shell :deep(.podcast-subscriptions) {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(144px, 184px);
  grid-template-columns: none;
  overflow-x: auto;
  padding-bottom: 16px;
  scroll-snap-type: x proximity;
}
.desktop-editorial-shell :deep(.podcast-subscriptions > *) {
  scroll-snap-align: start;
}
.desktop-editorial-shell :deep(.podcast-recommendations h2 + div) {
  display: none;
}
.desktop-editorial-shell :deep(.radio-card > div:first-child) {
  border-radius: 12px;
  box-shadow: none !important;
}
.desktop-editorial-shell :deep(.radio-card img),
.desktop-editorial-shell :deep(.album-editorial-grid img),
.desktop-editorial-shell :deep(.chart-editorial-grid img) {
  transition: transform 280ms cubic-bezier(0.2, 1.2, 0.3, 1);
}
.desktop-editorial-shell :deep(.radio-card:hover img),
.desktop-editorial-shell :deep(.album-editorial-grid .list-card:hover img),
.desktop-editorial-shell :deep(.chart-editorial-grid .toplist-card:hover img) {
  transform: scale(1.015);
}
.desktop-editorial-shell :deep(.radio-card h3) {
  font-size: 15px;
  font-weight: 600;
}
.desktop-editorial-shell :deep(.radio-card [class*='backdrop-blur']) {
  backdrop-filter: none;
}
@media (min-width: 801px) {
  .desktop-editorial-shell :deep(.chart-editorial-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 32px;
    row-gap: 16px;
  }
  .desktop-editorial-shell :deep(.chart-editorial-grid > :first-child) {
    grid-column: auto;
    grid-row: span 4;
  }
  .desktop-editorial-shell :deep(.chart-editorial-grid > :not(:first-child)) {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--divider);
  }
  .desktop-editorial-shell :deep(.chart-editorial-grid > :not(:first-child) > div:first-child) {
    width: 72px;
    flex: none;
    border-radius: 8px;
  }
  .desktop-editorial-shell :deep(.chart-editorial-grid > :not(:first-child) > div:nth-child(2)) {
    min-width: 0;
    margin-top: 0;
  }
}
@media (max-width: 800px) {
  .desktop-editorial-shell :deep(.album-editorial-grid),
  .desktop-editorial-shell :deep(.playlist-editorial-grid),
  .desktop-editorial-shell :deep(.chart-editorial-grid),
  .desktop-editorial-shell :deep(.podcast-feature-grid),
  .desktop-editorial-shell :deep(.podcast-category-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .desktop-editorial-shell :deep(.album-editorial-grid > :first-child),
  .desktop-editorial-shell :deep(.playlist-editorial-grid > :first-child),
  .desktop-editorial-shell :deep(.chart-editorial-grid > :first-child),
  .desktop-editorial-shell :deep(.podcast-feature-grid > :first-child),
  .desktop-editorial-shell :deep(.podcast-category-grid > :first-child) {
    grid-row: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .desktop-editorial-shell :deep(.radio-card img),
  .desktop-editorial-shell :deep(.album-editorial-grid img),
  .desktop-editorial-shell :deep(.chart-editorial-grid img) {
    transition: none;
    transform: none !important;
  }
}
@media (max-width: 800px) {
  .desktop-editorial-shell :deep(.sticky-page-content),
  .desktop-editorial-shell :deep(.search-content),
  .desktop-editorial-shell :deep(.search-result-content),
  .desktop-editorial-shell :deep(.toplist-content),
  .desktop-editorial-shell :deep(.music-list-content),
  .desktop-editorial-shell :deep(.local-music-content),
  .desktop-editorial-shell :deep(.download-content),
  .desktop-editorial-shell :deep(.settings-content),
  .desktop-editorial-shell :deep(.library-overview) {
    padding-inline: 16px;
  }
}

.layout-page {
  @apply w-screen h-screen overflow-hidden bg-light dark:bg-black;
  transition: --sidebar-width 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

@property --sidebar-width {
  syntax: '<length>';
  inherits: true;
  initial-value: 260px;
}

.layout-main {
  @apply w-full h-full relative text-gray-900 dark:text-white;
}

.layout-main-page {
  @apply flex;
  height: calc(100% - 44px);
}

.menu {
  @apply h-full;
  background: #f4f7f5;
}

.main {
  @apply overflow-hidden flex-1 flex flex-col;
  min-width: 0;
  padding-top: 5px;
}

:global(.dark) .menu {
  background: #111815;
}

.main-content {
  @apply flex-1 overflow-hidden;
}

.main-page {
  @apply h-full;
}

.mobile {
  .main-content {
    height: calc(100vh - 130px);
    overflow: auto;
    display: block;
    flex: none;
    position: relative;
  }

  .mobile-content {
    height: calc(100vh - 75px);
    position: relative;
  }
}
</style>
