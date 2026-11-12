<template>
  <div
    id="layout-main"
    class="mobile-layout mobile"
    :class="{
      'has-safe-area': isPhone,
      'android-liquidglass': isAndroidApp,
      'player-expanded': playerStore.musicFull
    }"
  >
    <!-- 顶部头部 -->
    <mobile-header
      v-if="!playerStore.musicFull"
      :class="{ 'is-content-scrolled': headerHidden }"
      :inert="headerHidden || undefined"
      :aria-hidden="headerHidden ? 'true' : undefined"
    />

    <!-- 主内容区域 -->
    <div
      ref="contentRef"
      class="mobile-content"
      :class="{ 'has-bottom-menu': shouldShowBottomMenu, 'has-player': isPlay }"
    >
      <router-view v-slot="{ Component }" class="mobile-page">
        <keep-alive :include="keepAliveInclude">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>

    <!-- 底部播放条 -->
    <mobile-play-bar v-if="isPlay" />

    <!-- 底部导航菜单 -->
    <div v-if="shouldShowBottomMenu" class="mobile-bottom-menu">
      <app-menu class="mobile-menu" :menus="menuStore.menus" />
    </div>
    <!-- 其他弹窗/抽屉 -->
    <playlist-drawer v-model="showPlaylistDrawer" :song-id="currentSongId" />
    <playing-list-drawer />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  watch
} from 'vue';
import { useRoute } from 'vue-router';

import homeRouter from '@/router/home';
import otherRouter from '@/router/other';
import { useMenuStore } from '@/store/modules/menu';
import { usePlayerStore } from '@/store/modules/player';
import { isAndroidApp } from '@/utils';

import AppMenu from './components/AppMenu.vue';
import MobileHeader from './components/MobileHeader.vue';
const MobilePlayBar = defineAsyncComponent(() => import('@/components/player/MobilePlayBar.vue'));
const PlayingListDrawer = defineAsyncComponent(
  () => import('@/components/player/PlayingListDrawer.vue')
);
const PlaylistDrawer = defineAsyncComponent(() => import('@/components/common/PlaylistDrawer.vue'));

const props = defineProps<{
  isPhone: boolean;
}>();

const route = useRoute();
const playerStore = usePlayerStore();
const menuStore = useMenuStore();
const contentRef = ref<HTMLElement | null>(null);
const headerHidden = ref(false);
let pageObserver: MutationObserver | undefined;
let scrollHost: HTMLElement | null = null;
const handlePageScroll = () => {
  if (scrollHost) headerHidden.value = scrollHost.scrollTop > 16;
};
// Keep the scroll viewport edge-to-edge. Insets belong to scrollable content,
// never an opaque reserved band outside it. This also covers nested Naive scrollbars.
const bindPageScroll = () => {
  if (!isAndroidApp || !contentRef.value) return;
  const content = contentRef.value;
  const host =
    content.querySelector<HTMLElement>(
      '.mobile-page .n-scrollbar-container, .mobile-page.n-scrollbar .n-scrollbar-container'
    ) || content;
  if (host === scrollHost) return;
  scrollHost?.removeEventListener('scroll', handlePageScroll);
  scrollHost?.classList.remove('mobile-edge-scroll');
  scrollHost?.firstElementChild?.classList.remove('mobile-edge-body');
  scrollHost = host;
  content.classList.toggle('owns-page-scroll', host === content);
  host.classList.add('mobile-edge-scroll');
  host.firstElementChild?.classList.add('mobile-edge-body');
  host.addEventListener('scroll', handlePageScroll, { passive: true });
  handlePageScroll();
};
watch(
  () => route.path,
  async () => {
    headerHidden.value = false;
    await nextTick();
    bindPageScroll();
  }
);
onMounted(() => {
  bindPageScroll();
  pageObserver = new MutationObserver(bindPageScroll);
  if (contentRef.value) pageObserver.observe(contentRef.value, { childList: true, subtree: true });
});
onBeforeUnmount(() => {
  pageObserver?.disconnect();
  scrollHost?.removeEventListener('scroll', handlePageScroll);
});

// 提供是否有安全区域
provide('hasSafeArea', props.isPhone);

// 是否有播放的歌曲
const isPlay = computed(() => playerStore.playMusic && playerStore.playMusic.id);

// 是否显示底部菜单
const shouldShowBottomMenu = computed(() => {
  const menuPaths = menuStore.menus.map((item: any) => item.path);
  return menuPaths.includes(route.path) && !playerStore.musicFull;
});

// 提供给 MobilePlayBar 使用，用于调整播放栏位置
provide('shouldShowMobileMenu', shouldShowBottomMenu);

// Keep-alive 配置
const keepAliveInclude = computed(() => {
  const allRoutes = [...homeRouter, ...otherRouter];
  return allRoutes
    .filter((item) => item.meta?.keepAlive)
    .map((item) =>
      typeof item.name === 'string' ? item.name.charAt(0).toUpperCase() + item.name.slice(1) : ''
    )
    .filter(Boolean);
});

// 歌单抽屉
const showPlaylistDrawer = ref(false);
const currentSongId = ref<number | undefined>();

// 提供打开歌单抽屉的方法
const openPlaylistDrawer = (songId: number, isOpen: boolean = true) => {
  currentSongId.value = songId;
  showPlaylistDrawer.value = isOpen;
  playerStore.setMusicFull(false);
  playerStore.setPlayListDrawerVisible(!isOpen);
};

provide('openPlaylistDrawer', openPlaylistDrawer);
</script>

<style lang="scss" scoped>
.mobile-layout {
  @apply w-screen h-screen flex flex-col;
  @apply bg-light dark:bg-black;
  @apply overflow-hidden;
  position: relative;
}

.mobile-content {
  @apply flex-1 overflow-auto;

  // // 只有底部菜单
  // &.has-bottom-menu:not(.has-player) {
  //   padding-bottom: calc(60px + var(--safe-area-inset-bottom, 0px));
  // }

  // // 只有播放栏
  // &.has-player:not(.has-bottom-menu) {
  //   padding-bottom: calc(70px + var(--safe-area-inset-bottom, 0px));
  // }
}

.mobile-page {
  @apply h-full;
}

// Android uses separate floating surfaces for the mini player and tab bar.
.mobile-bottom-menu {
  @apply bg-light dark:bg-black;
  @apply border-t border-gray-200 dark:border-gray-800;
}

.mobile-menu {
  @apply w-full;
}

.android-liquidglass .mobile-content.has-bottom-menu {
  scroll-padding-bottom: calc(var(--safe-area-inset-bottom, 0px) + 88px);
}

.android-liquidglass .mobile-content.has-bottom-menu.has-player {
  scroll-padding-bottom: calc(var(--safe-area-inset-bottom, 0px) + 156px);
}

.android-liquidglass .mobile-content.has-player:not(.has-bottom-menu) {
  scroll-padding-bottom: calc(var(--safe-area-inset-bottom, 0px) + 80px);
}

.android-liquidglass .mobile-menu :deep(.app-menu) {
  width: 100%;
  max-width: 100%;
  padding: 0;
  background: transparent !important;
  border: 0;
}

.android-liquidglass .mobile-menu :deep(.app-menu-list) {
  padding: 0 8px !important;
}

.android-liquidglass .mobile-menu :deep(.app-menu-item-link),
.android-liquidglass .mobile-menu :deep(.app-menu-item-link.is-active) {
  background: transparent !important;
  box-shadow: none !important;
}
</style>
