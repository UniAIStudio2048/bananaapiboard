/**
 * 多选批量连线（框选 ≥2 个节点后从选框右侧 + 号拖出的连线）辅助函数。
 * 与单源 "+" 拖拽连线行为保持一致：不做节点类型校验，由 addEdge 负责去重。
 */

/**
 * 计算多选批量连线中需要补连的"额外源节点"ID 列表。
 *
 * 规则：
 * - 主源节点（发起拖拽的节点）由调用方单独连线，这里跳过
 * - 跳过目标节点自身、编组节点、画布上不存在的节点与重复 ID
 * - cellLevelTarget 为 true（Storyboard 格子级输入）时返回空数组：
 *   同一格子只允许一条入边，多条会互相覆盖
 *
 * @param {Object} params
 * @param {Array<String>} params.sourceIds - 本次批量连线涉及的全部源节点 ID
 * @param {String} params.primarySourceId - 发起拖拽的主源节点 ID
 * @param {Array<Object>} params.nodes - 画布节点列表
 * @param {Object|null} params.targetNode - 目标节点
 * @param {Boolean} [params.cellLevelTarget=false] - 目标是否为格子级输入（input-N）
 * @returns {Array<String>} 需要补连的源节点 ID
 */
export function resolveMultiConnectExtraSourceIds({
  sourceIds,
  primarySourceId,
  nodes = [],
  targetNode = null,
  cellLevelTarget = false
}) {
  if (cellLevelTarget) return []
  if (!Array.isArray(sourceIds) || !targetNode?.id) return []

  const targetId = targetNode.id
  const seen = new Set()
  const extraIds = []

  for (const id of sourceIds) {
    if (!id || id === targetId || id === primarySourceId || seen.has(id)) continue
    seen.add(id)
    const sourceNode = nodes.find(node => node?.id === id)
    if (!sourceNode || sourceNode.type === 'group') continue
    extraIds.push(id)
  }

  return extraIds
}
