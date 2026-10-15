/* ==========================================================================
 * data.js —— 演示用 MOCK 数据（现场赛演示用途，非真实业务数据）
 * 所有数据均可在界面上「重置演示数据」恢复
 * 日期口径：2026-10-15 周四 / 16 周五 / 19 周一 / 20 周二 / 21 周三 / 22 周四 / 23 周五 / 26 周一
 * ========================================================================== */

globalThis.SEED = {
  meta: {
    demoDate: '2026-10-15', // 演示时点，可在侧边栏修改以触发到期提醒规则
    mock: true,
    currentRole: 'PM',      // 当前使用人角色：PM 产品经理 / DEV 开发 / QA 测试 / MGR 管理者
    systemName: '需求拆解与排期闭环（演示）'
  },

  // 部门目标（需求挂靠目标，验收后回溯目标达成度）
  goals: [
    {
      id: 'g1', code: 'G-2026Q4-01', name: '信用卡还款体验提升',
      owner: 'm1', target: 85, metric: '挂靠需求验收达成度平均',
      desc: 'MOCK 部门目标：2026 Q4 通过还款链路改造，使还款相关需求验收达成度平均不低于 85 分。',
      reqIds: ['r1', 'r2', 'r3']
    }
  ],

  // 关联系统（所有涉及系统均为可配置清单，不真实对接）
  systems: [
    { id: 's_core', code: 'CORE', name: '核心系统' },
    { id: 's_chn', code: 'CHN', name: '渠道系统' },
    { id: 's_pay', code: 'PAY', name: '支付网关' },
    { id: 's_data', code: 'DATA', name: '数据平台' }
  ],

  // 人员（PM=产品经理 / DEV=开发 / QA=测试 / MGR=管理者）
  people: [
    { id: 'p1', name: '张明', role: 'PM', title: '产品经理' },
    { id: 'p2', name: '李伟', role: 'DEV', title: '后端开发' },
    { id: 'p3', name: '王芳', role: 'DEV', title: '前端开发' },
    { id: 'p4', name: '刘洋', role: 'DEV', title: '后端开发' },
    { id: 'p6', name: '赵磊', role: 'DEV', title: '数据开发' },
    { id: 'p5', name: '陈静', role: 'QA', title: '测试工程师' },
    { id: 'p8', name: '周婷', role: 'QA', title: '测试工程师' },
    { id: 'p7', name: '孙倩', role: 'PM', title: '产品经理' },
    { id: 'm1', name: '王总', role: 'MGR', title: '部门负责人' }
  ],

  // 需求（order = 队列位置，数值越小越靠前；fpVersion = 功能点基准版本）
  requirements: [
    {
      id: 'r3', code: 'XQ20260120077', title: '账单分期提前结清',
      priority: 'P0', stage: '开发', order: 1, source: '信用卡中心', createdAt: '2026-10-09',
      desc: 'MOCK 需求描述：支持持卡人对已分期账单发起提前结清，完成试算、扣款、销账与额度释放。',
      parsed: true, confirmed: true, aiDone: true, fpVersion: 1
    },
    {
      id: 'r1', code: 'XQ20260120051', title: '信用卡聚合跨行还款',
      priority: 'P1', stage: '分析', order: 2, source: '信用卡中心', createdAt: '2026-10-08',
      desc: 'MOCK 需求描述：支持持卡人通过统一入口使用他行账户完成信用卡还款，覆盖订单创建、通道路由、结果回调、渠道入口改造、流水对账与状态查询，涉及核心系统、渠道系统、支付网关、数据平台四个关联系统。',
      parsed: false, confirmed: false, aiDone: false, fpVersion: 0
    },
    {
      id: 'r2', code: 'XQ20260120068', title: '还款结果实时通知',
      priority: 'P1', stage: '开发', order: 3, source: '客户运营部', createdAt: '2026-10-07',
      desc: 'MOCK 需求描述：还款成功后通过 App 消息中心与短信实时通知用户，支持模板配置、失败重试与结果回写。',
      parsed: true, confirmed: true, aiDone: true, fpVersion: 1
    },
    {
      id: 'r4', code: 'XQ20260120091', title: '还款优惠券抵扣',
      priority: 'P2', stage: '分析', order: 4, source: '市场部', createdAt: '2026-10-14',
      desc: 'MOCK 需求描述：还款时支持使用优惠券抵扣还款金额，涉及券核销、金额计算与对账处理。',
      parsed: false, confirmed: false, aiDone: false, fpVersion: 0
    }
  ],

  // 功能点（人工确认后即锁定为基准数据 SSOT；锁定后不可解锁，调整须走「需求变更审批」）
  // analysisStatus：分析阶段执行状态，是「分析 → 开发」阶段门禁的依据
  featurePoints: [
    { id: 'f1', reqId: 'r1', name: '跨行还款订单创建', desc: '发起跨行还款并生成还款订单', mainSys: 's_core', relSys: ['s_chn', 's_pay'], priority: 'P1', ac: '订单创建成功率 ≥99.9%，幂等校验通过', analysisHours: 6, confirmed: false, analyst: '', analysisPlan: null, analysisStatus: '未开始' },
    { id: 'f2', reqId: 'r1', name: '还款路由与通道选择', desc: '按可用通道与费率选择路由', mainSys: 's_core', relSys: ['s_pay', 's_data'], priority: 'P1', ac: '通道切换成功率 ≥99%，异常自动降级', analysisHours: 8, confirmed: false, analyst: '', analysisPlan: null, analysisStatus: '未开始' },
    { id: 'f3', reqId: 'r1', name: '还款结果异步回调处理', desc: '接收他行还款结果并更新订单', mainSys: 's_pay', relSys: ['s_core', 's_data'], priority: 'P1', ac: '回调幂等，T+0 内完成状态同步', analysisHours: 10, confirmed: false, analyst: '', analysisPlan: null, analysisStatus: '未开始' },
    { id: 'f4', reqId: 'r1', name: '渠道端还款入口改造', desc: 'App/H5 还款入口页面与交互改造', mainSys: 's_chn', relSys: ['s_core'], priority: 'P2', ac: '入口可用率 ≥99.9%，兼容存量版本', analysisHours: 12, confirmed: false, analyst: '', analysisPlan: null, analysisStatus: '未开始' },
    { id: 'f5', reqId: 'r1', name: '还款流水与对账数据落库', desc: '流水明细入库与对账文件生成', mainSys: 's_data', relSys: ['s_core'], priority: 'P2', ac: '流水与对账数据一致性 100%', analysisHours: 6, confirmed: false, analyst: '', analysisPlan: null, analysisStatus: '未开始' },
    { id: 'f6', reqId: 'r1', name: '还款状态查询接口', desc: '对外提供还款状态查询能力', mainSys: 's_core', relSys: ['s_chn', 's_pay'], priority: 'P2', ac: '查询响应 <300ms，状态准确率 100%', analysisHours: 5, confirmed: false, analyst: '', analysisPlan: null, analysisStatus: '未开始' },

    {
      id: 'f7', reqId: 'r2', name: '通知模板配置', desc: '消息中心与短信模板配置', mainSys: 's_chn', relSys: ['s_data'], priority: 'P1', ac: '模板生效实时，支持灰度', analysisHours: 4,
      confirmed: true, analyst: 'p1', analysisStatus: '已完成',
      analysisPlan: { start: '2026-10-09', end: '2026-10-09', days: 1, daily: [{ date: '2026-10-09', hours: 4, preOccupied: 0 }] }
    },
    {
      id: 'f8', reqId: 'r2', name: '通知触发与重试', desc: '还款成功后触发通知并失败重试', mainSys: 's_core', relSys: ['s_chn'], priority: 'P1', ac: '通知触达率 ≥99%，重试 3 次', analysisHours: 6,
      confirmed: true, analyst: 'p1', analysisStatus: '已完成',
      analysisPlan: { start: '2026-10-12', end: '2026-10-12', days: 1, daily: [{ date: '2026-10-12', hours: 6, preOccupied: 0 }] }
    },
    {
      id: 'f9', reqId: 'r2', name: '通知渠道对接', desc: '对接短信网关与推送通道', mainSys: 's_pay', relSys: ['s_core'], priority: 'P1', ac: '双通道互备，切换无感', analysisHours: 8,
      confirmed: true, analyst: 'p7', analysisStatus: '已完成',
      analysisPlan: { start: '2026-10-09', end: '2026-10-09', days: 1, daily: [{ date: '2026-10-09', hours: 8, preOccupied: 0 }] }
    },
    {
      id: 'f10', reqId: 'r2', name: '通知结果数据回写', desc: '触达结果回写数据平台', mainSys: 's_data', relSys: ['s_core'], priority: 'P2', ac: '回写延迟 T+1 内', analysisHours: 6,
      confirmed: true, analyst: 'p7', analysisStatus: '已完成',
      analysisPlan: { start: '2026-10-12', end: '2026-10-13', days: 2, daily: [{ date: '2026-10-12', hours: 3, preOccupied: 0 }, { date: '2026-10-13', hours: 3, preOccupied: 0 }] }
    },

    {
      id: 'f11', reqId: 'r3', name: '提前结清试算', desc: '试算剩余本金与手续费', mainSys: 's_core', relSys: ['s_data'], priority: 'P0', ac: '试算结果与账务一致', analysisHours: 6,
      confirmed: true, analyst: 'p1', analysisStatus: '已完成',
      analysisPlan: { start: '2026-10-13', end: '2026-10-13', days: 1, daily: [{ date: '2026-10-13', hours: 6, preOccupied: 0 }] }
    },
    {
      id: 'f12', reqId: 'r3', name: '结清扣款与销账', desc: '扣款成功后的销账与额度释放', mainSys: 's_pay', relSys: ['s_core'], priority: 'P0', ac: '销账成功率 ≥99.9%', analysisHours: 8,
      confirmed: true, analyst: 'p7', analysisStatus: '已完成',
      analysisPlan: { start: '2026-10-13', end: '2026-10-14', days: 2, daily: [{ date: '2026-10-13', hours: 4, preOccupied: 0 }, { date: '2026-10-14', hours: 4, preOccupied: 0 }] }
    }
  ],

  // 开发任务（每条开发任务默认派生 1 条测试记录）
  // baselineStart / baselineEnd = 计划生效时冻结的基准（用于「计划 vs 实际」偏差对比）
  devTasks: [
    { id: 't1', fpid: 'f7', reqId: 'r2', sysId: 's_chn', assignee: 'p3', hours: 16, start: '2026-10-19', end: '2026-10-20', planDaily: [{ date: '2026-10-19', hours: 8 }, { date: '2026-10-20', hours: 8 }], baselineStart: '2026-10-16', baselineEnd: '2026-10-19', status: '进行中' },
    { id: 't2', fpid: 'f8', reqId: 'r2', sysId: 's_core', assignee: 'p2', hours: 24, start: '2026-10-19', end: '2026-10-21', planDaily: [{ date: '2026-10-19', hours: 8 }, { date: '2026-10-20', hours: 8 }, { date: '2026-10-21', hours: 8 }], baselineStart: '2026-10-19', baselineEnd: '2026-10-21', status: '进行中' },
    { id: 't3', fpid: 'f9', reqId: 'r2', sysId: 's_pay', assignee: 'p4', hours: 12, start: '2026-10-16', end: '2026-10-16', planDaily: [{ date: '2026-10-16', hours: 8 }, { date: '2026-10-19', hours: 4 }], baselineStart: '2026-10-16', baselineEnd: '2026-10-16', status: '未开始' },
    { id: 't4', fpid: 'f10', reqId: 'r2', sysId: 's_data', assignee: 'p6', hours: 14, start: '2026-10-16', end: '2026-10-19', planDaily: [{ date: '2026-10-16', hours: 8 }, { date: '2026-10-19', hours: 6 }], baselineStart: '2026-10-16', baselineEnd: '2026-10-19', status: '已完成' },
    { id: 't5', fpid: 'f8', reqId: 'r2', sysId: 's_chn', assignee: 'p3', hours: 8, start: '2026-10-21', end: '2026-10-21', planDaily: [{ date: '2026-10-21', hours: 8 }], baselineStart: '2026-10-20', baselineEnd: '2026-10-20', status: '未开始' },
    { id: 't6', fpid: 'f11', reqId: 'r3', sysId: 's_core', assignee: 'p2', hours: 20, start: '2026-10-20', end: '2026-10-22', planDaily: [{ date: '2026-10-20', hours: 8 }, { date: '2026-10-21', hours: 8 }, { date: '2026-10-22', hours: 4 }], baselineStart: '2026-10-19', baselineEnd: '2026-10-20', status: '未开始' },
    { id: 't7', fpid: 'f12', reqId: 'r3', sysId: 's_pay', assignee: 'p3', hours: 6, start: '2026-10-16', end: '2026-10-16', planDaily: [{ date: '2026-10-16', hours: 6 }], baselineStart: '2026-10-16', baselineEnd: '2026-10-16', status: '未开始' },
    { id: 't8', fpid: 'f11', reqId: 'r3', sysId: 's_data', assignee: 'p6', hours: 8, start: '2026-10-22', end: '2026-10-22', planDaily: [{ date: '2026-10-22', hours: 8 }], baselineStart: '2026-10-19', baselineEnd: '2026-10-19', status: '未开始' },
    { id: 't9', fpid: 'f12', reqId: 'r3', sysId: 's_core', assignee: 'p4', hours: 10, start: '2026-10-19', end: '2026-10-20', planDaily: [{ date: '2026-10-19', hours: 8 }, { date: '2026-10-20', hours: 2 }], baselineStart: '2026-10-19', baselineEnd: '2026-10-20', status: '未开始' }
  ],

  // 测试记录（与开发任务 1:1 派生；测试阶段独立排期与状态维护）
  testRecords: [
    { id: 'tc1', taskId: 't1', fpid: 'f7', reqId: 'r2', assignee: 'p5', hours: 8, start: '2026-10-21', end: '2026-10-22', planDaily: [{ date: '2026-10-21', hours: 4 }, { date: '2026-10-22', hours: 4 }], status: '进行中' },
    { id: 'tc2', taskId: 't2', fpid: 'f8', reqId: 'r2', assignee: 'p5', hours: 8, start: '2026-10-22', end: '2026-10-23', planDaily: [{ date: '2026-10-22', hours: 4 }, { date: '2026-10-23', hours: 4 }], status: '未开始' },
    { id: 'tc3', taskId: 't3', fpid: 'f9', reqId: 'r2', assignee: 'p5', hours: 6, start: '2026-10-19', end: '2026-10-19', planDaily: [{ date: '2026-10-19', hours: 6 }], status: '未开始' },
    { id: 'tc4', taskId: 't4', fpid: 'f10', reqId: 'r2', assignee: 'p5', hours: 7, start: '2026-10-20', end: '2026-10-20', planDaily: [{ date: '2026-10-20', hours: 7 }], status: '已完成' },
    { id: 'tc5', taskId: 't5', fpid: 'f8', reqId: 'r2', assignee: 'p5', hours: 4, start: '2026-10-22', end: '2026-10-22', planDaily: [{ date: '2026-10-22', hours: 4 }], status: '未开始' },
    { id: 'tc6', taskId: 't6', fpid: 'f11', reqId: 'r3', assignee: 'p5', hours: 10, start: '2026-10-23', end: '2026-10-26', planDaily: [{ date: '2026-10-23', hours: 5 }, { date: '2026-10-26', hours: 5 }], status: '未开始' },
    { id: 'tc7', taskId: 't7', fpid: 'f12', reqId: 'r3', assignee: 'p5', hours: 3, start: '2026-10-19', end: '2026-10-19', planDaily: [{ date: '2026-10-19', hours: 3 }], status: '未开始' },
    { id: 'tc8', taskId: 't8', fpid: 'f11', reqId: 'r3', assignee: 'p5', hours: 4, start: '2026-10-23', end: '2026-10-23', planDaily: [{ date: '2026-10-23', hours: 4 }], status: '未开始' },
    { id: 'tc9', taskId: 't9', fpid: 'f12', reqId: 'r3', assignee: 'p5', hours: 5, start: '2026-10-21', end: '2026-10-22', planDaily: [{ date: '2026-10-21', hours: 2.5 }, { date: '2026-10-22', hours: 2.5 }], status: '未开始' }
  ],

  // 里程碑节点（阶段门禁通过后生成，含审批与变更审批）
  milestones: [
    { id: 'm1', reqId: 'r2', stage: '分析', title: '分析完成评审', submitter: 'p1', approver: 'm1', status: '已通过', createdAt: '2026-10-13 17:20', decidedAt: '2026-10-14 09:10', note: '' },
    { id: 'm2', reqId: 'r2', stage: '开发', title: '开发计划生效审批', submitter: 'p2', approver: 'm1', status: '待审批', createdAt: '2026-10-13 18:00', decidedAt: '', note: '' },
    { id: 'm3', reqId: 'r3', stage: '开发', title: '开发计划生效审批', submitter: 'p7', approver: 'm1', status: '待审批', createdAt: '2026-10-12 11:30', decidedAt: '', note: '' },
    { id: 'm4', reqId: 'r1', stage: '分析', title: '分析完成评审', submitter: 'p1', approver: 'm1', status: '已驳回', createdAt: '2026-10-11 16:00', decidedAt: '2026-10-11 18:30', note: '工时颗粒度不足，请按关联系统补充后再提交' }
  ],

  // 变更单（需求变更 / 计划变更，均需管理者审批后生效）
  changeRequests: [
    {
      id: 'cr1', reqId: 'r2', kind: '计划变更', scene: '开发排期调整',
      title: '功能点「通知触发与重试」开发任务顺延 2 天',
      before: '2026-10-19 → 2026-10-21', after: '2026-10-21 → 2026-10-23',
      reason: '受 XQ20260120077 插队影响，实施人周末需支持生产变更',
      status: '待审批', submitter: 'p2', approver: 'm1', createdAt: '2026-10-14 10:20', decidedAt: '', note: '',
      payload: { type: 'plan', tasks: [{ id: 't2', hours: 24, assignee: 'p2', start: '2026-10-21', end: '2026-10-23' }] }
    },
    {
      id: 'cr2', reqId: 'r3', kind: '需求变更', scene: '验收标准调整',
      title: '功能点「结清扣款与销账」验收标准加严',
      before: '销账成功率 ≥99.9%', after: '销账成功率 ≥99.95% 且支持幂等重试',
      reason: '监管口径更新，要求提升销账成功率下限',
      status: '已批准', submitter: 'p7', approver: 'm1', createdAt: '2026-10-13 09:10', decidedAt: '2026-10-13 09:30',
      note: '同意调整，注意同步更新测试用例与验收证据',
      payload: { type: 'fp', fps: [{ id: 'f12', action: '修改', name: '结清扣款与销账', ac: '销账成功率 ≥99.95% 且支持幂等重试' }] }
    }
  ],

  // 变更 / 插队留痕
  changes: [
    { id: 'c1', reqId: 'r3', type: '插队', detail: '需求插队：由队列第 3 位插至第 1 位（优先级 P1 → P0）', before: '队列位置 3', after: '队列位置 1', reason: '监管要求提前上线', at: '2026-10-12 10:05', by: '王总' },
    { id: 'c2', reqId: 'r2', type: '排期顺延', detail: '受 XQ20260120077 插队影响，开发窗口顺延 3 天', before: '10-16 开始', after: '10-19 开始', reason: '资源抢占（李伟）', at: '2026-10-12 10:06', by: '系统自动' },
    { id: 'c3', reqId: 'r1', type: '评审驳回', detail: '分析完成评审被驳回', before: '待审批', after: '已驳回', reason: '工时颗粒度不足', at: '2026-10-11 18:30', by: '王总' },
    { id: 'c4', reqId: 'r3', type: '变更生效', detail: '需求变更「结清扣款与销账」验收标准调整审批通过并生效（基准版本 v1.1）', before: '销账成功率 ≥99.9%', after: '销账成功率 ≥99.95% 且支持幂等重试', reason: '监管口径更新', at: '2026-10-13 09:30', by: '王总' }
  ],

  // 逐条验收记录（对照功能点的验收标准 AC 打验收结论与得分，形成可追溯的验收证据）
  acceptances: [
    { id: 'a1', reqId: 'r2', fpid: 'f7', status: '已达成', score: 92, actual: '模板下发生效 <2s，支持灰度', evidence: '压测报告 RPT-2026-1012', by: 'p1', at: '2026-10-14 10:20' },
    { id: 'a2', reqId: 'r2', fpid: 'f8', status: '部分达成', score: 70, actual: '通知触达率 98.2%（目标 ≥99%），重试 3 次已生效', evidence: '监控大盘截图 IMG-2026-1014', by: 'p1', at: '2026-10-14 10:26' },
    { id: 'a3', reqId: 'r2', fpid: 'f9', status: '已达成', score: 88, actual: '双通道互备，切换耗时 1.2s', evidence: '演练记录 DR-2026-1013', by: 'p1', at: '2026-10-14 10:31' },
    { id: 'a4', reqId: 'r2', fpid: 'f10', status: '未达成', score: 45, actual: '回写延迟 T+2，未达 T+1 要求', evidence: '数据平台任务日志', by: 'p1', at: '2026-10-14 10:35' },
    { id: 'a5', reqId: 'r3', fpid: 'f11', status: '已达成', score: 95, actual: '试算结果与账务一致（对账 100% 通过）', evidence: '对账文件 RC-2026-1010', by: 'p7', at: '2026-10-13 15:40' },
    { id: 'a6', reqId: 'r3', fpid: 'f12', status: '部分达成', score: 68, actual: '销账成功率 99.2%（目标 ≥99.9%）', evidence: '生产监控周报 W41', by: 'p7', at: '2026-10-13 15:46' }
  ],

  // 组织验收结论（管理者对需求验收结果拍板，形成目标验收节点）
  goalReviews: [
    {
      id: 'gr1', reqId: 'r2', goalId: 'g1', result: '有条件通过', achieved: 79, target: 85,
      note: '通知触达率与数据回写延迟未达标，限期 10-24 前完成整改后复验；其余功能点验收通过。',
      by: 'm1', at: '2026-10-14 16:10'
    }
  ],

  // 员工复盘改进记录（服务于个人改进，可追溯）
  retros: [
    {
      id: 'rt1', personId: 'p6', reqId: 'r2',
      good: '数据回写链路改造上线顺利，无生产事故',
      bad: '对 T+1 时效要求评估不足，依赖上游调度窗口',
      action: '与数据平台约定独立调度窗口，下个迭代内完成评审',
      by: 'm1', at: '2026-10-14 17:00'
    }
  ],

  // 计划外工作 / 手动新增计划（分析 / 开发 / 测试三类，计入人员占用，避免排期冲突）
  manualPlans: [],

  // AI 解析预置结果（用于「导入 → 拆解」演出，未接入真实模型）
  parsePresets: {
    r1: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
    r4: [
      { id: 'f13', reqId: 'r4', name: '优惠券查询与校验', desc: '查询可用券并校验使用条件', mainSys: 's_core', relSys: ['s_chn'], priority: 'P2', ac: '券校验准确率 100%', analysisHours: 5, confirmed: false, analyst: '', analysisPlan: null, analysisStatus: '未开始' },
      { id: 'f14', reqId: 'r4', name: '还款金额抵扣计算', desc: '按券规则计算抵扣金额', mainSys: 's_core', relSys: ['s_data'], priority: 'P2', ac: '计算与账务一致', analysisHours: 6, confirmed: false, analyst: '', analysisPlan: null, analysisStatus: '未开始' },
      { id: 'f15', reqId: 'r4', name: '券核销与回滚', desc: '扣款失败时支持券回滚', mainSys: 's_core', relSys: ['s_chn', 's_pay'], priority: 'P2', ac: '回滚成功率 100%', analysisHours: 8, confirmed: false, analyst: '', analysisPlan: null, analysisStatus: '未开始' },
      { id: 'f16', reqId: 'r4', name: '券使用数据回写', desc: '券核销结果回写数据平台', mainSys: 's_data', relSys: ['s_core'], priority: 'P2', ac: 'T+1 内完成回写', analysisHours: 4, confirmed: false, analyst: '', analysisPlan: null, analysisStatus: '未开始' }
    ]
  }
};
