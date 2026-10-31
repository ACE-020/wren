<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api } from '@/api/client.js';
import { sidebarLinks } from '@/nav.js';
import { refreshSessions, sessions } from '@/stores/sessions.js';

const route = useRoute();
const router = useRouter();

onMounted(refreshSessions);

async function newChat() {
  router.push('/');
}

async function rename(session) {
  const title = window.prompt('重命名会话', session.title || '新对话');
  if (!title?.trim()) return;
  await api.renameSession(session.id, title.trim());
  await refreshSessions();
}

async function remove(session) {
  if (!window.confirm(`删除「${session.title || '新对话'}」？`)) return;
  try {
    await api.deleteSession(session.id);
  } catch (err) {
    window.alert(err.message);
    return;
  }
  if (String(route.params.sessionId) === String(session.id)) router.push('/');
  await refreshSessions();
}
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">Wren</div>
      <button class="new-chat" @click="newChat">＋ 新对话</button>
      <nav class="session-list">
        <p v-if="sessions.error" class="error small">{{ sessions.error }}</p>
        <p v-else-if="sessions.loaded && !sessions.items.length" class="muted small">还没有对话</p>
        <div
          v-for="s in sessions.items"
          :key="s.id"
          class="session"
          :class="{ active: String(route.params.sessionId) === String(s.id) }"
        >
          <RouterLink :to="`/c/${s.id}`" class="session-title">{{ s.title || '新对话' }}</RouterLink>
          <span class="session-actions">
            <button title="重命名" @click="rename(s)">✎</button>
            <button title="删除" @click="remove(s)">✕</button>
          </span>
        </div>
      </nav>
      <div class="sidebar-links">
        <RouterLink v-for="link in sidebarLinks" :key="link.to" :to="link.to">{{ link.label }}</RouterLink>
      </div>
    </aside>
    <main class="main">
      <RouterView :key="route.params.sessionId ?? route.path.split('/')[1]" />
    </main>
  </div>
</template>
