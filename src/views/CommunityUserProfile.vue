<template>
  <div class="min-h-screen bg-black text-white">
    <!-- 背景 Banner 区域 -->
    <div class="relative w-full h-[200px] md:h-[260px] bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 overflow-hidden">
      <img
        v-if="profile?.banner_url"
        :src="profile.banner_url"
        alt="背景图"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full bg-gradient-to-br from-indigo-900/40 via-purple-900/30 to-gray-900" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <!-- 自己主页：更换背景 -->
      <button
        v-if="isSelf"
        class="absolute top-4 right-4 md:top-6 md:right-6 flex items-center gap-2 rounded-lg bg-black/50 backdrop-blur-sm px-3 py-2 text-sm text-white/80 hover:bg-black/70 hover:text-white transition-colors border border-white/10"
        @click="triggerBannerUpload"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        更换背景图片
      </button>
      <div v-if="bannerUploading" class="absolute inset-0 flex items-center justify-center bg-black/60">
        <div class="h-8 w-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      </div>
      <input
        ref="bannerInputRef"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        class="hidden"
        @change="handleBannerChange"
      />
      <!-- 返回按钮 -->
      <button
        class="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-1.5 rounded-lg bg-black/50 backdrop-blur-sm px-3 py-2 text-sm text-white/80 hover:bg-black/70 hover:text-white transition-colors border border-white/10"
        @click="goBack"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </button>
    </div>

    <!-- 加载/错误状态 -->
    <div v-if="profileLoading" class="flex min-h-[400px] items-center justify-center">
      <div class="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
    </div>
    <div v-else-if="profileError" class="mx-auto max-w-[600px] px-6 py-16 text-center">
      <p class="text-sm text-red-300">{{ profileError }}</p>
      <button
        type="button"
        class="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
        @click="loadProfile"
      >
        重新加载
      </button>
    </div>

    <!-- 主布局：左侧卡片 + 右侧内容 -->
    <div v-else-if="profile" class="mx-auto max-w-[1400px] px-4 md:px-6 -mt-16 relative z-10">
      <div class="flex flex-col lg:flex-row gap-6">
        <!-- 左侧用户卡片 -->
        <aside class="w-full lg:w-[280px] shrink-0">
          <div class="sticky top-6 space-y-4">
            <div class="rounded-2xl border border-white/10 bg-gray-900/80 backdrop-blur-sm p-6 space-y-5">
              <!-- 头像 -->
              <div class="flex justify-center">
                <div class="relative group">
                  <img
                    v-if="profile?.avatar_url"
                    :src="profile.avatar_url"
                    :alt="profile?.username"
                    class="h-24 w-24 rounded-full object-cover border-4 border-gray-900 shadow-xl"
                  />
                  <div v-else class="flex h-24 w-24 items-center justify-center rounded-full border-4 border-gray-900 bg-gray-800 text-3xl font-semibold text-white/70 shadow-xl">
                    {{ avatarFallback }}
                  </div>
                  <!-- 自己主页时显示上传头像遮罩 -->
                  <div
                    v-if="isSelf"
                    class="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    @click="triggerAvatarUpload"
                  >
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div v-if="avatarUploading" class="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
                    <div class="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  </div>
                  <input
                    ref="avatarInputRef"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    class="hidden"
                    @change="handleAvatarChange"
                  />
                </div>
              </div>

              <!-- 用户名 -->
              <div class="text-center">
                <h1 class="text-xl font-bold text-white truncate">{{ profile?.username || '未知作者' }}</h1>
              </div>

              <!-- 简介 -->
              <div class="text-center">
                <div v-if="isSelf && editingBio" class="space-y-2 text-left">
                  <textarea
                    ref="bioInputRef"
                    v-model="bioText"
                    maxlength="200"
                    rows="3"
                    class="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:border-white/40 focus:outline-none resize-none"
                    placeholder="写点什么介绍自己吧..."
                    @keydown.enter.ctrl="saveBio"
                  />
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-white/30">{{ bioText.length }}/200</span>
                    <div class="flex items-center gap-2">
                      <button class="rounded-lg px-3 py-1 text-xs text-white/50 hover:text-white/80 transition-colors" @click="cancelBioEdit">取消</button>
                      <button class="rounded-lg bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20 transition-colors disabled:opacity-50" :disabled="bioSaving" @click="saveBio">{{ bioSaving ? '保存中...' : '保存' }}</button>
                    </div>
                  </div>
                </div>
                <template v-else>
                  <div v-if="isSelf" class="group/bio cursor-pointer" @click="startBioEdit">
                    <p v-if="profile?.bio" class="text-sm text-white/50 leading-relaxed">{{ profile.bio }}</p>
                    <p v-else class="text-sm text-white/30 italic">点击编辑简介...</p>
                  </div>
                  <template v-else>
                    <p v-if="profile?.bio" class="text-sm text-white/50 leading-relaxed">{{ profile.bio }}</p>
                    <p v-else class="text-sm text-white/30">暂无简介</p>
                  </template>
                </template>
              </div>

              <!-- 统计数据 -->
              <div class="flex justify-center gap-6 py-2 border-t border-b border-white/5">
                <div class="text-center">
                  <div class="text-lg font-bold text-white">{{ stats.followerCount }}</div>
                  <div class="text-xs text-white/40">粉丝</div>
                </div>
                <div class="text-center">
                  <div class="text-lg font-bold text-white">{{ stats.workCount }}</div>
                  <div class="text-xs text-white/40">作品</div>
                </div>
                <div class="text-center">
                  <div class="text-lg font-bold text-white">{{ stats.likeCount }}</div>
                  <div class="text-xs text-white/40">获赞</div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="space-y-3">
                <!-- 他人主页：关注 + 私信 -->
                <template v-if="!isSelf && profile?.id">
                  <FollowButton
                    :user-id="String(profile.id)"
                    :initial-following="!!profile?.is_following"
                    :initial-mutual="!!profile?.is_mutual_follow"
                    class="w-full"
                    @changed="handleFollowChanged"
                    @login-required="handleLoginRequired"
                  />
                  <button
                    class="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                    @click="handleSendMessage"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.721C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    发私信
                  </button>
                </template>

                <!-- 分享按钮 -->
                <button
                  class="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                  @click="handleShare"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  分享
                </button>

                <!-- 自己主页：进入创作 -->
                <router-link
                  v-if="isSelf"
                  to="/"
                  class="w-full flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-900 transition"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  进入创作
                </router-link>
              </div>
            </div>
          </div>
        </aside>

        <!-- 右侧主内容区域 -->
        <main class="flex-1 min-w-0 pb-12">
          <!-- Tab 选项卡 -->
          <div class="flex items-center gap-1 border-b border-white/10 mb-6">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="relative px-5 py-3 text-sm font-medium transition-colors"
              :class="activeTab === tab.key ? 'text-white' : 'text-white/40 hover:text-white/70'"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
              <span
                v-if="tab.key === 'messages' && unreadCount > 0"
                class="absolute -top-0.5 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none"
              >
                {{ unreadCount > 99 ? '99+' : unreadCount }}
              </span>
              <div
                v-if="activeTab === tab.key"
                class="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full"
              />
            </button>
            <!-- 如果是自己，显示发布按钮 -->
            <div v-if="isSelf" class="flex-1" />
            <button
              v-if="isSelf"
              class="flex items-center gap-2 px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-colors"
              @click="openPublishDialog"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              发布作品
            </button>
          </div>

          <!-- 作品集 Tab -->
          <div v-if="activeTab === 'works'">
            <div v-if="worksLoading && !works.length" class="flex min-h-[240px] items-center justify-center">
              <div class="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            </div>
            <div v-else-if="worksError && !works.length" class="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-8 text-center">
              <p class="text-sm text-red-300">{{ worksError }}</p>
              <button class="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90" @click="loadWorks(true)">重新加载</button>
            </div>
            <div v-else-if="works.length" class="columns-2 gap-3 [column-fill:_balance-all] sm:columns-2 lg:columns-3 xl:columns-4">
              <div v-for="item in works" :key="item.id" class="mb-3 break-inside-avoid">
                <WorkCard :work="item" :landscape="item.orientation === 'landscape'" @click="goToWork" @like="handleLike" />
              </div>
            </div>
            <div v-else-if="isSelf" class="rounded-2xl border border-white/10 bg-white/5 px-6 py-16 text-center">
              <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg class="w-8 h-8 text-white/20" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p class="text-sm text-white/40 mb-4">你还没有发布公开作品</p>
              <button class="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm text-white transition hover:bg-white/20" @click="openPublishDialog">
                发布第一个作品
              </button>
            </div>
            <div v-else class="rounded-2xl border border-white/10 bg-white/5 px-6 py-16 text-center text-sm text-white/40">
              这个作者暂时还没有公开作品
            </div>
            <!-- 加载更多 -->
            <div v-if="works.length" class="flex justify-center pt-6">
              <button
                v-if="hasMore"
                class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="worksLoading"
                @click="loadWorks()"
              >
                <div v-if="worksLoading" class="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <span>{{ worksLoading ? '加载中...' : '加载更多' }}</span>
              </button>
              <div v-else class="text-sm text-white/30">已经到底了</div>
            </div>
          </div>

          <!-- 关注 Tab -->
          <div v-else-if="activeTab === 'following'">
            <div v-if="followingLoading" class="flex min-h-[240px] items-center justify-center">
              <div class="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            </div>
            <div v-else-if="followingList.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <router-link
                v-for="user in followingList"
                :key="user.id"
                :to="`/community/users/${user.id}`"
                class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
              >
                <img
                  v-if="user.avatar_url"
                  :src="user.avatar_url"
                  :alt="user.username"
                  class="w-12 h-12 rounded-full object-cover shrink-0"
                />
                <div v-else class="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
                  <span class="text-white/60 text-lg">{{ (user.username || '?')[0] }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-white truncate">{{ user.username || '未知用户' }}</div>
                  <div class="text-xs text-white/40 truncate mt-0.5">{{ user.bio || '暂无简介' }}</div>
                </div>
              </router-link>
            </div>
            <div v-else class="rounded-2xl border border-white/10 bg-white/5 px-6 py-16 text-center text-sm text-white/40">
              {{ isSelf ? '你还没有关注任何人' : '该用户还没有关注任何人' }}
            </div>
            <!-- 加载更多 -->
            <div v-if="followingList.length && followingHasMore" class="flex justify-center pt-6">
              <button
                class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-60"
                :disabled="followingLoading"
                @click="loadFollowing()"
              >
                {{ followingLoading ? '加载中...' : '加载更多' }}
              </button>
            </div>
          </div>

          <!-- 私信 Tab -->
          <div v-else-if="activeTab === 'messages'">
            <div v-if="messagesTabLoading && !messageConversations.length" class="flex min-h-[240px] items-center justify-center">
              <div class="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            </div>
            <div v-else-if="messageConversations.length" class="space-y-3">
              <button
                v-for="conv in messageConversations"
                :key="conv.id"
                type="button"
                class="flex w-full items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10 hover:border-white/15"
                @click="goToConversation(conv)"
              >
                <img
                  v-if="normalizeConversationPeer(conv).avatar"
                  :src="normalizeConversationPeer(conv).avatar"
                  :alt="normalizeConversationPeer(conv).name"
                  class="h-12 w-12 rounded-full object-cover shrink-0"
                />
                <div v-else class="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-white/70 shrink-0">
                  {{ normalizeConversationPeer(conv).initial }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate text-sm font-medium text-white">{{ normalizeConversationPeer(conv).name }}</span>
                    <span class="shrink-0 text-xs text-white/30">{{ formatMessageTime(conv.last_message_at || conv.updated_at || conv.created_at) }}</span>
                  </div>
                  <p class="mt-1 line-clamp-1 text-xs text-white/45">
                    {{ conv.last_message_text || conv.last_message?.content || '暂无消息' }}
                  </p>
                </div>
                <span
                  v-if="Number(conv.unread_count || 0) > 0"
                  class="shrink-0 mt-1 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white leading-none"
                >
                  {{ Number(conv.unread_count) > 99 ? '99+' : conv.unread_count }}
                </span>
              </button>
              <div class="flex justify-center pt-4">
                <router-link
                  to="/community/messages"
                  class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
                >
                  查看全部私信
                </router-link>
              </div>
            </div>
            <div v-else class="rounded-2xl border border-white/10 bg-white/5 px-6 py-16 text-center">
              <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg class="w-8 h-8 text-white/20" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.721C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p class="text-sm text-white/40 mb-4">暂无私信会话</p>
              <router-link
                to="/community"
                class="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm text-white transition hover:bg-white/20"
              >
                去社区发现作者
              </router-link>
            </div>
          </div>

          <!-- 我的点赞 Tab -->
          <div v-else-if="activeTab === 'favorites'">
            <div v-if="!isSelf" class="rounded-2xl border border-white/10 bg-white/5 px-6 py-16 text-center text-sm text-white/40">
              点赞列表仅自己可见
            </div>
            <template v-else>
              <div v-if="favoritesLoading" class="flex min-h-[240px] items-center justify-center">
                <div class="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              </div>
              <div v-else-if="favoritesList.length" class="columns-2 gap-3 [column-fill:_balance-all] sm:columns-2 lg:columns-3 xl:columns-4">
                <div v-for="item in favoritesList" :key="item.id" class="mb-3 break-inside-avoid">
                  <WorkCard :work="item" :landscape="item.orientation === 'landscape'" @click="goToWork" @like="handleLike" />
                </div>
              </div>
              <div v-else class="rounded-2xl border border-white/10 bg-white/5 px-6 py-16 text-center text-sm text-white/40">
                你还没有点赞任何作品
              </div>
              <!-- 加载更多 -->
              <div v-if="favoritesList.length && favoritesHasMore" class="flex justify-center pt-6">
                <button
                  class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-60"
                  :disabled="favoritesLoading"
                  @click="loadFavorites()"
                >
                  {{ favoritesLoading ? '加载中...' : '加载更多' }}
                </button>
              </div>
            </template>
          </div>
        </main>
      </div>
    </div>

    <LoginModal v-model="communityStore.showLoginModal" @login-success="handleLoginSuccess" />
    <PublishWorkDialog v-model="showPublishDialog" @published="handlePublished" />

    <!-- Toast -->
    <transition name="fade">
      <div v-if="showToast" class="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-gray-800 text-sm text-gray-200 shadow-lg">
        {{ toastMsg }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getCommunityUserProfile, getCommunityUserWorks, toggleLike, toggleFavorite, getFollowing, getMyFavorites, getConversations, getUnreadMessageCount, uploadAvatar, uploadBanner, updateUserProfile } from '@/api/community'
import { useCommunityStore } from '@/stores/community'
import WorkCard from '@/components/community/WorkCard.vue'
import FollowButton from '@/components/community/FollowButton.vue'
import LoginModal from '@/components/community/LoginModal.vue'
import PublishWorkDialog from '@/components/community/PublishWorkDialog.vue'

const route = useRoute()
const router = useRouter()
const communityStore = useCommunityStore()

const PAGE_SIZE = 20

// Profile state
const profile = ref(null)
const profileLoading = ref(false)
const profileError = ref('')

// Tab state
const activeTab = ref('works')
const tabs = computed(() => {
  const base = [{ key: 'works', label: '我的作品集' }]
  base.push({ key: 'following', label: '关注' })
  if (isSelf.value) {
    base.push({ key: 'messages', label: '私信' })
    base.push({ key: 'favorites', label: '我的点赞' })
  }
  return base
})

// Works state
const works = ref([])
const worksLoading = ref(false)
const worksError = ref('')
const worksPage = ref(1)
const totalWorks = ref(0)
const hasMore = ref(true)

// Following state
const followingList = ref([])
const followingLoading = ref(false)
const followingPage = ref(1)
const followingHasMore = ref(true)

// Favorites state
const favoritesList = ref([])
const favoritesLoading = ref(false)
const favoritesPage = ref(1)
const favoritesHasMore = ref(true)

// Messages state
const messageConversations = ref([])
const messagesTabLoading = ref(false)
const unreadCount = ref(0)

// Publish dialog
const showPublishDialog = ref(false)

// Toast
const showToast = ref(false)
const toastMsg = ref('')
let toastTimer = null
function toast(msg) {
  toastMsg.value = msg
  showToast.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { showToast.value = false }, 2000)
}

// Computed
const isSelf = computed(() => !!profile.value?.is_self)
const avatarFallback = computed(() => (profile.value?.username || '?').slice(0, 1).toUpperCase())
const stats = computed(() => ({
  workCount: Number(profile.value?.work_count || 0),
  followingCount: Number(profile.value?.following_count || 0),
  followerCount: Number(profile.value?.follower_count || 0),
  likeCount: Number(profile.value?.portfolio_like_count || profile.value?.total_likes || 0)
}))

// Avatar upload
const avatarInputRef = ref(null)
const avatarUploading = ref(false)
function triggerAvatarUpload() { avatarInputRef.value?.click() }
async function handleAvatarChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { toast('头像图片不能超过 5MB'); return }
  avatarUploading.value = true
  try {
    const result = await uploadAvatar(file)
    if (result?.avatar_url) {
      localStorage.setItem('avatar', result.avatar_url)
      profile.value = { ...profile.value, avatar_url: result.avatar_url }
    }
  } catch (err) {
    console.error('[Profile] 头像上传失败:', err)
    toast('头像上传失败，请重试')
  } finally {
    avatarUploading.value = false
    if (avatarInputRef.value) avatarInputRef.value.value = ''
  }
}

// Banner upload
const bannerInputRef = ref(null)
const bannerUploading = ref(false)
function triggerBannerUpload() { bannerInputRef.value?.click() }
async function handleBannerChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (file.size > 10 * 1024 * 1024) { toast('背景图不能超过 10MB'); return }
  bannerUploading.value = true
  try {
    const result = await uploadBanner(file)
    if (result?.banner_url) {
      profile.value = { ...profile.value, banner_url: result.banner_url }
    }
  } catch (err) {
    console.error('[Profile] 背景图上传失败:', err)
    toast('背景图上传失败，请重试')
  } finally {
    bannerUploading.value = false
    if (bannerInputRef.value) bannerInputRef.value.value = ''
  }
}

// Bio edit
const editingBio = ref(false)
const bioText = ref('')
const bioSaving = ref(false)
const bioInputRef = ref(null)
function startBioEdit() {
  bioText.value = profile.value?.bio || ''
  editingBio.value = true
  nextTick(() => bioInputRef.value?.focus())
}
function cancelBioEdit() { editingBio.value = false; bioText.value = '' }
async function saveBio() {
  if (bioSaving.value) return
  bioSaving.value = true
  try {
    const result = await updateUserProfile({ bio: bioText.value.trim() })
    if (result?.success) {
      profile.value = { ...profile.value, bio: result.bio }
      editingBio.value = false
    }
  } catch (err) {
    console.error('[Profile] 保存简介失败:', err)
    toast('保存失败，请重试')
  } finally {
    bioSaving.value = false
  }
}

// Author fallback helper
const authorFallback = computed(() => {
  if (!profile.value) return null
  return {
    author_name: profile.value.username || profile.value.nickname || '',
    author_avatar: profile.value.avatar_url || profile.value.avatar || ''
  }
})
function normalizeWorkAuthor(work) {
  if (!work || !authorFallback.value) return work
  return { ...work, author_name: work.author_name || authorFallback.value.author_name, author_avatar: work.author_avatar || authorFallback.value.author_avatar }
}

// Load profile
async function loadProfile() {
  const userId = route.params.userId
  if (!userId) { profile.value = null; profileError.value = '缺少作者信息'; return }
  profileLoading.value = true
  profileError.value = ''
  try {
    const response = await getCommunityUserProfile(userId)
    profile.value = response?.data || response?.profile || response || null
  } catch (error) {
    console.error('[Profile] 加载作者信息失败:', error)
    profile.value = null
    profileError.value = error?.message || '加载作者信息失败'
  } finally {
    profileLoading.value = false
  }
}

// Load works
function extractWorksPayload(response) {
  const data = response?.data || response || {}
  const list = data?.works || data?.items || data?.list || []
  const total = Number(data?.total || data?.count || data?.pagination?.total || 0)
  const pageSize = Number(data?.pageSize || data?.pagination?.pageSize || PAGE_SIZE)
  const currentPage = Number(data?.page || data?.pagination?.page || worksPage.value)
  return { list, total, pageSize, currentPage }
}
async function loadWorks(reset = false) {
  const userId = route.params.userId
  if (!userId || worksLoading.value) return
  if (reset) { worksPage.value = 1; works.value = []; hasMore.value = true }
  if (!hasMore.value && !reset) return
  worksLoading.value = true
  worksError.value = ''
  try {
    const response = await getCommunityUserWorks(userId, { page: worksPage.value, pageSize: PAGE_SIZE })
    const { list, total, pageSize, currentPage } = extractWorksPayload(response)
    const normalizedList = list.map(normalizeWorkAuthor)
    if (reset) {
      works.value = normalizedList
    } else {
      const existingIds = new Set(works.value.map(item => item.id))
      works.value = [...works.value, ...normalizedList.filter(item => !existingIds.has(item.id))]
    }
    totalWorks.value = total || profile.value?.work_count || works.value.length
    hasMore.value = list.length >= pageSize && works.value.length < (total || Number.MAX_SAFE_INTEGER)
    worksPage.value = currentPage + 1
  } catch (error) {
    console.error('[Profile] 加载作品失败:', error)
    worksError.value = error?.message || '加载作品失败'
  } finally {
    worksLoading.value = false
  }
}

// Load following
async function loadFollowing(reset = false) {
  const userId = route.params.userId
  if (!userId || followingLoading.value) return
  if (reset) { followingPage.value = 1; followingList.value = []; followingHasMore.value = true }
  if (!followingHasMore.value && !reset) return
  followingLoading.value = true
  try {
    const response = await getFollowing(userId, { page: followingPage.value, pageSize: PAGE_SIZE })
    const data = response?.data || response || {}
    const list = data?.users || data?.list || data?.items || []
    if (reset) {
      followingList.value = list
    } else {
      const existingIds = new Set(followingList.value.map(u => u.id))
      followingList.value = [...followingList.value, ...list.filter(u => !existingIds.has(u.id))]
    }
    followingHasMore.value = list.length >= PAGE_SIZE
    followingPage.value += 1
  } catch (error) {
    console.error('[Profile] 加载关注列表失败:', error)
  } finally {
    followingLoading.value = false
  }
}

// Load favorites
async function loadFavorites(reset = false) {
  if (!isSelf.value || favoritesLoading.value) return
  if (reset) { favoritesPage.value = 1; favoritesList.value = []; favoritesHasMore.value = true }
  if (!favoritesHasMore.value && !reset) return
  favoritesLoading.value = true
  try {
    const response = await getMyFavorites({ page: favoritesPage.value, pageSize: PAGE_SIZE })
    const data = response?.data || response || {}
    const list = data?.works || data?.favorites || data?.list || data?.items || []
    if (reset) {
      favoritesList.value = list
    } else {
      const existingIds = new Set(favoritesList.value.map(w => w.id))
      favoritesList.value = [...favoritesList.value, ...list.filter(w => !existingIds.has(w.id))]
    }
    favoritesHasMore.value = list.length >= PAGE_SIZE
    favoritesPage.value += 1
  } catch (error) {
    console.error('[Profile] 加载收藏列表失败:', error)
  } finally {
    favoritesLoading.value = false
  }
}

// Messages helpers
const currentUserId = computed(() => String(localStorage.getItem('user_id') || localStorage.getItem('userId') || ''))

function normalizeConversationPeer(conversation) {
  if (!conversation) return { userId: '', name: '未知用户', avatar: '', initial: '?' }
  const rawPeer = conversation.peer || conversation.partner || conversation.target_user || conversation.user || null
  const participants = Array.isArray(conversation.participants) ? conversation.participants : []
  const peerFromParticipants = participants.find(item => String(item?.id || item?.user_id) !== currentUserId.value)
  const fallbackName = conversation.peer_name || conversation.partner_username || conversation.target_username || conversation.username || conversation.title || '未知用户'
  const name = rawPeer?.username || rawPeer?.name || peerFromParticipants?.username || peerFromParticipants?.name || fallbackName
  const avatar = rawPeer?.avatar_url || rawPeer?.avatar || peerFromParticipants?.avatar_url || peerFromParticipants?.avatar || conversation.peer_avatar || conversation.partner_avatar_url || conversation.target_avatar || ''
  const userId = String(rawPeer?.id || rawPeer?.user_id || peerFromParticipants?.id || peerFromParticipants?.user_id || conversation.peer_user_id || conversation.partner_id || conversation.target_user_id || '')
  return { userId, name, avatar, initial: (name || '?').slice(0, 1).toUpperCase() }
}

function formatMessageTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}小时前`
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

async function loadMessageConversations() {
  if (messagesTabLoading.value) return
  messagesTabLoading.value = true
  try {
    const response = await getConversations()
    const data = response?.data || response || {}
    messageConversations.value = data?.conversations || data?.items || data?.list || []
  } catch (error) {
    console.error('[Profile] 加载私信会话失败:', error)
  } finally {
    messagesTabLoading.value = false
  }
}

async function loadUnreadCount() {
  try {
    const response = await getUnreadMessageCount()
    const data = response?.data || response || {}
    unreadCount.value = Number(data?.unread_count || data?.count || 0)
  } catch (error) {
    console.error('[Profile] 加载未读消息数失败:', error)
  }
}

function goToConversation(conversation) {
  const peer = normalizeConversationPeer(conversation)
  if (peer.userId) {
    router.push(`/community/messages?userId=${peer.userId}`)
  } else {
    router.push('/community/messages')
  }
}

function handleSendMessage() {
  if (!communityStore.requireLogin()) return
  router.push(`/community/messages?userId=${route.params.userId}`)
}

function goBack() {
  if (window.history.length > 1) { router.back(); return }
  router.push('/community')
}
function goToWork(work) {
  if (!work?.id) return
  router.push(`/community/${work.id}`)
}
function handleLoginRequired() { communityStore.showLoginModal = true }
function handleLoginSuccess() {
  if (route.query.openMessage === '1' && route.params.userId) {
    router.push(`/community/messages?userId=${route.params.userId}`)
  }
}
function handleFollowChanged(payload) {
  if (!profile.value) return
  const wasFollowing = !!profile.value.is_following
  const nextFollowing = !!(payload?.isFollowing ?? payload?.is_following)
  const nextMutual = !!(payload?.isMutual ?? payload?.is_mutual_follow)
  profile.value = {
    ...profile.value,
    is_following: nextFollowing,
    is_mutual_follow: nextMutual,
    follower_count: Math.max(0, Number(profile.value.follower_count || 0) + (wasFollowing === nextFollowing ? 0 : (nextFollowing ? 1 : -1)))
  }
}
function openPublishDialog() { showPublishDialog.value = true }
function handlePublished() { showPublishDialog.value = false; loadWorks(true) }
async function handleLike(work) {
  if (!communityStore.requireLogin()) return
  try {
    const response = await toggleLike(work.id)
    const data = response?.data || response || {}
    work.is_liked = data.liked ?? !work.is_liked
    work.like_count = data.like_count ?? (work.is_liked ? Number(work.like_count || 0) + 1 : Math.max(Number(work.like_count || 0) - 1, 0))
    toggleFavorite(work.id).catch(() => {})
  } catch (error) {
    console.error('[Profile] 点赞失败:', error)
  }
}
async function handleShare() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast('链接已复制到剪贴板')
  } catch {
    toast('复制失败，请手动复制链接')
  }
}

// Tab change -> load data
watch(activeTab, (tab) => {
  if (tab === 'following' && !followingList.value.length) loadFollowing(true)
  if (tab === 'messages' && !messageConversations.value.length) loadMessageConversations()
  if (tab === 'favorites' && !favoritesList.value.length) loadFavorites(true)
})

// Route change
watch(
  () => route.params.userId,
  async () => {
    profile.value = null
    works.value = []
    followingList.value = []
    favoritesList.value = []
    totalWorks.value = 0
    hasMore.value = true
    worksPage.value = 1
    followingPage.value = 1
    favoritesPage.value = 1
    activeTab.value = 'works'
    messageConversations.value = []
    unreadCount.value = 0
    await loadProfile()
    if (isSelf.value) loadUnreadCount()
    await loadWorks(true)
  },
  { immediate: true }
)
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
