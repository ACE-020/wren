<script setup>
import { onMounted, reactive, ref } from 'vue';

import { api } from '@/api/client.js';

const form = reactive({
  base_url: '',
  model: '',
  api_key: '',
  thinking: 'default',
  reasoning_effort: '',
  max_steps: 8,
  history_budget_tokens: 32000,
});
const keyHint = ref('');
const keySet = ref(false);
const status = ref('');
const error = ref('');
const busy = ref(false);

function load(data) {
  Object.assign(form, { ...data, api_key: '' });
  keySet.value = data.api_key_set;
  keyHint.value = data.api_key_hint;
}

onMounted(async () => {
  try {
    load(await api.getModel());
  } catch (err) {
    error.value = err.message;
  }
});

async function save() {
  busy.value = true;
  status.value = '';
  error.value = '';
  try {
    const { api_key_set, api_key_hint, ...patch } = /** @type {any} */ ({ ...form });
    load(await api.putModel(patch));
    status.value = '已保存';
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function test() {
  busy.value = true;
  status.value = '测试中…';
  error.value = '';
  try {
    const res = await api.testModel();
    if (res.ok) status.value = `连接正常（${res.model}）`;
    else {
      status.value = '';
      error.value = res.error;
    }
  } catch (err) {
    status.value = '';
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function clearKey() {
  if (!window.confirm('清除已保存的 API key？')) return;
  load(await api.putModel({ api_key: null }));
}
</script>

<template>
  <h3>模型</h3>
  <p class="muted small">任何 OpenAI 兼容的 Chat Completions 接口都可以。配置保存在本机 data/wren.db。</p>
  <form class="form" @submit.prevent="save">
    <label>
      Base URL
      <input v-model="form.base_url" placeholder="https://api.deepseek.com" required />
    </label>
    <label>
      模型
      <input v-model="form.model" placeholder="deepseek-flash" required />
    </label>
    <label>
      API key
      <input
        v-model="form.api_key"
        type="password"
        autocomplete="off"
        :placeholder="keySet ? `已设置（${keyHint}），留空表示不修改` : '未设置'"
      />
      <button v-if="keySet" type="button" class="link small" @click="clearKey">清除</button>
    </label>
    <label>
      思考模式
      <select v-model="form.thinking">
        <option value="default">服务端默认</option>
        <option value="enabled">开启</option>
        <option value="disabled">关闭</option>
      </select>
    </label>
    <label>
      思考强度
      <select v-model="form.reasoning_effort">
        <option value="">服务端默认</option>
        <option value="low">low</option>
        <option value="high">high</option>
        <option value="max">max</option>
      </select>
    </label>
    <label>
      单回合最多步数
      <input v-model.number="form.max_steps" type="number" min="1" max="50" />
    </label>
    <label>
      历史预算（估算 token）
      <input v-model.number="form.history_budget_tokens" type="number" min="1000" step="1000" />
      <span class="muted small">超出时从最早的回合开始整回合不再发送给模型。</span>
    </label>
    <div class="form-actions">
      <button class="btn primary" :disabled="busy">保存</button>
      <button type="button" class="btn" :disabled="busy || !keySet" @click="test">测试连接</button>
      <span v-if="status" class="small">{{ status }}</span>
    </div>
    <p v-if="error" class="error small">{{ error }}</p>
  </form>
</template>
