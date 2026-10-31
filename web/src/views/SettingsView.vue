<script setup>
import { settingsSections } from '@/nav.js';
</script>

<template>
  <div class="settings">
    <nav class="settings-nav">
      <h2>设置</h2>
      <RouterLink v-for="s in settingsSections" :key="s.to" :to="s.to">{{ s.label }}</RouterLink>
    </nav>
    <section class="settings-body">
      <RouterView />
    </section>
  </div>
</template>
