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
      <div class="app-menu-list">
        <div v-for="item in visibleMenus" :key="item.path" class="app-menu-item">
          <n-tooltip
            :delay="200"
            :disabled="settingsStore.setData.isMenuExpanded || isMobile"
            placement="bottom"
          >
            <template #trigger>
              <router-link
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
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import { useSettingsStore } from '@/store';
import { isAndroidApp, isMobile } from '@/utils';

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
const path = ref(route.path);
const settingsStore = useSettingsStore();
const visibleMenus = computed(() =>
  isAndroidApp && isMobile.value
    ? props.menus.filter((item: any) => item.path !== '/album')
    : props.menus
);
watch(
  () => route.path,
  async (newParams) => {
    path.value = newParams;
  }
);

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
    display: flex;
    justify-content: space-around;
    align-items: stretch;
    gap: 4px;
    padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px));
  }

  .app-menu-item {
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

  .app-menu.android-hig-tabs .app-menu-item-link:active {
    transform: none;
  }
}
</style>
