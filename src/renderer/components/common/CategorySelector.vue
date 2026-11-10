<template>
  <div class="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-black z-10">
    <n-scrollbar ref="scrollbarRef" x-scrollable>
      <div
        class="flex items-center py-4 page-padding"
        style="white-space: nowrap"
        @wheel.prevent="handleWheel"
      >
        <button
          v-for="(category, index) in categories"
          :key="getItemKey(category, index)"
          type="button"
          class="category-choice"
          :class="{ active: isActive(category) }"
          :aria-pressed="isActive(category)"
          @click="handleClickCategory(category)"
        >
          {{ getItemLabel(category) }}
        </button>
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { NScrollbar } from 'naive-ui';
import { ref } from 'vue';

type Category = string | number | { [key: string]: any };

type CategorySelectorProps = {
  categories: Category[];
  modelValue: any;
  labelKey?: string;
  valueKey?: string;
  animationClass?: string;
};

const props = withDefaults(defineProps<CategorySelectorProps>(), {
  labelKey: 'label',
  valueKey: 'value',
  animationClass: 'animate__bounceIn'
});

const emit = defineEmits<{
  'update:modelValue': [value: any];
  change: [value: any];
}>();

const scrollbarRef = ref();

const getItemKey = (item: Category, index: number): string | number => {
  if (typeof item === 'object' && item !== null) {
    return item[props.valueKey] ?? item[props.labelKey] ?? index;
  }
  return item;
};

const getItemLabel = (item: Category): string => {
  if (typeof item === 'object' && item !== null) {
    return item[props.labelKey] ?? String(item);
  }
  return String(item);
};

const getItemValue = (item: Category): any => {
  if (typeof item === 'object' && item !== null) {
    return item[props.valueKey] ?? item;
  }
  return item;
};

const isActive = (item: Category): boolean => {
  const itemValue = getItemValue(item);
  return itemValue === props.modelValue;
};

const handleClickCategory = (item: Category) => {
  const value = getItemValue(item);
  if (value === props.modelValue) return;
  emit('change', value);
};

const handleWheel = (e: WheelEvent) => {
  const scrollbar = scrollbarRef.value;
  if (scrollbar) {
    const delta = e.deltaY || e.detail;
    scrollbar.scrollBy({ left: delta });
  }
};

defineExpose({
  scrollbarRef
});
</script>

<style scoped>
.category-choice {
  padding: 7px 13px;
  margin-right: 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #67756f;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.category-choice:hover {
  background: #f0f5f2;
  color: #315f55;
}
.category-choice.active {
  background: #e4efe9;
  color: #315f55;
}
.category-choice:focus-visible {
  outline: 2px solid #568f7c;
  outline-offset: 2px;
}
:global(.dark) .category-choice {
  color: #a8bab1;
}
:global(.dark) .category-choice:hover,
:global(.dark) .category-choice.active {
  background: #283c33;
  color: #d2eadc;
}
</style>
