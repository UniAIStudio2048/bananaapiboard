<script setup>
/**
 * PurchaseDialog.vue - 购买工作流确认弹窗
 */
import { ref, computed, watch } from 'vue'
import { purchaseWork, getPlatformFeeRate } from '@/api/community'
import { getMe } from '@/api/client'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  work: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue', 'purchased'])

const loading = ref(false)
const error = ref('')
const packagePoints = ref(0)
const permanentPoints = ref(0)
const loadingPoints = ref(false)
const feeRate = ref(0)

const workPrice = computed(() => props.work?.price || 0)
const totalPoints = computed(() => packagePoints.value + permanentPoints.value)
const canAfford = computed(() => totalPoints.value >= workPrice.value)

const authorIncome = computed(() => {
  const price = workPrice.value
  return price - Math.floor(price * feeRate.value)
})

const feePercent = computed(() => Math.round(feeRate.value * 100))

watch(() => props.modelValue, async (v) => {
  if (v) {
    error.value = ''
    await Promise.all([loadUserPoints(), loadFeeRate()])
  }
})

async function loadUserPoints() {
  loadingPoints.value = true
  try {
    const user = await getMe(true)
    if (user) {
      const expAt = user.package_points_expires_at || 0
      const expired = expAt > 0 && expAt < Date.now()
      packagePoints.value = expired ? 0 : (user.package_points || 0)
      permanentPoints.value = user.points || 0
    }
  } catch (e) {
    console.error('[PurchaseDialog] 获取积分失败:', e)
  } finally {
    loadingPoints.value = false
  }
}

async function loadFeeRate() {
  try {
    const res = await getPlatformFeeRate()
    feeRate.value = res?.data?.fee_rate ?? res?.fee_rate ?? 0.1
  } catch (e) {
    console.error('[PurchaseDialog] 获取抽佣比例失败:', e)
  }
}

function close() {
  emit('update:modelValue', false)
}

async function handlePurchase() {
  if (!canAfford.value) return

  loading.value = true
  error.value = ''
  try {
    const result = await purchaseWork(props.work.id)
    emit('purchased', result)
    close()
  } catch (e) {
    error.value = e.message || '购买失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[9999] flex items-center justify-center"
      @click.self="close"
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div class="relative w-full max-w-sm mx-4 bg-gray-900 rounded-2xl border border-white/10 shadow-2xl animate-[slideUp_0.3s_ease]">
        <!-- 头部 -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 class="text-lg font-semibold text-white">购买工作流</h2>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
            @click="close"
            aria-label="关闭"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="px-6 py-5">
          <!-- 作品信息 -->
          <div class="p-4 bg-white/5 rounded-xl mb-5">
            <p class="text-white font-medium text-sm mb-2">{{ work.title }}</p>
            <div class="flex items-center justify-between">
              <span class="text-white/50 text-xs">价格</span>
              <span class="text-white font-bold text-lg">{{ workPrice }} 积分</span>
            </div>
          </div>

          <!-- 余额 -->
          <div class="p-3 bg-white/5 rounded-lg mb-4 space-y-2">
            <template v-if="loadingPoints">
              <div class="flex items-center justify-center py-1">
                <span class="text-sm text-white/40">加载中...</span>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center justify-between">
                <span class="text-sm text-white/60">套餐积分</span>
                <span class="text-sm text-white/80">{{ packagePoints }} 积分</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-white/60">永久积分</span>
                <span class="text-sm text-white/80">{{ permanentPoints }} 积分</span>
              </div>
              <div class="border-t border-white/10 pt-2">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-white/80 font-medium">总可用</span>
                  <span class="text-sm font-semibold" :class="canAfford ? 'text-white' : 'text-white/40'">
                    {{ totalPoints }} 积分
                  </span>
                </div>
              </div>
            </template>
          </div>

          <!-- 余额不足警告 -->
          <div v-if="!loadingPoints && !canAfford" class="p-3 mb-4 bg-white/5 border border-white/15 rounded-lg text-sm text-white/60">
            总积分不足，还需 {{ workPrice - totalPoints }} 积分
          </div>

          <!-- 服务费提示 -->
          <p class="text-xs text-white/40 mb-2">
            平台将收取 {{ feePercent }}% 的服务费，作者实际到账 {{ authorIncome }} 积分
          </p>

          <!-- 积分扣除说明 -->
          <p class="text-xs text-white/30 mb-5">
            购买后将优先扣除套餐积分，不足部分从永久积分扣除
          </p>

          <!-- 错误 -->
          <div v-if="error" class="p-3 mb-4 bg-white/5 border border-white/15 rounded-lg text-sm text-white/60">
            {{ error }}
          </div>

          <!-- 按钮 -->
          <div class="flex gap-3">
            <button
              class="flex-1 py-2.5 bg-white/10 text-white/80 text-sm rounded-lg hover:bg-white/15 transition"
              @click="close"
              :disabled="loading"
            >取消</button>
            <button
              class="flex-1 py-2.5 bg-white text-neutral-900 text-sm font-medium rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
              @click="handlePurchase"
              :disabled="loading || !canAfford || loadingPoints"
            >
              <span v-if="loading" class="inline-flex items-center justify-center">
                <svg class="animate-spin -ml-1 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                购买中...
              </span>
              <span v-else>确认购买</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
