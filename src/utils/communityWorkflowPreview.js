/**
 * communityWorkflowPreview.js
 * 社区作品 / 模板 / 项目工作流的只读预览节点归一化工具。
 *
 * 解决历史快照里 group 编组节点不显示 / 显示不正确的问题：
 * - 旧快照 group 节点的尺寸放在顶层 dimensions（或顶层 width/height），
 *   且 data 缺失 groupName，仅有 title/label，导致 GroupNode.vue 渲染成默认 400x300 极淡框。
 * - 旧快照 group 的 style.zIndex 是 -1000（与正式画布全局规则一致），在预览里被遮挡看不到。
 *
 * 本工具只负责"读"出可视层级，不修改后端，不影响正式画布 CanvasBoard 的拖动/层级逻辑。
 */

const PREVIEW_FLAGS = {
  draggable: false,
  selectable: true,
  connectable: false
}

function isGroupNode(node) {
  return node && node.type === 'group'
}

function pickGroupSize(node) {
  const dim = node.dimensions || {}
  const dataDim = node.data || {}
  const width =
    Number(dataDim.width) ||
    Number(dim.width) ||
    Number(node.width) ||
    undefined
  const height =
    Number(dataDim.height) ||
    Number(dim.height) ||
    Number(node.height) ||
    undefined
  return { width, height }
}

function pickGroupName(data = {}) {
  return data.groupName || data.title || data.label || '编组'
}

function normalizeGroupNode(node) {
  const { width, height } = pickGroupSize(node)
  const data = node.data || {}
  const nextData = {
    ...data,
    readonly: true,
    groupName: pickGroupName(data)
  }
  if (width != null) nextData.width = width
  if (height != null) nextData.height = height

  return {
    ...node,
    ...PREVIEW_FLAGS,
    data: nextData,
    zIndex: 0,
    style: { ...(node.style || {}), zIndex: 0 }
  }
}

function normalizePlainNode(node) {
  const data = node.data || {}
  return {
    ...node,
    ...PREVIEW_FLAGS,
    data: { ...data, readonly: true },
    zIndex: 1,
    style: { ...(node.style || {}), zIndex: 1 }
  }
}

export function normalizeCommunityWorkflowPreviewNodes(rawNodes) {
  if (!Array.isArray(rawNodes)) return []
  return rawNodes.map((n) => (isGroupNode(n) ? normalizeGroupNode(n) : normalizePlainNode(n)))
}

export default normalizeCommunityWorkflowPreviewNodes
