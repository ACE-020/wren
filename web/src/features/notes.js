/**
 * 笔记功能在前端的全部接入点：页面路由、侧栏入口、对话里的事件卡片。
 */

import { registerEventRenderer } from '@/chat/renderers.js';
import NoteSavedCard from '@/components/NoteSavedCard.vue';

registerEventRenderer('note_saved', NoteSavedCard);

/** @type {import('vue-router').RouteRecordRaw} */
export const notesRoute = { path: '/notes', name: 'notes', component: () => import('@/views/NotesView.vue') };

export const notesLink = { to: '/notes', label: '笔记' };
