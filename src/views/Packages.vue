<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-dark-900 dark:via-dark-800 dark:to-dark-900 py-12 px-4">
    <div class="max-w-7xl mx-auto">
      <!-- 页面标题 -->
      <div class="text-center mb-12">
        <h1 class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent mb-4">
          {{ translateUi('uiMessages.ma8618123b9fd') }}
        </h1>
        <p class="text-slate-600 dark:text-slate-400 text-lg">
          {{ translateUi('uiMessages.mfc617514afcc') }}
        </p>
      </div>

      <!-- 当前套餐信息 -->
      <div v-if="activePackage" class="mb-8 bg-white dark:bg-dark-800 rounded-2xl p-6 shadow-lg border border-primary-200 dark:border-primary-800">
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center">
              <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('packages.currentPlan') }}</div>
              <div class="text-xl font-bold text-slate-900 dark:text-white">{{ activePackage.package_name }}</div>
            </div>
          </div>
          <div class="flex items-center gap-6">
            <div class="text-center">
              <div class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m44c5959863d8') }}</div>
              <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">{{ activePackage.concurrent_limit }}</div>
            </div>
            <div class="text-center">
              <div class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m568c1e74fb06') }}</div>
              <div class="text-lg font-semibold text-slate-700 dark:text-slate-300">{{ formatRemainingTime(activePackage.expires_at) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 余额显示 -->
      <div class="mb-8 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <svg class="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span class="text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.m32cdac4f29d7') }}</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {{ formatMoney(user?.balance || 0) }}
            </div>
            <button
              @click="openRechargeModal"
              class="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2"
            >
              <span>💳</span>
              <span>{{ translateUi('uiMessages.m3527c8a8543c') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 套餐列表 -->
      <div v-if="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        <p class="mt-4 text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m9b27807ec6b9') }}</p>
      </div>

      <div v-else-if="error" class="text-center py-12">
        <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        <button @click="loadPackages" class="mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          {{ translateUi('common.retry') }}
        </button>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        <div
          v-for="pkg in packages"
          :key="pkg.id"
          class="relative bg-white dark:bg-dark-800 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border-2"
          :class="getPackageStyle(pkg.type)"
        >
          <!-- 推荐标签 -->
          <div v-if="pkg.type === 'monthly'" class="absolute -top-3 left-1/2 transform -translate-x-1/2">
            <span class="bg-gradient-to-r from-primary-500 to-purple-500 text-white text-xs font-bold px-4 py-1 rounded-full">
              {{ translateUi('landing.recommended') }}
            </span>
          </div>

          <!-- 套餐名称 -->
          <div class="text-center mb-6">
            <h3 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">{{ pkg.name }}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">{{ pkg.description }}</p>
          </div>

          <!-- 价格 -->
          <div class="text-center mb-6">
            <div class="text-4xl font-bold text-slate-900 dark:text-white mb-1">
              {{ currencySymbol }}{{ (pkg.price / 100).toFixed(0) }}
            </div>
            <div class="text-sm text-slate-500 dark:text-slate-400">{{ getDurationText(pkg.duration_days) }}</div>
          </div>

          <!-- 特性列表 -->
          <div class="space-y-3 mb-6">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.md901f70479c8', { value1: (formatPoints(pkg.points)) }) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.mf1eb4eb32522', { value1: (pkg.concurrent_limit) }) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.mffd9fcd5e618', { value1: (pkg.duration_days) }) }}</span>
            </div>
            <div v-for="discount in getPackageDiscounts(pkg)" :key="discount.type" class="flex items-center gap-2">
              <svg class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-slate-700 dark:text-slate-300">{{ discount.text }}</span>
            </div>
          </div>

          <!-- 购买按钮 -->
          <button
            @click="purchasePackage(pkg)"
            :disabled="purchasing === pkg.id || isDowngrade(pkg.type)"
            class="w-full py-3 rounded-xl font-semibold transition-all duration-200"
            :class="getButtonStyle(pkg.type)"
          >
            <span v-if="purchasing === pkg.id">{{ translateUi('common.processing') }}</span>
            <span v-else-if="isCurrentPackage(pkg.type)">{{ translateUi('uiMessages.m05367bca4f4f') }}</span>
            <span v-else-if="canUpgrade(pkg.type)">{{ translateUi('packages.upgradePackage') }}</span>
            <span v-else-if="isDowngrade(pkg.type)">{{ translateUi('packages.cannotDowngrade') }}</span>
            <span v-else>{{ translateUi('packages.upgradePackage') }}</span>
          </button>
        </div>
      </div>

      <!-- 说明 -->
      <div class="mt-12 bg-white dark:bg-dark-800 rounded-xl p-6 shadow-lg">
        <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-4">{{ translateUi('uiMessages.m82178d27eb16') }}</h3>
        <ul class="space-y-2 text-slate-600 dark:text-slate-400">
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-primary-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ translateUi('uiMessages.m83984edfeace') }}</span>
          </li>
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span><span class="font-semibold text-green-600 dark:text-green-400">{{ translateUi('uiMessages.mf67d7542eea8') }}</span>{{ translateUi('uiMessages.m23dc677ea7fe') }}</span>
          </li>
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-primary-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ translateUi('uiMessages.mf8d0cda12ae7') }}</span>
          </li>
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-primary-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ translateUi('uiMessages.m5c6d4bddf75a') }}</span>
          </li>
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{{ translateUi('uiMessages.mda391d896401') }}</span>
          </li>
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-primary-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ translateUi('uiMessages.m69c0979680e2') }} <span class="font-semibold text-primary-600">{{ defaultConcurrentLimit }}</span> {{ translateUi('uiMessages.m9d2cd4289279') }}</span>
          </li>
        </ul>
      </div>
    </div>
    
    <!-- 兑换券模态框 -->
    <div v-if="showVoucherModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeVoucherModal">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">{{ translateUi('uiMessages.m793022b01b53') }}</h3>
            <button @click="closeVoucherModal" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6">
          <div class="mb-4">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('uiMessages.mabbb6156a43e') }}
            </label>
            <input
              v-model="voucherCode"
              type="text"
              :placeholder="translateUi('uiMessages.m2727a128acfb')"
              maxlength="13"
              class="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-dark-500 bg-white dark:bg-dark-600 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              @keyup.enter="submitVoucher"
            />
            <div class="mt-2 space-y-2">
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ translateUi('uiMessages.m2ff0d07456b2') }}
              </p>
              <div class="p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p class="text-xs text-blue-700 dark:text-blue-300 flex items-start gap-1.5">
                  <svg class="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span class="font-medium">{{ translateUi('uiMessages.m94975a647190') }}</span>
                </p>
              </div>
              <p class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{{ translateUi('uiMessages.mdcb454dad517') }}</span>
              </p>
            </div>
          </div>
          
          <div v-if="voucherError" class="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-lg">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div class="flex-1">
                <p class="text-sm font-medium text-amber-800 dark:text-amber-300">{{ voucherError }}</p>
                <p v-if="voucherError.includes('优惠券')" class="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  {{ translateUi('uiMessages.m27f258ddc68a') }}
                </p>
              </div>
            </div>
          </div>
          
          <div v-if="voucherSuccess" class="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-lg">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div class="flex-1">
                <p class="text-sm text-green-700 dark:text-green-300 whitespace-pre-line font-medium">{{ voucherSuccess }}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex justify-between items-center">
          <!-- 外部链接按钮 - 左下角 -->
          <div v-if="externalLinkConfig.enabled && externalLinkConfig.url">
            <a 
              :href="externalLinkConfig.url"
              :target="externalLinkConfig.open_in_new_tab ? '_blank' : '_self'"
              :rel="externalLinkConfig.open_in_new_tab ? 'noopener noreferrer' : ''"
              class="inline-flex items-center px-3 py-2 text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200"
            >
              <span class="mr-1.5">🔗</span>
              <span>{{ externalLinkConfig.button_text || translateUi('voucher.getVoucher') }}</span>
              <svg v-if="externalLinkConfig.open_in_new_tab" class="w-3.5 h-3.5 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </a>
          </div>
          
          <!-- 操作按钮 - 右侧 -->
          <div class="flex space-x-3">
            <button 
              @click="closeVoucherModal"
              class="px-4 py-2 rounded-lg font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
              :disabled="voucherLoading"
            >
              {{ translateUi('common.cancel') }}
            </button>
            <button 
              @click="submitVoucher"
              class="px-6 py-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="voucherLoading || !voucherCode.trim()"
            >
              <span v-if="voucherLoading">{{ translateUi('user.redeeming') }}</span>
              <span v-else>{{ translateUi('user.redeemNow') }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 套餐购买确认模态框 -->
    <div v-if="showPurchaseModal && selectedPackage && purchaseInfo" class="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-4 md:py-8" @click.self="closePurchaseModal">
      <div class="bg-white dark:bg-dark-700 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 my-auto max-h-[95vh] md:max-h-[90vh] flex flex-col animate-scale-in">
        <!-- 头部 -->
        <div class="p-6 border-b border-slate-200 dark:border-dark-600 bg-gradient-to-r from-primary-500 to-purple-500 flex-shrink-0">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div>
                <h3 class="text-xl font-bold text-white">{{ translateUi('uiMessages.m13d30a975aae', { value1: (purchaseInfo.action) }) }}</h3>
                <p class="text-sm text-white/80">{{ translateUi('uiMessages.m6daaa54e3b1d') }}</p>
              </div>
            </div>
            <button @click="closePurchaseModal" class="text-white/80 hover:text-white transition-colors">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 内容 -->
        <div class="p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
          <!-- 套餐信息 -->
          <div class="bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 rounded-xl p-6 border border-primary-200 dark:border-primary-800">
            <div class="flex items-center justify-between mb-4">
              <h4 class="text-lg font-bold text-slate-900 dark:text-white">{{ selectedPackage.name }}</h4>
              <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">
                {{ formatMoney(selectedPackage.price) }}
              </div>
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div class="text-center">
                <div class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('admin.grantPoints') }}</div>
                <div class="text-lg font-bold text-slate-900 dark:text-white">{{ formatPoints(selectedPackage.points) }}</div>
              </div>
              <div class="text-center">
                <div class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.mf33bc7f6cdbb') }}</div>
                <div class="text-lg font-bold text-slate-900 dark:text-white">{{ selectedPackage.concurrent_limit }}</div>
              </div>
              <div class="text-center">
                <div class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m9c2a28e8f98f') }}</div>
                <div class="text-lg font-bold text-slate-900 dark:text-white">{{ translateUi('uiMessages.mb4baa30d48ff', { value1: (selectedPackage.duration_days) }) }}</div>
              </div>
            </div>
            
            <!-- 续费/升级说明 -->
            <div v-if="purchaseInfo.isCurrent" class="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div class="text-sm text-green-800 dark:text-green-300 space-y-1">
                <div class="font-semibold mb-2">{{ translateUi('uiMessages.m493df7848705') }}</div>
                <div>{{ translateUi('uiMessages.m8bed3b58d990', { value1: (formatPoints(selectedPackage.points)) }) }}</div>
                <div>{{ translateUi('uiMessages.m5c18fc018af0', { value1: (selectedPackage.duration_days) }) }}</div>
                <div>{{ translateUi('uiMessages.m036c1a95cfda') }}</div>
              </div>
            </div>
            <div v-else-if="purchaseInfo.isUpgrade" class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div class="text-sm text-blue-800 dark:text-blue-300">
                <div class="font-semibold">{{ translateUi('uiMessages.mc5a613eccb20') }}</div>
                <div>{{ translateUi('uiMessages.mb40877e15fa8') }}</div>
              </div>
            </div>
          </div>

          <!-- 优惠券输入 -->
          <div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
            <div class="flex items-center gap-2 mb-3">
              <svg class="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
              <span class="font-medium text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.m3e2581c8de38') }}</span>
            </div>
            <div class="flex gap-2">
              <input 
                v-model="purchaseCouponCode"
                type="text"
                :placeholder="translateUi('uiMessages.mb394a69d722c')"
                class="flex-1 px-4 py-2 bg-white dark:bg-dark-600 border border-slate-300 dark:border-dark-500 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent uppercase"
                @input="purchaseCouponCode = purchaseCouponCode.toUpperCase()"
              />
              <button 
                @click="applyCoupon"
                :disabled="!purchaseCouponCode || purchaseLoading"
                class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {{ translateUi('directorStudio.inspector.apply') }}
              </button>
            </div>
            <!-- 优惠券应用成功提示 -->
            <div v-if="appliedCoupon" class="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-green-700 dark:text-green-300 text-sm">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{{ appliedCoupon.name }}</span>
                </div>
                <button @click="removeCoupon" class="text-red-600 hover:text-red-700 text-sm">
                  {{ translateUi('user.removeCoupon') }}
                </button>
              </div>
              <div class="mt-1 text-xs text-green-600 dark:text-green-400">
                {{ translateUi('uiMessages.m70026419601d', { value1: (formatMoney(couponDiscount)) }) }}
              </div>
            </div>
            <!-- 优惠券错误提示 -->
            <div v-if="couponError" class="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div class="text-sm text-red-700 dark:text-red-300">
                {{ couponError }}
              </div>
            </div>
          </div>

          <!-- 支付信息 -->
          <div class="space-y-4">
            <h4 class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {{ translateUi('user.paymentMethod') }}
            </h4>

            <!-- 余额使用 -->
            <div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span class="font-medium text-slate-700 dark:text-slate-300">{{ translateUi('packages.accountBalance') }}</span>
                </div>
                <span class="text-amber-600 dark:text-amber-400 font-bold">{{ formatMoney(purchaseInfo.balance) }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.mde21671eec3c') }}</span>
                <span class="font-bold text-green-600 dark:text-green-400">-{{ formatMoney(purchaseInfo.balanceUsed) }}</span>
              </div>
            </div>

            <!-- 在线支付 -->
            <div v-if="purchaseInfo.needOnlinePayment" class="space-y-3">
              <div class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <span class="font-medium text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.md0438a53b3da') }}</span>
                  </div>
                  <span class="text-blue-600 dark:text-blue-400 font-bold">{{ formatMoney(purchaseInfo.needPay) }}</span>
                </div>
                
              </div>
            </div>

            <!-- 纯余额支付提示 -->
            <div v-else class="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
              <div class="flex items-center gap-2 text-green-700 dark:text-green-300">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="font-medium">{{ translateUi('uiMessages.mab14bd432b90') }}</span>
              </div>
            </div>
          </div>

          <!-- 费用汇总 -->
          <div class="bg-slate-50 dark:bg-dark-600 rounded-xl p-4 space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.mae94f319b00a') }}</span>
              <span class="text-slate-900 dark:text-white font-medium">{{ formatMoney(selectedPackage.price) }}</span>
            </div>
            <div v-if="purchaseInfo.isUpgrade && purchaseInfo.upgradeDiscount > 0" class="flex items-center justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m288f601c81ac') }}</span>
              <span class="text-blue-600 dark:text-blue-400 font-medium">-{{ formatMoney(purchaseInfo.upgradeDiscount) }}</span>
            </div>
            <div v-if="couponDiscount > 0" class="flex items-center justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m01c2b7dc5501') }}</span>
              <span class="text-purple-600 dark:text-purple-400 font-medium">-{{ formatMoney(couponDiscount) }}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.mde21671eec3c') }}</span>
              <span class="text-green-600 dark:text-green-400 font-medium">-{{ formatMoney(purchaseInfo.balanceUsed) }}</span>
            </div>
            <div class="border-t border-slate-200 dark:border-dark-500 pt-2 mt-2">
              <div class="flex items-center justify-between">
                <span class="font-bold text-slate-900 dark:text-white">{{ translateUi('uiMessages.m5c9576f44990') }}</span>
                <span class="text-2xl font-bold text-primary-600 dark:text-primary-400">
                  {{ formatMoney(purchaseInfo.needPay) }}
                </span>
              </div>
            </div>
          </div>

          <!-- 错误提示 -->
          <div v-if="purchaseError" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div class="flex items-center gap-2 text-red-700 dark:text-red-300">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{{ purchaseError }}</span>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 bg-slate-50 dark:bg-dark-800 flex gap-3 flex-shrink-0">
          <button
            @click="closePurchaseModal"
            :disabled="purchaseLoading"
            class="flex-1 px-6 py-3 bg-white dark:bg-dark-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-100 dark:hover:bg-dark-500 transition-colors border border-slate-300 dark:border-dark-500"
          >
            {{ translateUi('common.cancel') }}
          </button>
          <button
            @click="confirmPurchase"
            :disabled="purchaseLoading"
            class="flex-1 px-6 py-3 bg-gradient-to-r from-primary-500 to-purple-500 hover:from-primary-600 hover:to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg v-if="purchaseLoading" class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span v-if="purchaseLoading">{{ translateUi('common.processing') }}</span>
            <span v-else-if="purchaseInfo.needOnlinePayment">{{ translateUi('uiMessages.me79225bdda7f') }}</span>
            <span v-else>{{ translateUi('uiMessages.mc447e931aca1', { value1: (purchaseInfo.action) }) }}</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- 充值模态框 -->
    <div v-if="showRechargeModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeRechargeModal">
      <div class="bg-white dark:bg-dark-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <!-- 头部 -->
        <div class="p-6 border-b border-slate-200 dark:border-dark-600 bg-gradient-to-r from-amber-500 to-orange-500">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <span class="text-3xl">💳</span>
              <div>
                <h3 class="text-xl font-bold text-white">{{ translateUi('user.accountRecharge') }}</h3>
                <p class="text-sm text-white/80">{{ translateUi('uiMessages.mc3bce5c18868') }}</p>
              </div>
            </div>
            <button @click="closeRechargeModal" class="text-white/80 hover:text-white transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6 space-y-6">
          <!-- 充值卡片选项 -->
          <div v-if="rechargeCards.length > 0">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              {{ translateUi('user.selectRechargeCard') }}
            </label>
            <div class="grid grid-cols-3 gap-3">
              <button
                v-for="card in rechargeCards"
                :key="card.id"
                @click="selectRechargeCard(card)"
                :class="[
                  'relative py-3 px-4 rounded-xl font-medium text-center transition-all duration-200 border-2',
                  selectedRechargeCard?.id === card.id
                    ? 'bg-amber-500 text-white border-amber-500 shadow-lg scale-105'
                    : 'bg-white dark:bg-dark-600 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-dark-500 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                ]"
              >
                <!-- 奖励标识：小星星 -->
                <span v-if="card.bonus_enabled" class="absolute -top-1 -right-1 text-yellow-400 text-lg">★</span>
                <div>{{ currencySymbol }}{{ (card.amount / 100).toFixed(0) }}</div>
                <!-- 奖励说明 -->
                <div v-if="card.bonus_enabled" class="text-xs mt-1" :class="selectedRechargeCard?.id === card.id ? 'text-white/80' : 'text-amber-600 dark:text-amber-400'">
                  <span v-if="card.bonus_type === 'random'">{{ translateUi('uiMessages.mbee417a9888a', { value1: (card.bonus_min), value2: (card.bonus_max) }) }}</span>
                  <span v-else>{{ translateUi('uiMessages.mff467e49bb29', { value1: (card.bonus_fixed) }) }}</span>
                </div>
              </button>
            </div>
          </div>
          
          <!-- 自定义金额 -->
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('uiMessages.m8db41ccc790d', { value1: (rechargeLimits.minAmount), value2: (rechargeLimits.maxAmount), value3: (currencyUnitLabel) }) }}
            </label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-lg">{{ currencySymbol }}</span>
              <input
                v-model="rechargeCustomAmount"
                type="number"
                :min="rechargeLimits.minAmount"
                :max="rechargeLimits.maxAmount"
                step="0.01"
                class="w-full pl-10 px-4 py-3 rounded-lg border border-slate-300 dark:border-dark-500 bg-white dark:bg-dark-600 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all text-lg"
                :placeholder="translateUi('uiMessages.mad727176fc37')"
                @input="rechargeAmount = ''; selectedRechargeCard = null"
              />
            </div>
          </div>
          
          
          <!-- 充值金额预览 -->
          <div v-if="getFinalRechargeAmount() > 0" class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-green-700 dark:text-green-300">{{ translateUi('user.rechargeAmount') }}</span>
              <span class="text-2xl font-bold text-green-600 dark:text-green-400">
                {{ formatMoney(getFinalRechargeAmount()) }}
              </span>
            </div>
            <!-- 选中充值卡片的奖励信息 -->
            <div v-if="selectedRechargeCard?.bonus_enabled" class="mt-2 pt-2 border-t border-green-200 dark:border-green-700">
              <div class="flex items-center justify-between text-sm">
                <span class="text-green-600 dark:text-green-400">{{ translateUi('uiMessages.m223b8f0b39eb') }}</span>
                <span class="font-medium text-amber-600 dark:text-amber-400">
                  <span v-if="selectedRechargeCard.bonus_type === 'random'">{{ translateUi('uiMessages.mbee417a9888a', { value1: (selectedRechargeCard.bonus_min), value2: (selectedRechargeCard.bonus_max) }) }}</span>
                  <span v-else>{{ translateUi('uiMessages.mff467e49bb29', { value1: (selectedRechargeCard.bonus_fixed) }) }}</span>
                </span>
              </div>
            </div>
          </div>
          
          <!-- 错误提示 -->
          <div v-if="rechargeError" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-600 dark:text-red-400">{{ rechargeError }}</p>
          </div>
          
          <!-- 提示说明 -->
          <div class="bg-slate-50 dark:bg-dark-600/50 rounded-xl p-4">
            <div class="flex items-start space-x-2">
              <span class="text-lg">💡</span>
              <div class="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <p>{{ translateUi('uiMessages.me7d555f383d4') }}</p>
                <p>{{ translateUi('uiMessages.mc79f4ab52fca') }}</p>
                <p>{{ translateUi('uiMessages.m717b29d7fba4', { value1: (rechargeLimits.minAmount), value2: (currencyUnitLabel), value3: (rechargeLimits.maxAmount), value4: (currencyUnitLabel) }) }}</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 操作按钮 -->
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex space-x-3">
          <button 
            @click="closeRechargeModal"
            class="flex-1 px-4 py-3 rounded-xl font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
            :disabled="rechargeLoading"
          >
            {{ translateUi('common.cancel') }}
          </button>
          <button 
            @click="submitRecharge"
            class="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="rechargeLoading || getFinalRechargeAmount() < 100"
          >
            <span v-if="rechargeLoading">{{ translateUi('common.processing') }}</span>
            <span v-else>{{ translateUi('uiMessages.m6fa46cf1759d') }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 支付二维码弹窗 -->

  </div>
</template>

<script setup>
import { t as translateUi } from '@/i18n'

import { openCheckout } from '@/utils/openCheckout'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { redeemVoucher, getMe } from '@/api/client'
import { getTenantHeaders, getApiUrl, getRechargeLimits } from '@/config/tenant'
import { formatPoints } from '@/utils/format'
import { getPackageDiscounts } from '@/utils/packageDiscounts'
import { useCurrencyDisplay } from '@/utils/currencyDisplay'

const router = useRouter()
const { formatMoney, symbol: currencySymbol, unitLabel: currencyUnitLabel } = useCurrencyDisplay()
const packages = ref([])
const activePackage = ref(null)
const user = ref(null)
const loading = ref(true)
const error = ref('')
const purchasing = ref(null)
const defaultConcurrentLimit = ref(1) // 默认并发限制

// 兑换券相关
const showVoucherModal = ref(false)
const voucherCode = ref('')
const voucherLoading = ref(false)
const voucherError = ref('')
const voucherSuccess = ref('')
const externalLinkConfig = ref({
  enabled: false,
  get button_text() { return translateUi('voucher.getVoucher') },
  url: '',
  open_in_new_tab: true
})

// 充值相关
const showRechargeModal = ref(false)
const rechargeAmount = ref('')
const rechargeCustomAmount = ref('')

const rechargeLoading = ref(false)
const rechargeError = ref('')

const quickAmounts = [300, 500, 1000, 5000, 10000] // 单位：分
const rechargeCards = ref([]) // 充值卡片列表
const selectedRechargeCard = ref(null) // 选中的充值卡片
const rechargeLimits = computed(() => getRechargeLimits())

// 使用后端返回的 level 字段来判断套餐等级
// 注意：如果没有 level 字段，则回退到 packageOrder 映射
const packageOrder = { daily: 1, weekly: 2, monthly: 3, quarterly: 4, yearly: 5, supmonthly: 4, quarter: 5, year: 6 }

// 根据套餐类型获取等级（优先使用 packages 中的 level 字段）
function getPackageLevel(type) {
  const pkg = packages.value.find(p => p.type === type)
  if (pkg && typeof pkg.level === 'number') {
    return pkg.level
  }
  return packageOrder[type] || 0
}

// 获取当前用户套餐的等级
function getCurrentPackageLevel() {
  if (!activePackage.value) return 0
  // 优先使用 user_packages 中存储的 package_level
  if (typeof activePackage.value.package_level === 'number' && activePackage.value.package_level > 0) {
    return activePackage.value.package_level
  }
  // 回退到根据类型查找
  return getPackageLevel(activePackage.value.package_type)
}

function getPackageStyle(type) {
  const styles = {
    daily: 'border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600',
    weekly: 'border-green-200 dark:border-green-800 hover:border-green-400 dark:hover:border-green-600',
    monthly: 'border-purple-300 dark:border-purple-700 hover:border-purple-500 dark:hover:border-purple-500 ring-2 ring-purple-400 dark:ring-purple-600',
    quarterly: 'border-orange-200 dark:border-orange-800 hover:border-orange-400 dark:hover:border-orange-600',
    yearly: 'border-red-200 dark:border-red-800 hover:border-red-400 dark:hover:border-red-600'
  }
  return styles[type] || 'border-slate-200 dark:border-slate-700'
}

function getButtonStyle(type) {
  if (isDowngrade(type)) {
    return 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
  }
  
  const styles = {
    daily: 'bg-blue-600 hover:bg-blue-700 text-white',
    weekly: 'bg-green-600 hover:bg-green-700 text-white',
    monthly: 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white',
    quarterly: 'bg-orange-600 hover:bg-orange-700 text-white',
    yearly: 'bg-red-600 hover:bg-red-700 text-white'
  }
  return styles[type] || 'bg-primary-600 hover:bg-primary-700 text-white'
}

function getDurationText(days) {
  if (days === 1) return translateUi('uiMessages.meea1694c235b')
  if (days === 7) return translateUi('uiMessages.m92845d3b531d')
  if (days === 30) return translateUi('uiMessages.m68b21af949de')
  if (days === 90) return translateUi('uiMessages.md12e1ba679ca')
  if (days === 365) return translateUi('uiMessages.m3fd8936ffb47')
  return translateUi('uiMessages.mb4baa30d48ff', { value1: (days) })
}

function formatRemainingTime(expiresAt) {
  const now = Date.now()
  const remaining = expiresAt - now
  if (remaining <= 0) return translateUi('user.expired')
  
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  
  if (days > 0) return translateUi('uiMessages.mb4baa30d48ff', { value1: (days) })
  return translateUi('uiMessages.mf512482fac29', { value1: (hours) })
}

function isCurrentPackage(type) {
  return activePackage.value && activePackage.value.package_type === type
}

function canUpgrade(type) {
  if (!activePackage.value) return false
  const currentLevel = getCurrentPackageLevel()
  const newLevel = getPackageLevel(type)
  return newLevel > currentLevel
}

function isDowngrade(type) {
  if (!activePackage.value) {
    console.log('[isDowngrade] 用户没有活跃套餐，不是降级')
    return false
  }
  const currentLevel = getCurrentPackageLevel()
  const newLevel = getPackageLevel(type)
  const isDowngradeResult = newLevel < currentLevel
  console.log(`[isDowngrade] 当前套餐等级: ${currentLevel}, 新套餐等级: ${newLevel}, 是否降级: ${isDowngradeResult}`)
  return isDowngradeResult
}

async function loadPackages() {
  try {
    loading.value = true
    error.value = ''
    
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    // 获取用户信息
    const userRes = await fetch(getApiUrl('/api/user/me'), {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (userRes.ok) {
      user.value = await userRes.json()
    }

    // 获取套餐列表
    const pkgRes = await fetch(getApiUrl('/api/packages'), {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (pkgRes.ok) {
      const data = await pkgRes.json()
      packages.value = data.packages
    } else {
      error.value = translateUi('uiMessages.m3eb439c8e6bb')
    }

    // 获取当前套餐
    const activeRes = await fetch(getApiUrl('/api/user/package'), {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (activeRes.ok) {
      const data = await activeRes.json()
      activePackage.value = data.package
    }

    // 获取系统默认并发限制配置和外部链接配置
    try {
      const configRes = await fetch(getApiUrl('/api/points-config'))
      if (configRes.ok) {
        const configData = await configRes.json()
        // 如果有 default_concurrent_limit 配置就使用，否则保持默认值 1
        if (configData.default_concurrent_limit !== undefined) {
          defaultConcurrentLimit.value = configData.default_concurrent_limit
        }
        // 加载兑换券外部链接配置
        if (configData.voucher_external_link) {
          externalLinkConfig.value = {
            enabled: !!configData.voucher_external_link.enabled,
            button_text: configData.voucher_external_link.button_text || translateUi('voucher.getVoucher'),
            url: configData.voucher_external_link.url || '',
            open_in_new_tab: configData.voucher_external_link.open_in_new_tab !== false
          }
        }
      }
    } catch (e) {
      console.warn('[loadPackages] 获取默认并发限制配置失败:', e)
    }

  } catch (e) {
    console.error('[loadPackages] error:', e)
    error.value = translateUi('uiMessages.m639b9fd76d7c')
  } finally {
    loading.value = false
  }
}

// 套餐购买确认模态框相关
const showPurchaseModal = ref(false)
const selectedPackage = ref(null)

const purchaseLoading = ref(false)
const purchaseError = ref('')
const purchaseCouponCode = ref('')
const appliedCoupon = ref(null)
const couponDiscount = ref(0)
const couponError = ref('')

async function purchasePackage(pkg) {
  if (purchasing.value) return
  if (isDowngrade(pkg.type)) {
    alert(translateUi('uiMessages.me5ee1cf41124'))
    return
  }

  // 打开支付确认模态框
  selectedPackage.value = pkg
  showPurchaseModal.value = true
  purchaseError.value = ''
  purchaseCouponCode.value = ''
  appliedCoupon.value = null
  couponDiscount.value = 0
  couponError.value = ''
  

}

function closePurchaseModal() {
  showPurchaseModal.value = false
  selectedPackage.value = null
  purchaseError.value = ''
  purchaseCouponCode.value = ''
  appliedCoupon.value = null
  couponDiscount.value = 0
  couponError.value = ''
}

// 计算支付信息
const purchaseInfo = computed(() => {
  if (!selectedPackage.value || !user.value) return null
  
  const pkg = selectedPackage.value
  const balance = user.value.balance || 0
  
  const isCurrent = isCurrentPackage(pkg.type)
  const isUpgrade = canUpgrade(pkg.type)
  const action = isCurrent ? translateUi('packages.renew') : (isUpgrade ? translateUi('packages.upgrade') : translateUi('pointsType.purchase'))
  
  // 1. 原始套餐价格
  let finalPrice = pkg.price
  let upgradeDiscount = 0
  
  // 2. 如果是升级，计算折抵（这里简化处理，实际折抵在后端计算）
  // 前端只是展示，实际价格由后端返回
  if (isUpgrade && activePackage.value) {
    // 这里只是估算，实际以后端为准
    upgradeDiscount = 0 // 暂时不在前端计算，等后端返回
  }
  
  // 3. 应用优惠券
  const priceAfterUpgrade = finalPrice - upgradeDiscount
  const priceAfterCoupon = priceAfterUpgrade - couponDiscount.value
  
  // 4. 计算余额使用
  const balanceUsed = Math.min(balance, priceAfterCoupon)
  
  // 5. 计算需要在线支付的金额
  const needPay = priceAfterCoupon - balanceUsed
  
  return {
    action,
    isCurrent,
    isUpgrade,
    totalAmount: finalPrice,
    upgradeDiscount,
    couponDiscount: couponDiscount.value,
    priceAfterCoupon,
    balance,
    balanceUsed,
    needPay: Math.max(0, needPay),
    canPayWithBalance: balance >= priceAfterCoupon,
    needOnlinePayment: needPay > 0
  }
})

// 应用优惠券
async function applyCoupon() {
  if (!purchaseCouponCode.value) return
  
  couponError.value = ''
  
  try {
    const token = localStorage.getItem('token')
    const priceToValidate = selectedPackage.value.price // 使用原价验证
    
    const res = await fetch(getApiUrl('/api/user/coupons/validate'), {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: purchaseCouponCode.value,
        amount: priceToValidate
      })
    })
    
    const data = await res.json()
    
    if (!res.ok) {
      couponError.value = data.message || translateUi('user.couponValidateFailed')
      return
    }
    
    appliedCoupon.value = data.coupon
    couponDiscount.value = data.discount_amount
    couponError.value = ''
    
  } catch (e) {
    console.error('[applyCoupon] error:', e)
    couponError.value = translateUi('uiMessages.mef72c47d43a5')
  }
}

// 移除优惠券
function removeCoupon() {
  purchaseCouponCode.value = ''
  appliedCoupon.value = null
  couponDiscount.value = 0
  couponError.value = ''
}

async function confirmPurchase() {
  if (!selectedPackage.value || purchaseLoading.value) return
  const input = { kind: 'package', package_id: selectedPackage.value.id,
    ...(appliedCoupon.value ? { coupon_code: purchaseCouponCode.value.trim() } : {}) }
  const title = selectedPackage.value.name || translateUi('pointsType.package_purchase')
  closePurchaseModal()
  const result = await openCheckout(input, title)
  if (result) { await loadPackages() }
}

// 充值相关函数
async function openRechargeModal() {
  showRechargeModal.value = true
  rechargeAmount.value = 0
  rechargeCustomAmount.value = ''
  rechargeError.value = ''
  selectedRechargeCard.value = null
  try {
    const response = await fetch(getApiUrl('/api/recharge-cards'), { headers: getTenantHeaders() })
    if (!response.ok) throw new Error(translateUi('uiMessages.mc54d2d8aaf79'))
    rechargeCards.value = (await response.json()).recharge_cards || []
  } catch (e) { rechargeCards.value = []; rechargeError.value = e.message }
}

function closeRechargeModal() {
  showRechargeModal.value = false
  rechargeAmount.value = ''
  rechargeCustomAmount.value = ''
  selectedRechargeCard.value = null
  rechargeError.value = ''
}

function selectQuickAmount(amount) {
  rechargeAmount.value = amount
  rechargeCustomAmount.value = ''
  selectedRechargeCard.value = null
}

// 选择充值卡片
function selectRechargeCard(card) {
  selectedRechargeCard.value = card
  rechargeAmount.value = card.amount
  rechargeCustomAmount.value = ''
}

function getFinalRechargeAmount() {
  if (rechargeAmount.value) {
    return parseInt(rechargeAmount.value)
  }
  if (rechargeCustomAmount.value) {
    const yuan = parseFloat(rechargeCustomAmount.value)
    if (Number.isFinite(yuan)) {
      return Math.floor(yuan * 100)
    }
  }
  return 0
}

async function submitRecharge() {
  const amount = getFinalRechargeAmount()
  if (amount < rechargeLimits.value.minAmount * 100 || amount > rechargeLimits.value.maxAmount * 100) {
    rechargeError.value = translateUi('uiMessages.m726e1c06b4a0', { value1: (rechargeLimits.value.minAmount), value2: (rechargeLimits.value.maxAmount), value3: (currencyUnitLabel.value) })
    return
  }
  const input = { kind: 'recharge', amount, ...(selectedRechargeCard.value ? { recharge_card_id: selectedRechargeCard.value.id } : {}) }
  closeRechargeModal()
  const result = await openCheckout(input, '账户充值')
  if (result) { await loadPackages() }
}

// 兑换券相关函数
function openVoucherModal() {
  showVoucherModal.value = true
  voucherCode.value = ''
  voucherError.value = ''
  voucherSuccess.value = ''
}

function closeVoucherModal() {
  showVoucherModal.value = false
  voucherCode.value = ''
  voucherError.value = ''
  voucherSuccess.value = ''
}

async function submitVoucher() {
  if (!voucherCode.value || !voucherCode.value.trim()) {
    voucherError.value = translateUi('user.enterVoucherCode')
    return
  }
  
  voucherLoading.value = true
  voucherError.value = ''
  voucherSuccess.value = ''
  
  try {
    const result = await redeemVoucher(voucherCode.value.trim().toUpperCase())
    
    // 刷新用户信息获取最新余额
    const token = localStorage.getItem('token')
    const userRes = await fetch(getApiUrl('/api/user/me'), {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (userRes.ok) {
      user.value = await userRes.json()
    }
    
    // 检查是否有余额，如果有则自动购买最大套餐
    const balance = user.value?.balance || 0
    console.log('[submitVoucher] ========== 开始自动购买流程 ==========')
    console.log('[submitVoucher] 兑换后用户余额:', balance, '分 (' + formatMoney(balance) + ')')
    console.log('[submitVoucher] 当前套餐列表数量:', packages.value ? packages.value.length : 0)
    
    // 强制重新加载套餐列表，确保数据最新
    console.log('[submitVoucher] 重新加载套餐列表...')
    await loadPackages()
    console.log('[submitVoucher] 加载后套餐数量:', packages.value ? packages.value.length : 0)
    console.log('[submitVoucher] 当前活跃套餐:', activePackage.value ? activePackage.value.package_name : '无')
    
    if (balance > 0 && packages.value && packages.value.length > 0) {
      console.log('[submitVoucher] 条件满足：余额 > 0 且有套餐列表，开始查找可购买套餐')
      // 找到余额范围内可购买的最大套餐
      const affordablePackage = findMaxAffordablePackage(balance)
      console.log('[submitVoucher] findMaxAffordablePackage 返回结果:', affordablePackage ? affordablePackage.name : 'null (无可购买套餐)')
      
      if (affordablePackage) {
        // 自动购买套餐
        console.log('[submitVoucher] 开始自动购买套餐:', affordablePackage.name)
        const purchaseResult = await autoPurchasePackage(affordablePackage, token)
        console.log('[submitVoucher] 购买结果:', purchaseResult)
        
        if (purchaseResult.success) {
          // 再次刷新用户信息获取最新数据
          const userRes2 = await fetch(getApiUrl('/api/user/me'), {
            headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
          })
          if (userRes2.ok) {
            user.value = await userRes2.json()
          }
          
          // 刷新套餐信息
          await loadPackages()
          
          // 构建成功消息
          const remainingBalance = user.value?.balance || 0
          voucherSuccess.value = translateUi('uiMessages.m46659c533807', { value1: (formatMoney(balance)), value2: (affordablePackage.name), value3: (formatPoints(affordablePackage.points)), value4: (affordablePackage.concurrent_limit), value5: (affordablePackage.duration_days), value6: (formatMoney(remainingBalance)) }).trim()
        } else {
          // 购买失败，显示兑换成功但未能自动购买
          voucherSuccess.value = translateUi('uiMessages.ma4e351d6cc4f', { value1: (formatMoney(balance)), value2: (purchaseResult.error) })
        }
      } else {
        // 余额不足以购买任何套餐，或所有套餐都是降级
        console.log('[submitVoucher] 没有可购买的套餐（余额不足或会降级）')
        // 查找最便宜的套餐价格，给用户提示
        const minPricePackage = packages.value.reduce((min, p) => (!min || p.price < min.price) ? p : min, null)
        const minPrice = minPricePackage ? minPricePackage.price : 0
        let hint = translateUi('uiMessages.mc6951c2ee094')
        if (minPrice > 0 && balance < minPrice) {
          hint = translateUi('uiMessages.m905571e1537c', { value1: (formatMoney(minPrice)), value2: (formatMoney(balance)) })
        } else if (activePackage.value) {
          hint = translateUi('uiMessages.m291e03dea9c3')
        }
        voucherSuccess.value = translateUi('uiMessages.ma29e2e3bfb0b', { value1: (formatMoney(balance)), value2: (hint) })
      }
    } else {
      // 没有余额或没有套餐
      console.log('[submitVoucher] 条件不满足: balance=', balance, ', packages.length=', packages.value?.length)
      if (balance === 0 && result.points > 0) {
        voucherSuccess.value = translateUi('uiMessages.m9af7b466b352', { value1: (result.points) })
      } else if (!packages.value || packages.value.length === 0) {
        voucherSuccess.value = translateUi('uiMessages.md1cedd2220ed', { value1: (formatMoney(balance)) })
      } else {
        voucherSuccess.value = result.message || translateUi('uiMessages.m54d0432acd4c', { value1: (result.points) })
      }
    }
    
    // 触发全局用户信息更新事件（更新导航栏）
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
    // 5秒后关闭模态框（给用户更多时间查看详细信息）
    setTimeout(() => {
      closeVoucherModal()
    }, 5000)
  } catch (e) {
    voucherError.value = e.message || translateUi('uiMessages.m5fbc20de118c')
  } finally {
    voucherLoading.value = false
  }
}

// 找到余额范围内可购买的最大套餐
function findMaxAffordablePackage(balance) {
  console.log('[findMaxAffordablePackage] ========== 开始查找可购买套餐 ==========')
  console.log('[findMaxAffordablePackage] 当前余额:', balance, '分 (' + formatMoney(balance) + ')')
  
  if (!packages.value || packages.value.length === 0) {
    console.log('[findMaxAffordablePackage] ❌ 没有可用套餐列表')
    return null
  }
  
  console.log('[findMaxAffordablePackage] 所有套餐列表:')
  packages.value.forEach(p => {
    console.log(`  - ${p.name}: 价格=${p.price}分(${formatMoney(p.price)}), 类型=${p.type}, ID=${p.id}`)
  })
  
  console.log('[findMaxAffordablePackage] 当前用户活跃套餐:', activePackage.value ? 
    `${activePackage.value.package_name} (类型: ${activePackage.value.package_type})` : '无')
  
  // 过滤出可以购买的套餐（不能降级）
  let affordablePackages = packages.value.filter(pkg => {
    // 余额足够
    if (pkg.price > balance) {
      console.log(`[findMaxAffordablePackage] ❌ 套餐 "${pkg.name}" 价格 ${pkg.price}分 > 余额 ${balance}分 - 跳过`)
      return false
    }
    // 不能降级
    const downgrade = isDowngrade(pkg.type)
    if (downgrade) {
      console.log(`[findMaxAffordablePackage] ❌ 套餐 "${pkg.name}" 会导致降级 - 跳过`)
      return false
    }
    console.log(`[findMaxAffordablePackage] ✅ 套餐 "${pkg.name}" 符合条件 (价格: ${pkg.price}分, 类型: ${pkg.type})`)
    return true
  })
  
  console.log('[findMaxAffordablePackage] 符合条件的套餐数量:', affordablePackages.length)
  
  if (affordablePackages.length === 0) {
    console.log('[findMaxAffordablePackage] ❌ 没有符合条件的套餐可购买')
    return null
  }
  
  // 按照套餐等级排序，找到最大的套餐（优先使用 level 字段）
  affordablePackages.sort((a, b) => {
    const orderA = a.level || packageOrder[a.type] || 0
    const orderB = b.level || packageOrder[b.type] || 0
    return orderB - orderA
  })
  
  const selected = affordablePackages[0]
  console.log(`[findMaxAffordablePackage] ✅ 选择套餐: "${selected.name}" (价格: ${formatMoney(selected.price)}, 类型: ${selected.type})`)
  console.log('[findMaxAffordablePackage] ========== 查找完成 ==========')
  
  return selected
}

// 自动购买套餐
async function autoPurchasePackage(pkg, token) {
  try {
    console.log('[autoPurchasePackage] ========== 开始自动购买 ==========')
    console.log('[autoPurchasePackage] 套餐信息:', {
      name: pkg.name,
      id: pkg.id,
      price: pkg.price,
      type: pkg.type,
      points: pkg.points,
      concurrent_limit: pkg.concurrent_limit
    })
    
    const payload = {
      package_id: pkg.id
    }
    
    console.log('[autoPurchasePackage] 发送请求到 /api/packages/purchase, payload:', payload)
    const res = await fetch(getApiUrl('/api/packages/purchase'), {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
    
    const data = await res.json()
    console.log('[autoPurchasePackage] 响应状态:', res.status)
    console.log('[autoPurchasePackage] 响应数据:', JSON.stringify(data, null, 2))
    
    if (res.ok) {
      // 如果返回了支付链接，说明余额不足（理论上不应该发生）
      if (data.pay_url) {
        console.log('[autoPurchasePackage] ❌ 返回了支付链接，余额不足')
        return { success: false, error: translateUi('uiMessages.mb438cd6bc50c') }
      }
      
      console.log('[autoPurchasePackage] ✅ 购买成功!')
      console.log('[autoPurchasePackage] ========== 购买完成 ==========')
      return { success: true, data }
    } else {
      console.log('[autoPurchasePackage] ❌ 购买失败:', data.message || data.error)
      console.log('[autoPurchasePackage] ========== 购买失败 ==========')
      return { success: false, error: data.message || data.error || translateUi('uiMessages.m0f18b9ba38bf') }
    }
  } catch (e) {
    console.error('[autoPurchasePackage] ❌ 异常:', e)
    console.log('[autoPurchasePackage] ========== 购买异常 ==========')
    return { success: false, error: e.message || translateUi('uiMessages.m88c035ff99b6') }
  }
}

// 检查并处理支付返回后的刷新
async function checkPaymentReturn() {
  const pendingRefresh = localStorage.getItem('pending_payment_refresh')
  const timestamp = localStorage.getItem('payment_timestamp')
  
  if (pendingRefresh === 'true') {
    // 清除标记
    localStorage.removeItem('pending_payment_refresh')
    localStorage.removeItem('payment_timestamp')
    
    // 检查时间戳，如果是最近5分钟内的支付，才刷新
    const paymentTime = parseInt(timestamp) || 0
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000
    
    if (now - paymentTime < fiveMinutes) {
      console.log('[Packages] 检测到支付返回，刷新用户信息...')
      // 延迟2秒后刷新，给后端处理回调的时间
      await new Promise(resolve => setTimeout(resolve, 2000))
      await loadPackages()
      // 触发全局用户信息更新事件
      window.dispatchEvent(new CustomEvent('user-info-updated'))
    }
  }
}

// 监听页面可见性变化
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    checkPaymentReturn()
  }
}

onMounted(() => {
  loadPackages()
  
  // 立即检查是否有待刷新的标记
  checkPaymentReturn()
  
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  // 监听兑换券入口点击事件
  window.addEventListener('open-voucher-modal', openVoucherModal)
  
  // 监听用户信息更新事件（支付成功后刷新）
  window.addEventListener('user-info-updated', handleUserInfoUpdated)
})

// 处理用户信息更新
async function handleUserInfoUpdated() {
  console.log('[Packages] 用户信息已更新，刷新页面数据')
  await loadPackages()
}

// 组件卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('open-voucher-modal', openVoucherModal)
  window.removeEventListener('user-info-updated', handleUserInfoUpdated)
})
</script>

<style scoped>
/* 自定义样式 */
@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}
</style>

