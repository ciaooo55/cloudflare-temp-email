<script setup>
const version = import.meta.env.PACKAGE_VERSION || ''
const build = import.meta.env.BUILD_COMMIT || ''
</script>
<template>
  <footer class="version-watermark" aria-label="version">v{{ version }}<template v-if="build"> · {{ build }}</template></footer>
</template>
<style scoped>
.version-watermark { padding: 14px 0 18px; text-align: right; color: #737e94; font: 11px ui-monospace, SFMono-Regular, monospace; letter-spacing: .04em; }
</style>
