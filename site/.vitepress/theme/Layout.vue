<script setup>
import DefaultTheme from 'vitepress/theme'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #doc-before>
      <div class="research-disclaimer">
        请核对正文中的数据日期与来源；本站内容不构成确定性投资建议。
      </div>
    </template>
  </Layout>
</template>
