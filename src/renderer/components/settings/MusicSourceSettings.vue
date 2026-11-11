<template>
  <responsive-modal
    v-model="visible"
    :title="t('settings.playback.musicSources')"
    @close="handleClose"
  >
    <div class="flex flex-col h-full">
      <input
        ref="pluginFileInput"
        class="hidden"
        type="file"
        accept=".js,.mjs,.cjs,.txt,application/javascript,text/plain"
        @change="handlePluginFileSelected"
      />
      <input
        ref="customApiFileInput"
        class="hidden"
        type="file"
        accept=".json,application/json"
        @change="handleCustomApiFileSelected"
      />
      <!-- 顺序说明：启用中的音源按序号依次尝试解析 -->
      <div class="flex items-center gap-1.5 px-1 pb-2 shrink-0">
        <i class="ri-sort-asc text-xs text-gray-400"></i>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ t('settings.playback.pluginSources.orderHint') }}
        </span>
      </div>

      <div class="h-[420px] overflow-y-auto overscroll-contain">
        <section
          class="music-free-plugin-catalog mb-4 rounded-2xl border border-gray-100 bg-gray-50/80 p-3 dark:border-white/5 dark:bg-white/[0.035]"
        >
          <div class="mb-2 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-semibold text-gray-800 dark:text-gray-100">
                MusicFree 插件订阅
              </p>
              <p class="mt-0.5 text-[10px] text-gray-400">选一个目录浏览，再逐个导入需要的音源</p>
            </div>
            <div v-if="activeSubscription" class="flex shrink-0 items-center gap-1">
              <button
                class="rounded-xl px-2.5 py-1.5 text-xs text-primary transition active:scale-95 hover:bg-primary/10"
                :disabled="isLoadingSubscription"
                @click="retryActiveSubscription"
              >
                {{ isLoadingSubscription ? '读取中' : '重试' }}
              </button>
              <button
                class="rounded-xl px-2.5 py-1.5 text-xs text-gray-500 transition active:scale-95 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
                @click="
                  activeSubscription = null;
                  subscriptionPlugins = [];
                "
              >
                返回
              </button>
            </div>
          </div>
          <template v-if="!activeSubscription">
            <button
              v-for="subscription in musicFreeSubscriptions"
              :key="subscription.url"
              class="mb-1.5 flex w-full items-center justify-between gap-3 rounded-xl bg-white/80 px-3 py-2.5 text-left transition hover:bg-white active:scale-[0.99] dark:bg-white/[0.045] dark:hover:bg-white/[0.08]"
              @click="openMusicFreeSubscription(subscription)"
            >
              <span class="truncate text-xs font-medium text-gray-700 dark:text-gray-200">{{
                subscription.name
              }}</span>
              <span class="shrink-0 text-[11px] text-gray-400">{{
                subscription.pluginCount ? `${subscription.pluginCount} 个插件` : '浏览 →'
              }}</span>
            </button>
            <p v-if="subscriptionError" class="px-1 pt-1 text-[10px] text-red-500">
              {{ subscriptionError }}
            </p>
          </template>
          <template v-else>
            <div v-if="isLoadingSubscription" class="py-6 text-center text-xs text-gray-400">
              正在读取插件目录…
            </div>
            <div v-else-if="subscriptionError" class="space-y-2 py-4 text-center">
              <p class="text-xs leading-relaxed text-red-500">{{ subscriptionError }}</p>
              <button
                class="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary active:scale-95"
                type="button"
                @click="retryActiveSubscription"
              >
                重新读取
              </button>
            </div>
            <div v-else-if="subscriptionPlugins.length" class="space-y-1">
              <div
                v-for="plugin in subscriptionPlugins"
                :key="plugin.url"
                class="flex items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-white/70 dark:hover:bg-white/[0.06]"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium text-gray-800 dark:text-gray-100">
                    {{ plugin.name }}
                  </p>
                  <p class="text-[10px] text-gray-400">
                    {{ plugin.version ? `v${plugin.version}` : 'MusicFree' }}
                  </p>
                </div>
                <button
                  class="shrink-0 rounded-xl bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/15 active:scale-95 disabled:opacity-50"
                  :disabled="isImportingPlugin || isPluginImported(plugin.url)"
                  @click="importSubscriptionPlugin(plugin)"
                >
                  {{ isPluginImported(plugin.url) ? '已导入' : '导入' }}
                </button>
              </div>
            </div>
            <p v-else-if="!isLoadingSubscription" class="py-4 text-center text-xs text-gray-400">
              订阅目录没有可用插件
            </p>
          </template>
        </section>

        <template v-for="group in sourceGroups" :key="group.key">
          <p
            class="px-1 pt-3 pb-1 text-[11px] font-medium text-gray-400 dark:text-gray-500 first:pt-1"
          >
            {{ group.title }}
          </p>
          <div class="divide-y divide-gray-100 dark:divide-white/5">
            <template v-for="source in group.rows" :key="source.key">
              <div class="group flex items-center gap-3 py-2.5 px-1">
                <!-- 序号（启用中才有，传达解析优先级）；停用显示图标 -->
                <span
                  v-if="orderNumberOf(source.key)"
                  class="flex items-center justify-center w-5 h-5 rounded-md bg-primary text-white text-[11px] font-semibold tabular-nums shrink-0"
                >
                  {{ orderNumberOf(source.key) }}
                </span>
                <i
                  v-else
                  class="ri-disc-line text-base text-gray-300 dark:text-gray-600 shrink-0 w-5 text-center"
                ></i>

                <!-- 名称与描述 -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span
                      class="text-sm truncate"
                      :class="
                        isEnabled(source.key)
                          ? 'font-medium text-gray-900 dark:text-white'
                          : 'text-gray-400 dark:text-gray-500'
                      "
                    >
                      {{ source.label || source.key }}
                    </span>
                    <span
                      v-if="source.kind === 'plugin'"
                      class="text-[10px] leading-none px-1.5 py-0.5 rounded shrink-0 text-gray-400 bg-gray-100 dark:bg-white/10 dark:text-gray-500"
                    >
                      {{ dialectLabel(source.dialect) }}
                    </span>
                  </div>
                  <p
                    v-if="source.description"
                    class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate"
                    :title="source.description"
                  >
                    {{ source.description }}
                  </p>
                </div>

                <!-- hover 操作（customApi 配置 / 插件排序·变量·删除） -->
                <div
                  class="flex items-center gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                >
                  <button
                    v-if="source.key === 'customApi'"
                    class="p-1.5 rounded-lg text-gray-400 hover:text-violet-500 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    :title="t('settings.playback.customApi.importConfig')"
                    @click="importCustomApi"
                  >
                    <i class="ri-upload-line text-sm"></i>
                  </button>
                  <template v-if="source.kind === 'plugin'">
                    <button
                      class="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      :disabled="source.first"
                      :title="t('settings.playback.pluginSources.moveUp')"
                      @click="moveSource(source.key, -1)"
                    >
                      <i class="ri-arrow-up-line text-sm"></i>
                    </button>
                    <button
                      class="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      :disabled="source.last"
                      :title="t('settings.playback.pluginSources.moveDown')"
                      @click="moveSource(source.key, 1)"
                    >
                      <i class="ri-arrow-down-line text-sm"></i>
                    </button>
                    <button
                      v-if="source.vars?.length"
                      class="p-1.5 rounded-lg text-gray-400 hover:text-cyan-500 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                      :title="t('settings.playback.pluginSources.editVars')"
                      @click="toggleVarsEditor(source.pluginId!)"
                    >
                      <i class="ri-settings-3-line text-sm"></i>
                    </button>
                    <button
                      class="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                      :title="t('settings.playback.pluginSources.remove')"
                      @click="removePlugin(source)"
                    >
                      <i class="ri-delete-bin-line text-sm"></i>
                    </button>
                  </template>
                </div>

                <!-- 开关（恒显、右对齐固定宽度） -->
                <div class="shrink-0 w-9 flex justify-end">
                  <n-switch
                    :value="isEnabled(source.key)"
                    size="small"
                    @update:value="(v: boolean) => toggleSource(source, v)"
                  />
                </div>
              </div>

              <!-- 变量编辑（紧贴所属插件行展开） -->
              <div v-if="varsEditorId === source.pluginId && source.vars?.length" class="px-1 pb-3">
                <div
                  class="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 p-3 space-y-2.5"
                >
                  <div
                    v-for="pluginVar in source.vars"
                    :key="pluginVar.key"
                    class="flex items-center gap-3"
                  >
                    <span
                      class="text-xs text-gray-500 w-28 shrink-0 truncate"
                      :title="pluginVar.key"
                    >
                      {{ pluginVar.label }}
                      <i v-if="pluginVar.required" class="text-red-500">*</i>
                    </span>
                    <n-input
                      :value="source.userVars?.[pluginVar.key] || ''"
                      size="small"
                      :type="pluginVar.type === 'secret' ? 'password' : 'text'"
                      :show-password-on="pluginVar.type === 'secret' ? 'click' : undefined"
                      :placeholder="pluginVar.placeholder"
                      @update:value="
                        (v: string) => setPluginVar(source.pluginId!, pluginVar.key, v)
                      "
                    />
                  </div>
                  <p class="text-[10px] text-gray-400">
                    {{ t('settings.playback.pluginSources.varsHint') }}
                  </p>
                </div>
              </div>
            </template>
          </div>

          <!-- 插件空状态 -->
          <div
            v-if="group.key === 'plugin' && group.rows.length === 0"
            class="mt-1 py-8 text-center rounded-xl border border-dashed border-gray-200 dark:border-white/10"
          >
            <i class="ri-puzzle-line text-2xl text-gray-300 dark:text-gray-600"></i>
            <p class="mt-2 text-xs text-gray-400">
              {{ t('settings.playback.pluginSources.empty') }}
            </p>
          </div>
        </template>
      </div>

      <!-- 添加音源 -->
      <div class="mt-1 pt-3 border-t border-gray-100 dark:border-white/5 shrink-0">
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <i class="ri-link absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400"></i>
            <input
              v-model="pluginUrl"
              :placeholder="t('settings.playback.pluginSources.urlPlaceholder')"
              class="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[10px] text-xs focus:outline-none focus:border-primary/60 transition-colors"
              :disabled="isImportingPlugin"
              @keyup.enter="importFromUrl"
            />
          </div>
          <s-btn
            variant="primary"
            :loading="isImportingPlugin"
            :disabled="!pluginUrl.trim()"
            @click="importFromUrl"
          >
            {{ t('settings.playback.pluginSources.importBtn') }}
          </s-btn>
          <s-btn :disabled="isImportingPlugin" @click="importFromFile">
            <i class="ri-folder-line text-sm"></i>
            {{ t('settings.playback.pluginSources.importLocal') }}
          </s-btn>
        </div>
      </div>
    </div>

    <!-- Footer：操作即时生效，仅关闭 -->
    <template #footer>
      <div class="flex justify-end">
        <s-btn variant="primary" @click="handleClose">
          {{ t('common.confirm') }}
        </s-btn>
      </div>
    </template>
  </responsive-modal>
</template>

<script setup lang="ts">
import { useMessage } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import ResponsiveModal from '@/components/common/ResponsiveModal.vue';
import { MusicSourcePluginStore } from '@/services/musicSource/pluginStore';
import { useMusicSourceRegistry } from '@/services/musicSource/registry';
import { fetchMusicSourcePlugin } from '@/services/musicSource/transport';
import { useSettingsStore } from '@/store';
import { type Platform } from '@/types/music';
import type { MusicSourcePlugin } from '@/types/musicSourcePlugin';
import { isMusicSourcePluginKey } from '@/types/musicSourcePlugin';
import { isElectron } from '@/utils';
import SBtn from '@/views/set/SBtn.vue';

// ==================== Props & Emits ====================
const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  sources: {
    type: Array as () => Platform[],
    default: () => ['pyncmd'] as Platform[]
  }
});

const emit = defineEmits(['update:show', 'update:sources']);

// ==================== 状态 ====================
const { t } = useI18n();
const settingsStore = useSettingsStore();
const message = useMessage();
const visible = ref(props.show);
const selectedSources = ref<Platform[]>([...props.sources]);
const { providers } = useMusicSourceRegistry();

const pluginUrl = ref('');
const pluginFileInput = ref<HTMLInputElement | null>(null);
const customApiFileInput = ref<HTMLInputElement | null>(null);
const isImportingPlugin = ref(false);
const varsEditorId = ref<string | null>(null);
const activeSubscription = ref<string | null>(null);
const isLoadingSubscription = ref(false);
const subscriptionError = ref('');
const subscriptionPlugins = ref<Array<{ name: string; url: string; version?: string }>>([]);
const musicFreeSubscriptions = computed(() => settingsStore.setData.musicSourceSubscriptions || []);

const isPluginImported = (url: string): boolean =>
  providers.value.some((provider) => provider.plugin?.sourceUrl === url);

const openMusicFreeSubscription = async (subscription: { name: string; url: string }) => {
  activeSubscription.value = subscription.url;
  subscriptionError.value = '';
  isLoadingSubscription.value = true;
  subscriptionPlugins.value = [];
  try {
    const result = await fetchMusicSourcePlugin(subscription.url);
    const manifest = JSON.parse(result.content);
    if (!Array.isArray(manifest?.plugins)) throw new Error('JSON 订阅清单格式无效');
    subscriptionPlugins.value = manifest.plugins
      .filter(
        (plugin: any) => plugin && typeof plugin.name === 'string' && typeof plugin.url === 'string'
      )
      .map((plugin: any) => ({
        name: plugin.name,
        url: plugin.url,
        ...(typeof plugin.version === 'string' ? { version: plugin.version } : {})
      }));
    const subscriptions = [...musicFreeSubscriptions.value];
    const existing = subscriptions.findIndex((item: any) => item.url === subscription.url);
    const next = {
      ...subscription,
      pluginCount: subscriptionPlugins.value.length
    };
    if (existing >= 0) subscriptions[existing] = next;
    else subscriptions.push(next);
    settingsStore.setSetData({ musicSourceSubscriptions: subscriptions });
  } catch (error: any) {
    subscriptionError.value = error?.message || '读取订阅目录失败';
  } finally {
    isLoadingSubscription.value = false;
  }
};

const retryActiveSubscription = () => {
  const subscription = musicFreeSubscriptions.value.find(
    (item: any) => item.url === activeSubscription.value
  );
  if (subscription) void openMusicFreeSubscription(subscription);
};

const importSubscriptionPlugin = async (plugin: { name: string; url: string }) => {
  isImportingPlugin.value = true;
  try {
    const result = await fetchMusicSourcePlugin(plugin.url);
    await installSource(result.content, { name: plugin.name, sourceUrl: result.url || plugin.url });
  } catch (error: any) {
    message.error(`${t('common.error')}：${error?.message || '插件导入失败'}`);
  } finally {
    isImportingPlugin.value = false;
  }
};

// ==================== 列表模型 ====================

type SourceRow = {
  key: string;
  label?: string;
  kind: 'builtin' | 'plugin';
  dialect?: MusicSourcePlugin['dialect'];
  description?: string;
  vars?: MusicSourcePlugin['vars'];
  userVars?: Record<string, string>;
  pluginId?: string;
  first?: boolean;
  last?: boolean;
};

/** 全量顺序：musicSourceOrder 优先，未入表的按注册表默认序补齐 */
const enabledOrder = computed<string[]>(() => {
  const order: string[] = settingsStore.setData.musicSourceOrder || [];
  const allKeys = providers.value.map((p) => p.key);
  return [
    ...order.filter((key) => allKeys.includes(key)),
    ...allKeys.filter((key) => !order.includes(key))
  ];
});

const rowsOf = (keys: string[]): SourceRow[] =>
  keys
    .map((key) => providers.value.find((p) => p.key === key))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((provider) => ({
      key: provider.key,
      label: provider.name,
      kind: provider.kind,
      dialect: provider.plugin?.dialect,
      description: provider.plugin?.description,
      vars: provider.plugin?.vars,
      userVars: provider.plugin?.userVars,
      pluginId: provider.plugin?.id,
      first: provider.key === keys[0],
      last: provider.key === keys[keys.length - 1]
    }));

const sourceGroups = computed(() => [
  {
    key: 'builtin',
    title: t('settings.playback.pluginSources.groupBuiltin'),
    rows: rowsOf(enabledOrder.value.filter((key) => !isMusicSourcePluginKey(key)))
  },
  {
    key: 'plugin',
    title: t('settings.playback.pluginSources.groupPlugin'),
    rows: rowsOf(enabledOrder.value.filter((key) => isMusicSourcePluginKey(key)))
  }
]);

/** 启用中的音源按列表顺序的解析序号（1 起）；停用返回 null */
const orderNumberOf = (key: string): number | null => {
  if (!isEnabled(key)) return null;
  const enabledBefore = enabledOrder.value
    .slice(0, enabledOrder.value.indexOf(key) + 1)
    .filter((k) => isEnabled(k));
  return enabledBefore.length;
};

// ==================== 操作（即时生效） ====================
const isEnabled = (key: string): boolean => selectedSources.value.includes(key as Platform);

const persistSelection = () => {
  settingsStore.setSetData({ enabledMusicSources: [...selectedSources.value] });
  emit('update:sources', [...selectedSources.value]);
};

const toggleSource = (source: SourceRow, enabled: boolean) => {
  // 插件源：勾选与插件启用状态同步
  if (source.kind === 'plugin' && source.pluginId) {
    MusicSourcePluginStore.setEnabled(source.pluginId, enabled);
  }

  const index = selectedSources.value.indexOf(source.key as Platform);
  if (enabled && index === -1) {
    selectedSources.value.push(source.key as Platform);
  } else if (!enabled && index > -1) {
    if (selectedSources.value.length <= 1) {
      if (source.kind === 'plugin' && source.pluginId) {
        MusicSourcePluginStore.setEnabled(source.pluginId, true);
      }
      message.warning(t('settings.playback.musicSourcesWarning'));
      return;
    }
    selectedSources.value.splice(index, 1);
  }
  persistSelection();
};

/** 上移/下移：写 musicSourceOrder（全部 provider 的完整顺序） */
const moveSource = (key: string, direction: -1 | 1) => {
  const order = [...enabledOrder.value];
  const index = order.indexOf(key);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  settingsStore.setSetData({ musicSourceOrder: order });
};

const removePlugin = (source: SourceRow) => {
  if (!source.pluginId) return;
  MusicSourcePluginStore.removePlugin(source.pluginId);
  if (varsEditorId.value === source.pluginId) varsEditorId.value = null;
  const index = selectedSources.value.indexOf(source.key as Platform);
  if (index > -1 && selectedSources.value.length > 1) {
    selectedSources.value.splice(index, 1);
  }
  persistSelection();
  message.success(t('settings.playback.pluginSources.removed', { name: source.label || '' }));
};

const toggleVarsEditor = (pluginId: string) => {
  varsEditorId.value = varsEditorId.value === pluginId ? null : pluginId;
};

const setPluginVar = (pluginId: string, key: string, value: string) => {
  const plugin = MusicSourcePluginStore.getPlugin(pluginId);
  if (!plugin) return;
  MusicSourcePluginStore.setVars(pluginId, { ...plugin.userVars, [key]: value });
};

const dialectLabel = (dialect?: MusicSourcePlugin['dialect']): string => {
  return dialect ? MusicSourcePluginStore.getDialectLabel(dialect) : '';
};

/** 导入源码（文件/URL 共用）：安装期沙箱探测失败会拒绝入库 */
const installSource = async (content: string, options: { name?: string; sourceUrl?: string }) => {
  try {
    const { plugin, replaced } = await MusicSourcePluginStore.installFromSource(content, options);
    const pluginKey = `plugin:${plugin.id}` as Platform;
    if (!selectedSources.value.includes(pluginKey)) {
      selectedSources.value.push(pluginKey);
    }
    persistSelection();
    message.success(
      replaced
        ? t('settings.playback.pluginSources.updated', { name: plugin.name })
        : t('settings.playback.pluginSources.imported', { name: plugin.name })
    );
  } catch (error: any) {
    console.error('音源插件导入失败:', error);
    message.error(`${t('common.error')}：${error.message}`);
  }
};

const importFromFile = async () => {
  if (!isElectron) {
    pluginFileInput.value?.click();
    return;
  }
  try {
    const result = await window.api.importMusicSourcePlugin();
    if (result?.content) {
      await installSource(result.content, { name: result.name });
    }
  } catch (error: any) {
    console.error('导入本地音源插件失败:', error);
    message.error(`${t('common.error')}：${error.message}`);
  }
};

const handlePluginFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    message.error('音源脚本不能超过 2 MB。');
    return;
  }
  isImportingPlugin.value = true;
  try {
    await installSource(await file.text(), { name: file.name.replace(/\.(m?js|cjs|txt)$/i, '') });
  } catch (error: any) {
    message.error(`${t('common.error')}：${error?.message || '插件导入失败'}`);
  } finally {
    isImportingPlugin.value = false;
  }
};

const importFromUrl = async () => {
  const url = pluginUrl.value.trim();
  if (!url) return;
  try {
    new URL(url);
  } catch {
    message.error(t('settings.playback.lxMusic.scripts.invalidUrl'));
    return;
  }

  isImportingPlugin.value = true;
  try {
    const result = await fetchMusicSourcePlugin(url);
    try {
      const manifest = JSON.parse(result.content);
      if (Array.isArray(manifest?.plugins)) {
        const subscription = {
          name: manifest.desc || new URL(url).hostname,
          url: result.url || url
        };
        await openMusicFreeSubscription(subscription);
        return;
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        // A single JavaScript plugin continues through the regular importer.
      } else {
        throw error;
      }
    }
    await installSource(result.content, { name: result.name, sourceUrl: result.url });
    pluginUrl.value = '';
  } catch (error: any) {
    console.error('从 URL 导入音源插件失败:', error);
    message.error(`${t('common.error')}：${error.message}`);
  } finally {
    isImportingPlugin.value = false;
  }
};

/** 自定义 API 的 JSON 配置导入（customApi 内置 provider 的配置入口） */
const importCustomApi = async () => {
  if (!isElectron) {
    customApiFileInput.value?.click();
    return;
  }
  try {
    const result = await window.api.importCustomApiPlugin();
    if (result && result.name && result.content) {
      settingsStore.setCustomApiPlugin(result);
      message.success(t('settings.playback.customApi.importSuccess', { name: result.name }));
      if (!selectedSources.value.includes('customApi' as Platform)) {
        selectedSources.value.push('customApi' as Platform);
      }
      persistSelection();
    }
  } catch (error: any) {
    message.error(t('settings.playback.customApi.importFailed', { message: error.message }));
  }
};

const handleCustomApiFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 256 * 1024) throw new Error('自定义音源配置不能超过 256 KB。');
    const content = await file.text();
    const config = JSON.parse(content);
    if (!config.name || !config.apiUrl || !config.params || !config.responseUrlPath) {
      throw new Error('配置缺少 name、apiUrl、params 或 responseUrlPath。');
    }
    settingsStore.setCustomApiPlugin({ name: config.name, content });
    if (!selectedSources.value.includes('customApi' as Platform)) {
      selectedSources.value.push('customApi' as Platform);
    }
    persistSelection();
    message.success(t('settings.playback.customApi.importSuccess', { name: config.name }));
  } catch (error: any) {
    message.error(error?.message || t('settings.playback.customApi.importFailed', { message: '' }));
  }
};

/** 操作即时生效：关闭即完成（无取消语义） */
const handleClose = () => {
  visible.value = false;
};

// ==================== 监听器 ====================
watch(
  () => props.show,
  (newVal) => {
    visible.value = newVal;
    if (newVal) {
      selectedSources.value = [
        ...((settingsStore.setData.enabledMusicSources || []) as Platform[])
      ];
    }
  }
);

watch(
  () => visible.value,
  (newVal) => {
    emit('update:show', newVal);
  }
);

// 插件库外部变化时清理勾选里已不存在的插件 key
watch(
  () =>
    providers.value
      .filter((p) => p.kind === 'plugin')
      .map((p) => p.key)
      .join(','),
  () => {
    const validKeys = new Set(providers.value.map((p) => p.key));
    selectedSources.value = selectedSources.value.filter(
      (key) => !isMusicSourcePluginKey(key) || validKeys.has(key)
    );
  }
);
</script>
