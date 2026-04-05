<template>
  <div class="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
    <div class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
      <div class="flex items-start gap-4 min-w-0">
        <!-- 头像区域 -->
        <div class="relative group shrink-0">
          <img
            v-if="profile?.avatar_url"
            :src="profile.avatar_url"
            :alt="profile?.username || '作者头像'"
            class="h-20 w-20 rounded-full object-cover border border-white/10"
          />
          <div v-else class="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5 text-2xl font-semibold text-white/70">
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

        <div class="min-w-0 space-y-2 flex-1">
          <div class="space-y-1">
            <h1 class="truncate text-2xl font-semibold text-white">{{ profile?.username || '未知作者' }}</h1>
            <!-- 简介编辑模式 -->
            <div v-if="isSelf && editingBio" class="space-y-2">
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
                  <button
                    class="rounded-lg px-3 py-1 text-xs text-white/50 hover:text-white/80 transition-colors"
                    @click="cancelBioEdit"
                  >
                    取消
                  </button>
                  <button
                    class="rounded-lg bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                    :disabled="bioSaving"
                    @click="saveBio"
                  >
                    {{ bioSaving ? '保存中...' : '保存' }}
                  </button>
                </div>
              </div>
            </div>
            <!-- 简介展示模式 -->
            <template v-else>
              <div v-if="isSelf" class="group/bio flex items-start gap-1.5">
                <p v-if="profile?.bio" class="text-sm leading-6 text-white/60">{{ profile.bio }}</p>
                <p v-else class="text-sm text-white/35">点击编辑，写点什么介绍自己吧...</p>
                <button
                  class="mt-0.5 shrink-0 rounded p-0.5 text-white/30 hover:text-white/70 opacity-0 group-hover/bio:opacity-100 transition-opacity"
                  @click="startBioEdit"
                  title="编辑简介"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
              <template v-else>
                <p v-if="profile?.bio" class="text-sm leading-6 text-white/60">{{ profile.bio }}</p>
                <p v-else class="text-sm text-white/35">这个作者还没有填写简介。</p>
              </template>
            </template>
          </div>

          <div class="flex flex-wrap gap-4 text-sm text-white/70">
            <div>
              <span class="font-semibold text-white">{{ stats.workCount }}</span>
              <span class="ml-1">作品</span>
            </div>
            <div>
              <span class="font-semibold text-white">{{ stats.followingCount }}</span>
              <span class="ml-1">关注</span>
            </div>
            <div>
              <span class="font-semibold text-white">{{ stats.followerCount }}</span>
              <span class="ml-1">粉丝</span>
            </div>
            <div>
              <span class="font-semibold text-white">{{ stats.likeCount }}</span>
              <span class="ml-1">获赞</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 他人主页：关注/私信 -->
      <div v-if="showActionArea" class="flex flex-wrap items-center gap-3 md:justify-end">
        <FollowButton
          :user-id="String(profile.id)"
          :initial-following="!!profile?.is_following"
          :initial-mutual="!!profile?.is_mutual_follow"
          @changed="handleFollowChanged"
          @login-required="$emit('login-required')"
        />
        <MessageEntryButton
          :user-id="String(profile.id)"
          :can-message="!!profile?.is_mutual_follow"
          @open="handleMessageClick"
          @login-required="$emit('login-required')"
        />
      </div>

      <!-- 自己主页：发布作品 -->
      <div v-else-if="isSelf" class="flex flex-wrap items-center gap-3 md:justify-end">
        <button
          class="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
          @click="$emit('publish-work')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          发布作品
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { uploadAvatar, updateUserProfile } from '@/api/community'
import FollowButton from './FollowButton.vue'
import MessageEntryButton from './MessageEntryButton.vue'

const props = defineProps({
  profile: { type: Object, default: () => ({}) },
  showActions: { type: Boolean, default: true }
})

const emit = defineEmits(['follow-changed', 'message-click', 'login-required', 'publish-work', 'profile-updated'])

const avatarFallback = computed(() => {
  return (props.profile?.username || '?').slice(0, 1).toUpperCase()
})

const stats = computed(() => ({
  workCount: Number(props.profile?.work_count || 0),
  followingCount: Number(props.profile?.following_count || 0),
  followerCount: Number(props.profile?.follower_count || 0),
  likeCount: Number(props.profile?.portfolio_like_count || props.profile?.total_likes || 0)
}))

const isSelf = computed(() => !!props.profile?.is_self)

const showActionArea = computed(() => {
  return props.showActions && props.profile?.id && !isSelf.value
})

// 头像上传
const avatarInputRef = ref(null)
const avatarUploading = ref(false)

function triggerAvatarUpload() {
  avatarInputRef.value?.click()
}

async function handleAvatarChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    alert('头像图片不能超过 5MB')
    return
  }
  avatarUploading.value = true
  try {
    const result = await uploadAvatar(file)
    if (result?.avatar_url) {
      localStorage.setItem('avatar', result.avatar_url)
      emit('profile-updated', { avatar_url: result.avatar_url })
    }
  } catch (err) {
    console.error('[AuthorHeroCard] 头像上传失败:', err)
    alert('头像上传失败，请重试')
  } finally {
    avatarUploading.value = false
    if (avatarInputRef.value) avatarInputRef.value.value = ''
  }
}

// 简介编辑
const editingBio = ref(false)
const bioText = ref('')
const bioSaving = ref(false)
const bioInputRef = ref(null)

function startBioEdit() {
  bioText.value = props.profile?.bio || ''
  editingBio.value = true
  nextTick(() => bioInputRef.value?.focus())
}

function cancelBioEdit() {
  editingBio.value = false
  bioText.value = ''
}

async function saveBio() {
  if (bioSaving.value) return
  bioSaving.value = true
  try {
    const result = await updateUserProfile({ bio: bioText.value.trim() })
    if (result?.success) {
      emit('profile-updated', { bio: result.bio })
      editingBio.value = false
    }
  } catch (err) {
    console.error('[AuthorHeroCard] 保存简介失败:', err)
    alert('保存失败，请重试')
  } finally {
    bioSaving.value = false
  }
}

function handleFollowChanged(payload) {
  emit('follow-changed', payload)
}

function handleMessageClick(userId) {
  emit('message-click', userId)
}
</script>
