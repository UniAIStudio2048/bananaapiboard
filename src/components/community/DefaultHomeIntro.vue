<template>
  <section hidden aria-labelledby="default-home-heading" class="max-w-[1400px] mx-auto px-6 pt-8 pb-2">
    <h1 id="default-home-heading" class="text-2xl sm:text-3xl font-semibold tracking-tight text-white">{{ content.heading }}</h1>
    <p class="mt-3 max-w-4xl text-sm leading-7 text-neutral-400">{{ content.description }}</p>
    <nav aria-label="无限画布使用指南" class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
      <a href="/docs" class="text-neutral-300 underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-offset-4">画布使用文档</a>
      <a href="/community/templates" class="text-neutral-300 underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-offset-4">探索工作流模板</a>
      <a href="/pricing" class="text-neutral-300 underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-offset-4">模型价格与积分</a>
    </nav>
    <details class="mt-5 rounded-xl border border-neutral-800 bg-neutral-950 text-sm">
      <summary class="cursor-pointer rounded-xl px-4 py-3 text-neutral-300 hover:text-white focus-visible:outline focus-visible:outline-offset-4">了解无限画布：使用步骤与常见问题</summary>
      <div class="px-4 pb-5 leading-7 text-neutral-400">
        <h2 class="mt-2 font-medium text-white">如何使用无限画布</h2>
        <ol class="mt-2 list-decimal space-y-1 pl-5">
          <li v-for="step in content.steps" :key="step">{{ step }}</li>
        </ol>
        <h2 class="mt-5 font-medium text-white">无限画布常见问题</h2>
        <div v-for="[question, answer] in content.faq" :key="question" class="mt-4">
          <h3 class="font-medium text-neutral-200">{{ question }}</h3>
          <p class="mt-1">{{ answer }}</p>
        </div>
      </div>
    </details>
  </section>
</template>

<script setup>
import { defaultHomeContent as content } from '@/utils/defaultHomeContent'
</script>
