<template>
  <Transition name="slide-right">
    <div v-if="visible" class="ai-assistant-container" :class="{ 'compact-mode': isCompactMode }" :style="containerStyle">
      <!-- 左侧拖拽手柄 -->
      <div 
        class="resize-handle"
        @mousedown.prevent="startResize"
      >
        <div class="resize-indicator"></div>
      </div>
      <div class="ai-assistant-panel">
        <!-- 头部 -->
        <div class="panel-header">
          <div class="header-left">
            <div class="header-icon">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id="sparkle-gradient-header" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#e5e7eb"/>
                    <stop offset="50%" stop-color="#d1d5db"/>
                    <stop offset="100%" stop-color="#9ca3af"/>
                  </linearGradient>
                </defs>
                <!-- 主星 -->
                <path
                  d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
                  fill="url(#sparkle-gradient-header)"
                />
                <!-- 小星1 -->
                <path
                  d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
                  fill="url(#sparkle-gradient-header)"
                  opacity="0.7"
                />
                <!-- 小星2 -->
                <path
                  d="M5 15L5.5 16.5L7 17L5.5 17.5L5 19L4.5 17.5L3 17L4.5 16.5L5 15Z"
                  fill="url(#sparkle-gradient-header)"
                  opacity="0.5"
                />
              </svg>
            </div>
            <span class="header-title">AI 灵感助手</span>
          </div>
          <div class="header-actions">
            <button class="header-btn" @click="startNewChat" title="新对话">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <button class="header-btn" @click="showHistory = !showHistory" title="历史记录">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </button>
            <button class="header-btn close-btn" @click="$emit('close')" title="关闭">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 历史记录抽屉 -->
        <div v-if="showHistory" class="history-drawer">
          <div class="history-header">
            <span>历史对话</span>
            <button class="history-close" @click="showHistory = false">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="history-list">
            <div v-if="sessions.length === 0" class="history-empty">
              暂无历史对话
            </div>
            <div
              v-for="session in sessions"
              :key="session.id"
              class="history-item"
              :class="{ active: session.id === currentSessionId }"
              @click="loadSession(session)"
            >
              <div class="history-item__title">{{ session.title }}</div>
              <div class="history-item__preview">{{ session.last_message }}</div>
              <button
                class="history-item__delete"
                @click.stop="deleteSessionItem(session.id)"
                title="删除"
              >
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>


        <!-- 消息区域 -->
        <div ref="messagesRef" class="messages-area">
          <!-- 欢迎信息 -->
          <div v-if="messages.length === 0" class="welcome-section">
            <div class="welcome-icon">
              <svg class="w-12 h-12" viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id="sparkle-gradient-welcome" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#9ca3af"/>
                    <stop offset="50%" stop-color="#6b7280"/>
                    <stop offset="100%" stop-color="#4b5563"/>
                  </linearGradient>
                </defs>
                <!-- 主星 -->
                <path
                  d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
                  fill="url(#sparkle-gradient-welcome)"
                />
                <!-- 小星1 -->
                <path
                  d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
                  fill="url(#sparkle-gradient-welcome)"
                  opacity="0.7"
                />
                <!-- 小星2 -->
                <path
                  d="M5 15L5.5 16.5L7 17L5.5 17.5L5 19L4.5 17.5L3 17L4.5 16.5L5 15Z"
                  fill="url(#sparkle-gradient-welcome)"
                  opacity="0.5"
                />
              </svg>
            </div>
            <h3 class="welcome-title">Hi, {{ userName }}!</h3>
            <p class="welcome-subtitle">在寻找哪方面的灵感?</p>
            <div class="welcome-tips">
              <div class="tip-card" @click="sendQuickMessage('帮我想一些创意图片的点子')">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4M12 8h.01"/>
                </svg>
                <span>创意灵感</span>
              </div>
              <div class="tip-card" @click="sendQuickMessage('帮我优化这个提示词')">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                </svg>
                <span>优化提示词</span>
              </div>
              <div class="tip-card" @click="sendQuickMessage('搜索最新的AI艺术风格趋势')">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <span>搜索资料</span>
              </div>
            </div>
          </div>

          <!-- 消息列表 -->
          <AIAssistantMessage
            v-for="(msg, index) in messages"
            :key="index"
            :message="msg"
            :user-name="userName"
            @preview-media="previewMedia"
          />
        </div>

        <!-- 附件预览 -->
        <div v-if="attachments.length > 0" class="attachments-preview">
          <div
            v-for="(att, index) in attachments"
            :key="index"
            class="attachment-item"
          >
            <!-- 图片预览 -->
            <div v-if="att.type === 'image'" class="attachment-thumb-wrapper">
              <img :src="att.preview" class="attachment-thumb" />
              <button class="attachment-remove" @click="removeAttachment(index)">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <!-- 视频缩略图预览 -->
            <div v-else-if="att.type === 'video'" class="attachment-thumb-wrapper attachment-video-wrapper">
              <video
                :src="att.preview"
                class="attachment-thumb"
                muted
                preload="metadata"
                @loadeddata="$event.target.currentTime = 0.5"
              ></video>
              <div class="video-play-badge">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </div>
              <button class="attachment-remove" @click="removeAttachment(index)">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <!-- 音频预览 -->
            <div v-else-if="att.type === 'audio'" class="attachment-file file-audio">
              <div class="file-icon">
                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18V5l12-2v13"/>
                  <circle cx="6" cy="18" r="3"/>
                  <circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
              <div class="file-info">
                <div class="file-name">{{ att.name }}</div>
                <div v-if="att.size" class="file-size">{{ formatFileSize(att.size) }}</div>
              </div>
              <button class="attachment-remove attachment-remove-file" @click.stop="removeAttachment(index)">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <!-- 文件图标 -->
            <div v-else class="attachment-file" :class="`file-${att.fileType}`">
              <div class="file-icon">
                <!-- PDF -->
                <svg v-if="att.ext === 'pdf'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <text x="7" y="17" font-size="5" fill="currentColor">PDF</text>
                </svg>

                <!-- 代码文件 -->
                <svg v-else-if="att.fileType === 'code'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                </svg>

                <!-- Office文档 -->
                <svg v-else-if="att.fileType === 'office'" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="8" y1="13" x2="16" y2="13"/>
                  <line x1="8" y1="17" x2="16" y2="17"/>
                </svg>

                <!-- 普通文档 -->
                <svg v-else class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div class="file-info">
                <div class="file-name">{{ att.name }}</div>
                <div v-if="att.size" class="file-size">{{ formatFileSize(att.size) }}</div>
              </div>
              <button class="attachment-remove attachment-remove-file" @click="removeAttachment(index)">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 输入区域 -->
        <div 
          class="input-area" 
          :class="{ 'is-dragging': isDragging }"
          @dragenter.prevent="handleDragEnter"
          @dragover.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <!-- 拖拽提示层 -->
          <div v-if="isDragging" class="drag-overlay">
            <div class="drag-content">
              <svg class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div class="drag-text">释放以上传文件</div>
              <div class="drag-hint">支持图片、PDF、文档、代码等格式</div>
            </div>
          </div>
          
          <!-- 输入框 -->
          <textarea
            ref="inputRef"
            v-model="inputText"
            class="input-textarea"
            placeholder="开启你的灵感之旅..."
            rows="1"
            @keydown.enter.exact.prevent="sendMessage"
            @input="autoResize"
          ></textarea>

          <!-- 工具栏 -->
          <div class="input-toolbar">
            <!-- 左侧功能组 -->
            <div class="toolbar-left">
              <!-- 对话模式选择器 -->
              <div class="mode-selector">
                <button
                  class="toolbar-btn mode-btn"
                  @click.stop="showModeDropdown = !showModeDropdown"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <defs>
                      <linearGradient id="mode-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#e5e7eb"/>
                        <stop offset="50%" stop-color="#d1d5db"/>
                        <stop offset="100%" stop-color="#9ca3af"/>
                      </linearGradient>
                    </defs>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="url(#mode-icon-gradient)" stroke-width="2" fill="none"/>
                  </svg>
                  <span>{{ selectedMode?.name || '创意灵感' }}</span>
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 15l-6-6-6 6"/>
                  </svg>
                </button>

                <!-- 模式下拉菜单 -->
                <Transition name="dropdown">
                  <div v-if="showModeDropdown" class="mode-dropdown">
                    <button
                      v-for="mode in config.modes"
                      :key="mode.id"
                      class="mode-option"
                      :class="{ active: selectedModeId === mode.id }"
                      @click="selectMode(mode)"
                    >
                      <span class="mode-icon">{{ getModeIcon(mode.icon) }}</span>
                      <span class="mode-name">{{ mode.name }}</span>
                      <svg v-if="selectedModeId === mode.id" class="w-4 h-4 check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </button>
                  </div>
                </Transition>
              </div>

              <!-- 预设选择器 -->
              <div class="preset-selector">
                <button
                  class="toolbar-btn preset-btn"
                  @click.stop="showPresetDropdown = !showPresetDropdown"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                  </svg>
                  <span>{{ selectedPreset ? selectedPreset.name : '自定义预设' }}</span>
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 15l-6-6-6 6"/>
                  </svg>
                </button>

                <!-- 预设下拉菜单 -->
                <Transition name="dropdown">
                  <div v-if="showPresetDropdown" class="preset-dropdown">
                    <!-- 无预设选项 -->
                    <button
                      class="preset-option"
                      :class="{ active: !selectedPreset }"
                      @click.stop="selectPreset(null)"
                    >
                      <span class="preset-name">无预设</span>
                      <svg v-if="!selectedPreset" class="w-4 h-4 check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </button>

                    <div v-if="userPresets.length > 0" class="preset-divider"></div>

                    <!-- 用户预设列表 -->
                    <button
                      v-for="preset in userPresets"
                      :key="preset.id"
                      class="preset-option"
                      :class="{ active: selectedPreset?.id === preset.id }"
                      @click.stop="selectPreset(preset)"
                    >
                      <span class="preset-name">{{ preset.name }}</span>
                      <svg v-if="selectedPreset?.id === preset.id" class="w-4 h-4 check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </button>

                    <div class="preset-divider"></div>

                    <!-- 管理预设按钮 -->
                    <button class="preset-option preset-manage" @click.stop="openPresetManagerFromDropdown">
                      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                      <span class="preset-name">管理预设...</span>
                    </button>
                  </div>
                </Transition>
              </div>

              <!-- 附件按钮（带下拉菜单） -->
              <div class="attach-selector" ref="attachSelectorRef">
                <button class="toolbar-btn" @click="showAttachDropdown = !showAttachDropdown" title="添加附件">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <Transition name="dropdown">
                  <div v-if="showAttachDropdown" class="attach-dropdown">
                    <button class="attach-option" @click="handleLocalUpload">
                      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <span>本地上传</span>
                    </button>
                    <button class="attach-option" @click="handleCanvasPick">
                      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="2" width="20" height="20" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span>从画布选择</span>
                    </button>
                  </div>
                </Transition>
              </div>
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.json,.xml,.doc,.docx,.xls,.xlsx,.py,.js,.ts,.java,.c,.cpp,.html,.css,.sh,.yaml,.yml,.mp4,.mov,.avi,.webm,.mkv,.mp3,.wav,.ogg,.flac,.aac"
                multiple
                class="hidden"
                @change="handleFileSelect"
              />
            </div>
            
            <!-- 右侧功能组 -->
            <div class="toolbar-right">
              <!-- 深度思考按钮 -->
              <button 
                class="toolbar-btn icon-btn"
                :class="{ active: deepThinkEnabled }"
                @click="deepThinkEnabled = !deepThinkEnabled"
                title="深度思考"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 12h20M2 12l3-3m-3 3l3 3M22 12l-3-3m3 3l-3 3"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              
              <!-- 联网搜索按钮 -->
              <button 
                class="toolbar-btn icon-btn"
                :class="{ active: webSearchEnabled }"
                @click="webSearchEnabled = !webSearchEnabled"
                title="联网搜索"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </button>
              
              <!-- 发送按钮 -->
              <button
                class="send-btn"
                :disabled="!canSend"
                @click="sendMessage"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- 预设管理器 -->
  <PresetManager
    :is-open="showPresetManager"
    @close="closePresetManager"
    @create="handleCreatePreset"
    @edit="handleEditPreset"
    @select="selectPreset"
    @refresh="loadUserPresets"
  />

  <!-- 自定义预设对话框 -->
  <CustomPresetDialog
    :is-open="showCustomPresetDialog"
    :preset="editingPreset"
    @close="closePresetDialog"
    @submit="handleSavePreset"
    @temp-use="handleTempUsePreset"
  />

  <!-- 媒体预览 Lightbox -->
  <Teleport to="body">
    <Transition name="lightbox-fade">
      <div v-if="lightboxVisible" class="media-lightbox" @click.self="closeLightbox">
        <button class="lightbox-close" @click="closeLightbox">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        <!-- 图片预览 -->
        <img
          v-if="lightboxMedia.type === 'image'"
          :src="lightboxMedia.url"
          :alt="lightboxMedia.name"
          class="lightbox-image"
        />
        <!-- 视频预览 -->
        <video
          v-else-if="lightboxMedia.type === 'video'"
          :src="lightboxMedia.url"
          class="lightbox-video"
          controls
          autoplay
        ></video>
        <!-- 音频预览 -->
        <div v-else-if="lightboxMedia.type === 'audio'" class="lightbox-audio">
          <div class="lightbox-audio-icon">
            <svg class="w-16 h-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <div class="lightbox-audio-name">{{ lightboxMedia.name || '音频文件' }}</div>
          <audio
            :src="lightboxMedia.url"
            class="lightbox-audio-player"
            controls
            autoplay
          ></audio>
        </div>
        <div v-if="lightboxMedia.name" class="lightbox-caption">{{ lightboxMedia.name }}</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, inject } from 'vue'
import AIAssistantMessage from './AIAssistantMessage.vue'
import PresetManager from './dialogs/PresetManager.vue'
import CustomPresetDialog from './dialogs/CustomPresetDialog.vue'
import {
  getAIAssistantConfig,
  sendMessage as apiSendMessage,
  sendMessageStream,
  getSessions,
  deleteSession,
  getSessionMessages,
  getModeIcon,
  uploadAttachments
} from '@/api/canvas/ai-assistant'
import {
  getUserLLMPresets,
  createUserLLMPreset,
  updateUserLLMPreset
} from '@/api/canvas/llm'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'width-change', 'start-canvas-pick'])

// 注入用户信息
const userInfo = inject('userInfo', { value: { username: 'User' } })

const userName = computed(() => {
  return userInfo.value?.username || userInfo.value?.name || 'User'
})

// 状态
const config = ref({
  enabled: false,
  modes: [],
  mcp_servers: [],
  deep_think: { enabled: false },
  web_search: { enabled: false },
  models: [],
  points_cost: 1
})

const messages = ref([])
const inputText = ref('')
const isLoading = ref(false)
const currentSessionId = ref(null)
const sessions = ref([])

const selectedModeId = ref('')
const deepThinkEnabled = ref(false)
const webSearchEnabled = ref(false)

const showModeDropdown = ref(false)
const showPresetDropdown = ref(false)
const showHistory = ref(false)

const attachments = ref([])
const isDragging = ref(false)
const isUploading = ref(false) // 上传中状态
const showAttachDropdown = ref(false) // 附件下拉菜单
let dragCounter = 0 // 用于跟踪拖拽进入/离开次数

// 预设管理相关
const userPresets = ref([])
const selectedPreset = ref(null)
const showPresetManager = ref(false)
const showCustomPresetDialog = ref(false)
const editingPreset = ref(null)

// Refs
const messagesRef = ref(null)
const inputRef = ref(null)
const fileInputRef = ref(null)
const attachSelectorRef = ref(null)

// 面板宽度调整相关
const DEFAULT_WIDTH = 480 // 增加默认宽度以确保工具栏一行显示
const MIN_WIDTH = 380
const panelWidth = ref(DEFAULT_WIDTH)
const isResizing = ref(false)

// 计算最大宽度（屏幕的2/3）
const maxWidth = computed(() => {
  return Math.floor(window.innerWidth * 2 / 3)
})

// 容器样式
const containerStyle = computed(() => ({
  width: `${panelWidth.value}px`,
  '--panel-width': `${panelWidth.value}px`
}))

// 判断面板是否为紧凑模式（宽度较小时）
const isCompactMode = computed(() => panelWidth.value < 440)

// 计算属性
const selectedMode = computed(() => {
  return config.value.modes?.find(m => m.id === selectedModeId.value)
})

const canSend = computed(() => {
  return (inputText.value.trim() || attachments.value.length > 0) && !isLoading.value && !isUploading.value
})

// 检查是否有流式内容（用于隐藏加载指示器）
const hasStreamingContent = computed(() => {
  const lastMsg = messages.value[messages.value.length - 1]
  return lastMsg?.isStreaming && lastMsg?.content?.length > 0
})

// 节流滚动
let scrollThrottleTimer = null
function throttledScrollToBottom() {
  if (scrollThrottleTimer) return
  scrollThrottleTimer = setTimeout(() => {
    scrollToBottom()
    scrollThrottleTimer = null
  }, 50)
}

// 方法
async function loadConfig() {
  try {
    config.value = await getAIAssistantConfig()
    if (config.value.modes?.length > 0) {
      selectedModeId.value = config.value.modes[0].id
      // 应用模式的默认设置
      if (config.value.modes[0].deep_think_default) {
        deepThinkEnabled.value = true
      }
    }
  } catch (error) {
    console.error('[AI-Assistant] 加载配置失败:', error)
  }
}

// 加载用户预设
async function loadUserPresets() {
  try {
    const data = await getUserLLMPresets()
    userPresets.value = data.presets || []
  } catch (error) {
    console.error('[AI-Assistant] 加载预设失败:', error)
  }
}

async function loadSessions() {
  try {
    const result = await getSessions()
    sessions.value = result.sessions || []
  } catch (error) {
    console.error('[AI-Assistant] 加载会话列表失败:', error)
  }
}

function selectMode(mode) {
  selectedModeId.value = mode.id
  deepThinkEnabled.value = mode.deep_think_default || false
  showModeDropdown.value = false
}

function startNewChat() {
  messages.value = []
  currentSessionId.value = null
  inputText.value = ''
  attachments.value = []
}

async function loadSession(session) {
  try {
    currentSessionId.value = session.id
    showHistory.value = false
    
    // 加载会话历史消息
    const result = await getSessionMessages(session.id)
    messages.value = result.messages || []
    
    // 滚动到底部
    await nextTick()
    scrollToBottom()
  } catch (error) {
    console.error('[AI-Assistant] 加载会话消息失败:', error)
    // 如果加载失败，显示错误提示
    messages.value = [{
      role: 'assistant',
      content: '加载历史消息失败，请重试。',
      timestamp: Date.now()
    }]
  }
}

async function deleteSessionItem(sessionId) {
  try {
    await deleteSession(sessionId)
    sessions.value = sessions.value.filter(s => s.id !== sessionId)
    if (currentSessionId.value === sessionId) {
      startNewChat()
    }
  } catch (error) {
    console.error('[AI-Assistant] 删除会话失败:', error)
  }
}

function sendQuickMessage(text) {
  inputText.value = text
  sendMessage()
}

// ========== 预设管理相关方法 ==========

// 打开预设管理器
function openPresetManager() {
  showPresetManager.value = true
}

// 从下拉菜单打开预设管理器
function openPresetManagerFromDropdown() {
  console.log('[AI-Assistant] 打开预设管理器')
  showPresetDropdown.value = false
  showPresetManager.value = true
  console.log('[AI-Assistant] showPresetManager =', showPresetManager.value)
}

// 关闭预设管理器
function closePresetManager() {
  showPresetManager.value = false
}

// 打开新建预设对话框
function handleCreatePreset() {
  editingPreset.value = null
  showPresetManager.value = false
  showCustomPresetDialog.value = true
}

// 打开编辑预设对话框
function handleEditPreset(preset) {
  editingPreset.value = preset
  showPresetManager.value = false
  showCustomPresetDialog.value = true
}

// 关闭预设对话框
function closePresetDialog() {
  showCustomPresetDialog.value = false
  editingPreset.value = null
}

// 保存预设
async function handleSavePreset(data) {
  try {
    if (editingPreset.value) {
      // 更新现有预设
      await updateUserLLMPreset(editingPreset.value.id, data)
      console.log('[AI-Assistant] 预设已更新:', data.name)
    } else {
      // 创建新预设
      const result = await createUserLLMPreset(data)
      console.log('[AI-Assistant] 预设已创建:', data.name)
      // 自动选中新创建的预设
      selectedPreset.value = result.preset
    }

    // 重新加载预设列表
    await loadUserPresets()
    closePresetDialog()
  } catch (error) {
    console.error('[AI-Assistant] 保存预设失败:', error)
    alert(error.message || '保存失败，请重试')
  }
}

// 临时使用预设（不保存）
function handleTempUsePreset(data) {
  selectedPreset.value = {
    id: 'temp',
    name: '临时预设',
    systemPrompt: data.systemPrompt
  }
  console.log('[AI-Assistant] 使用临时预设')
}

// 选择预设
function selectPreset(preset) {
  selectedPreset.value = preset
  showPresetDropdown.value = false
  if (preset) {
    console.log('[AI-Assistant] 选中预设:', preset.name)
  } else {
    console.log('[AI-Assistant] 取消选择预设')
  }
}

async function sendMessage() {
  if (!canSend.value) return

  const messageText = inputText.value.trim()
  const messageAttachments = [...attachments.value]

  // 清空输入
  inputText.value = ''
  attachments.value = []
  autoResize()

  // 添加用户消息（先用本地预览显示）
  messages.value.push({
    role: 'user',
    content: messageText,
    attachments: messageAttachments.map(a => ({
      type: a.type,
      url: a.preview,
      name: a.name
    })),
    timestamp: Date.now()
  })

  scrollToBottom()
  isLoading.value = true

  // 添加空的助手消息用于流式更新
  const assistantMessageIndex = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: '',
    thinking: '',
    timestamp: Date.now(),
    isStreaming: true
  })

  try {
    // 如果有附件（图片或文件），先上传到七牛云获取URL
    let uploadedAttachments = []
    if (messageAttachments.length > 0) {
      // 筛选出需要上传的文件（有file对象的）
      const filesToUpload = messageAttachments.filter(a => a.file)

      if (filesToUpload.length > 0) {
        try {
          isUploading.value = true
          messages.value[assistantMessageIndex].content = '正在上传附件...'
          console.log(`[AI-Assistant] 开始上传 ${filesToUpload.length} 个附件...`)
          const uploadResults = await uploadAttachments(filesToUpload.map(a => a.file))

          // 构建上传后的附件列表
          uploadedAttachments = uploadResults.map(result => ({
            type: result.type,
            url: result.url,
            name: result.name
          }))
          console.log(`[AI-Assistant] 附件上传完成:`, uploadedAttachments)
          messages.value[assistantMessageIndex].content = ''

          // 更新用户消息中的附件 URL 为云端 URL（避免 blob URL 失效）
          const userMsg = messages.value[assistantMessageIndex - 1]
          if (userMsg && userMsg.attachments) {
            for (let i = 0; i < userMsg.attachments.length; i++) {
              const uploaded = uploadedAttachments.find(u => u.name === userMsg.attachments[i].name)
              if (uploaded) {
                userMsg.attachments[i].url = uploaded.url
                userMsg.attachments[i].type = uploaded.type
              }
            }
          }
        } catch (uploadError) {
          console.error('[AI-Assistant] 附件上传失败:', uploadError)
          messages.value[assistantMessageIndex].content = `抱歉，附件上传失败: ${uploadError.message}`
          messages.value[assistantMessageIndex].isStreaming = false
          isLoading.value = false
          isUploading.value = false
          return
        } finally {
          isUploading.value = false
        }
      }
    }

    await sendMessageStream({
      session_id: currentSessionId.value,
      message: messageText,
      mode_id: selectedModeId.value,
      options: {
        deep_think: deepThinkEnabled.value,
        web_search: webSearchEnabled.value
      },
      attachments: uploadedAttachments,
      system_prompt: selectedPreset.value?.systemPrompt, // 使用选中的预设系统提示词
      onSession: (sessionId) => {
        currentSessionId.value = sessionId
      },
      onContent: (chunk, fullContent) => {
        // 实时更新消息内容
        messages.value[assistantMessageIndex].content = fullContent
        // 使用节流滚动避免卡顿
        throttledScrollToBottom()
      },
      onThinking: (chunk, fullThinking) => {
        // 更新思考过程
        messages.value[assistantMessageIndex].thinking = fullThinking
        throttledScrollToBottom()
      },
      onDone: (fullContent, result) => {
        // 完成流式输出
        messages.value[assistantMessageIndex].isStreaming = false
        if (result?.session_id) {
          currentSessionId.value = result.session_id
        }
        // 更新会话列表
        loadSessions()
      },
      onError: (error) => {
        messages.value[assistantMessageIndex].content = `抱歉，发生了错误: ${error.message}`
        messages.value[assistantMessageIndex].isStreaming = false
      }
    })

  } catch (error) {
    console.error('[AI-Assistant] 发送消息失败:', error)
    messages.value[assistantMessageIndex].content = `抱歉，发生了错误: ${error.message}`
    messages.value[assistantMessageIndex].isStreaming = false
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleLocalUpload() {
  showAttachDropdown.value = false
  triggerFileInput()
}

function handleCanvasPick() {
  showAttachDropdown.value = false
  emit('start-canvas-pick')
}

function handleFileSelect(event) {
  const files = event.target.files
  if (!files) return

  processFiles(files)

  // 清空 input
  event.target.value = ''
}

function removeAttachment(index) {
  const att = attachments.value[index]
  if (att?.preview && att.preview.startsWith('blob:')) {
    URL.revokeObjectURL(att.preview)
  }
  attachments.value.splice(index, 1)
}

// 拖拽上传处理
function handleDragEnter(e) {
  dragCounter++
  if (e.dataTransfer.types.includes('Files')) {
    isDragging.value = true
  }
}

function handleDragOver(e) {
  if (e.dataTransfer.types.includes('Files')) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

function handleDragLeave(e) {
  dragCounter--
  if (dragCounter === 0) {
    isDragging.value = false
  }
}

function handleDrop(e) {
  dragCounter = 0
  isDragging.value = false
  
  const files = e.dataTransfer.files
  if (!files || files.length === 0) return
  
  // 复用现有的文件处理逻辑
  processFiles(files)
}

function processFiles(files) {
  // 支持的文件类型
  const supportedTypes = {
    image: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
    video: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/mp3', 'audio/x-wav'],
    document: ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/xml', 'text/xml'],
    office: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    code: ['text/javascript', 'application/javascript', 'text/x-python', 'text/x-java', 'text/x-c', 'text/x-c++',
           'text/html', 'text/css', 'application/x-sh', 'text/x-yaml']
  }

  // 扩展名到类型的映射
  const extToType = {
    // 图片
    'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'webp': 'image',
    // 视频
    'mp4': 'video', 'mov': 'video', 'avi': 'video', 'webm': 'video', 'mkv': 'video',
    // 音频
    'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'flac': 'audio', 'aac': 'audio',
    // 文档
    'pdf': 'document', 'txt': 'document', 'md': 'document', 'csv': 'document', 'json': 'document', 'xml': 'document',
    // Office
    'doc': 'office', 'docx': 'office', 'xls': 'office', 'xlsx': 'office',
    // 代码
    'py': 'code', 'js': 'code', 'ts': 'code', 'java': 'code', 'c': 'code', 'cpp': 'code',
    'html': 'code', 'css': 'code', 'sh': 'code', 'yaml': 'code', 'yml': 'code'
  }
  
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase()
    const fileType = extToType[ext]

    if (!fileType) {
      console.warn(`不支持的文件类型: ${file.name}`)
      continue
    }

    // 图片类型生成预览
    if (fileType === 'image') {
      attachments.value.push({
        type: 'image',
        name: file.name,
        file: file,
        fileType: fileType,
        ext: ext,
        preview: URL.createObjectURL(file)
      })
    } else if (fileType === 'video') {
      // 视频类型 - 生成 blob URL 用于缩略图预览
      attachments.value.push({
        type: 'video',
        name: file.name,
        file: file,
        fileType: fileType,
        ext: ext,
        size: file.size,
        preview: URL.createObjectURL(file)
      })
    } else if (fileType === 'audio') {
      // 音频类型 - 生成 blob URL 用于播放预览
      attachments.value.push({
        type: 'audio',
        name: file.name,
        file: file,
        fileType: fileType,
        ext: ext,
        size: file.size,
        preview: URL.createObjectURL(file)
      })
    } else {
      // 其他文件类型
      attachments.value.push({
        type: 'file',
        name: file.name,
        file: file,
        fileType: fileType,
        ext: ext,
        size: file.size
      })
    }
  }
}

function autoResize() {
  const textarea = inputRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

// ========== 媒体预览 Lightbox ==========
const lightboxVisible = ref(false)
const lightboxMedia = ref({ type: '', url: '', name: '' })

function previewMedia({ type, url, name }) {
  lightboxMedia.value = { type, url, name }
  lightboxVisible.value = true
}

function closeLightbox() {
  lightboxVisible.value = false
  lightboxMedia.value = { type: '', url: '', name: '' }
}

// ESC 关闭 Lightbox
function handleLightboxKeydown(e) {
  if (e.key === 'Escape' && lightboxVisible.value) {
    closeLightbox()
  }
}

watch(lightboxVisible, (val) => {
  if (val) {
    document.addEventListener('keydown', handleLightboxKeydown)
  }else {
    document.removeEventListener('keydown', handleLightboxKeydown)
  }
})

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// 拖拽调整宽度方法
function startResize(e) {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = panelWidth.value

  function onMouseMove(moveEvent) {
    if (!isResizing.value) return
    // 向左拖拽增加宽度，向右拖拽减少宽度
    const delta = startX - moveEvent.clientX
    let newWidth = startWidth + delta
    // 限制宽度范围
    newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth.value, newWidth))
    panelWidth.value = newWidth
  }

  function onMouseUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// 监听可见性变化
watch(() => props.visible, (visible) => {
  if (visible) {
    loadConfig()
    loadSessions()
    loadUserPresets()
    nextTick(() => {
      inputRef.value?.focus()
    })
    // 通知父组件面板宽度
    emit('width-change', panelWidth.value)
  } else {
    showModeDropdown.value = false
    showPresetDropdown.value = false
    showHistory.value = false
    emit('width-change', 0)
  }
})

// 监听面板宽度变化
watch(panelWidth, (newWidth) => {
  if (props.visible) {
    emit('width-change', newWidth)
  }
})

// 点击外部关闭下拉菜单
function handleClickOutside(event) {
  if (showModeDropdown.value && !event.target.closest('.mode-selector')) {
    showModeDropdown.value = false
  }
  if (showPresetDropdown.value && !event.target.closest('.preset-selector')) {
    showPresetDropdown.value = false
  }
  if (showAttachDropdown.value && !event.target.closest('.attach-selector')) {
    showAttachDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  if (props.visible) {
    loadConfig()
    loadSessions()
    loadUserPresets()
  }
})

/**
 * 从 URL 添加附件到灵感助手（供外部调用）
 * @param {string} url - 文件 URL
 * @param {string} type - 文件类型: 'image' | 'video' | 'audio'
 * @param {string} [name] - 文件名（可选）
 */
async function addAttachmentFromUrl(url, type, name) {
  if (!url) return

  const defaultNames = {
    image: `image_${Date.now()}.png`,
    video: `video_${Date.now()}.mp4`,
    audio: `audio_${Date.now()}.mp3`
  }
  const fileName = name || defaultNames[type] || `file_${Date.now()}`

  try {
    // 获取文件 blob
    let fetchUrl = url
    if (url.startsWith('/api/') || url.startsWith('/storage/')) {
      const { getApiUrl } = await import('@/config/tenant')
      fetchUrl = getApiUrl(url)
    }

    const { getTenantHeaders } = await import('@/config/tenant')
    const response = await fetch(fetchUrl, {
      headers: url.startsWith('data:') || url.startsWith('blob:') ? {}: getTenantHeaders()
    })
    const blob = await response.blob()
    const file = new File([blob], fileName, { type: blob.type })

    if (type === 'image') {
      attachments.value.push({
        type: 'image',
        name: fileName,
        file,
        fileType: 'image',
        ext: fileName.split('.').pop(),
        preview: URL.createObjectURL(file)
      })
    } else if (type === 'video') {
      attachments.value.push({
        type: 'video',
        name: fileName,
        file,
        fileType: 'video',
        ext: fileName.split('.').pop(),
        size: file.size,
        preview: URL.createObjectURL(file)
      })
    }else if (type === 'audio') {
      attachments.value.push({
        type: 'audio',
        name: fileName,
        file,
        fileType: 'audio',
        ext: fileName.split('.').pop(),
        size: file.size,
        preview: URL.createObjectURL(file)
      })
    }

    // 聚焦输入框
    await nextTick()
    inputRef.value?.focus()
  } catch (error) {
    console.error('[AI-Assistant] 从 URL 添加附件失败:', error)
  }
}

defineExpose({
  addAttachmentFromUrl
})
</script>

<style scoped>
.ai-assistant-container {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 480px;
  max-width: 66.67vw; /* 最大不超过屏幕的2/3 */
  min-width: 380px;
  z-index: 9000;
  overflow: visible; /* 允许下拉菜单溢出显示 */
  display: flex;
}

/* 拖拽手柄 */
.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resize-handle:hover .resize-indicator,
.resize-handle:active .resize-indicator {
  opacity: 1;
  background: rgba(100, 150, 255, 0.6);
}

.resize-indicator {
  width: 4px;
  height: 48px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  opacity: 0;
  transition: all 0.2s ease;
}

.ai-assistant-panel {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, 
    rgba(22, 24, 30, 0.92) 0%,
    rgba(18, 20, 26, 0.95) 100%
  );
  border-left: none;
  pointer-events: auto;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 16px 0 0 16px;
  overflow: visible; /* 允许下拉菜单溢出显示 */
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.2);
}

/* 头部 - 毛玻璃设计 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(135deg, 
    rgba(28, 30, 38, 0.85) 0%,
    rgba(24, 26, 34, 0.9) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 16px 0 0 0; /* 保持左上角圆角 */
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.25) 0%,
    rgba(99, 102, 241, 0.2) 50%,
    rgba(59, 130, 246, 0.25) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.9);
  box-shadow: 
    0 4px 12px rgba(139, 92, 246, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: white;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.2s;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.95);
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.8);
  color: white;
}

/* 历史记录抽屉 - 毛玻璃设计 */
.history-drawer {
  position: absolute;
  top: 57px;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, 
    rgba(26, 28, 36, 0.95) 0%,
    rgba(22, 24, 32, 0.98) 100%
  );
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 10;
  display: flex;
  flex-direction: column;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.95);
  font-weight: 500;
}

.history-close {
  color: rgba(255, 255, 255, 0.6);
  padding: 4px;
}

.history-close:hover {
  color: rgba(255, 255, 255, 0.95);
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.history-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  padding: 40px 20px;
}

.history-item {
  position: relative;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.history-item.active {
  background: rgba(255, 255, 255, 0.12);
}

.history-item__title {
  color: rgba(255, 255, 255, 0.95);
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item__preview {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item__delete {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px;
  color: rgba(255, 255, 255, 0.4);
  opacity: 0;
  transition: opacity 0.2s;
}

.history-item:hover .history-item__delete {
  opacity: 1;
}

.history-item__delete:hover {
  color: rgba(239, 68, 68, 0.9);
}

/* 设置栏 */
.settings-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #374151;
  background: #1f2937;
}

.mode-selector {
  position: relative;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #374151;
  border-radius: 6px;
  color: white;
  font-size: 13px;
  transition: background 0.2s;
}

.mode-btn:hover {
  background: #4b5563;
}

.mode-icon {
  font-size: 14px;
}

.mode-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  min-width: 160px;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 20;
  overflow: hidden;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  color: #d1d5db;
  font-size: 13px;
  text-align: left;
  transition: background 0.2s;
}

.mode-option:hover {
  background: #374151;
}

.mode-option.active {
  background: #3b82f6;
  color: white;
}

.feature-toggles {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-label:hover {
  background: #374151;
}

.toggle-label.active {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.toggle-label input {
  display: none;
}

/* 消息区域 */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 欢迎区域 */
.welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.welcome-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 20px;
  font-weight: 600;
  color: #60a5fa;
  margin-bottom: 8px;
}

.welcome-subtitle {
  font-size: 14px;
  color: #9ca3af;
  margin-bottom: 24px;
}

.welcome-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  padding: 0 16px;
}

.tip-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.25s ease;
  white-space: nowrap;
}

.tip-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.95);
  transform: translateY(-2px);
}

/* 紧凑模式下的提示卡片 */
.ai-assistant-container.compact-mode .tip-card {
  padding: 8px 12px;
  font-size: 12px;
  gap: 6px;
}

/* 附件预览 */
.attachments-preview {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  overflow-x: auto;
}

.attachment-item {
  position: relative;
  flex-shrink: 0;
}

.attachment-thumb-wrapper {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
}

.attachment-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 文件附件样式 */
.attachment-file {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  min-width: 160px;
  max-width: 200px;
}

.file-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
}

.file-document .file-icon {
  color: rgba(96, 165, 250, 0.9);
}

.file-code .file-icon {
  color: rgba(134, 239, 172, 0.9);
}

.file-office .file-icon {
  color: rgba(251, 146, 60, 0.9);
}

.file-video .file-icon {
  color: rgba(168, 85, 247, 0.9);
}

.file-audio .file-icon {
  color: rgba(251, 191, 36, 0.9);
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.attachment-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  color: rgba(255, 255, 255, 0.8);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.attachment-thumb-wrapper:hover .attachment-remove,
.attachment-file:hover .attachment-remove {
  opacity: 1;
}

.attachment-remove:hover {
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
}

/* 文件类型附件的删除按钮（始终可见） */
.attachment-remove-file {
  position: static;
  opacity: 1;
  flex-shrink: 0;
  margin-left: auto;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);
}

.attachment-remove-file:hover {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.85);
}

/* 视频缩略图 */
.attachment-video-wrapper {
  position: relative;
}

.attachment-video-wrapper video {
  pointer-events: none;
}

.video-play-badge {
  position: absolute;
  bottom: 4px;
  left: 4px;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 输入区域 - 毛玻璃设计 */
.input-area {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  padding-bottom: 20px; /* 增加底部内边距，确保发送按钮不被遮挡 */
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(135deg, 
    rgba(24, 26, 34, 0.9) 0%,
    rgba(20, 22, 30, 0.95) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: all 0.3s ease;
  flex-shrink: 0; /* 防止被压缩 */
}

.input-area.is-dragging {
  background: rgba(59, 130, 246, 0.1);
  border-top-color: rgba(59, 130, 246, 0.5);
}

/* 拖拽提示层 */
.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(18, 18, 18, 0.95);
  backdrop-filter: blur(10px);
  border: 2px dashed rgba(59, 130, 246, 0.6);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.drag-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: rgba(59, 130, 246, 0.9);
}

.drag-content svg {
  animation: bounce 1s ease-in-out infinite;
}

.drag-text {
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.drag-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: -4px;
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

.input-textarea {
  width: 100%;
  min-height: 44px;
  max-height: 120px;
  padding: 12px 16px;
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.06) 0%,
    rgba(255, 255, 255, 0.08) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.95);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  transition: all 0.3s ease;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

.input-textarea::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.input-textarea:focus {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.1) 100%
  );
  border-color: rgba(59, 130, 246, 0.35);
  box-shadow: 
    0 0 0 3px rgba(59, 130, 246, 0.1),
    inset 0 1px 2px rgba(0, 0, 0, 0.08);
}

/* 工具栏 */
.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-wrap: nowrap; /* 不允许换行，保持一行 */
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: visible; /* 允许下拉菜单溢出 */
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0; /* 确保右侧工具栏不被压缩 */
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.toolbar-btn.mode-btn {
  padding: 6px 10px;
}

/* 下拉按钮中的文字 - 限制最大宽度并显示省略号 */
.toolbar-btn span {
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 模式选择器 */
.mode-selector {
  position: relative;
}

.mode-dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 180px;
  background: rgba(30, 32, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.mode-option:hover {
  background: rgba(255, 255, 255, 0.08);
}

.mode-option.active {
  background: rgba(100, 150, 255, 0.15);
  color: rgba(180, 200, 255, 1);
}

.mode-icon {
  font-size: 16px;
}

.mode-name {
  flex: 1;
}

.check-icon {
  color: rgba(100, 180, 255, 1);
}

/* 预设选择器 */
.preset-selector {
  position: relative;
}

.preset-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
}

.preset-dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 200px;
  max-width: 280px;
  background: rgba(30, 32, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
  max-height: 320px;
  overflow-y: auto;
}

.preset-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #d1d5db;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.preset-option:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.preset-option.active {
  background: rgba(100, 150, 255, 0.15);
  color: rgba(180, 200, 255, 1);
}

.preset-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 0;
}

.preset-manage {
  color: rgba(139, 92, 246, 0.9);
  font-weight: 500;
}

.preset-manage:hover {
  background: rgba(139, 92, 246, 0.15);
  color: rgba(167, 139, 250, 1);
}

/* 附件选择器 */
.attach-selector {
  position: relative;
}

.attach-dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 160px;
  background: rgba(30, 32, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.attach-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #d1d5db;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.attach-option:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.attach-option svg {
  flex-shrink: 0;
  opacity: 0.7;
}

/* 下拉菜单动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.toolbar-btn.icon-btn {
  padding: 6px;
  min-width: 32px;
  justify-content: center;
}

.toolbar-btn.icon-btn.active {
  background: rgba(100, 150, 255, 0.12);
  color: rgba(150, 180, 255, 0.95);
}

/* 紧凑模式：当面板宽度较窄时自动应用 */
.ai-assistant-container.compact-mode .input-toolbar {
  gap: 4px;
}

.ai-assistant-container.compact-mode .toolbar-left {
  gap: 2px;
}

.ai-assistant-container.compact-mode .toolbar-btn {
  padding: 6px 8px;
  font-size: 11px;
  gap: 4px;
}

.ai-assistant-container.compact-mode .toolbar-btn span {
  max-width: 56px;
}

/* 在紧凑模式下隐藏下拉箭头 */
.ai-assistant-container.compact-mode .toolbar-btn .w-3:last-child {
  display: none;
}

/* 响应式：移动端 */
@media (max-width: 500px) {
  .input-toolbar {
    gap: 4px;
  }
  
  .toolbar-left {
    gap: 2px;
  }
  
  .toolbar-btn {
    padding: 6px 8px;
    font-size: 11px;
    gap: 4px;
  }
  
  .toolbar-btn span {
    max-width: 50px;
  }
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: linear-gradient(135deg, 
    rgba(59, 130, 246, 0.9) 0%,
    rgba(37, 99, 235, 0.95) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
  box-shadow: 
    0 4px 12px rgba(59, 130, 246, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, 
    rgba(37, 99, 235, 0.95) 0%,
    rgba(29, 78, 216, 1) 100%
  );
  transform: scale(1.05);
  box-shadow: 
    0 6px 16px rgba(59, 130, 246, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: linear-gradient(135deg, 
    rgba(100, 100, 100, 0.3) 0%,
    rgba(80, 80, 80, 0.35) 100%
  );
  box-shadow: none;
}

.hidden {
  display: none;
}

/* 动画 */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 滚动条 */
.messages-area::-webkit-scrollbar,
.history-list::-webkit-scrollbar {
  width: 6px;
}

.messages-area::-webkit-scrollbar-track,
.history-list::-webkit-scrollbar-track {
  background: transparent;
}

.messages-area::-webkit-scrollbar-thumb,
.history-list::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: 3px;
}

.messages-area::-webkit-scrollbar-thumb:hover,
.history-list::-webkit-scrollbar-thumb:hover {
  background: #4b5563;
}

/* ========== 媒体预览 Lightbox ========== */
.media-lightbox {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  cursor: zoom-out;
}

.lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  z-index: 1;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.25);
}

.lightbox-image {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  cursor: default;
}

.lightbox-video {
  max-width: 90vw;
  max-height: 85vh;
  border-radius: 8px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  outline: none;
  cursor: default;
}

/* 音频 Lightbox */
.lightbox-audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 48px;
  background: rgba(30, 32, 40, 0.85);
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  min-width: 340px;
}

.lightbox-audio-icon {
  color: #a78bfa;
  opacity: 0.8;
}

.lightbox-audio-name {
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  max-width: 300px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lightbox-audio-player {
  width: 300px;
  outline: none;
}

.lightbox-caption {
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  max-width: 80vw;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.2s ease;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}

</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   AIAssistantPanel 白昼模式样式适配
   ======================================== */
:root.canvas-theme-light .ai-assistant-panel {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.85) 0%,
    rgba(248, 250, 252, 0.9) 100%
  ) !important;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-left: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .ai-assistant-panel .panel-header {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.8) 0%,
    rgba(250, 250, 252, 0.85) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .ai-assistant-panel .header-icon {
  background: linear-gradient(135deg, 
    rgba(139, 92, 246, 0.15) 0%,
    rgba(99, 102, 241, 0.1) 100%
  );
  border: 1px solid rgba(139, 92, 246, 0.15);
}

:root.canvas-theme-light .ai-assistant-panel .header-title {
  color: #1c1917;
}

:root.canvas-theme-light .ai-assistant-panel .header-btn {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .ai-assistant-panel .header-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .ai-assistant-panel .close-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

:root.canvas-theme-light .ai-assistant-panel .welcome-title {
  color: #3b82f6;
}

:root.canvas-theme-light .ai-assistant-panel .welcome-subtitle {
  color: #57534e;
}

:root.canvas-theme-light .ai-assistant-panel .tip-card {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.08);
  color: #57534e;
}

:root.canvas-theme-light .ai-assistant-panel .tip-card:hover {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

:root.canvas-theme-light .ai-assistant-panel .input-area {
  border-top-color: rgba(0, 0, 0, 0.06);
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.7) 0%,
    rgba(250, 250, 252, 0.75) 100%
  );
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

:root.canvas-theme-light .ai-assistant-panel .input-textarea {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.6) 0%,
    rgba(248, 250, 252, 0.7) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-color: rgba(0, 0, 0, 0.08);
  color: #1c1917;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .ai-assistant-panel .input-textarea::placeholder {
  color: rgba(0, 0, 0, 0.35);
}

:root.canvas-theme-light .ai-assistant-panel .input-textarea:focus {
  background: rgba(255, 255, 255, 0.85);
  border-color: rgba(59, 130, 246, 0.35);
  box-shadow: 
    0 0 0 3px rgba(59, 130, 246, 0.1),
    inset 0 1px 2px rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .ai-assistant-panel .toolbar-btn {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .ai-assistant-panel .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .ai-assistant-panel .send-btn {
  background: linear-gradient(135deg, 
    rgba(59, 130, 246, 0.9) 0%,
    rgba(37, 99, 235, 0.95) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 
    0 4px 12px rgba(59, 130, 246, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

:root.canvas-theme-light .ai-assistant-panel .send-btn:hover {
  background: linear-gradient(135deg, 
    rgba(37, 99, 235, 0.95) 0%,
    rgba(29, 78, 216, 1) 100%
  );
  box-shadow: 
    0 6px 16px rgba(59, 130, 246, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

:root.canvas-theme-light .ai-assistant-panel .model-selector {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.5) 0%,
    rgba(248, 250, 252, 0.6) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-color: rgba(0, 0, 0, 0.08);
  color: #57534e;
}

:root.canvas-theme-light .ai-assistant-panel .model-selector:hover {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.65) 0%,
    rgba(248, 250, 252, 0.75) 100%
  );
  border-color: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .ai-assistant-panel .history-drawer {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.9) 0%,
    rgba(250, 250, 252, 0.95) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .ai-assistant-panel .history-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
  color: #1c1917;
}

:root.canvas-theme-light .ai-assistant-panel .history-item {
  color: #57534e;
}

:root.canvas-theme-light .ai-assistant-panel .history-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

:root.canvas-theme-light .ai-assistant-panel .history-item.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

:root.canvas-theme-light .ai-assistant-panel .history-empty {
  color: #a8a29e;
}

:root.canvas-theme-light .ai-assistant-panel .messages-area::-webkit-scrollbar-thumb,
:root.canvas-theme-light .ai-assistant-panel .history-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .ai-assistant-panel .messages-area::-webkit-scrollbar-thumb:hover,
:root.canvas-theme-light .ai-assistant-panel .history-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

/* 消息气泡白昼模式 */
:root.canvas-theme-light .ai-assistant-panel .message-user {
  background: rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .ai-assistant-panel .message-user .message-text {
  color: #1c1917;
}

:root.canvas-theme-light .ai-assistant-panel .message-assistant {
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .ai-assistant-panel .message-assistant .message-text {
  color: #1c1917;
}

:root.canvas-theme-light .ai-assistant-panel .message-time {
  color: rgba(0, 0, 0, 0.4);
}

:root.canvas-theme-light .ai-assistant-panel .message-actions button {
  color: rgba(0, 0, 0, 0.4);
}

:root.canvas-theme-light .ai-assistant-panel .message-actions button:hover {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.7);
}

/* ========================================
   模式/预设选择器下拉菜单 - 白昼模式
   ======================================== */

/* 模式按钮 */
:root.canvas-theme-light .ai-assistant-panel .mode-btn {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .ai-assistant-panel .mode-btn:hover {
  background: rgba(0, 0, 0, 0.08) !important;
}

/* 模式下拉菜单 */
:root.canvas-theme-light .ai-assistant-panel .mode-dropdown {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.92) 0%,
    rgba(250, 250, 252, 0.95) 100%
  ) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
}

:root.canvas-theme-light .ai-assistant-panel .mode-option {
  color: #57534e !important;
}

:root.canvas-theme-light .ai-assistant-panel .mode-option:hover {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .ai-assistant-panel .mode-option.active {
  background: rgba(59, 130, 246, 0.1) !important;
  color: #3b82f6 !important;
}

:root.canvas-theme-light .ai-assistant-panel .mode-option .check-icon {
  color: #3b82f6 !important;
}

/* 预设按钮 */
:root.canvas-theme-light .ai-assistant-panel .preset-btn {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .ai-assistant-panel .preset-btn:hover {
  background: rgba(0, 0, 0, 0.08) !important;
}

/* 预设下拉菜单 */
:root.canvas-theme-light .ai-assistant-panel .preset-dropdown {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.92) 0%,
    rgba(250, 250, 252, 0.95) 100%
  ) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
}

:root.canvas-theme-light .ai-assistant-panel .preset-option {
  color: #57534e !important;
}

:root.canvas-theme-light .ai-assistant-panel .preset-option:hover {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .ai-assistant-panel .preset-option.active {
  background: rgba(59, 130, 246, 0.1) !important;
  color: #3b82f6 !important;
}

:root.canvas-theme-light .ai-assistant-panel .preset-option .check-icon {
  color: #3b82f6 !important;
}

:root.canvas-theme-light .ai-assistant-panel .preset-divider {
  background: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .ai-assistant-panel .preset-manage {
  color: #57534e !important;
}

:root.canvas-theme-light .ai-assistant-panel .preset-manage:hover {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #1c1917 !important;
}

/* 附件下拉菜单 - 白昼模式 */
:root.canvas-theme-light .ai-assistant-panel .attach-dropdown {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.92) 0%,
    rgba(250, 250, 252, 0.95) 100%
  ) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
}

:root.canvas-theme-light .ai-assistant-panel .attach-option {
  color: #57534e !important;
}

:root.canvas-theme-light .ai-assistant-panel .attach-option:hover {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #1c1917 !important;
}

/* 附件预览区域 - 白昼模式 */
:root.canvas-theme-light .ai-assistant-panel .attachments-preview {
  border-top-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .ai-assistant-panel .attachment-file {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.6) 0%,
    rgba(248, 250, 252, 0.7) 100%
  ) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .ai-assistant-panel .file-name {
  color: #1c1917 !important;
}

:root.canvas-theme-light .ai-assistant-panel .file-size {
  color: #78716c !important;
}

:root.canvas-theme-light .ai-assistant-panel .file-icon {
  background: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .ai-assistant-panel .attachment-remove-file {
  background: rgba(0, 0, 0, 0.06) !important;
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .ai-assistant-panel .attachment-remove-file:hover {
  background: rgba(0, 0, 0, 0.12) !important;
  color: rgba(0, 0, 0, 0.75) !important;
}
</style>
