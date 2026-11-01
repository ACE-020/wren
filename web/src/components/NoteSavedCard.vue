<script setup>
defineProps({ event: { type: Object, required: true } });
</script>

<template>
  <RouterLink :to="`/notes#note-${event.note.id}`" class="note-card">
    📝 已保存笔记：{{ event.note.title }}
  </RouterLink>
</template>
