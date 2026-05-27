/**
 * VirtualizedNode - 画布节点虚拟化 HOC（高阶组件）
 *
 * 将真实节点组件（如 ImageNode / TextNode / VideoNode）包装为
 * 一个支持"视口外卸载、视口内挂载"的代理组件。
 *
 * 使用：
 *   const nodeTypes = {
 *     'text-input': createVirtualizedNodeType(TextNode),
 *     'image': createVirtualizedNodeType(ImageNode),
 *     // ...
 *   }
 *
 * 行为：
 *   - 通过 inject('canvasVirtualization') 拿到虚拟化控制器
 *   - 控制器告知该节点 ID 是否在 shellIds 集合中
 *   - 若在集合中且未选中 → 渲染 NodeShell 轻骨架（真组件完全卸载）
 *   - 否则渲染 RealComponent，所有 props / attrs / slots 完整透传
 *
 * 设计要点：
 *   - inheritAttrs: false，render 函数手动透传，避免外层产生额外 DOM
 *   - shell ↔ real 切换通过 v-if 风格（h 函数返回不同 vnode），让 Vue 真正卸载/挂载
 *   - 选中节点永远走真组件（与 CanvasBoard.performance.test.mjs 契约一致）
 *   - 编组节点（group）也永远走真组件，避免成员节点失去视觉容器
 */
import { defineComponent, h, inject, computed } from 'vue'
import NodeShell from './NodeShell.vue'

// Vue Flow 传给自定义节点的标准 props 列表
// 来源：@vue-flow/core/src/types/node.ts NodeProps
const VUE_FLOW_NODE_PROPS = [
  'id',
  'type',
  'data',
  'events',
  'selected',
  'dragging',
  'connectable',
  'position',
  'zIndex',
  'targetPosition',
  'sourcePosition',
  'label',
  'dimensions',
  'isValidTargetPos',
  'isValidSourcePos',
  'parent',
  'parentNode',
  'dragHandle',
  'resizing'
]

const VUE_FLOW_NODE_PROPS_SCHEMA = VUE_FLOW_NODE_PROPS.reduce((acc, key) => {
  acc[key] = { default: undefined }
  return acc
}, {})

/**
 * 创建虚拟化包装组件
 * @param {object} RealComponent 真实节点组件
 * @param {object} [options]
 * @param {boolean} [options.alwaysReal=false] 强制始终渲染真组件（如 group 节点）
 * @returns {object} Vue 组件定义
 */
export function createVirtualizedNodeType(RealComponent, options = {}) {
  if (!RealComponent) {
    throw new Error('[VirtualizedNode] RealComponent 不能为空')
  }
  const { alwaysReal = false } = options
  const componentName = RealComponent.name
    || RealComponent.__name
    || 'Node'

  return defineComponent({
    name: `Virtualized${componentName}`,
    inheritAttrs: false,
    props: VUE_FLOW_NODE_PROPS_SCHEMA,
    setup(props, { attrs, slots }) {
      const virtualization = inject('canvasVirtualization', null)

      const isShell = computed(() => {
        if (alwaysReal) return false
        if (!virtualization) return false
        // 选中、拖拽中的节点永远走真组件
        if (props.selected === true) return false
        if (props.dragging === true) return false
        return virtualization.shellIds.value.has(props.id)
      })

      return () => {
        // 收集所有要透传的 prop（既包含声明 prop 也包含 attrs）
        const passthrough = { ...attrs }
        for (const key of VUE_FLOW_NODE_PROPS) {
          const v = props[key]
          if (v !== undefined) passthrough[key] = v
        }

        if (isShell.value) {
          return h(NodeShell, {
            id: passthrough.id,
            data: passthrough.data,
            type: passthrough.type,
            selected: passthrough.selected === true
          })
        }

        return h(RealComponent, passthrough, slots)
      }
    }
  })
}

export default createVirtualizedNodeType
