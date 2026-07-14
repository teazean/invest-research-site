<script setup>
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

const props = defineProps({ folder: { type: String, required: true } })
const { theme } = useData()
const company = computed(() => theme.value.researchCatalog?.companies?.find(item => item.folder === props.folder))
const labels = { overview: '正文', financials: '财务', valuation: '估值', competitors: '竞对', review: '审核', other: '其他' }
</script>

<template>
  <nav v-if="company" class="research-tabs" aria-label="公司研究材料">
    <a v-for="document in company.documents" :key="document.link" :href="withBase(document.link)">
      {{ labels[document.role] ?? document.title }}
    </a>
  </nav>
</template>
