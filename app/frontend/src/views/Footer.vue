<script setup>
const version = import.meta.env.PACKAGE_VERSION || ''
</script>
<template>
  <footer class="version-watermark" aria-label="version">v{{ version }}</footer>
</template>
<style scoped>
.version-watermark { padding: 14px 0 18px; text-align: right; color: #737e94; font: 11px ui-monospace, SFMono-Regular, monospace; letter-spacing: .04em; }
</style>
