<script setup>
import { onMounted, ref } from 'vue';

import { api } from '@/api/client.js';

const text = ref('');
const status = ref('');
const error = ref('');

onMounted(async () => {
  try {
    text.value = (await api.getSystemPrompt()).system_prompt;
  } catch (err) {
    error.value = err.message;
  }
});

async function save() {
  status.value = '';
  error.value = '';
  try {
    await api.putSystemPrompt(text.value);
    status.value = '已保存';
  } catch (err) {
    error.value = err.message;
  }
}
</script>

<template>
  <h3>系统提示</h3>
  <p class="muted small">附加在内置系统提示之后，每个回合都会发送。</p>
  <form class="form" @submit.prevent="save">
    <textarea v-model="text" rows="10" maxlength="8000" placeholder="例如：回答尽量简短。" />
    <div class="form-actions">
      <button class="btn primary">保存</button>
      <span v-if="status" class="small">{{ status }}</span>
    </div>
    <p v-if="error" class="error small">{{ error }}</p>
  </form>
</template>
