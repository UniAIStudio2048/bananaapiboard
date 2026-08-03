<template>
  <Transition name="slide-right">
    <div v-if="visible" class="ai-assistant-container" :class="{ 'compact-mode': isCompactMode, 'narrow-mode': isNarrowMode }" :style="containerStyle">
      <!-- 左侧拖拽手柄 -->
      <div 
        class="resize-handle"
        @mousedown.prevent="startResize"
      >
        <div class="resize-indicator"></div>
      </div>
      <div class="ai-assistant-panel canvas-panel">
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
              <MessageSquarePlus :size="16" aria-hidden="true" />
            </button>
            <button class="header-btn" @click="showHistory = !showHistory" title="历史记录">
              <History :size="16" aria-hidden="true" />
            </button>
            <button class="header-btn" @click="window.open('/inspiration', '_blank')" title="打开灵感中心">
              <Sparkle :size="16" aria-hidden="true" />
            </button>
            <button class="header-btn close-btn" @click="$emit('close')" title="关闭">
              <X :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- 历史记录抽屉 -->
        <div v-if="showHistory" class="history-drawer">
          <div class="history-header">
            <span>历史对话</span>
            <button class="history-close" @click="showHistory = false">
              <X :size="16" aria-hidden="true" />
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
                v-if="modelPickerTypes.length"
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
            :key="att.key || index"
            class="attachment-item"
            draggable="true"
            @dragstart="attachmentDragIndex = index"
            @dragend="resetAttachmentDragState"
            @dragover.prevent
            @drop.prevent="moveAttachment(attachmentDragIndex, index)"
          >
            <!-- 图片预览 -->
            <div
              v-if="att.type === 'image'"
              class="attachment-thumb-wrapper"
              @click.stop="insertAttachmentMention(index)"
              @mouseenter="onHoverStart(att.preview, $event)"
              @mouseleave="onHoverEnd"
            >
              <img :src="att.preview" class="attachment-thumb" />
              <button class="attachment-remove" @click="removeAttachment(index)">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <!-- 视频缩略图预览 -->
            <div
              v-else-if="att.type === 'video'"
              class="attachment-thumb-wrapper attachment-video-wrapper"
              @click.stop="insertAttachmentMention(index)"
              @mouseenter="onVideoHoverStart(att.preview, $event)"
              @mouseleave="onHoverEnd"
            >
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
            <div v-if="attachmentMentionItems[index]" class="attachment-mention-label">
              @{{ attachmentMentionItems[index].label }}
            </div>
          </div>
        </div>

        <div v-if="pendingAgentApproval" class="agent-approval-bar">
          <span>Skill「{{ pendingAgentApproval.skill?.name || pendingAgentApproval.skill_name }}」请求以下授权</span>
          <div v-for="action in pendingApprovalActions" :key="`${action.capability}:${action.model}`" class="agent-approval-action">
            <code>{{ action.capability }}</code>
            <span v-if="action.model">模型：{{ action.model }}</span>
            <span v-if="action.estimated_points">预计 {{ action.estimated_points }} 积分</span>
            <span v-if="action.write_target">写回：{{ action.write_target.workflow_id }} / {{ action.write_target.node_id }}</span>
          </div>
          <div>
            <button type="button" :disabled="approvalDeciding" @click="decideSkillRun('deny')">拒绝</button>
            <button type="button" :disabled="approvalDeciding" @click="decideSkillRun('allow_once')">确认本次</button>
          </div>
        </div>

        <!-- 输入区域 -->
        <div 
          class="input-area prompt-input-wrapper" 
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
          <div v-if="selectedAssistantModel" class="selected-model-tag">
            <span class="selected-model-tag-icon"><ModelIcon :icon="getAssistantModelIcon(selectedAssistantModel)" :label="selectedAssistantModel.label || selectedAssistantModel.value" /></span>
            <span class="selected-model-tag-label">{{ selectedAssistantModel.label || selectedAssistantModel.value }}</span>
            <button type="button" class="selected-model-tag-remove" title="移除已选模型" aria-label="移除已选模型" @click="clearAssistantModel">×</button>
          </div>
          <div
            :key="inputEditorRenderKey"
            ref="inputRef"
            class="input-textarea"
            :class="{ 'is-empty': !inputText && !selectedAssistantModel }"
            contenteditable="true"
            role="textbox"
            aria-multiline="true"
            data-placeholder="开启你的灵感之旅..."
            @keydown="handleInputKeydown"
            @beforeinput="handleInputBeforeInput"
            @input="handleInputEvent"
            @compositionstart="handleInputCompositionStart"
            @compositionend="handleInputCompositionEnd"
          >
            <span
              v-for="(seg, i) in highlightedInputSegments"
              :key="i"
              class="prompt-highlight-segment"
              :class="{ 'is-prompt-tag-slot': seg.isTag }"
              :data-prompt-segment-index="i"
              :data-prompt-segment-start="seg.start"
              :data-prompt-segment-end="seg.end"
              :data-prompt-mention="seg.isTag ? seg.text : undefined"
              :contenteditable="seg.isTag ? 'false' : undefined"
            ><PromptMediaTag v-if="seg.isTag" :text="seg.text" :media="seg.media" /><template v-else>{{ seg.text }}</template></span>
          </div>

          <PromptMentionPopup
            :visible="showMentionPopup"
            :items="filteredAttachmentMentionItems"
            :active-index="mentionActiveIndex"
            :position="mentionPosition"
            @select="selectAttachmentMention"
            @update:active-index="mentionActiveIndex = $event"
          />

          <!-- 工具栏 -->
          <div class="input-toolbar">
            <!-- 左侧功能组 -->
            <div class="toolbar-left">
              <!-- 对话模式选择器 -->
              <div class="mode-selector">
                <button
                  class="toolbar-btn mode-btn"
                  type="button"
                  title="对话模式"
                  aria-label="选择对话模式"
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
                  <span class="toolbar-label">{{ selectedMode?.name || '创意灵感' }}</span>
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

              <!-- Canvas Skill 执行模式：自动调用或每次调用前确认 -->
              <div class="skill-execution-selector">
                <button
                  class="toolbar-btn skill-mode-btn"
                  type="button"
                  aria-label="Skill 调用模式"
                  @click.stop="showSkillExecutionDropdown = !showSkillExecutionDropdown"
                  title="Skill 调用模式"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 3v18M3 12h18M5 5l14 14M19 5L5 19" />
                  </svg>
                  <span class="toolbar-label">{{ skillExecutionMode === 'auto' ? '自动模式' : '手动模式' }}</span>
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
                </button>
                <Transition name="dropdown">
                  <div v-if="showSkillExecutionDropdown" class="mode-dropdown skill-mode-dropdown">
                    <button class="mode-option" :class="{ active: skillExecutionMode === 'manual' }" @click="selectSkillExecutionMode('manual')">
                      <span class="mode-icon">☝</span><span class="mode-name">手动模式</span><small>Agent 在每次生成前询问</small>
                    </button>
                    <button class="mode-option" :class="{ active: skillExecutionMode === 'auto' }" @click="selectSkillExecutionMode('auto')">
                      <span class="mode-icon">⟳</span><span class="mode-name">自动模式</span><small>Agent 完全自动生成</small>
                    </button>
                  </div>
                </Transition>
              </div>

              <!-- 预设选择器 -->
              <div class="preset-selector">
                <button
                  class="toolbar-btn preset-btn"
                  type="button"
                  title="选择预设"
                  aria-label="选择预设"
                  @click.stop="showPresetDropdown = !showPresetDropdown"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                  </svg>
                  <span class="toolbar-label">{{ selectedPreset ? selectedPreset.name : '自定义预设' }}</span>
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
                <button class="toolbar-btn" type="button" @click="showAttachDropdown = !showAttachDropdown" title="添加附件" aria-label="添加附件">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"/>
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
              <button
                class="toolbar-btn icon-btn model-picker-trigger"
                type="button"
                :class="{ active: selectedModelValue }"
                title="选择生图模型"
                aria-label="选择生图模型"
                @click.stop="showModelPicker = true"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 3l2.8 5.7L21 9.6l-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z" />
                </svg>
              </button>
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
                type="button"
                :disabled="!canSend"
                @click="sendMessage"
                title="发送"
                aria-label="发送"
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

  <Teleport to="body">
    <Transition name="model-picker-fade">
      <div v-if="showModelPicker" class="model-picker-overlay" @click.self="showModelPicker = false">
        <section class="model-picker-dialog" role="dialog" aria-modal="true" aria-label="选择模型">
          <header class="model-picker-header">
            <div><h2>选择模型</h2><p>仅显示当前租户与 Skill 允许调用的模型</p></div>
            <button type="button" class="model-picker-close" title="关闭" aria-label="关闭模型选择" @click="showModelPicker = false">×</button>
          </header>
          <div class="model-picker-tabs" role="tablist">
            <button v-for="type in modelPickerTypes" :key="type" type="button" role="tab" :aria-selected="modelPickerType === type" :class="{ active: modelPickerType === type }" @click="modelPickerType = type">{{ modelTypeLabel(type) }}</button>
          </div>
          <div class="model-picker-list">
            <button v-for="model in modelPickerModels" :key="model.value" type="button" class="model-picker-item" :class="{ selected: isAssistantModelSelected(model) }" @click="selectAssistantModel(model)">
              <span class="picker-model-icon"><ModelIcon :icon="getAssistantModelIcon(model)" :label="model.label || model.value" /></span>
              <span class="picker-model-copy"><strong>{{ model.label || model.value }}</strong><small>{{ model.description || '已启用模型' }}</small></span>
              <span v-if="model.pointsCost != null" class="picker-model-cost">{{ formatModelCost(model.pointsCost) }} 积分</span>
              <span class="picker-model-action" :class="{ selected: isAssistantModelSelected(model) }" :aria-label="isAssistantModelSelected(model) ? '已选择' : '选择模型'">
                <svg v-if="isAssistantModelSelected(model)" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </span>
            </button>
            <p v-if="!modelPickerModels.length" class="model-picker-empty">当前没有可选择的{{ modelTypeLabel(modelPickerType) }}。</p>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>

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
import { ref, computed, watch, nextTick, onMounted, onUnmounted, inject } from 'vue'
import { History, MessageSquarePlus, Sparkle, X } from '@lucide/vue'
import AIAssistantMessage from './AIAssistantMessage.vue'
import PromptMentionPopup from './PromptMentionPopup.vue'
import PromptMediaTag from './PromptMediaTag.vue'
import PresetManager from './dialogs/PresetManager.vue'
import CustomPresetDialog from './dialogs/CustomPresetDialog.vue'
import ModelIcon from '../common/ModelIcon.vue'
import {
  getAIAssistantConfig,
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
import {
  buildDirectUrlAttachment,
  getAssistantAttachmentTypeConfig,
  normalizeAssistantAttachmentName,
  shouldFetchAssistantAttachmentUrl
} from '@/utils/aiAssistantAttachments'
import { applyPromptEditorTextInput, getActivePromptMentionRange, getMentionPopupPosition, getPromptMediaTagCaretIndex, getPromptEditorSelectionRange, hasPromptEditorOrphanTextNodes, isPromptEditorSelectionAtMentionBoundary, removePromptEditorOrphanTextNodes, restorePromptEditorSelection, serializePromptEditorContent, shouldDeferPromptEditorBoundaryBeforeInputForIme, snapPromptEditorCaretOutOfMention } from '@/utils/promptMention'
import {
  bindAssistantAttachmentMention,
  buildAssistantMentionItems,
  ensureAssistantAttachmentKey,
  resolveAssistantAttachmentsForSend,
  syncAssistantAttachmentMentions
} from '@/utils/aiAssistantAttachmentMentions'
import { useImageHoverPreview } from '@/composables/useImageHoverPreview'
import { showAlert } from '@/composables/useCanvasDialog'
import { buildPromptSafetyDialog, isPromptSafetyBlockedError } from '@/utils/promptSafetyError'
import { createAgentIdempotencyKey, createAgentRun, decideAgentRun, getSkillCatalog, streamAgentRun } from '@/api/agent'
import { config as tenantConfig, getAvailableImageModels, getAvailableVideoModels, useTenantConfigVersion } from '@/config/tenant'
import { getAssistantModelIcon } from '@/utils/aiAssistantModels'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  canvasContext: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['close', 'width-change', 'start-canvas-pick', 'canvas-writeback'])

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
  stream: { normal: true, deep_think: true },
  models: [],
  points_cost: 1
})

const messages = ref([])
const inputText = ref('')
const inputEditorRenderKey = ref(0)
const isLoading = ref(false)
const currentSessionId = ref(null)
const sessions = ref([])

const selectedModeId = ref('')
const deepThinkEnabled = ref(false)
const webSearchEnabled = ref(false)
const agentSkills = ref([])
const selectedSkillId = ref('')
const pendingAgentApproval = ref(null)
const pendingAgentMessageIndex = ref(-1)
const approvalDeciding = ref(false)
const pendingApprovalActions = computed(() => pendingAgentApproval.value?.approval?.actions || pendingAgentApproval.value?.actions || [])
let agentStreamController = null
const showModelPicker = ref(false)
const modelPickerType = ref('image')
const selectedModelByType = ref({ image: '', video: '' })
const tenantConfigVersion = useTenantConfigVersion()

const showModeDropdown = ref(false)
const showSkillExecutionDropdown = ref(false)
const skillExecutionMode = ref('auto')
const showPresetDropdown = ref(false)
const showHistory = ref(false)

const attachments = ref([])
const isDragging = ref(false)
const isUploading = ref(false) // 上传中状态
const showAttachDropdown = ref(false) // 附件下拉菜单
const attachmentDragIndex = ref(-1)
const attachmentMentionBindings = ref({})
const showMentionPopup = ref(false)
const mentionActiveIndex = ref(0)
const mentionPosition = ref({ top: 0, left: 0 })
const mentionQuery = ref('')
let dragCounter = 0 // 用于跟踪拖拽进入/离开次数
let mentionStartPos = -1
let nextAttachmentLocalId = 0
let isInputComposing = false

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
const { onHoverStart, onVideoHoverStart, onHoverEnd } = useImageHoverPreview()

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
const isCompactMode = computed(() => panelWidth.value < 525)
const isNarrowMode = computed(() => panelWidth.value < 440)

// 计算属性
const selectedMode = computed(() => {
  return config.value.modes?.find(m => m.id === selectedModeId.value)
})

const selectedSkill = computed(() => agentSkills.value.find(skill => skill.id === selectedSkillId.value) || null)
const modelPickerTypes = computed(() => {
  const capabilities = agentSkills.value.flatMap(skill => Array.isArray(skill?.capabilities) ? skill.capabilities : [])
  return ['image', 'video'].filter(type => capabilities.includes(`${type}:generate`))
})
const selectedModelValue = computed(() => selectedModelByType.value[modelPickerType.value] || '')
const modelPickerModels = computed(() => {
  tenantConfigVersion.value
  const configuredModels = modelPickerType.value === 'video' ? tenantConfig.video_models : tenantConfig.image_models
  if (!Array.isArray(configuredModels) || configuredModels.length === 0) return []
  const configuredOrder = new Map(configuredModels.map((item, index) => [String(item?.name || item?.id || ''), index]))
  const models = (modelPickerType.value === 'video' ? getAvailableVideoModels({ disableVeoMerge: true }) : getAvailableImageModels())
    .sort((left, right) => {
      const leftIndex = configuredOrder.get(String(left.value || left.name || left.id)) ?? Number.MAX_SAFE_INTEGER
      const rightIndex = configuredOrder.get(String(right.value || right.name || right.id)) ?? Number.MAX_SAFE_INTEGER
      return leftIndex - rightIndex
    })
  const allowlist = Array.isArray(selectedSkill.value?.model_allowlist) ? selectedSkill.value.model_allowlist : []
  if (!allowlist.length) return models
  return models.filter(model => allowlist.includes(model.value) || allowlist.includes(model.id) || allowlist.includes(model.name))
})
const selectedAssistantModel = computed(() => {
  if (!selectedModelValue.value) return null
  return modelPickerModels.value.find(model => isAssistantModelSelected(model)) || null
})

function modelTypeLabel(type) {
  return type === 'video' ? '视频' : '图片'
}

function formatModelCost(value) {
  if (value && typeof value === 'object') return Object.values(value).join(' / ')
  return Number(value || 0)
}

function selectAssistantModel(model) {
  const selectedValue = model.veoModes?.find(mode => mode.value === model.defaultVeoMode)?.actualModel ||
    model.klingO1Modes?.find(mode => mode.value === model.defaultKlingO1Mode)?.actualModel ||
    model.actualModel || model.value
  selectedModelByType.value = { ...selectedModelByType.value, [modelPickerType.value]: selectedValue }
  showModelPicker.value = false
}

function isAssistantModelSelected(model) {
  const selected = selectedModelValue.value
  if (!selected) return false
  const aliases = [model.value, model.id, model.name, model.actualModel]
  const subModels = [...(model.veoModes || []), ...(model.klingO1Modes || [])]
  return aliases.includes(selected) || subModels.some(item => item?.actualModel === selected)
}

function clearAssistantModel() {
  selectedModelByType.value = { ...selectedModelByType.value, [modelPickerType.value]: '' }
}

const canSend = computed(() => {
  return (inputText.value.trim() || attachments.value.length > 0) && !isLoading.value && !isUploading.value
})

function selectSkillExecutionMode(mode) {
  skillExecutionMode.value = mode === 'manual' ? 'manual' : 'auto'
  showSkillExecutionDropdown.value = false
}

const attachmentMentionItems = computed(() => buildAssistantMentionItems(attachments.value))

const highlightedInputSegments = computed(() => {
  if (!inputText.value) return []
  const segments = []
  const regex = /【?@(图片|视频|音频|文件)\d+】?/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(inputText.value)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: inputText.value.slice(lastIndex, match.index),
        isTag: false,
        start: lastIndex,
        end: match.index
      })
    }
    segments.push({
      text: match[0],
      isTag: true,
      media: getAttachmentForPromptTag(match[0]),
      start: match.index,
      end: regex.lastIndex
    })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < inputText.value.length) {
    segments.push({
      text: inputText.value.slice(lastIndex),
      isTag: false,
      start: lastIndex,
      end: inputText.value.length
    })
  }
  return segments
})

function getAttachmentForPromptTag(text) {
  const match = String(text || '').match(/^【?@(图片|视频|音频|文件)(\d+)】?$/)
  if (!match) return null
  const typeMap = { 图片: 'image', 视频: 'video', 音频: 'audio', 文件: 'file' }
  const type = typeMap[match[1]]
  const index = Number(match[2])
  const item = attachmentMentionItems.value.find(entry => entry.type === type && entry.index === index)
  if (!item) return null
  return {
    ...item,
    thumbnailUrl: item.preview || item.thumbnailUrl || item.thumbnail_url || '',
    url: item.url || item.preview || ''
  }
}

function getInputEditorCaretViewportRect(editor = inputRef.value) {
  if (!editor || typeof window === 'undefined') return null
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer)) return null
  const rect = range.getBoundingClientRect()
  if (rect && Number.isFinite(rect.left) && (rect.width || rect.height)) return rect
  return editor.getBoundingClientRect()
}

function handlePromptTagMousedown(seg, event) {
  event.preventDefault()
  event.stopPropagation()
  const editor = inputRef.value
  if (!editor) return
  const tagSegments = highlightedInputSegments.value.filter(item => item.isTag)
  const segmentIndex = tagSegments.findIndex(item =>
    item === seg ||
    (item.start === seg.start && item.end === seg.end && item.text === seg.text)
  )
  const targetIndex = getPromptMediaTagCaretIndex({
    segments: tagSegments,
    segmentIndex,
    clickX: event.clientX,
    tagRects: Array.from(editor.querySelectorAll('[data-prompt-mention]')).map(el => el.getBoundingClientRect())
  })
  editor.focus()
  nextTick(() => {
    if (editor && Number.isFinite(targetIndex)) {
      restorePromptEditorSelection(editor, targetIndex, targetIndex)
    }
  })
}

const filteredAttachmentMentionItems = computed(() => {
  const query = mentionQuery.value.trim().toLowerCase()
  if (!query) return attachmentMentionItems.value
  return attachmentMentionItems.value.filter(item => {
    return item.label.toLowerCase().includes(query) ||
      String(item.name || '').toLowerCase().includes(query)
  })
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

async function loadAgentSkills() {
  try {
    const catalogResult = await getSkillCatalog()
    agentSkills.value = catalogResult.skills || []
    if (!selectedSkillId.value) selectedSkillId.value = agentSkills.value.find(skill => skill.id === 'builtin-canvas-image-generate')?.id || agentSkills.value[0]?.id || ''
    if (!modelPickerTypes.value.includes(modelPickerType.value)) modelPickerType.value = modelPickerTypes.value[0] || 'image'
  } catch (error) {
    console.warn('[AI-Assistant] 加载 Canvas Skills 失败:', error)
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
  attachmentMentionBindings.value = {}
  showMentionPopup.value = false
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

function normalizeAssistantAttachment(attachment) {
  nextAttachmentLocalId += 1
  return ensureAssistantAttachmentKey(attachment, `attachment-${nextAttachmentLocalId}`)
}

function pushAttachment(attachment) {
  attachments.value.push(normalizeAssistantAttachment(attachment))
  syncCurrentAttachmentMentions()
}

function syncCurrentAttachmentMentions() {
  const result = syncAssistantAttachmentMentions(
    inputText.value,
    attachmentMentionBindings.value,
    attachments.value
  )
  inputText.value = result.text
  attachmentMentionBindings.value = result.bindings
  if (attachments.value.length === 0) {
    showMentionPopup.value = false
  }
}

function showAttachmentMentionPopup() {
  if (attachmentMentionItems.value.length === 0 || !inputRef.value) {
    showMentionPopup.value = false
    return
  }

  const caretRect = getInputEditorCaretViewportRect(inputRef.value)
  mentionPosition.value = getMentionPopupPosition({
    caretRect,
    fallbackRect: inputRef.value.getBoundingClientRect(),
    popupHeight: 260,
    viewportHeight: window.innerHeight
  })
  mentionActiveIndex.value = Math.min(mentionActiveIndex.value, Math.max(filteredAttachmentMentionItems.value.length - 1, 0))
  showMentionPopup.value = filteredAttachmentMentionItems.value.length > 0
}

function updateAttachmentMentionPopup() {
  const editor = inputRef.value
  if (!editor) return

  const { start: cursor } = getPromptEditorSelectionRange(editor)
  const before = inputText.value.slice(0, cursor)
  const atIndex = before.lastIndexOf('@')
  if (atIndex === -1) {
    showMentionPopup.value = false
    return
  }

  const query = before.slice(atIndex + 1)
  if (/\s/.test(query)) {
    showMentionPopup.value = false
    return
  }

  mentionStartPos = atIndex
  mentionQuery.value = query
  mentionActiveIndex.value = 0
  showAttachmentMentionPopup()
}

function handleInputCompositionStart() {
  const editor = inputRef.value
  if (editor) snapPromptEditorCaretOutOfMention(editor)
  isInputComposing = true
}

function handleInputCompositionEnd(event) {
  isInputComposing = false
  handleInputEvent(event)
}

function handleInputBeforeInput(event) {
  if (isInputComposing || event?.isComposing) return
  if (event.inputType !== 'insertText' || typeof event.data !== 'string' || !event.data) return
  if (shouldDeferPromptEditorBoundaryBeforeInputForIme(event)) return
  const editor = event.currentTarget || event.target
  // caret 可能被浏览器收进 mention chip 内部，先 snap 出来再走 mention 边界处理
  snapPromptEditorCaretOutOfMention(editor)
  if (!isPromptEditorSelectionAtMentionBoundary(editor)) return

  const selectionRange = getPromptEditorSelectionRange(editor)
  const currentText = serializePromptEditorContent(editor)
  const next = applyPromptEditorTextInput({
    text: currentText,
    selection: selectionRange,
    data: event.data
  })

  event.preventDefault()
  inputText.value = next.text
  inputEditorRenderKey.value += 1
  showMentionPopup.value = false
  autoResize()
  nextTick(() => {
    const nextEditor = inputRef.value
    if (nextEditor) {
      nextEditor.focus()
      restorePromptEditorSelection(nextEditor, next.cursor, next.cursor)
      autoResize()
    }
  })
}

function handleInputEvent(event) {
  if (isInputComposing || event?.isComposing) return
  const editor = inputRef.value
  if (editor) {
    const selectionRange = getPromptEditorSelectionRange(editor)
    const text = serializePromptEditorContent(editor)
    if (text !== inputText.value) {
      inputText.value = text
    }
    if (hasPromptEditorOrphanTextNodes(editor) ||
      Array.from(editor.childNodes).some(node => node.nodeType === 1 && node.tagName !== 'SPAN')) {
      inputEditorRenderKey.value += 1
      nextTick(() => {
        const nextEditor = inputRef.value
        if (nextEditor) {
          nextEditor.focus()
          restorePromptEditorSelection(nextEditor, selectionRange.start, selectionRange.end)
        }
      })
    } else {
      nextTick(() => {
        removePromptEditorOrphanTextNodes(editor)
        restorePromptEditorSelection(editor, selectionRange.start, selectionRange.end)
      })
    }
  }
  autoResize()
  updateAttachmentMentionPopup()
}

function handleInputKeydown(event) {
  if (showMentionPopup.value && filteredAttachmentMentionItems.value.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      mentionActiveIndex.value = Math.min(filteredAttachmentMentionItems.value.length - 1, mentionActiveIndex.value + 1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      mentionActiveIndex.value = Math.max(0, mentionActiveIndex.value - 1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      selectAttachmentMention(filteredAttachmentMentionItems.value[mentionActiveIndex.value])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      showMentionPopup.value = false
      return
    }
  }

  if ((event.key === 'Backspace' || event.key === 'Delete') && attachmentMentionItems.value.length > 0) {
    const editor = inputRef.value
    const selection = editor ? getPromptEditorSelectionRange(editor) : null
    if (editor && selection && selection.start === selection.end) {
      const cursorPos = selection.start
      const text = inputText.value
      const tagRegex = /【?@(图片|视频|音频|文件)\d+】?/g
      let match
      while ((match = tagRegex.exec(text)) !== null) {
        const tagStart = match.index
        const tagEnd = tagStart + match[0].length
        const shouldDelete = event.key === 'Backspace'
          ? (cursorPos > tagStart && cursorPos <= tagEnd)
          : (cursorPos >= tagStart && cursorPos < tagEnd)
        if (shouldDelete) {
          event.preventDefault()
          showMentionPopup.value = false
          inputText.value = text.slice(0, tagStart) + text.slice(tagEnd)
          nextTick(() => {
            restorePromptEditorSelection(editor, tagStart, tagStart)
            autoResize()
          })
          return
        }
      }
    }
  }

  if (event.key === 'Enter' && event.shiftKey) {
    event.preventDefault()
    insertInputEditorPlainText('\n')
    return
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

function insertInputEditorPlainText(text) {
  const editor = inputRef.value
  if (!editor) return
  const { start, end } = getPromptEditorSelectionRange(editor)
  inputText.value = inputText.value.slice(0, start) + text + inputText.value.slice(end)
  nextTick(() => {
    const nextPos = start + text.length
    restorePromptEditorSelection(editor, nextPos, nextPos)
    autoResize()
  })
}

function insertAttachmentMention(index) {
  const item = attachmentMentionItems.value[index]
  if (!item) return

  const mention = `@${item.label}`
  const editor = inputRef.value
  const scrollPosition = editor
    ? { scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft }
    : null
  const selection = editor ? getPromptEditorSelectionRange(editor) : null
  const start = selection?.start ?? inputText.value.length
  const end = selection?.end ?? start
  const activeMention = start === end ? getActivePromptMentionRange(inputText.value, start) : null
  const replaceStart = activeMention?.start ?? start
  const replaceEnd = activeMention?.end ?? end

  const suffix = inputText.value[replaceEnd] === ' ' ? '' : ' '
  inputText.value = inputText.value.slice(0, replaceStart) + mention + suffix + inputText.value.slice(replaceEnd)
  inputEditorRenderKey.value += 1
  attachmentMentionBindings.value = {
    ...(attachmentMentionBindings.value || {}),
    [item.key]: {
      type: item.type,
      label: item.label
    }
  }
  showMentionPopup.value = false
  mentionQuery.value = ''
  mentionStartPos = -1

  nextTick(() => {
    autoResize()
    if (inputRef.value) {
      removePromptEditorOrphanTextNodes(inputRef.value)
      const nextCursor = replaceStart + mention.length + suffix.length
      restorePromptEditorSelection(inputRef.value, nextCursor, nextCursor)
      inputRef.value.scrollTop = scrollPosition?.scrollTop || 0
      inputRef.value.scrollLeft = scrollPosition?.scrollLeft || 0
    }
  })
}

function selectAttachmentMention(item) {
  if (!item || mentionStartPos < 0) return
  const editor = inputRef.value
  const scrollPosition = editor
    ? { scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft }
    : null
  const result = bindAssistantAttachmentMention({
    text: inputText.value,
    start: mentionStartPos,
    queryLength: mentionQuery.value.length,
    item,
    bindings: attachmentMentionBindings.value
  })

  inputText.value = result.text
  inputEditorRenderKey.value += 1
  attachmentMentionBindings.value = result.bindings
  showMentionPopup.value = false
  mentionQuery.value = ''
  mentionStartPos = -1

  nextTick(() => {
    autoResize()
    if (inputRef.value) {
      removePromptEditorOrphanTextNodes(inputRef.value)
      restorePromptEditorSelection(inputRef.value, result.cursor, result.cursor)
      inputRef.value.scrollTop = scrollPosition?.scrollTop || 0
      inputRef.value.scrollLeft = scrollPosition?.scrollLeft || 0
    }
  })
}

function moveAttachment(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
  const next = [...attachments.value]
  const [item] = next.splice(fromIndex, 1)
  if (!item) return
  next.splice(toIndex, 0, item)
  attachments.value = next
  attachmentDragIndex.value = -1
  syncCurrentAttachmentMentions()
}

function resetAttachmentDragState() {
  attachmentDragIndex.value = -1
  dragCounter = 0
  isDragging.value = false
  window.dispatchEvent(new CustomEvent('canvas-drag-end'))
}

async function sendMessage() {
  if (!canSend.value) return

  syncCurrentAttachmentMentions()
  const messageText = inputText.value.trim()
  const messageAttachments = resolveAssistantAttachmentsForSend({
    text: inputText.value,
    bindings: attachmentMentionBindings.value,
    attachments: attachments.value
  })

  // 清空输入
  inputText.value = ''
  attachments.value = []
  attachmentMentionBindings.value = {}
  showMentionPopup.value = false
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
  let canvasWritebackSent = false
  const applyGeneratedResult = (result) => {
    applyAgentResultToMessage(assistantMessageIndex, result)
    const urls = Array.isArray(result?.result_urls) ? result.result_urls.filter(Boolean) : []
    const workflowId = props.canvasContext?.workflow_id || props.canvasContext?.workflowId
    const nodeId = props.canvasContext?.node_ids?.[0] || props.canvasContext?.node_id || props.canvasContext?.nodeId
    if (!canvasWritebackSent && urls.length) {
      canvasWritebackSent = true
      emit('canvas-writeback', {
        workflow_id: workflowId || null,
        node_id: nodeId || null,
        media_type: result.media_type || 'image',
        result_urls: urls,
        history_id: result.task_id || result.id || null
      })
    }
  }

  let safetyErrorHandled = false
  let safetyAlertPromise = null
  const handlePromptSafetyError = (error) => {
    safetyErrorHandled = true
    const dialog = buildPromptSafetyDialog(error)
    messages.value[assistantMessageIndex].content = dialog.message
    messages.value[assistantMessageIndex].isStreaming = false
    safetyAlertPromise = showAlert(dialog.message, dialog.title, dialog.detail)
    return safetyAlertPromise
  }

  try {
    // 如果有附件（图片或文件），本地临时资源先上传，公网 URL 直接传给后端
    let uploadedAttachments = messageAttachments
      .filter(a => !a.file && a.url)
      .map(a => ({
        key: a.key,
        type: a.type,
        url: a.url,
        name: a.name
      }))

    if (messageAttachments.length > 0) {
      // 筛选出需要上传的文件（有file对象的）
      const filesToUpload = messageAttachments.filter(a => a.file)

      if (filesToUpload.length > 0) {
        try {
          isUploading.value = true
          messages.value[assistantMessageIndex].content = '正在上传附件...'
          console.log(`[AI-Assistant] 开始上传 ${filesToUpload.length} 个附件...`)
          const uploadResults = await uploadAttachments(filesToUpload.map(a => a.file))
          const uploadedByOriginal = uploadResults.map((result, index) => ({
            key: filesToUpload[index].key,
            type: result.type,
            url: result.url,
            name: result.name
          }))

          // 构建上传后的附件列表
          uploadedAttachments = [
            ...uploadedAttachments,
            ...uploadedByOriginal
          ]
          console.log(`[AI-Assistant] 附件上传完成:`, uploadedAttachments)
          messages.value[assistantMessageIndex].content = ''

          // 更新用户消息中的附件 URL 为云端 URL（避免 blob URL 失效）
          const userMsg = messages.value[assistantMessageIndex - 1]
          if (userMsg && userMsg.attachments) {
            for (let i = 0; i < userMsg.attachments.length; i++) {
              const uploaded = uploadedAttachments.find(u => u.key === messageAttachments[i]?.key || u.name === userMsg.attachments[i].name)
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

    // 统一使用流式请求：对用户永远呈现打字机效果。
    // 后端会根据租户配置决定对下游模型请求真流式还是非流式，
    // 若下游模型不支持流式响应，后端会自动将完整内容切片模拟 SSE 流返回给前端，
    // 保证前端体验始终一致。
    await sendMessageStream({
      session_id: currentSessionId.value,
      message: messageText,
      mode_id: selectedModeId.value,
      options: {
        deep_think: deepThinkEnabled.value,
        web_search: webSearchEnabled.value,
        skill_mode: skillExecutionMode.value,
        skill_model: selectedModelValue.value || undefined,
        skill_model_type: selectedModelValue.value ? modelPickerType.value : undefined
      },
      canvas_context: props.canvasContext,
      attachments: uploadedAttachments,
      system_prompt: selectedPreset.value?.systemPrompt,
      onSession: (sessionId) => {
        currentSessionId.value = sessionId
        loadSessions()
      },
      onContent: (chunk, fullContent) => {
        messages.value[assistantMessageIndex].content = fullContent
        throttledScrollToBottom()
      },
      onThinking: (chunk, fullThinking) => {
        messages.value[assistantMessageIndex].thinking = fullThinking
        throttledScrollToBottom()
      },
      onToolEvent: (event) => {
        if (event?.type === 'tool_started') {
          const skillLabel = event.skill_id === 'builtin-canvas-video-generate' ? '生视频' :
            event.skill_id === 'builtin-canvas-image-generate' ? '生图' : '媒体'
          messages.value[assistantMessageIndex].content = `正在调用 Skill${skillLabel}…`
          messages.value[assistantMessageIndex].isStreaming = true
        } else if (event?.type === 'tool_progress') {
          messages.value[assistantMessageIndex].content = '生成任务已提交，正在等待结果…'
        } else if (event?.type === 'tool_completed') {
          applyGeneratedResult(event.result)
        }
        throttledScrollToBottom()
      },
      onDone: (fullContent, result) => {
        messages.value[assistantMessageIndex].isStreaming = false
        if (result?.session_id) {
          currentSessionId.value = result.session_id
        }
        const generated = findGeneratedMediaResult(result?.tool_results)
        if (generated) applyGeneratedResult(generated)
        loadSessions()
      },
      onApproval: (approval) => {
        pendingAgentApproval.value = approval
        pendingAgentMessageIndex.value = assistantMessageIndex
        messages.value[assistantMessageIndex].content = 'MCP 工具调用需要授权'
        messages.value[assistantMessageIndex].isStreaming = false
      },
      onError: (error) => {
        if (isPromptSafetyBlockedError(error)) {
          handlePromptSafetyError(error)
          return
        }
        messages.value[assistantMessageIndex].content = `抱歉，发生了错误: ${error.message}`
        messages.value[assistantMessageIndex].isStreaming = false
      }
    })

  } catch (error) {
    console.error('[AI-Assistant] 发送消息失败:', error)
    if (isPromptSafetyBlockedError(error)) {
      if (safetyErrorHandled) {
        await safetyAlertPromise
      } else {
        await handlePromptSafetyError(error)
      }
      return
    }
    messages.value[assistantMessageIndex].content = `抱歉，发生了错误: ${error.message}`
    messages.value[assistantMessageIndex].isStreaming = false
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

async function sendSkillMessage() {
  const messageText = inputText.value.trim()
  if (!messageText) return
  inputText.value = ''
  autoResize()
  messages.value.push({ role: 'user', content: messageText, timestamp: Date.now() })
  const index = messages.value.length
  messages.value.push({ role: 'assistant', content: '正在准备 Skill 调用…', timestamp: Date.now(), isStreaming: true })
  isLoading.value = true
  try {
    const result = await createAgentRun({
      skill_id: selectedSkillId.value,
      message: messageText,
      canvas_context: props.canvasContext,
      authorization_mode: skillExecutionMode.value === 'manual' ? 'once' : 'auto',
      idempotency_key: createAgentIdempotencyKey('assistant')
    })
    if (result.status === 'approval_required') {
      pendingAgentApproval.value = result
      pendingAgentMessageIndex.value = index
      messages.value[index].content = `需要授权调用 ${pendingApprovalActions.value.map(action => action.capability).join('、')}`
      messages.value[index].isStreaming = false
    } else {
      await watchAgentRun(result.run_id, index)
    }
  } catch (error) {
    messages.value[index].content = `Skill 调用失败: ${error.message}`
    messages.value[index].isStreaming = false
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

function applyAgentResultToMessage(index, result) {
  if (!messages.value[index]) return
  const urls = Array.isArray(result?.result_urls) ? result.result_urls.filter(Boolean) : []
  if (urls.length) {
    const mediaType = ['image', 'video', 'audio'].includes(result?.media_type) ? result.media_type : 'image'
    messages.value[index].attachments = urls.map((url, mediaIndex) => ({
      type: mediaType,
      url,
      name: `${mediaType === 'image' ? '生成图片' : mediaType === 'video' ? '生成视频' : '生成音频'} ${mediaIndex + 1}`
    }))
    messages.value[index].content = mediaType === 'image'
      ? `已生成 ${urls.length} 张图片`
      : `${mediaType === 'video' ? '视频' : '音频'}生成完成`
    return
  }
  messages.value[index].content = result?.content || JSON.stringify(result || {})
}

function findGeneratedMediaResult(results) {
  if (!Array.isArray(results)) return null
  return [...results].reverse().find(result => Array.isArray(result?.result_urls) && result.result_urls.some(Boolean)) || null
}

async function watchAgentRun(runId, index) {
  agentStreamController?.abort()
  agentStreamController = new AbortController()
  let lastEventId = 0
  let terminal = false
  for (let attempt = 0; attempt < 5 && !terminal; attempt += 1) {
    try {
      await streamAgentRun(runId, {
        signal: agentStreamController.signal,
        lastEventId,
        onEvent(event, id) {
        lastEventId = id
        if (!messages.value[index]) return
        if (event.type === 'tool_started') {
          messages.value[index].content = `正在执行 ${event.capability}…`
          messages.value[index].isStreaming = true
        } else if (event.type === 'tool_progress') {
          messages.value[index].content = `任务已提交，正在等待 ${event.capability} 完成…`
        } else if (event.type === 'tool_completed') {
          applyAgentResultToMessage(index, event.result)
        } else if (event.type === 'done') {
          terminal = true
          applyAgentResultToMessage(index, event.result)
          messages.value[index].isStreaming = false
        } else if (event.type === 'error') {
          terminal = true
          messages.value[index].content = `Skill 调用失败: ${event.error}`
          messages.value[index].isStreaming = false
        }
        scrollToBottom()
        }
      })
    } catch (error) {
      if (agentStreamController.signal.aborted || attempt === 4) throw error
    }
    if (!terminal && attempt < 4) await new Promise(resolve => setTimeout(resolve, 400))
  }
}

async function decideSkillRun(decision) {
  const approval = pendingAgentApproval.value
  if (!approval?.run_id) return
  const index = pendingAgentMessageIndex.value
  isLoading.value = true
  approvalDeciding.value = true
  try {
    const result = await decideAgentRun(approval.run_id, {
      decision,
      approval_id: approval.approval?.approval_id || approval.approval_id,
      idempotency_key: createAgentIdempotencyKey('decision')
    })
    pendingAgentApproval.value = null
    pendingAgentMessageIndex.value = -1
    if (decision === 'deny') {
      if (messages.value[index]) messages.value[index].content = '已拒绝本次 Skill 调用'
    } else {
      await watchAgentRun(result.run_id || approval.run_id, index)
    }
  } catch (error) {
    if (messages.value[index]) messages.value[index].content = `授权处理失败: ${error.message}`
  } finally {
    pendingAgentApproval.value = null
    pendingAgentMessageIndex.value = -1
    approvalDeciding.value = false
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
  syncCurrentAttachmentMentions()
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
      pushAttachment({
        type: 'image',
        name: file.name,
        file: file,
        fileType: fileType,
        ext: ext,
        preview: URL.createObjectURL(file)
      })
    } else if (fileType === 'video') {
      // 视频类型 - 生成 blob URL 用于缩略图预览
      pushAttachment({
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
      pushAttachment({
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
      pushAttachment({
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
    loadAgentSkills()
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
  if (showSkillExecutionDropdown.value && !event.target.closest('.skill-execution-selector')) {
    showSkillExecutionDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  if (props.visible) {
    loadConfig()
    loadAgentSkills()
    loadSessions()
    loadUserPresets()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  agentStreamController?.abort()
})

/**
 * 从 URL 添加附件到灵感助手（供外部调用）
 * @param {string} url - 文件 URL
 * @param {string} type - 文件类型: 'image' | 'video' | 'audio'
 * @param {string} [name] - 文件名（可选）
 */
async function addAttachmentFromUrl(url, type, name) {
  if (!url) return

  const config = getAssistantAttachmentTypeConfig(type)
  const fileName = normalizeAssistantAttachmentName({ url, type, name })

  try {
    if (!shouldFetchAssistantAttachmentUrl(url)) {
      let directUrl = url
      if (url.startsWith('/api/') || url.startsWith('/storage/') || url.startsWith('/uploads/')) {
        const { getApiUrl } = await import('@/config/tenant')
        directUrl = getApiUrl(url)
      }
      pushAttachment(buildDirectUrlAttachment({ url: directUrl, type, name: fileName }))
      await nextTick()
      inputRef.value?.focus()
      return
    }

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
    
    // 强制使用传入的 type 对应的 MIME type，而不是依赖服务器返回的 Content-Type
    // 因为服务器可能返回错误的 Content-Type（比如音频文件返回 image/jpeg）
    const file = new File([blob], fileName, { type: config.mime })
    
    console.log(`[AI-Assistant] 从 URL 添加附件: type=${type}, fileName=${fileName}, blob.type=${blob.type}, 使用 MIME=${config.mime}`)

    if (type === 'image') {
      pushAttachment({
        type: 'image',
        name: fileName,
        file,
        fileType: 'image',
        ext: fileName.split('.').pop(),
        preview: URL.createObjectURL(file)
      })
    } else if (type === 'video') {
      pushAttachment({
        type: 'video',
        name: fileName,
        file,
        fileType: 'video',
        ext: fileName.split('.').pop(),
        size: file.size,
        preview: URL.createObjectURL(file)
      })
    } else if (type === 'audio') {
      pushAttachment({
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
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--canvas-bg-secondary);
  border-left: 1px solid var(--canvas-border-subtle);
  pointer-events: auto;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 12px 0 0 12px;
  overflow: visible; /* 允许下拉菜单溢出显示 */
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.2);
}

/* 头部 - 毛玻璃设计 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--canvas-border-subtle);
  background: linear-gradient(135deg,
    rgba(28, 30, 38, 0.85) 0%,
    rgba(24, 26, 34, 0.9) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 12px 0 0 0; /* 保持左上角圆角 */
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
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--canvas-text-secondary);
  transition: all 0.2s;
}

.header-btn:hover {
  background: var(--canvas-bg-tertiary);
  color: var(--canvas-text-primary);
}

.close-btn:hover {
  background: var(--canvas-bg-tertiary);
  color: var(--canvas-text-primary);
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

.attachment-item[draggable="true"] {
  cursor: grab;
}

.attachment-item[draggable="true"]:active {
  cursor: grabbing;
}

.attachment-mention-label {
  position: absolute;
  left: 6px;
  bottom: 6px;
  max-width: calc(100% - 12px);
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.62);
  color: #e5e7eb;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.attachment-thumb-wrapper {
  width: 72px;
  height: 72px;
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
  overflow: visible;
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
  position: relative;
  box-sizing: border-box;
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
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
  outline: none;
  transition: all 0.3s ease;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

.input-textarea.is-empty::before {
  content: attr(data-placeholder);
  position: absolute;
  top: 12px;
  left: 16px;
  right: 16px;
  color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
  white-space: pre-wrap;
}

.selected-model-tag {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  max-width: 100%;
  margin-bottom: -4px;
  padding: 5px 7px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  line-height: 1;
}

.selected-model-tag-icon {
  display: grid;
  width: 14px;
  height: 14px;
  place-items: center;
  flex-shrink: 0;
}

.selected-model-tag-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-model-tag-remove {
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.56);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.selected-model-tag-remove:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.prompt-highlight-segment.is-prompt-tag-slot {
  display: inline-flex;
  align-items: center;
  vertical-align: baseline;
  box-sizing: border-box;
  user-select: all;
  -webkit-user-select: all;
}

.prompt-highlight-segment.is-prompt-tag-slot :deep(.prompt-media-tag-chip) {
  flex-shrink: 0;
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

.assistant-skill-selector {
  max-width: 154px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
}

.agent-approval-bar {
  display: grid;
  gap: 8px;
  margin: 0 14px 8px;
  padding: 10px;
  border: 1px solid rgba(245, 180, 72, 0.3);
  border-radius: 8px;
  background: rgba(245, 180, 72, 0.1);
  color: rgba(255, 236, 199, 0.92);
  font-size: 12px;
}

.agent-approval-bar div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.agent-approval-bar button {
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
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

.toolbar-label { display: none; max-width: 72px; }

.model-picker-trigger { margin-left: 2px; }

.model-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 9100;
  display: block;
  background: transparent;
}

.model-picker-dialog {
  position: absolute;
  right: clamp(12px, 2vw, 28px);
  bottom: 88px;
  width: min(430px, calc(100vw - 24px));
  max-height: min(520px, calc(100vh - 112px));
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(21, 25, 35, 0.98);
  color: #eef2f7;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.03);
  transform-origin: bottom right;
}

.model-picker-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 15px 16px 10px; }
.model-picker-header h2 { margin: 0; font-size: 17px; }
.model-picker-header p { margin: 5px 0 0; color: #8f9bad; font-size: 11px; }
.model-picker-close { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: #9ca8b8; font-size: 22px; line-height: 1; cursor: pointer; }
.model-picker-close:hover { background: rgba(255,255,255,.08); color: #fff; }
.model-picker-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; margin: 0 16px 10px; padding: 3px; border: 1px solid rgba(255,255,255,.08); border-radius: 9px; background: rgba(255,255,255,.04); }
.model-picker-tabs button { padding: 7px 12px; border: 0; border-radius: 7px; background: transparent; color: #8f9bad; font-size: 12px; cursor: pointer; }
.model-picker-tabs button.active { background: rgba(111, 93, 252, .24); color: #e4e0ff; box-shadow: 0 2px 8px rgba(0,0,0,.16); }
.model-picker-list { display: grid; gap: 6px; max-height: 360px; overflow: auto; padding: 2px 12px 14px; }
.model-picker-item { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto 28px; align-items: center; gap: 9px; padding: 9px 10px; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(27, 32, 44, .94); color: inherit; text-align: left; cursor: pointer; }
.model-picker-item:hover, .model-picker-item.selected { border-color: #7668e8; background: #24233e; }
.picker-model-icon { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 8px; background: #30374a; color: #d9d5ff; font-weight: 700; }
.picker-model-copy { display: grid; min-width: 0; gap: 3px; }
.picker-model-copy strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.picker-model-copy small { overflow: hidden; color: #8f9bad; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.picker-model-cost { color: #aeb7c8; font-size: 11px; white-space: nowrap; }
.picker-model-action { display: grid; width: 26px; height: 26px; place-items: center; border: 1px solid rgba(255,255,255,.14); border-radius: 50%; color: #aeb7c8; }
.picker-model-action svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.picker-model-action.selected { border-color: #9b8cff; background: #7668e8; color: #fff; }
.model-picker-empty { margin: 20px 0; color: #8f9bad; font-size: 12px; text-align: center; }
.model-picker-fade-enter-active, .model-picker-fade-leave-active { transition: opacity .18s ease; }
.model-picker-fade-enter-active .model-picker-dialog, .model-picker-fade-leave-active .model-picker-dialog { transition: transform .18s ease, opacity .18s ease; }
.model-picker-fade-enter-from, .model-picker-fade-leave-to { opacity: 0; }
.model-picker-fade-enter-from .model-picker-dialog, .model-picker-fade-leave-to .model-picker-dialog { opacity: 0; transform: translateY(10px) scale(.98); }

@media (max-width: 500px) {
  .model-picker-dialog { right: 10px; bottom: 76px; width: calc(100vw - 20px); max-height: calc(100vh - 96px); }
  .model-picker-list { max-height: min(330px, calc(100vh - 220px)); }
  .picker-model-cost { display: none; }
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

.ai-assistant-container.narrow-mode .toolbar-btn span {
  display: none;
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
  background: var(--canvas-bg-secondary) !important;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-left: 1px solid var(--canvas-border-subtle);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .ai-assistant-panel .panel-header {
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.8) 0%,
    rgba(250, 250, 252, 0.85) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom-color: var(--canvas-border-subtle);
}

:root.canvas-theme-light .ai-assistant-panel .header-icon {
  background: linear-gradient(135deg,
    rgba(139, 92, 246, 0.15) 0%,
    rgba(99, 102, 241, 0.1) 100%
  );
  border: 1px solid rgba(139, 92, 246, 0.15);
}

:root.canvas-theme-light .ai-assistant-panel .header-title {
  color: var(--canvas-text-primary);
}

:root.canvas-theme-light .ai-assistant-panel .header-btn {
  color: var(--canvas-text-secondary);
}

:root.canvas-theme-light .ai-assistant-panel .header-btn:hover {
  background: var(--canvas-bg-tertiary);
  color: var(--canvas-text-primary);
}

:root.canvas-theme-light .ai-assistant-panel .close-btn:hover {
  background: var(--canvas-bg-tertiary);
  color: var(--canvas-text-primary);
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

:root.canvas-theme-light .ai-assistant-panel .input-textarea.is-empty::before {
  color: rgba(0, 0, 0, 0.35);
}

:root.canvas-theme-light .ai-assistant-panel .selected-model-tag {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(15, 23, 42, 0.05);
  color: #1c1917;
}

:root.canvas-theme-light .ai-assistant-panel .selected-model-tag-remove {
  color: rgba(15, 23, 42, 0.45);
}

:root.canvas-theme-light .ai-assistant-panel .selected-model-tag-remove:hover {
  background: rgba(15, 23, 42, 0.08);
  color: #1c1917;
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

:root.canvas-theme-light .ai-assistant-panel .history-close {
  color: #78716c;
}

:root.canvas-theme-light .ai-assistant-panel .history-close:hover {
  color: #292524;
}

:root.canvas-theme-light .ai-assistant-panel .history-item {
  color: #57534e;
}

:root.canvas-theme-light .ai-assistant-panel .history-item__title {
  color: #292524;
}

:root.canvas-theme-light .ai-assistant-panel .history-item__preview {
  color: #78716c;
}

:root.canvas-theme-light .ai-assistant-panel .history-item__delete {
  color: #a8a29e;
}

:root.canvas-theme-light .ai-assistant-panel .history-item__delete:hover {
  color: #dc2626;
}

:root.canvas-theme-light .ai-assistant-panel .history-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

:root.canvas-theme-light .ai-assistant-panel .history-item.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

:root.canvas-theme-light .ai-assistant-panel .history-item.active .history-item__title {
  color: #1d4ed8;
}

:root.canvas-theme-light .ai-assistant-panel .history-item.active .history-item__preview {
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

/* 模型选择面板 - 白昼模式 */
:root.canvas-theme-light .model-picker-dialog {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(255, 255, 255, 0.98);
  color: #1c1917;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.03);
}

:root.canvas-theme-light .model-picker-header p,
:root.canvas-theme-light .picker-model-copy small,
:root.canvas-theme-light .model-picker-empty {
  color: #78716c;
}

:root.canvas-theme-light .model-picker-close {
  color: #78716c;
}

:root.canvas-theme-light .model-picker-close:hover {
  background: rgba(15, 23, 42, 0.06);
  color: #1c1917;
}

:root.canvas-theme-light .model-picker-tabs {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(15, 23, 42, 0.04);
}

:root.canvas-theme-light .model-picker-tabs button {
  color: #78716c;
}

:root.canvas-theme-light .model-picker-tabs button.active {
  background: #ede9fe;
  color: #6d28d9;
  box-shadow: 0 2px 8px rgba(109, 40, 217, 0.12);
}

:root.canvas-theme-light .model-picker-item {
  border-color: rgba(15, 23, 42, 0.1);
  background: #f8fafc;
}

:root.canvas-theme-light .model-picker-item:hover,
:root.canvas-theme-light .model-picker-item.selected {
  border-color: #8b5cf6;
  background: #f5f3ff;
}

:root.canvas-theme-light .picker-model-icon {
  background: #ede9fe;
  color: #6d28d9;
}

:root.canvas-theme-light .picker-model-cost {
  color: #78716c;
}

:root.canvas-theme-light .picker-model-action {
  border-color: rgba(15, 23, 42, 0.14);
  color: #78716c;
}

:root.canvas-theme-light .picker-model-action.selected {
  border-color: #8b5cf6;
  background: #8b5cf6;
  color: #fff;
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
