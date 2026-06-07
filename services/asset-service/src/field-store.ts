import fs from 'fs'
import path from 'path'

export type WorkOrderStatus = 'pending_review' | 'approved' | 'dispatched' | 'completed' | 'rejected'
export type WorkOrderPriority = 'normal' | 'urgent'
export type InspectionTaskStatus = 'pending' | 'completed'

export interface FieldWorkOrder {
  id: string
  order_no: string
  base_name: string
  pool_code: string
  device_name: string
  action_type: string
  action_label: string
  priority: WorkOrderPriority
  reason: string
  note: string
  status: WorkOrderStatus
  requested_by: string
  requested_by_role: string
  created_at: number
  updated_at: number
  reviewed_by?: string
  review_note?: string
  completed_by?: string
  completion_note?: string
  completed_at?: number
}

export interface InspectionTask {
  id: string
  task_no: string
  base_name: string
  pool_code: string
  title: string
  due_time: string
  assignee: string
  status: InspectionTaskStatus
  checklist: string[]
  result_note?: string
  updated_at: number
}

interface FieldData {
  work_orders: FieldWorkOrder[]
  inspection_tasks: InspectionTask[]
}

interface Actor {
  username: string
  role: string
}

interface WorkOrderInput {
  base_name?: string
  pool_code?: string
  device_name?: string
  action_type?: string
  action_label?: string
  priority?: WorkOrderPriority
  reason?: string
  note?: string
  confirm_text?: string
}

const DATA_PATH = process.env.FIELD_DATA_PATH ||
  path.resolve(process.cwd(), '..', '..', '.local', 'field-ops-data.json')

export class FieldStore {
  private data: FieldData

  constructor() {
    this.data = this.load()
  }

  listWorkOrders(baseNames: string[]): FieldWorkOrder[] {
    return this.data.work_orders
      .filter(order => baseNames.includes(order.base_name))
      .sort((a, b) => b.created_at - a.created_at)
  }

  getWorkOrder(id: string): FieldWorkOrder | undefined {
    return this.findWorkOrder(id)
  }

  createWorkOrder(input: WorkOrderInput, actor: Actor): FieldWorkOrder {
    const priority = input.priority || 'normal'
    const baseName = cleanString(input.base_name)
    const poolCode = cleanString(input.pool_code).toUpperCase()
    const deviceName = cleanString(input.device_name)
    const actionType = cleanString(input.action_type)
    const actionLabel = cleanString(input.action_label) || actionType
    const reason = cleanString(input.reason)

    if (!baseName) throw new Error('base_name is required')
    if (!poolCode) throw new Error('pool_code is required')
    if (!deviceName) throw new Error('device_name is required')
    if (!actionType) throw new Error('action_type is required')
    if (reason.length < 4) throw new Error('reason is required')
    const confirmText = cleanString(input.confirm_text)
    if (priority === 'urgent' && confirmText !== '现场确认' && confirmText !== 'CONFIRM') {
      throw new Error('urgent work order requires confirm_text=现场确认')
    }

    const now = Date.now()
    const status: WorkOrderStatus = priority === 'urgent' ? 'pending_review' : 'dispatched'
    const order: FieldWorkOrder = {
      id: makeId('wo'),
      order_no: `WO-${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      base_name: baseName,
      pool_code: poolCode,
      device_name: deviceName,
      action_type: actionType,
      action_label: actionLabel,
      priority,
      reason,
      note: cleanString(input.note),
      status,
      requested_by: actor.username,
      requested_by_role: actor.role,
      created_at: now,
      updated_at: now,
      review_note: status === 'dispatched' ? '普通操作已自动下发，完成后需回填结果。' : '应急操作已进入主管复核队列。',
    }

    this.data.work_orders.unshift(order)
    this.save()
    return order
  }

  reviewWorkOrder(id: string, status: 'approved' | 'rejected', actor: Actor, note?: string): FieldWorkOrder {
    const order = this.findWorkOrder(id)
    if (!order) throw new Error('work order not found')
    if (order.status !== 'pending_review') throw new Error('work order is not pending review')

    order.status = status
    order.reviewed_by = actor.username
    order.review_note = cleanString(note) || (status === 'approved' ? '复核通过，等待现场执行。' : '复核驳回。')
    order.updated_at = Date.now()
    this.save()
    return order
  }

  completeWorkOrder(id: string, actor: Actor, note?: string): FieldWorkOrder {
    const order = this.findWorkOrder(id)
    if (!order) throw new Error('work order not found')
    if (!['approved', 'dispatched'].includes(order.status)) {
      throw new Error('work order cannot be completed in current status')
    }

    order.status = 'completed'
    order.completed_by = actor.username
    order.completion_note = cleanString(note) || '现场已完成，设备状态待下一轮巡检复核。'
    order.completed_at = Date.now()
    order.updated_at = order.completed_at
    this.save()
    return order
  }

  listTasks(baseNames: string[]): InspectionTask[] {
    return this.data.inspection_tasks
      .filter(task => baseNames.includes(task.base_name))
      .sort((a, b) => a.due_time.localeCompare(b.due_time))
  }

  getTask(id: string): InspectionTask | undefined {
    return this.data.inspection_tasks.find(item => item.id === id || item.task_no === id)
  }

  completeTask(id: string, actor: Actor, note?: string): InspectionTask {
    const task = this.data.inspection_tasks.find(item => item.id === id || item.task_no === id)
    if (!task) throw new Error('inspection task not found')

    task.status = 'completed'
    task.assignee = actor.username
    task.result_note = cleanString(note) || '现场巡检完成，未见新增异常。'
    task.updated_at = Date.now()
    this.save()
    return task
  }

  private findWorkOrder(id: string): FieldWorkOrder | undefined {
    return this.data.work_orders.find(order => order.id === id || order.order_no === id)
  }

  private load(): FieldData {
    if (!fs.existsSync(DATA_PATH)) {
      const seed = seedData()
      this.write(seed)
      return seed
    }

    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf-8')
      return JSON.parse(raw) as FieldData
    } catch {
      const seed = seedData()
      this.write(seed)
      return seed
    }
  }

  private save(): void {
    this.write(this.data)
  }

  private write(data: FieldData): void {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true })
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
  }
}

function seedData(): FieldData {
  const now = Date.now()
  return {
    work_orders: [
      seedOrder('A基地', 'P02', '增氧机 #02', 'freq_up', '增氧频率 +15%', 'urgent', 'DO 连续 20 分钟低于班组关注线', 'pending_review', 'operator', now - 18 * 60_000),
      seedOrder('A基地', 'P01', '投喂器 #01', 'stop_feed', '停止投喂', 'normal', '巡检发现残饵偏多，先暂停一轮投喂', 'dispatched', 'operator', now - 42 * 60_000),
      seedOrder('B基地', 'P04', '增氧机 #01', 'full_aeration', '全负荷增氧', 'urgent', '水温和 DO 同时越过预警线', 'approved', 'manager', now - 70 * 60_000),
    ],
    inspection_tasks: [
      seedTask('A基地', 'P01', '核对增氧机电流和叶轮声音', '10:30', '王涵哲', ['拍摄电流表', '记录叶轮声音', '检查电缆接头']),
      seedTask('A基地', 'P02', '复测 DO 并检查底部残饵', '11:00', '王涵哲', ['手持 DO 复测', '观察残饵', '拍照上传']),
      seedTask('B基地', 'P04', '复核高温池遮阳和循环泵状态', '11:20', '陈鹏翔', ['检查遮阳网', '确认循环泵电流', '记录水温']),
    ],
  }
}

function seedOrder(
  baseName: string,
  poolCode: string,
  deviceName: string,
  actionType: string,
  actionLabel: string,
  priority: WorkOrderPriority,
  reason: string,
  status: WorkOrderStatus,
  requestedBy: string,
  createdAt: number,
): FieldWorkOrder {
  return {
    id: makeId('wo'),
    order_no: `WO-${poolCode}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    base_name: baseName,
    pool_code: poolCode,
    device_name: deviceName,
    action_type: actionType,
    action_label: actionLabel,
    priority,
    reason,
    note: '初始化现场工单',
    status,
    requested_by: requestedBy,
    requested_by_role: requestedBy === 'operator' ? 'operator' : 'manager',
    created_at: createdAt,
    updated_at: createdAt,
    review_note: status === 'pending_review' ? '等待主管复核' : '已进入现场处理流程',
  }
}

function seedTask(baseName: string, poolCode: string, title: string, dueTime: string, assignee: string, checklist: string[]): InspectionTask {
  return {
    id: makeId('task'),
    task_no: `TASK-${poolCode}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    base_name: baseName,
    pool_code: poolCode,
    title,
    due_time: dueTime,
    assignee,
    status: 'pending',
    checklist,
    updated_at: Date.now(),
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
