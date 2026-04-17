<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-dark-900 dark:via-dark-800 dark:to-dark-900 py-12 px-4">
    <div class="max-w-7xl mx-auto">
      <!-- 页面标题 -->
      <div class="text-center mb-12">
        <h1 class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent mb-4">
          套餐选购
        </h1>
        <p class="text-slate-600 dark:text-slate-400 text-lg">
          选择适合您的创作套餐，解锁更多并发能力
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
              <div class="text-sm text-slate-500 dark:text-slate-400">当前套餐</div>
              <div class="text-xl font-bold text-slate-900 dark:text-white">{{ activePackage.package_name }}</div>
            </div>
          </div>
          <div class="flex items-center gap-6">
            <div class="text-center">
              <div class="text-sm text-slate-500 dark:text-slate-400">并发限制</div>
              <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">{{ activePackage.concurrent_limit }}</div>
            </div>
            <div class="text-center">
              <div class="text-sm text-slate-500 dark:text-slate-400">剩余时间</div>
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
            <span class="text-slate-700 dark:text-slate-300">当前余额</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-2xl font-bold text-amber-600 dark:text-amber-400">
              ¥{{ (user?.balance / 100 || 0).toFixed(2) }}
            </div>
            <button
              @click="openRechargeModal"
              class="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2"
            >
              <span>💳</span>
              <span>去充值</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 套餐列表 -->
      <div v-if="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        <p class="mt-4 text-slate-600 dark:text-slate-400">加载套餐信息...</p>
      </div>

      <div v-else-if="error" class="text-center py-12">
        <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        <button @click="loadPackages" class="mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          重试
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
              推荐
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
              ¥{{ (pkg.price / 100).toFixed(0) }}
            </div>
            <div class="text-sm text-slate-500 dark:text-slate-400">{{ getDurationText(pkg.duration_days) }}</div>
          </div>

          <!-- 特性列表 -->
          <div class="space-y-3 mb-6">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-slate-700 dark:text-slate-300">{{ formatPoints(pkg.points) }} 积分</span>
            </div>
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-slate-700 dark:text-slate-300">{{ pkg.concurrent_limit }} 个并发</span>
            </div>
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-slate-700 dark:text-slate-300">{{ pkg.duration_days }} 天有效期</span>
            </div>
          </div>

          <!-- 购买按钮 -->
          <button
            @click="purchasePackage(pkg)"
            :disabled="purchasing === pkg.id || isDowngrade(pkg.type)"
            class="w-full py-3 rounded-xl font-semibold transition-all duration-200"
            :class="getButtonStyle(pkg.type)"
          >
            <span v-if="purchasing === pkg.id">处理中...</span>
            <span v-else-if="isCurrentPackage(pkg.type)">续费套餐</span>
            <span v-else-if="canUpgrade(pkg.type)">升级套餐</span>
            <span v-else-if="isDowngrade(pkg.type)">不可降级</span>
            <span v-else>升级套餐</span>
          </button>
        </div>
      </div>

      <!-- 说明 -->
      <div class="mt-12 bg-white dark:bg-dark-800 rounded-xl p-6 shadow-lg">
        <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-4">购买说明</h3>
        <ul class="space-y-2 text-slate-600 dark:text-slate-400">
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-primary-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>套餐购买后立即生效，赠送的积分将自动充值到您的账户</span>
          </li>
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span><span class="font-semibold text-green-600 dark:text-green-400">支持套餐续费</span>：续费当前套餐将累计增加积分和有效期，并发数保持不变</span>
          </li>
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-primary-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>并发限制决定了您可以同时生成的图片数量，提升创作效率</span>
          </li>
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-primary-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>支持套餐升级，升级时将自动折抵剩余时长的价值，并获得更高的并发限制</span>
          </li>
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>不支持套餐降级，请根据实际需求选择合适的套餐</span>
          </li>
          <li class="flex items-start gap-2">
            <svg class="w-5 h-5 text-primary-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>套餐到期后，并发限制将恢复为 <span class="font-semibold text-primary-600">{{ defaultConcurrentLimit }}</span> 个默认值，过期积分同时清零</span>
          </li>
        </ul>
      </div>
    </div>
    
    <!-- 兑换券模态框 -->
    <div v-if="showVoucherModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeVoucherModal">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">🎫 兑换券</h3>
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
              兑换码
            </label>
            <input
              v-model="voucherCode"
              type="text"
              placeholder="请输入13位兑换码"
              maxlength="13"
              class="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-dark-500 bg-white dark:bg-dark-600 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              @keyup.enter="submitVoucher"
            />
            <div class="mt-2 space-y-2">
              <p class="text-xs text-slate-500 dark:text-slate-400">
                兑换券为13位大写字母和数字组合
              </p>
              <div class="p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p class="text-xs text-blue-700 dark:text-blue-300 flex items-start gap-1.5">
                  <svg class="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span class="font-medium">智能购买：兑换后如有余额，将自动购买最大可用套餐并激活，剩余余额保留在账户中</span>
                </p>
              </div>
              <p class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>如果您有优惠券，请在购买套餐结算时使用</span>
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
                  💡 提示：优惠券在购买套餐时使用，可以享受折扣优惠
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
              <span>{{ externalLinkConfig.button_text || '获取兑换券' }}</span>
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
              取消
            </button>
            <button 
              @click="submitVoucher"
              class="px-6 py-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="voucherLoading || !voucherCode.trim()"
            >
              <span v-if="voucherLoading">兑换中...</span>
              <span v-else>立即兑换</span>
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
                <h3 class="text-xl font-bold text-white">{{ purchaseInfo.action }}套餐</h3>
                <p class="text-sm text-white/80">请确认订单信息</p>
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
                ¥{{ (selectedPackage.price / 100).toFixed(2) }}
              </div>
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div class="text-center">
                <div class="text-sm text-slate-500 dark:text-slate-400">赠送积分</div>
                <div class="text-lg font-bold text-slate-900 dark:text-white">{{ formatPoints(selectedPackage.points) }}</div>
              </div>
              <div class="text-center">
                <div class="text-sm text-slate-500 dark:text-slate-400">并发数</div>
                <div class="text-lg font-bold text-slate-900 dark:text-white">{{ selectedPackage.concurrent_limit }}</div>
              </div>
              <div class="text-center">
                <div class="text-sm text-slate-500 dark:text-slate-400">有效期</div>
                <div class="text-lg font-bold text-slate-900 dark:text-white">{{ selectedPackage.duration_days }}天</div>
              </div>
            </div>
            
            <!-- 续费/升级说明 -->
            <div v-if="purchaseInfo.isCurrent" class="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div class="text-sm text-green-800 dark:text-green-300 space-y-1">
                <div class="font-semibold mb-2">✓ 续费说明：</div>
                <div>• 积分累计增加 {{ formatPoints(selectedPackage.points) }} 点</div>
                <div>• 有效期累计延长 {{ selectedPackage.duration_days }} 天</div>
                <div>• 并发数保持不变</div>
              </div>
            </div>
            <div v-else-if="purchaseInfo.isUpgrade" class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div class="text-sm text-blue-800 dark:text-blue-300">
                <div class="font-semibold">✓ 升级说明：</div>
                <div>升级将自动折抵剩余时长的价值</div>
              </div>
            </div>
          </div>

          <!-- 优惠券输入 -->
          <div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
            <div class="flex items-center gap-2 mb-3">
              <svg class="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
              <span class="font-medium text-slate-700 dark:text-slate-300">优惠券</span>
            </div>
            <div class="flex gap-2">
              <input 
                v-model="purchaseCouponCode"
                type="text"
                placeholder="输入优惠券码"
                class="flex-1 px-4 py-2 bg-white dark:bg-dark-600 border border-slate-300 dark:border-dark-500 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent uppercase"
                @input="purchaseCouponCode = purchaseCouponCode.toUpperCase()"
              />
              <button 
                @click="applyCoupon"
                :disabled="!purchaseCouponCode || purchaseLoading"
                class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                应用
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
                  移除
                </button>
              </div>
              <div class="mt-1 text-xs text-green-600 dark:text-green-400">
                优惠: -¥{{ (couponDiscount / 100).toFixed(2) }}
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
              支付方式
            </h4>

            <!-- 余额使用 -->
            <div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span class="font-medium text-slate-700 dark:text-slate-300">账户余额</span>
                </div>
                <span class="text-amber-600 dark:text-amber-400 font-bold">¥{{ (purchaseInfo.balance / 100).toFixed(2) }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-slate-600 dark:text-slate-400">使用余额</span>
                <span class="font-bold text-green-600 dark:text-green-400">-¥{{ (purchaseInfo.balanceUsed / 100).toFixed(2) }}</span>
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
                    <span class="font-medium text-slate-700 dark:text-slate-300">在线支付</span>
                  </div>
                  <span class="text-blue-600 dark:text-blue-400 font-bold">¥{{ (purchaseInfo.needPay / 100).toFixed(2) }}</span>
                </div>
                
                <!-- 支付方式选择 -->
                <div class="space-y-2">
                  <label class="text-sm text-slate-600 dark:text-slate-400">选择支付方式</label>
                  <select 
                    v-model="purchasePaymentMethod"
                    class="w-full px-4 py-2 bg-white dark:bg-dark-600 border border-slate-300 dark:border-dark-500 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option v-for="method in paymentMethods" :key="method.id" :value="method.id">
                      {{ method.name }}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <!-- 纯余额支付提示 -->
            <div v-else class="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
              <div class="flex items-center gap-2 text-green-700 dark:text-green-300">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="font-medium">余额充足，无需额外支付</span>
              </div>
            </div>
          </div>

          <!-- 费用汇总 -->
          <div class="bg-slate-50 dark:bg-dark-600 rounded-xl p-4 space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">套餐原价</span>
              <span class="text-slate-900 dark:text-white font-medium">¥{{ (selectedPackage.price / 100).toFixed(2) }}</span>
            </div>
            <div v-if="purchaseInfo.isUpgrade && purchaseInfo.upgradeDiscount > 0" class="flex items-center justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">升级折抵</span>
              <span class="text-blue-600 dark:text-blue-400 font-medium">-¥{{ (purchaseInfo.upgradeDiscount / 100).toFixed(2) }}</span>
            </div>
            <div v-if="couponDiscount > 0" class="flex items-center justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">优惠券优惠</span>
              <span class="text-purple-600 dark:text-purple-400 font-medium">-¥{{ (couponDiscount / 100).toFixed(2) }}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">使用余额</span>
              <span class="text-green-600 dark:text-green-400 font-medium">-¥{{ (purchaseInfo.balanceUsed / 100).toFixed(2) }}</span>
            </div>
            <div class="border-t border-slate-200 dark:border-dark-500 pt-2 mt-2">
              <div class="flex items-center justify-between">
                <span class="font-bold text-slate-900 dark:text-white">需要支付</span>
                <span class="text-2xl font-bold text-primary-600 dark:text-primary-400">
                  ¥{{ (purchaseInfo.needPay / 100).toFixed(2) }}
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
            取消
          </button>
          <button
            @click="confirmPurchase"
            :disabled="purchaseLoading || (purchaseInfo.needOnlinePayment && !purchasePaymentMethod)"
            class="flex-1 px-6 py-3 bg-gradient-to-r from-primary-500 to-purple-500 hover:from-primary-600 hover:to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg v-if="purchaseLoading" class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span v-if="purchaseLoading">处理中...</span>
            <span v-else-if="purchaseInfo.needOnlinePayment">确认并支付</span>
            <span v-else>确认{{ purchaseInfo.action }}</span>
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
                <h3 class="text-xl font-bold text-white">账户充值</h3>
                <p class="text-sm text-white/80">快速充值到账户余额</p>
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
              选择充值卡片
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
                <div>¥{{ (card.amount / 100).toFixed(0) }}</div>
                <!-- 奖励说明 -->
                <div v-if="card.bonus_enabled" class="text-xs mt-1" :class="selectedRechargeCard?.id === card.id ? 'text-white/80' : 'text-amber-600 dark:text-amber-400'">
                  <span v-if="card.bonus_type === 'random'">+{{ card.bonus_min }}~{{ card.bonus_max }} 随机积分奖励</span>
                  <span v-else>+{{ card.bonus_fixed }} 积分奖励</span>
                </div>
              </button>
            </div>
          </div>
          
          <!-- 自定义金额 -->
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              或输入自定义金额（1-1500元）
            </label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-lg">¥</span>
              <input
                v-model="rechargeCustomAmount"
                type="number"
                min="1"
                max="1500"
                step="0.01"
                class="w-full pl-10 px-4 py-3 rounded-lg border border-slate-300 dark:border-dark-500 bg-white dark:bg-dark-600 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all text-lg"
                placeholder="输入金额"
                @input="rechargeAmount = ''; selectedRechargeCard = null"
              />
            </div>
          </div>
          
          <!-- 支付方式 -->
          <div v-if="paymentMethods.length > 0">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              选择支付方式
            </label>
            <div class="space-y-2">
              <label
                v-for="method in paymentMethods"
                :key="method.id"
                :class="[
                  'flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all duration-200',
                  rechargeSelectedMethod === method.id
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-slate-200 dark:border-dark-500 hover:border-amber-400'
                ]"
              >
                <div class="flex items-center space-x-3">
                  <input
                    type="radio"
                    :value="method.id"
                    v-model="rechargeSelectedMethod"
                    class="w-4 h-4 text-amber-500"
                  />
                  <span class="font-medium text-slate-700 dark:text-slate-300">{{ method.name }}</span>
                </div>
                <span class="text-sm text-slate-500 dark:text-slate-400">{{ method.module }}</span>
              </label>
            </div>
          </div>
          
          <!-- 充值金额预览 -->
          <div v-if="getFinalRechargeAmount() > 0" class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-green-700 dark:text-green-300">充值金额</span>
              <span class="text-2xl font-bold text-green-600 dark:text-green-400">
                ¥{{ (getFinalRechargeAmount() / 100).toFixed(2) }}
              </span>
            </div>
            <!-- 选中充值卡片的奖励信息 -->
            <div v-if="selectedRechargeCard?.bonus_enabled" class="mt-2 pt-2 border-t border-green-200 dark:border-green-700">
              <div class="flex items-center justify-between text-sm">
                <span class="text-green-600 dark:text-green-400">🎁 充值奖励</span>
                <span class="font-medium text-amber-600 dark:text-amber-400">
                  <span v-if="selectedRechargeCard.bonus_type === 'random'">+{{ selectedRechargeCard.bonus_min }}~{{ selectedRechargeCard.bonus_max }} 随机积分奖励</span>
                  <span v-else>+{{ selectedRechargeCard.bonus_fixed }} 积分奖励</span>
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
                <p>• 充值后金额将直接到账户余额</p>
                <p>• 账户余额可用于购买套餐或划转为积分</p>
                <p>• 最低充值1元，单笔最高1500元</p>
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
            取消
          </button>
          <button 
            @click="submitRecharge"
            class="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="rechargeLoading || getFinalRechargeAmount() < 100 || !rechargeSelectedMethod"
          >
            <span v-if="rechargeLoading">处理中...</span>
            <span v-else>💳 立即支付</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 支付二维码弹窗 -->
    <div v-if="showPaymentModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closePaymentModal">
      <div class="bg-white dark:bg-dark-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <!-- 头部 -->
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-slate-900 dark:text-white">扫码支付</h3>
            <button @click="closePaymentModal" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 二维码区域 -->
        <div class="p-8">
          <div class="flex flex-col items-center">
            <!-- 二维码 -->
            <div class="bg-white p-4 rounded-lg shadow-md mb-4">
              <div id="payment-qrcode" class="w-64 h-64 flex items-center justify-center">
                <div class="text-slate-400">加载中...</div>
              </div>
            </div>

            <!-- 支付状态 -->
            <div v-if="paymentStatus === 'pending'" class="text-center mb-4">
              <p class="text-slate-600 dark:text-slate-400 mb-2">请使用支付宝扫码支付</p>
              <p class="text-sm text-slate-500 dark:text-slate-500">订单号：{{ paymentOrderNo }}</p>
            </div>

            <div v-else-if="paymentStatus === 'checking'" class="text-center mb-4">
              <div class="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>正在确认支付...</span>
              </div>
            </div>

            <div v-else-if="paymentStatus === 'paid'" class="text-center mb-4">
              <div class="flex items-center justify-center gap-2 text-green-600 dark:text-green-400 mb-2">
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span class="font-semibold">支付成功！</span>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex gap-3 w-full">
              <button
                @click="closePaymentModal"
                class="flex-1 px-4 py-3 border border-slate-300 dark:border-dark-500 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-dark-600 transition-colors"
              >
                取消
              </button>
              <button
                @click="confirmPaymentComplete"
                class="flex-1 px-4 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all"
              >
                {{ paymentStatus === 'paid' ? '已完成' : '支付已完成' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { redeemVoucher, getMe } from '@/api/client'
import { getTenantHeaders, getApiUrl } from '@/config/tenant'
import { formatPoints } from '@/utils/format'

const router = useRouter()
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
  button_text: '获取兑换券',
  url: '',
  open_in_new_tab: true
})

// 充值相关
const showRechargeModal = ref(false)
const rechargeAmount = ref('')
const rechargeCustomAmount = ref('')
const rechargeSelectedMethod = ref(null)
const rechargeLoading = ref(false)
const rechargeError = ref('')
const paymentMethods = ref([])
const quickAmounts = [300, 500, 1000, 5000, 10000] // 单位：分
const rechargeCards = ref([]) // 充值卡片列表
const selectedRechargeCard = ref(null) // 选中的充值卡片

// 支付弹窗相关
const showPaymentModal = ref(false)
const paymentQrCode = ref('')
const paymentOrderNo = ref('')
const paymentStatus = ref('pending') // pending, checking, paid, failed
const paymentPollingTimer = ref(null)

function resolveQrImageSrc(qrCode) {
  const code = String(qrCode || '').trim()
  if (!code) return ''
  if (code.startsWith('data:image/')) return code
  if (/^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(code)) return code
  return `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(code)}`
}

async function ensureQrLib() {
  if (window.QRCode?.toDataURL) return true
  const cdns = [
    'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
    'https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js'
  ]
  for (const src of cdns) {
    const loaded = await new Promise(resolve => {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.head.appendChild(script)
    })
    if (loaded && window.QRCode?.toDataURL) return true
  }
  return false
}

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
  if (days === 1) return '每天'
  if (days === 7) return '每周'
  if (days === 30) return '每月'
  if (days === 90) return '每季度'
  if (days === 365) return '每年'
  return `${days}天`
}

function formatRemainingTime(expiresAt) {
  const now = Date.now()
  const remaining = expiresAt - now
  if (remaining <= 0) return '已过期'
  
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  
  if (days > 0) return `${days}天`
  return `${hours}小时`
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
      error.value = '加载套餐失败'
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
            button_text: configData.voucher_external_link.button_text || '获取兑换券',
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
    error.value = '加载失败，请刷新重试'
  } finally {
    loading.value = false
  }
}

// 套餐购买确认模态框相关
const showPurchaseModal = ref(false)
const selectedPackage = ref(null)
const purchasePaymentMethod = ref(null)
const purchaseLoading = ref(false)
const purchaseError = ref('')
const purchaseCouponCode = ref('')
const appliedCoupon = ref(null)
const couponDiscount = ref(0)
const couponError = ref('')

async function purchasePackage(pkg) {
  if (purchasing.value) return
  if (isDowngrade(pkg.type)) {
    alert('不支持降级套餐')
    return
  }

  // 打开支付确认模态框
  selectedPackage.value = pkg
  showPurchaseModal.value = true
  purchasePaymentMethod.value = null
  purchaseError.value = ''
  purchaseCouponCode.value = ''
  appliedCoupon.value = null
  couponDiscount.value = 0
  couponError.value = ''
  
  // 加载支付方式
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(getApiUrl('/api/user/payment-methods'), {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      paymentMethods.value = data.methods || []
      if (paymentMethods.value.length > 0) {
        purchasePaymentMethod.value = paymentMethods.value[0].id
      }
    }
  } catch (e) {
    console.error('[loadPaymentMethods] error:', e)
  }
}

function closePurchaseModal() {
  showPurchaseModal.value = false
  selectedPackage.value = null
  purchasePaymentMethod.value = null
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
  const action = isCurrent ? '续费' : (isUpgrade ? '升级' : '购买')
  
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
      couponError.value = data.message || '优惠券验证失败'
      return
    }
    
    appliedCoupon.value = data.coupon
    couponDiscount.value = data.discount_amount
    couponError.value = ''
    
  } catch (e) {
    console.error('[applyCoupon] error:', e)
    couponError.value = '优惠券验证失败，请重试'
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
  if (purchaseLoading.value) return
  
  const info = purchaseInfo.value
  if (!info) return
  
  // 如果需要在线支付但没有选择支付方式
  if (info.needOnlinePayment && !purchasePaymentMethod.value) {
    purchaseError.value = '请选择支付方式'
    return
  }
  
  try {
    purchaseLoading.value = true
    purchaseError.value = ''
    
    const token = localStorage.getItem('token')
    const payload = {
      package_id: selectedPackage.value.id,
      frontend_url: window.location.origin
    }

    // 如果使用了优惠券，添加优惠券码
    if (appliedCoupon.value) {
      payload.coupon_code = purchaseCouponCode.value
    }

    // 如果需要在线支付，添加支付方式
    if (info.needOnlinePayment) {
      payload.payment_method_id = purchasePaymentMethod.value
    }
    
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
    
    if (res.ok) {
      // 如果返回了二维码支付，显示支付弹窗
      if (data.payment_type === 'qrcode' && data.qr_code) {
        paymentQrCode.value = data.qr_code
        paymentOrderNo.value = data.order_no
        paymentStatus.value = 'pending'
        showPaymentModal.value = true
        closePurchaseModal()
        startPaymentPolling()
        return
      }

      // 如果返回了支付链接，跳转支付
      if (data.pay_url) {
        // 设置待刷新标记
        localStorage.setItem('pending_payment_refresh', 'true')
        localStorage.setItem('payment_timestamp', Date.now().toString())
        window.location.href = data.pay_url
        return
      }

      // 余额支付成功，立即刷新用户信息
      if (data.user) {
        user.value = data.user
      }
      
      // 立即刷新页面数据
      await loadPackages()
      
      closePurchaseModal()
      
      let successMessage = `${info.action}成功！\n\n已获得 ${formatPoints(selectedPackage.value.points)} 套餐积分`
      if (info.isCurrent) {
        successMessage += `\n有效期已延长 ${selectedPackage.value.duration_days} 天`
      } else {
        successMessage += `\n并发限制：${selectedPackage.value.concurrent_limit}个`
      }
      
      alert(successMessage)
      
      // 触发全局用户信息更新事件（更新导航栏）
      window.dispatchEvent(new CustomEvent('user-info-updated'))
    } else {
      purchaseError.value = data.message || `${info.action}失败`
    }
  } catch (e) {
    console.error('[confirmPurchase] error:', e)
    purchaseError.value = '操作失败，请稍后重试'
  } finally {
    purchaseLoading.value = false
  }
}

// 充值相关函数
async function openRechargeModal() {
  showRechargeModal.value = true
  rechargeAmount.value = ''
  rechargeCustomAmount.value = ''
  rechargeSelectedMethod.value = null
  selectedRechargeCard.value = null
  rechargeError.value = ''
  
  // 并行加载支付方式和充值卡片
  try {
    const token = localStorage.getItem('token')
    const headers = { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    
    const [paymentRes, cardsRes] = await Promise.all([
      fetch('/api/user/payment-methods', { headers }),
      fetch('/api/recharge-cards', { headers: getTenantHeaders() })
    ])
    
    // 处理支付方式
    if (paymentRes.ok) {
      const data = await paymentRes.json()
      paymentMethods.value = data.methods || []
      if (paymentMethods.value.length > 0) {
        rechargeSelectedMethod.value = paymentMethods.value[0].id
      }
    }
    
    // 处理充值卡片
    if (cardsRes.ok) {
      const data = await cardsRes.json()
      rechargeCards.value = data.recharge_cards || []
    }
  } catch (e) {
    console.error('[openRechargeModal] 加载数据失败:', e)
  }
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
    if (yuan >= 1 && yuan <= 1500) {
      return Math.floor(yuan * 100)
    }
  }
  return 0
}

async function submitRecharge() {
  const amount = getFinalRechargeAmount()
  
  if (amount < 100) {
    rechargeError.value = '最低充值金额为1元'
    return
  }
  if (amount > 150000) {
    rechargeError.value = '单笔最高充值1500元'
    return
  }
  if (!rechargeSelectedMethod.value) {
    rechargeError.value = '请选择支付方式'
    return
  }
  
  rechargeLoading.value = true
  rechargeError.value = ''
  
  try {
    const token = localStorage.getItem('token')
    const payload = {
      amount: amount,
      payment_method_id: rechargeSelectedMethod.value,
      frontend_url: window.location.origin
    }

    // 如果选择了充值卡片，传递卡片ID
    if (selectedRechargeCard.value) {
      payload.recharge_card_id = selectedRechargeCard.value.id
    }
    
    const res = await fetch('/api/user/recharge', {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.message || '创建订单失败')
    }

    // 根据支付类型决定是显示弹窗还是跳转
    if (data.payment_type === 'qrcode' && data.qr_code) {
      // 二维码支付：显示弹窗
      paymentQrCode.value = data.qr_code
      paymentOrderNo.value = data.order_no
      paymentStatus.value = 'pending'
      showPaymentModal.value = true
      closeRechargeModal()

      // 开始轮询支付状态
      startPaymentPolling()
    } else if (data.pay_url) {
      // 跳转支付：保持原有行为
      localStorage.setItem('pending_payment_refresh', 'true')
      localStorage.setItem('payment_timestamp', Date.now().toString())
      window.location.href = data.pay_url
    }
  } catch (e) {
    rechargeError.value = e.message || '充值失败，请重试'
  } finally {
    rechargeLoading.value = false
  }
}

// 支付弹窗相关函数
function closePaymentModal() {
  showPaymentModal.value = false
  stopPaymentPolling()
  paymentQrCode.value = ''
  paymentOrderNo.value = ''
  paymentStatus.value = 'pending'
}

function startPaymentPolling() {
  // 清除之前的定时器
  stopPaymentPolling()

  // 立即检查一次
  checkPaymentStatus()

  // 每3秒检查一次支付状态
  paymentPollingTimer.value = setInterval(() => {
    checkPaymentStatus()
  }, 3000)
}

function stopPaymentPolling() {
  if (paymentPollingTimer.value) {
    clearInterval(paymentPollingTimer.value)
    paymentPollingTimer.value = null
  }
}

async function checkPaymentStatus() {
  if (!paymentOrderNo.value) return

  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`/api/user-portal/pay/check/${paymentOrderNo.value}`, {
      headers: {
        ...getTenantHeaders(),
        'Authorization': `Bearer ${token}`
      }
    })

    const data = await res.json()

    if (data.status === 'paid') {
      paymentStatus.value = 'paid'
      stopPaymentPolling()

      // 刷新用户信息
      setTimeout(async () => {
        await loadUser()
        closePaymentModal()
      }, 1500)
    } else if (data.status === 'checking') {
      paymentStatus.value = 'checking'
    }
  } catch (e) {
    console.error('检查支付状态失败:', e)
  }
}

async function confirmPaymentComplete() {
  if (paymentStatus.value === 'paid') {
    closePaymentModal()
    return
  }
  paymentStatus.value = 'checking'
  await checkPaymentStatus()
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
    voucherError.value = '请输入兑换码'
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
    console.log('[submitVoucher] 兑换后用户余额:', balance, '分 (¥' + (balance/100).toFixed(2) + ')')
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
          const userRes2 = await fetch('/api/user/me', {
            headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
          })
          if (userRes2.ok) {
            user.value = await userRes2.json()
          }
          
          // 刷新套餐信息
          await loadPackages()
          
          // 构建成功消息
          const remainingBalance = user.value?.balance || 0
          voucherSuccess.value = `
            ✅ 兑换成功！获得 ¥${(balance / 100).toFixed(2)} 余额
            
            🎉 已自动购买「${affordablePackage.name}」套餐
            • 赠送积分：${formatPoints(affordablePackage.points)}
            • 并发限制：${affordablePackage.concurrent_limit}个
            • 有效期：${affordablePackage.duration_days}天
            
            💰 剩余余额：¥${(remainingBalance / 100).toFixed(2)}
          `.trim()
        } else {
          // 购买失败，显示兑换成功但未能自动购买
          voucherSuccess.value = `✅ 兑换成功！获得 ¥${(balance / 100).toFixed(2)} 余额\n\n⚠️ 自动购买套餐失败：${purchaseResult.error}\n请手动购买套餐`
        }
      } else {
        // 余额不足以购买任何套餐，或所有套餐都是降级
        console.log('[submitVoucher] 没有可购买的套餐（余额不足或会降级）')
        // 查找最便宜的套餐价格，给用户提示
        const minPricePackage = packages.value.reduce((min, p) => (!min || p.price < min.price) ? p : min, null)
        const minPrice = minPricePackage ? minPricePackage.price : 0
        let hint = '当前余额不足以购买套餐'
        if (minPrice > 0 && balance < minPrice) {
          hint = `最便宜的套餐需要 ¥${(minPrice/100).toFixed(2)}，当前余额 ¥${(balance/100).toFixed(2)}`
        } else if (activePackage.value) {
          hint = '您当前已有套餐，可购买的套餐无法升级'
        }
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(balance / 100).toFixed(2)} 余额\n\n💡 ${hint}，您可以继续充值后购买`
      }
    } else {
      // 没有余额或没有套餐
      console.log('[submitVoucher] 条件不满足: balance=', balance, ', packages.length=', packages.value?.length)
      if (balance === 0 && result.points > 0) {
        voucherSuccess.value = `✅ 成功兑换 ${result.points} 积分！`
      } else if (!packages.value || packages.value.length === 0) {
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(balance / 100).toFixed(2)} 余额\n\n⚠️ 暂无可用套餐，请稍后查看`
      } else {
        voucherSuccess.value = result.message || `成功兑换 ${result.points} 积分！`
      }
    }
    
    // 触发全局用户信息更新事件（更新导航栏）
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
    // 5秒后关闭模态框（给用户更多时间查看详细信息）
    setTimeout(() => {
      closeVoucherModal()
    }, 5000)
  } catch (e) {
    voucherError.value = e.message || '兑换失败，请检查兑换码是否正确'
  } finally {
    voucherLoading.value = false
  }
}

// 找到余额范围内可购买的最大套餐
function findMaxAffordablePackage(balance) {
  console.log('[findMaxAffordablePackage] ========== 开始查找可购买套餐 ==========')
  console.log('[findMaxAffordablePackage] 当前余额:', balance, '分 (¥' + (balance/100).toFixed(2) + ')')
  
  if (!packages.value || packages.value.length === 0) {
    console.log('[findMaxAffordablePackage] ❌ 没有可用套餐列表')
    return null
  }
  
  console.log('[findMaxAffordablePackage] 所有套餐列表:')
  packages.value.forEach(p => {
    console.log(`  - ${p.name}: 价格=${p.price}分(¥${(p.price/100).toFixed(2)}), 类型=${p.type}, ID=${p.id}`)
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
  console.log(`[findMaxAffordablePackage] ✅ 选择套餐: "${selected.name}" (价格: ¥${(selected.price/100).toFixed(2)}, 类型: ${selected.type})`)
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
        return { success: false, error: '余额不足，需要在线支付' }
      }
      
      console.log('[autoPurchasePackage] ✅ 购买成功!')
      console.log('[autoPurchasePackage] ========== 购买完成 ==========')
      return { success: true, data }
    } else {
      console.log('[autoPurchasePackage] ❌ 购买失败:', data.message || data.error)
      console.log('[autoPurchasePackage] ========== 购买失败 ==========')
      return { success: false, error: data.message || data.error || '购买失败' }
    }
  } catch (e) {
    console.error('[autoPurchasePackage] ❌ 异常:', e)
    console.log('[autoPurchasePackage] ========== 购买异常 ==========')
    return { success: false, error: e.message || '网络错误' }
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

// 监听支付弹窗状态，生成二维码
watch([showPaymentModal, paymentQrCode], async ([isShown, qrCode]) => {
  if (isShown && qrCode) {
    await nextTick()
    const qrContainer = document.getElementById('payment-qrcode')
    if (qrContainer) {
      const img = document.createElement('img')
      img.alt = 'Payment QR Code'
      img.className = 'w-full h-full'
      try {
        if (await ensureQrLib()) {
          img.src = await window.QRCode.toDataURL(qrCode, { width: 256, margin: 1 })
        } else {
          img.src = resolveQrImageSrc(qrCode)
        }
      } catch (e) {
        img.src = resolveQrImageSrc(qrCode)
      }
      img.onerror = () => {
        qrContainer.innerHTML = ''
        if (paymentOrderNo.value) {
          const link = document.createElement('a')
          link.href = `/api/user-portal/pay/${paymentOrderNo.value}`
          link.target = '_blank'
          link.rel = 'noopener'
          link.textContent = '二维码加载失败，点击打开支付页面'
          link.className = 'text-blue-500 underline text-sm'
          qrContainer.appendChild(link)
        }
      }
      qrContainer.innerHTML = ''
      qrContainer.appendChild(img)
    }
  }
})

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







