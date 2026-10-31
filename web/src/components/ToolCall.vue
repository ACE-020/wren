<script setup>
import { computed } from 'vue';

const props = defineProps({ block: { type: Object, required: true } });

const ICON = { running: '⏳', done: '✓', error: '✕', interrupted: '⏹' };
const LABEL = { running: '调用中', done: '完成', error: '失败', interrupted: '已中断' };

const args = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.block.arguments || '{}'), null, 2);
  } catch {
    return props.block.arguments;
  }
});
</script>

<template>
  <details class="tool" :class="block.status">
    <summary>
      <span class="tool-icon">{{ ICON[block.status] }}</span>
      <code>{{ block.name }}</code>
      <span class="muted small">{{ LABEL[block.status] }}</span>
    </summary>
    <div class="tool-body">
      <div class="small muted">参数</div>
      <pre>{{ args }}</pre>
      <template v-if="block.result !== null">
        <div class="small muted">结果</div>
        <pre>{{ block.result }}</pre>
      </template>
    </div>
  </details>
</template>
