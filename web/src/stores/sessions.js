import { reactive } from 'vue';

import { api } from '@/api/client.js';

/** 会话列表的共享状态（侧栏和对话页共用）。 */
export const sessions = reactive({
  /** @type {any[]} */
  items: [],
  loaded: false,
  error: '',
});

export async function refreshSessions() {
  try {
    sessions.items = (await api.listSessions()).sessions;
    sessions.error = '';
  } catch (err) {
    sessions.error = err instanceof Error ? err.message : String(err);
  } finally {
    sessions.loaded = true;
  }
}
