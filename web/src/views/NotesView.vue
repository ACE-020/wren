<script setup>
import { onMounted, ref } from 'vue';

import { api } from '@/api/client.js';
import { renderMarkdown } from '@/chat/markdown.js';

const notes = ref([]);
const error = ref('');
const loaded = ref(false);

async function load() {
  try {
    notes.value = (await api.listNotes()).notes;
  } catch (err) {
    error.value = err.message;
  } finally {
    loaded.value = true;
  }
}

async function remove(note) {
  if (!window.confirm(`删除笔记「${note.title}」？`)) return;
  try {
    await api.deleteNote(note.id);
    notes.value = notes.value.filter((n) => n.id !== note.id);
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <h2>笔记</h2>
    <p class="muted small">在对话里让 Wren「记下来」，内容会保存在这里。</p>
    <p v-if="error" class="error small">{{ error }}</p>
    <p v-if="loaded && !notes.length" class="muted">还没有笔记。</p>
    <article v-for="n in notes" :id="`note-${n.id}`" :key="n.id" class="note">
      <header>
        <strong>{{ n.title }}</strong>
        <span class="muted small">{{ new Date(n.updated_at).toLocaleString() }}</span>
        <RouterLink v-if="n.session_id" :to="`/c/${n.session_id}`" class="small">来源对话</RouterLink>
        <button class="link small" @click="remove(n)">删除</button>
      </header>
      <div class="md" v-html="renderMarkdown(n.body)" />
    </article>
  </div>
</template>
