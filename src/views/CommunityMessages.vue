<template>
  <div class="min-h-screen bg-black text-white">
    <div class="mx-auto flex h-screen max-w-[1400px] flex-col px-4 py-4 sm:px-6">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold text-white">社区私信</h1>
          <p class="mt-1 text-sm text-white/45">未互关用户最多可发送3条消息，互关后无限制</p>
        </div>
        <router-link
          to="/community"
          class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          返回社区
        </router-link>
      </div>

      <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
          <div class="border-b border-white/10 px-4 py-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-medium text-white">会话</h2>
              <button
                type="button"
                class="text-sm text-white/40 transition hover:text-white/80"
                :disabled="conversationListLoading"
                @click="loadConversations"
              >
                刷新
              </button>
            </div>
          </div>

          <div v-if="conversationListLoading && !conversations.length" class="flex flex-1 items-center justify-center">
            <div class="h-7 w-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>

          <div v-else-if="conversationError && !conversations.length" class="px-4 py-6 text-sm text-red-300">
            <p>{{ conversationError }}</p>
            <button
              type="button"
              class="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
              @click="loadConversations"
            >
              重试
            </button>
          </div>

          <div v-else-if="conversations.length" class="flex-1 overflow-y-auto p-2">
            <button
              v-for="item in conversations"
              :key="item.id"
              type="button"
              class="mb-2 flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition"
              :class="selectedConversationId === item.id
                ? 'border-white/20 bg-white/10'
                : 'border-transparent bg-transparent hover:border-white/10 hover:bg-white/5'"
              @click="selectConversation(item)"
            >
              <img
                v-if="getConversationAvatar(item)"
                :src="getConversationAvatar(item)"
                :alt="getConversationName(item)"
                class="h-11 w-11 rounded-full object-cover"
              />
              <div v-else class="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-white/70">
                {{ getConversationInitial(item) }}
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium text-white">{{ getConversationName(item) }}</p>
                  <span class="shrink-0 text-xs text-white/30">{{ formatTime(item.last_message_at || item.updated_at || item.created_at) }}</span>
                </div>
                <p class="mt-1 line-clamp-2 text-xs leading-5 text-white/45">
                  {{ item.last_message_text || item.last_message?.content || '暂无消息' }}
                </p>
              </div>
            </button>
          </div>

          <div v-else class="flex flex-1 items-center justify-center px-6 text-center text-sm text-white/35">
            暂无会话，去作者主页与互关作者开始聊天吧
          </div>
        </aside>

        <section class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
          <template v-if="activeConversation">
            <header class="border-b border-white/10 px-5 py-4">
              <div class="flex items-center gap-3">
                <img
                  v-if="activePeer.avatar"
                  :src="activePeer.avatar"
                  :alt="activePeer.name"
                  class="h-10 w-10 rounded-full object-cover"
                />
                <div v-else class="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-white/70">
                  {{ activePeer.initial }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <h2 class="truncate text-base font-medium text-white">{{ activePeer.name }}</h2>
                    <router-link
                      v-if="activePeer.userId"
                      :to="`/community/users/${activePeer.userId}`"
                      class="text-xs text-white/40 transition hover:text-white/80"
                    >
                      查看主页
                    </router-link>
                  </div>
                  <p class="mt-1 text-xs text-white/35">最近消息时间：{{ formatTime(activeConversation.last_message_at || activeConversation.updated_at || activeConversation.created_at) || '暂无' }}</p>
                </div>
              </div>
            </header>

            <div ref="messageScrollRef" class="flex-1 overflow-y-auto px-5 py-4">
              <div v-if="messagesLoading && !messages.length" class="flex h-full items-center justify-center">
                <div class="h-7 w-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              </div>

              <div v-else-if="messagesError && !messages.length" class="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm text-red-300">
                <p>{{ messagesError }}</p>
                <button
                  type="button"
                  class="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
                  @click="loadMessages(selectedConversationId)"
                >
                  重新加载
                </button>
              </div>

              <div v-else-if="messages.length" class="space-y-4">
                <div
                  v-for="message in messages"
                  :key="message.id"
                  class="flex"
                  :class="isOwnMessage(message) ? 'justify-end' : 'justify-start'"
                >
                  <div class="max-w-[80%]">
                    <div
                      class="rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm"
                      :class="isOwnMessage(message)
                        ? 'rounded-br-md bg-white text-black'
                        : 'rounded-bl-md border border-white/10 bg-white/10 text-white'"
                    >
                      {{ message.content || message.message || '' }}
                    </div>
                    <p class="mt-1 px-1 text-xs text-white/30" :class="isOwnMessage(message) ? 'text-right' : 'text-left'">
                      {{ formatTime(message.created_at || message.sent_at) }}
                    </p>
                  </div>
                </div>
              </div>

              <div v-else class="flex h-full items-center justify-center text-sm text-white/35">
                还没有消息，发送第一条消息开始对话吧
              </div>
            </div>

            <div v-if="messagesError && messages.length" class="border-t border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-300">
              {{ messagesError }}
            </div>

            <form class="border-t border-white/10 px-5 py-4" @submit.prevent="handleSendMessage">
              <div v-if="!isMutualFollow && activeConversation" class="mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs" :class="isMessageLimitReached ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300'">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span v-if="isMessageLimitReached">已达到消息上限，请先互相关注后继续对话</span>
                <span v-else>未互关状态，剩余可发送 {{ remainingMessages }} 条消息</span>
              </div>
              <div class="flex items-end gap-3">
                <textarea
                  v-model="messageInput"
                  rows="1"
                  maxlength="1000"
                  :placeholder="isMessageLimitReached ? '互关后才能继续发送消息' : '输入消息内容...'"
                  class="min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none disabled:opacity-50"
                  :disabled="sending || isMessageLimitReached"
                  @keydown.enter.exact.prevent="handleSendMessage"
                />
                <button
                  type="submit"
                  class="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="sending || !messageInput.trim() || isMessageLimitReached"
                >
                  {{ sending ? '发送中...' : '发送' }}
                </button>
              </div>
              <p v-if="sendError" class="mt-2 text-sm text-red-300">{{ sendError }}</p>
            </form>
          </template>

          <div v-else class="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <div class="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <svg class="h-8 w-8 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.721C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 class="mt-5 text-lg font-medium text-white">选择一个会话开始聊天</h2>
            <p class="mt-2 max-w-md text-sm leading-6 text-white/40">
              左侧会显示你与互关作者的私信会话。若从作者主页进入，会自动尝试打开对应会话。
            </p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  createConversation,
  getConversationMessages,
  getConversations,
  sendMessage
} from '@/api/community'

const route = useRoute()

const conversations = ref([])
const conversationListLoading = ref(false)
const conversationError = ref('')

const selectedConversationId = ref('')
const messages = ref([])
const messagesLoading = ref(false)
const messagesError = ref('')
const messageInput = ref('')
const sending = ref(false)
const sendError = ref('')
const messageScrollRef = ref(null)

const currentUserId = computed(() => {
  return String(localStorage.getItem('user_id') || localStorage.getItem('userId') || '')
})

const activeConversation = computed(() => {
  return conversations.value.find(item => String(item.id) === String(selectedConversationId.value)) || null
})

const activePeer = computed(() => {
  return normalizeConversationPeer(activeConversation.value)
})

const NON_MUTUAL_MESSAGE_LIMIT = 3

const isMutualFollow = computed(() => {
  if (!activeConversation.value) return false
  return !!activeConversation.value.is_mutual_follow
})

const totalMessageCount = computed(() => {
  if (!activeConversation.value) return 0
  if (activeConversation.value.total_message_count !== undefined) {
    return Number(activeConversation.value.total_message_count)
  }
  return messages.value.length
})

const remainingMessages = computed(() => {
  if (isMutualFollow.value) return Infinity
  return Math.max(0, NON_MUTUAL_MESSAGE_LIMIT - totalMessageCount.value)
})

const isMessageLimitReached = computed(() => {
  return !isMutualFollow.value && remainingMessages.value <= 0
})

function extractConversationList(response) {
  const data = response?.data || response || {}
  return data?.conversations || data?.items || data?.list || []
}

function extractMessageList(response) {
  const data = response?.data || response || {}
  return data?.messages || data?.items || data?.list || []
}

function normalizeConversationPeer(conversation) {
  if (!conversation) {
    return { userId: '', name: '未知用户', avatar: '', initial: '?' }
  }

  const rawPeer = conversation.peer || conversation.partner || conversation.target_user || conversation.user || null
  const participants = Array.isArray(conversation.participants) ? conversation.participants : []
  const peerFromParticipants = participants.find(item => String(item?.id || item?.user_id) !== currentUserId.value)
  const fallbackName = conversation.peer_name || conversation.partner_username || conversation.target_username || conversation.username || conversation.title || '未知用户'
  const name = rawPeer?.username || rawPeer?.name || peerFromParticipants?.username || peerFromParticipants?.name || fallbackName
  const avatar = rawPeer?.avatar_url || rawPeer?.avatar || peerFromParticipants?.avatar_url || peerFromParticipants?.avatar || conversation.peer_avatar || conversation.partner_avatar_url || conversation.target_avatar || ''
  const userId = String(rawPeer?.id || rawPeer?.user_id || peerFromParticipants?.id || peerFromParticipants?.user_id || conversation.peer_user_id || conversation.partner_id || conversation.target_user_id || '')

  return {
    userId,
    name,
    avatar,
    initial: (name || '?').slice(0, 1).toUpperCase()
  }
}

function hasResolvedConversationPeer(conversation) {
  const peer = normalizeConversationPeer(conversation)
  return !!peer.userId && peer.name !== '未知用户'
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

function getConversationName(item) {
  return normalizeConversationPeer(item).name
}

function getConversationAvatar(item) {
  return normalizeConversationPeer(item).avatar
}

function getConversationInitial(item) {
  return normalizeConversationPeer(item).initial
}

function isOwnMessage(message) {
  const senderId = String(message?.sender_id || message?.from_user_id || message?.user_id || '')
  return !!currentUserId.value && senderId === currentUserId.value
}

async function loadConversationDetail(conversationId) {
  if (!conversationId) return null

  try {
    const response = await getConversationMessages(conversationId)
    return response?.data?.conversation || response?.conversation || null
  } catch (error) {
    console.error('[CommunityMessages] 加载会话详情失败:', error)
    return null
  }
}

async function hydrateConversationPeer(conversation) {
  if (!conversation?.id || hasResolvedConversationPeer(conversation)) {
    return conversation
  }

  const detail = await loadConversationDetail(conversation.id)
  if (!detail) {
    return conversation
  }

  return {
    ...conversation,
    ...detail,
    partner: detail.partner || conversation.partner || null
  }
}

async function loadConversations(preferredUserId) {
  conversationListLoading.value = true
  conversationError.value = ''
  try {
    const response = await getConversations()
    const list = extractConversationList(response)
    const hydratedList = await Promise.all(list.map(hydrateConversationPeer))
    conversations.value = hydratedList

    if (preferredUserId) {
      const matched = hydratedList.find(item => normalizeConversationPeer(item).userId === String(preferredUserId))
      if (matched) {
        await selectConversation(matched)
        return
      }
    }

    if (selectedConversationId.value) {
      const stillExists = hydratedList.find(item => String(item.id) === String(selectedConversationId.value))
      if (stillExists) {
        return
      }
    }

    if (hydratedList.length) {
      await selectConversation(hydratedList[0])
    } else {
      selectedConversationId.value = ''
      messages.value = []
    }
  } catch (error) {
    console.error('[CommunityMessages] 加载会话失败:', error)
    conversationError.value = error?.message || '加载会话失败'
  } finally {
    conversationListLoading.value = false
  }
}

async function loadMessages(conversationId) {
  if (!conversationId) {
    messages.value = []
    return
  }

  messagesLoading.value = true
  messagesError.value = ''
  try {
    const response = await getConversationMessages(conversationId)
    messages.value = extractMessageList(response)
    await scrollToBottom()
  } catch (error) {
    console.error('[CommunityMessages] 加载消息失败:', error)
    messagesError.value = error?.message || '加载消息失败'
  } finally {
    messagesLoading.value = false
  }
}

async function selectConversation(conversation) {
  if (!conversation?.id) return
  selectedConversationId.value = String(conversation.id)
  sendError.value = ''
  await loadMessages(conversation.id)
}

async function ensureConversation(userId) {
  if (!userId) return

  const existing = conversations.value.find(item => normalizeConversationPeer(item).userId === String(userId))
  if (existing) {
    await selectConversation(existing)
    return
  }

  try {
    const response = await createConversation({ target_user_id: String(userId) })
    const created = response?.data?.conversation || response?.conversation || response?.data || response
    if (created?.id) {
      const hydratedCreated = await hydrateConversationPeer(created)
      const merged = [hydratedCreated, ...conversations.value.filter(item => String(item.id) !== String(hydratedCreated.id))]
      conversations.value = merged
      await selectConversation(hydratedCreated)
      return
    }
  } catch (error) {
    console.error('[CommunityMessages] 创建会话失败:', error)
    conversationError.value = error?.message || '无法打开该私信会话'
    return
  }

  await loadConversations(userId)
}

async function handleSendMessage() {
  const content = messageInput.value.trim()
  if (!content || !selectedConversationId.value || sending.value || isMessageLimitReached.value) return

  sending.value = true
  sendError.value = ''
  try {
    const response = await sendMessage(selectedConversationId.value, { content })
    const createdMessage = response?.data?.message || response?.message || response?.data || response

    if (createdMessage?.id) {
      messages.value = [...messages.value, createdMessage]
    } else {
      await loadMessages(selectedConversationId.value)
    }

    const activeId = String(selectedConversationId.value)
    conversations.value = conversations.value.map(item => {
      if (String(item.id) !== activeId) return item
      return {
        ...item,
        last_message_text: content,
        last_message: { ...(item.last_message || {}), content },
        last_message_at: createdMessage?.created_at || new Date().toISOString(),
        updated_at: createdMessage?.created_at || new Date().toISOString(),
        total_message_count: Number(item.total_message_count || 0) + 1
      }
    })

    const active = conversations.value.find(item => String(item.id) === activeId)
    if (active) {
      conversations.value = [active, ...conversations.value.filter(item => String(item.id) !== activeId)]
    }

    messageInput.value = ''
    await scrollToBottom()
  } catch (error) {
    console.error('[CommunityMessages] 发送消息失败:', error)
    sendError.value = error?.message || '发送失败，请稍后重试'
  } finally {
    sending.value = false
  }
}

async function scrollToBottom() {
  await nextTick()
  if (!messageScrollRef.value) return
  messageScrollRef.value.scrollTop = messageScrollRef.value.scrollHeight
}

async function initPage() {
  const preferredUserId = route.query.userId ? String(route.query.userId) : ''
  await loadConversations(preferredUserId)
  if (preferredUserId) {
    await ensureConversation(preferredUserId)
  }
}

watch(
  () => route.query.userId,
  async (userId, oldUserId) => {
    const nextUserId = userId ? String(userId) : ''
    const prevUserId = oldUserId ? String(oldUserId) : ''
    if (!nextUserId || nextUserId === prevUserId) return
    await ensureConversation(nextUserId)
  }
)

onMounted(() => {
  initPage()
})
</script>
