<script setup>
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

const { theme } = useData()
const companies = computed(() => theme.value.researchCatalog?.companies ?? [])
const industries = computed(() => theme.value.researchCatalog?.industries ?? [])
</script>

<template>
  <div class="research-home-grid">
    <a v-for="company in companies" :key="company.folder" class="research-card" :href="withBase(company.catalogLink)">
      <span class="research-card-kind">公司研究</span>
      <strong>{{ company.name }}</strong>
      <span v-if="company.ticker">{{ company.ticker }}</span>
      <small v-if="company.dataDate">核验日 {{ company.dataDate }}</small>
      <p v-if="company.summary">{{ company.summary }}</p>
    </a>
    <a v-for="industry in industries" :key="industry.folder" class="research-card" :href="withBase(industry.catalogLink)">
      <span class="research-card-kind">产业专题</span>
      <strong>{{ industry.name }}</strong>
      <small>{{ industry.documents.length }} 篇研究</small>
    </a>
  </div>
</template>
