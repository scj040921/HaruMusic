<template>
  <n-popover
    trigger="click"
    placement="top"
    :show-arrow="false"
    :flip="true"
    :animated="true"
    to="body"
    content-class="quality-popover"
    :content-style="{
      maxWidth: 'min(320px, calc(100vw - 32px))',
      maxHeight: 'calc(100dvh - 32px)',
      overflowY: 'auto'
    }"
    :z-index="9999999"
  >
    <template #trigger
      ><button
        type="button"
        class="quality-trigger"
        aria-label="自适应音质"
        :disabled="!song?.id"
        @click.stop
      >
        自适应
      </button></template
    >
    <div class="quality-menu">
      <div class="quality-title">自适应最高可用音质</div>
      <div class="quality-hint">
        按当前音源支持的音质从高到低尝试；无法解析或校验失败时自动降档，并继续尝试其他已启用音源。
      </div>
    </div>
  </n-popover>
</template>
<script setup lang="ts">
import type { SongResult } from '@/types/music';
defineProps<{ song: SongResult | null | undefined }>();
</script>
<style scoped>
.quality-trigger {
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid var(--divider, #d9d9de);
  border-radius: 8px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}
.quality-trigger:focus-visible {
  outline: 2px solid var(--accent, #fa2d48);
}
.quality-menu {
  padding: 16px;
  max-width: 280px;
  border: 1px solid var(--divider, #d9d9de);
  border-radius: 20px;
  background: var(--canvas, #fff);
  color: var(--text-primary, #111);
}

:global(.quality-popover) {
  border-radius: 20px !important;
  overflow: hidden;
}
.quality-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.quality-hint {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary, #77777c);
}
</style>
