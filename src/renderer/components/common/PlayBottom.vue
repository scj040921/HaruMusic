<template>
  <div v-if="isPlay && !isMobile" class="bottom" :style="{ height }"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { usePlayerStore } from '@/store/modules/player';
import { isMobile } from '@/utils';

const playerStore = usePlayerStore();
// Keep the page gutter in sync with AppLayout's player visibility condition.
// The active song remains visible in the play bar while its URL is refreshing.
const isPlay = computed(() => Boolean(playerStore.playMusic?.id));

defineProps({
  height: {
    type: String,
    default: undefined
  }
});
</script>

<style lang="scss" scoped>
.bottom {
  @apply h-32;
}
</style>
