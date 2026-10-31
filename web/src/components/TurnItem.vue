<script setup>
import { computed } from 'vue';

import { renderMarkdown } from '@/chat/markdown.js';
import { rendererFor } from '@/chat/renderers.js';
import ToolCall from './ToolCall.vue';

const props = defineProps({ turn: { type: Object, required: true } });

const STATUS_LABEL = { stopped: '已停止', failed: '出错' };
const statusLabel = computed(() => STATUS_LABEL[props.turn.status] ?? '');
const waiting = computed(
  () => props.turn.status === 'running' && !props.turn.draft?.text && !props.turn.draft?.reasoning,
);
</script>

<template>
  <section class="turn">
    <div class="msg user">{{ turn.userText }}</div>
    <div class="msg assistant">
      <template v-for="(block, i) in turn.blocks" :key="i">
        <details v-if="block.kind === 'reasoning'" class="reasoning">
          <summary>思考过程</summary>
          <div class="reasoning-text">{{ block.text }}</div>
        </details>
        <div v-else-if="block.kind === 'text'" class="md" v-html="renderMarkdown(block.text)" />
        <ToolCall v-else-if="block.kind === 'tool'" :block="block" />
        <component
          :is="rendererFor(block.event.type)"
          v-else-if="block.kind === 'custom' && rendererFor(block.event.type)"
          :event="block.event"
        />
      </template>

      <template v-if="turn.draft">
        <details v-if="turn.draft.reasoning" class="reasoning" :open="!turn.draft.text">
          <summary>思考中…</summary>
          <div class="reasoning-text">{{ turn.draft.reasoning }}</div>
        </details>
        <div v-if="turn.draft.text" class="md" v-html="renderMarkdown(turn.draft.text)" />
      </template>

      <p v-if="waiting" class="muted small pulse">正在生成…</p>
      <p v-if="statusLabel" class="turn-status" :class="turn.status">
        {{ statusLabel }}<template v-if="turn.error">：{{ turn.error }}</template>
      </p>
      <p v-if="turn.info?.dropped_turns" class="muted small">
        较早的 {{ turn.info.dropped_turns }} 个回合超出历史预算，本回合未发送给模型。
      </p>
    </div>
  </section>
</template>
