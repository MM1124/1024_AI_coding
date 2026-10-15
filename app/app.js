/* ==========================================================================
 * app.js —— 界面与交互层（零依赖，事件委托 + 全量渲染）
 * 第 1 部分：常量 / 工具 / 角色权限 / 导航 / 需求工作台
 * ========================================================================== */
(function () {
  'use strict';

  var E = globalThis.Engine;
  var SEED = globalThis.SEED;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var STORE_KEY = 'reqplan_demo_v5';   // v5：数据看板历史档案、新增「未分析」需求 r5（XQ20260120114）
  var STAGES = E.STAGES;               // 分析 → 开发 → 测试 → 验收 → 已验收
  var STATUS = ['未开始', '进行中', '已完成'];
  var KIND_CLS = { '分析': 'ana', '开发': 'dev', '测试': 'test' };
  var MODAL_KIND = { '需求变更': 'purple', '计划变更': 'blue' };

  /* ===== 使用人角色：同一平台不同角色可见视图与可操作能力不同 ===== */
  var ROLES = {
    PM: { key: 'PM', name: '产品经理', personId: 'p1', home: 'workbench', desc: '需求导入、拆解确认、分析排期、发起需求/计划变更、提交「分析→开发」与「验收→已验收」' },
    DEV: { key: 'DEV', name: '开发负责人', personId: 'p2', home: 'schedule', desc: '开发排期、引入任务与建测试记录、计划生效、维护开发状态、提交「开发→测试」' },
    QA: { key: 'QA', name: '测试工程师', personId: 'p5', home: 'schedule', desc: '测试阶段排期、维护测试状态、提交「测试→验收」、查看验收结果' },
    MGR: { key: 'MGR', name: '管理者', personId: 'm1', home: 'verify', desc: '阶段审批、变更审批、组织验收、目标达成评估、复盘（可兜底提交任一阶段）' }
  };
  var ROLE_VIEWS = {
    PM: ['workbench', 'schedule', 'board', 'dash', 'track', 'verify'],
    DEV: ['schedule', 'board', 'dash', 'track', 'verify'],
    QA: ['schedule', 'board', 'dash', 'track', 'verify'],
    MGR: ['workbench', 'schedule', 'board', 'dash', 'track', 'verify']
  };
  var PERM = {
    PM: ['fp.edit', 'fp.confirm', 'sched.analysis', 'task.analysis', 'plan.manual', 'stage.submit',
      'accept.write', 'retro.write', 'plan.insert', 'change.req', 'change.plan'],
    DEV: ['sched.dev', 'plan.apply', 'task.status', 'test.sched', 'plan.manual', 'stage.submit', 'change.plan'],
    QA: ['task.test', 'test.sched', 'plan.manual', 'stage.submit'],
    MGR: ['approve', 'cr.approve', 'review.decide', 'retro.write', 'accept.write', 'plan.insert', 'stage.submit']
  };
  /* 阶段流转责任角色：每个阶段由对应角色提交，管理者可兜底 */
  var STAGE_OWNER = { '分析': 'PM', '开发': 'DEV', '测试': 'QA', '验收': 'PM' };
  /* 阶段主题：色板 key（复用 --amber/--blue/--purple/--green/--teal 全家桶）+ 该阶段职责说明
     仅用于工作台「按阶段分类」的视觉分层，不参与任何计算 */
  var STAGE_THEME = {
    '分析': { key: 'amber', desc: '需求导入与 AI 拆解 → 人工确认功能点并锁定基准 → 分析排期与执行' },
    '开发': { key: 'blue', desc: '开发资源排期 → 按功能点引入任务（含关联系统自动建单）→ 逐笔维护实施状态' },
    '测试': { key: 'purple', desc: '测试资源排期 → 由开发任务派生测试记录 → 逐笔维护测试状态' },
    '验收': { key: 'green', desc: '功能点逐条验收 → 加权达成度与计划偏差 → 组织验收结论' },
    '已验收': { key: 'teal', desc: '已结项归档，纳入部门目标达成度统计与员工复盘' }
  };
  var VIEW_META = {
    workbench: { idx: '1', name: '需求工作台', nav: '队列·拆解·阶段流转', desc: '需求队列列表 → 点击进入详情：导入拆解 → 人工确认锁定（基准不再解锁）→ 阶段门禁流转' },
    schedule: { idx: '2', name: '排期中心', nav: '三阶段计划·阶段流转', desc: '分析 / 开发 / 测试三阶段计划分离，排期推荐 + 计划完成收口 + 分角色阶段流转 + 手动添加计划' },
    board: { idx: '3', name: '计划看板', nav: '时间轴·插队·提醒', desc: '按人排期时间轴、需求插队影响、资源冲突、到期提醒、变更留痕' },
    dash: { idx: '4', name: '数据看板', nav: '月度趋势·部门·工作量', desc: '月度需求数量变化、需求提出部门维度统计、按月份与多维度查看分析/开发/测试工作量' },
    track: { idx: '5', name: '执行跟踪', nav: '状态·审批中心', desc: '任务/测试逐笔状态维护、阶段审批与变更审批中心' },
    verify: { idx: '6', name: '验收评估', nav: '达成度·闭环', desc: '逐条验收对照既定标准、加权达成度、目标回溯、可追溯导出' }
  };
  var NAV_ORDER = ['workbench', 'schedule', 'board', 'dash', 'track', 'verify'];

  var DB = null;
  var UI = {
    view: 'workbench',
    reqId: 'r1',
    schedReqId: 'r1',
    verifyReqId: 'r2',
    role: 'PM',
    reqOpen: false,    // 需求工作台：false = 需求队列列表页，true = 某条需求的详情页
    dashDim: 'stage',  // 数据看板 · 月度工作量拆分维度：stage / source / sys / owner
    parseTimer: null,
    pick: {},
    crDraft: null,     // 需求变更单编辑器草稿
    crReason: ''
  };

  /* ======================= 基础工具 ======================= */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function person(id) { return (DB.people || []).filter(function (p) { return p.id === id; })[0] || { name: '未指派', title: '' }; }
  function pname(id) { return id ? person(id).name : '未指派'; }
  function sysOf(id) { return (DB.systems || []).filter(function (s) { return s.id === id; })[0] || { name: '—', code: '—' }; }
  function reqById(id) { return (DB.requirements || []).filter(function (r) { return r.id === id; })[0] || null; }
  function fpById(id) { return (DB.featurePoints || []).filter(function (f) { return f.id === id; })[0] || null; }
  function fpsOf(reqId) { return (DB.featurePoints || []).filter(function (f) { return f.reqId === reqId; }); }
  function fpsConfirmed(reqId) { return fpsOf(reqId).filter(function (f) { return f.confirmed; }); }
  function tasksOfReq(reqId) { return (DB.devTasks || []).filter(function (t) { return t.reqId === reqId; }); }
  function taskById(id) { return (DB.devTasks || []).filter(function (t) { return t.id === id; })[0]; }
  function testsOfTask(taskId) { return (DB.testRecords || []).filter(function (r) { return r.taskId === taskId; }); }
  function testsOfReq(reqId) { return (DB.testRecords || []).filter(function (r) { return r.reqId === reqId; }); }
  function testById(id) { return (DB.testRecords || []).filter(function (r) { return r.id === id; })[0]; }
  function mpById(id) { return (DB.manualPlans || []).filter(function (m) { return m.id === id; })[0]; }
  function mpsOf(reqId, type) { return (DB.manualPlans || []).filter(function (m) { return m.reqId === reqId && (!type || m.type === type); }); }
  function crOf(id) { return (DB.changeRequests || []).filter(function (c) { return c.id === id; })[0]; }
  function peopleByRole(role) { return (DB.people || []).filter(function (p) { return p.role === role; }); }
  function tag(text, cls) { return '<span class="tag ' + cls + '">' + esc(text) + '</span>'; }
  function priTag(p) { return tag(p, p === 'P0' ? 'red' : (p === 'P1' ? 'amber' : 'gray')); }
  function stageTag(s) {
    var cls = s === '已验收' ? 'teal' : (s === '验收' ? 'green' : (s === '测试' ? 'purple' : (s === '开发' ? 'blue' : 'amber')));
    return tag(s, cls);
  }
  function statusTag(s) { return tag(s, s === '已完成' ? 'green' : (s === '进行中' ? 'blue' : 'gray')); }
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }
  function nowStamp() { return DB.meta.demoDate + ' ' + new Date().toTimeString().slice(0, 5); }
  function logChange(c) {
    DB.changes.unshift({
      id: 'c' + (DB.seq.change++), reqId: c.reqId || '', type: c.type, detail: c.detail,
      before: c.before || '', after: c.after || '', reason: c.reason || '',
      at: nowStamp(), by: c.by || curRole().name + ' ' + pname(curRole().personId)
    });
  }
  function addMilestone(m) {
    DB.milestones.unshift({
      id: 'm' + (DB.seq.milestone++), reqId: m.reqId, stage: m.stage, title: m.title,
      submitter: m.submitter || curRole().personId, approver: 'm1', status: '待审批',
      createdAt: nowStamp(), decidedAt: '', note: ''
    });
  }
  function blockedDays(ms) {
    var created = (ms.createdAt || '').slice(0, 10);
    if (!created) return 0;
    return Math.max(0, E.diffDays(created, DB.meta.demoDate));
  }
  function nextStage(s) { return E.nextStage(s); }
  function versionOf(req) { return 'v' + (Number(req.fpVersion || 1)).toFixed(1); }

  /* ======================= 角色与权限 ======================= */
  function curRole() { return ROLES[UI.role] || ROLES.PM; }
  function can(p) { return (PERM[UI.role] || []).indexOf(p) >= 0; }
  function canView(v) { return (ROLE_VIEWS[UI.role] || []).indexOf(v) >= 0; }
  /* 阶段流转按角色分派：每个阶段由对应角色提交，管理者可兜底 */
  function stageOwnerName(stage) { var k = STAGE_OWNER[stage]; return k ? ROLES[k].name : '—'; }
  /* 阶段主题取用（工作台按阶段分类的视觉层） */
  function stageTheme(s) { return STAGE_THEME[s] || { key: 'gray', desc: '' }; }
  function stageVars(s) {
    var k = stageTheme(s).key;
    return '--sc:var(--' + k + ');--sc-bg:var(--' + k + '-bg);--sc-line:var(--' + k + '-line)';
  }
  function stageOwnerLabel(s) { return s === '已验收' ? '已结项归档' : stageOwnerName(s) + ' 主导'; }
  function canSubmitStage(req) {
    if (!req || !can('stage.submit')) return false;
    if (UI.role === 'MGR') return true;
    return STAGE_OWNER[req.stage] === UI.role;
  }
  function stageSubmitHint(req) {
    if (!req) return '';
    if (!can('stage.submit')) return lockedHint('stage.submit', '本阶段由' + stageOwnerName(req.stage) + '提交');
    if (canSubmitStage(req)) return '';
    return '<span class="tag amber">本阶段由' + stageOwnerName(req.stage) + '提交（当前身份无此环节）</span>';
  }
  function roleTag() {
    var r = curRole();
    return '<span class="tag blue" title="' + esc(r.desc) + '">当前身份：' + esc(r.name) + ' · ' + esc(pname(r.personId)) + '</span>';
  }
  function lockedHint(p, text) {
    if (can(p)) return '';
    return '<span class="tag gray" title="当前角色无此权限">只读 · ' + esc(text) + '</span>';
  }
  function deny(p) { toast('当前角色（' + curRole().name + '）无此权限：' + p); }
  function gradeTag(g) {
    var cls = g === '优秀' ? 'green' : (g === '达成' ? 'blue' : (g === '部分达成' ? 'amber' : 'red'));
    return tag(g, cls);
  }
  function scoreBar(v, cls) {
    var c = v >= 90 ? 'green' : (v >= 75 ? 'blue' : (v >= 60 ? 'amber' : 'red'));
    return '<div class="bar ' + (cls || '') + '" style="flex:1"><i style="width:' + Math.max(0, Math.min(100, v)) + '%;background:var(--' + c + ')"></i></div>';
  }
  /* 进度条（区别于评分条）：0% 灰 / 进行中蓝 / 100% 绿 —— 不用红色，避免把「未完成」误读成「异常」 */
  function progBar(v) {
    var fill = v >= 100 ? 'var(--green)' : (v > 0 ? 'var(--blue)' : 'var(--line-2)');
    return '<div class="bar" style="flex:1"><i style="width:' + Math.max(0, Math.min(100, v)) + '%;background:' + fill + '"></i></div>';
  }
  /* 手动添加计划：不同角色可登记的计划类型不同 */
  function manualTypes() {
    if (UI.role === 'PM') return ['分析', '开发'];
    if (UI.role === 'DEV') return ['开发', '测试'];
    if (UI.role === 'QA') return ['测试'];
    return ['分析', '开发', '测试'];
  }
  function personForKind(kind) {
    return kind === '分析' ? peopleByRole('PM') : (kind === '测试' ? peopleByRole('QA') : peopleByRole('DEV'));
  }
  function roleMatrixHTML() {
    var rows = [
      { k: '需求导入 / AI 拆解', PM: '✔', DEV: '—', QA: '—', MGR: '只读' },
      { k: '功能点确认锁定（SSOT · 不可解锁）', PM: '✔', DEV: '—', QA: '—', MGR: '只读' },
      { k: '分析阶段计划与排期', PM: '✔', DEV: '—', QA: '—', MGR: '只读' },
      { k: '手动添加计划（分析/开发/测试）', PM: '✔(分析/开发)', DEV: '✔(开发/测试)', QA: '✔(仅测试)', MGR: '—' },
      { k: '开发阶段计划与排期', PM: '只读', DEV: '✔', QA: '只读', MGR: '只读' },
      { k: '测试阶段计划与排期', PM: '只读', DEV: '✔', QA: '✔', MGR: '只读' },
      { k: '发起需求变更 / 计划变更', PM: '✔需求', DEV: '✔计划', QA: '—', MGR: '—' },
      { k: '阶段流转（门禁校验后提交）', PM: '✔分析/验收', DEV: '✔开发', QA: '✔测试', MGR: '✔兜底' },
      { k: '任务 / 测试状态维护', PM: '—', DEV: '✔(开发)', QA: '✔(测试)', MGR: '—' },
      { k: '开发 / 测试计划标记完成', PM: '—', DEV: '✔(开发)', QA: '✔(测试)', MGR: '—' },
      { k: '阶段审批 / 变更审批', PM: '—', DEV: '—', QA: '—', MGR: '✔' },
      { k: '功能点验收打分', PM: '✔', DEV: '—', QA: '只读', MGR: '✔' },
      { k: '组织验收结论 / 复盘改进', PM: '复盘', DEV: '只读', QA: '只读', MGR: '✔' }
    ];
    return '<div class="table-wrap"><table><thead><tr><th>能力项</th><th>产品经理</th><th>开发负责人</th>' +
      '<th>测试工程师</th><th>管理者</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var c = function (v) { return '<td class="' + (v === '✔' ? 'ok-cell' : (v === '—' ? 'muted' : '')) + '">' + v + '</td>'; };
        return '<tr><td>' + esc(r.k) + '</td>' + c(r.PM) + c(r.DEV) + c(r.QA) + c(r.MGR) + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function myTodos() {
    var t = [];
    if (UI.role === 'PM') {
      DB.requirements.forEach(function (r) {
        if (!r.confirmed && r.aiDone) t.push({ text: '待确认拆解：' + r.code, view: 'workbench', id: r.id });
      });
      var pend = fpsConfirmed(UI.reqId).filter(function (f) { return !f.analysisPlan; });
      if (pend.length) t.push({ text: '待排期分析工作 ' + pend.length + ' 项', view: 'schedule', id: UI.schedReqId });
      var undo = fpsConfirmed(UI.reqId).filter(function (f) { return f.analysisPlan && f.analysisStatus !== '已完成'; });
      if (undo.length) t.push({ text: '待完成分析 ' + undo.length + ' 项', view: 'schedule', id: UI.schedReqId });
      var needStage = DB.requirements.filter(function (r) { return r.stage !== '已验收' && E.stageGate(DB, r.id).ok && canSubmitStage(r); });
      needStage.forEach(function (r) { t.push({ text: '可提交阶段：' + r.code + '（' + nextStage(r.stage) + '）', view: 'workbench', id: r.id }); });
    }
    if (UI.role === 'DEV') {
      DB.requirements.forEach(function (r) {
        var un = tasksOfReq(r.id).filter(function (x) { return !x.start; });
        if (un.length) t.push({ text: '待排期开发任务 ' + un.length + ' 条：' + r.code, view: 'schedule', id: r.id });
      });
      var mix = tasksOfReq(UI.schedReqId).filter(function (x) { return x.status !== '已完成'; }).length;
      if (mix) t.push({ text: '开发在办 ' + mix + ' 条（可在排期中心直接标记完成）', view: 'schedule', id: UI.schedReqId });
      DB.requirements.forEach(function (r) {
        if (r.stage === '开发' && E.stageGate(DB, r.id).ok) t.push({ text: '可提交「开发→测试」：' + r.code, view: 'schedule', id: r.id });
      });
    }
    if (UI.role === 'QA') {
      var uns = testsOfReq(UI.schedReqId).filter(function (r) { return !r.start; });
      if (uns.length) t.push({ text: '待排期测试记录 ' + uns.length + ' 条', view: 'schedule', id: UI.schedReqId });
      var open = (DB.testRecords || []).filter(function (r) { return r.status !== '已完成'; });
      if (open.length) t.push({ text: '待执行测试 ' + open.length + ' 条（可在排期中心标记完成）', view: 'schedule', id: UI.schedReqId });
      DB.requirements.forEach(function (r) {
        if (r.stage === '测试' && E.stageGate(DB, r.id).ok) t.push({ text: '可提交「测试→验收」：' + r.code, view: 'schedule', id: r.id });
      });
    }
    if (UI.role === 'MGR') {
      (DB.milestones || []).filter(function (m) { return m.status === '待审批'; }).forEach(function (m) {
        t.push({ text: '待审批：' + m.title, view: 'track', id: m.reqId });
      });
      (DB.changeRequests || []).filter(function (c) { return c.status === '待审批'; }).forEach(function (c) {
        t.push({ text: '待变更审批：' + c.title, view: 'track', id: c.reqId });
      });
      (DB.requirements || []).forEach(function (r) {
        var a = E.reqAchievement(DB, r.id);
        if (a.verifiedCount && !a.conclusion) t.push({ text: '待组织验收：' + r.code, view: 'verify', id: r.id });
        if (r.stage !== '已验收' && E.stageGate(DB, r.id).ok && STAGE_OWNER[r.stage] !== 'PM') {
          t.push({ text: '可兜底提交阶段：' + r.code + '（' + nextStage(r.stage) + '）', view: 'schedule', id: r.id });
        }
      });
    }
    return t;
  }
  function navBadge(v) {
    if (v === 'track') {
      var m = (DB.milestones || []).filter(function (x) { return x.status === '待审批'; }).length;
      var c = (DB.changeRequests || []).filter(function (x) { return x.status === '待审批'; }).length;
      return (m + c) || '';
    }
    if (v === 'workbench') {
      return DB.requirements.filter(function (r) { return r.aiDone && !r.confirmed; }).length || '';
    }
    if (v === 'schedule') {
      if (UI.role === 'QA') return testsOfReq(UI.schedReqId).filter(function (r) { return !r.start; }).length || '';
      return tasksOfReq(UI.schedReqId).filter(function (t) { return !t.start; }).length || '';
    }
    return '';
  }

  /* ======================= 持久化 ======================= */
  var SEQ_DEFAULT = { task: 100, test: 100, change: 100, milestone: 100, plan: 100, accept: 100, review: 100, retro: 100, cr: 100 };

  /* 种子指纹（djb2 哈希种子 JSON）
     用途：mock 数据一旦有增补（新增需求 / 调整基准数字），指纹随之变化，
     启动时发现缓存指纹与当前种子不一致就自动重新播种 —— 避免"浏览器缓存着旧数据、
     新加的 mock 需求在页面上看不见"。有了它就不必每次手动升 STORE_KEY。
     仅演示态生效：若缓存是本机操作产生的，指纹与种子一致，照常沿用不丢改动。 */
  function seedSig(seed) {
    var s = '';
    try { s = JSON.stringify(seed); } catch (e) { s = ''; }
    var h = 5381;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
    return 'djb2-' + (h >>> 0).toString(36) + '-' + s.length;
  }
  var SEED_SIG = seedSig(SEED);

  function persist() {
    try { if (DB.meta) DB.meta.seedSig = SEED_SIG; localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { }
  }
  function resetData() {
    if (UI.parseTimer) { clearInterval(UI.parseTimer); UI.parseTimer = null; }
    var role = UI.role;
    DB = clone(SEED);
    DB.seq = clone(SEQ_DEFAULT);
    UI.pick = {}; UI.crDraft = null; UI.crReason = '';
    UI.role = role;
    UI.view = curRole().home;
    persist(); render();
  }

  /* ======================= 弹窗 ======================= */
  function openModal(opts) {
    var root = $('#modalRoot');
    root.innerHTML = '<div class="modal-mask"><div class="modal' + (opts.wide ? ' wide' : '') + '"><div class="modal-h">' + opts.title +
      '</div><div class="modal-b">' + (opts.bodyHTML || '') + '</div><div class="modal-f"></div></div></div>';
    var f = $('.modal-f', root);
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn ' + (a.cls || '');
      b.textContent = a.label;
      b.onclick = function () { if (a.onClick) a.onClick(); };
      f.appendChild(b);
    });
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }

  /* ======================= 排期展示公共片段 ======================= */
  function workdayNote(s) {
    if (!s) return '';
    return E.isWorkday(E.toDate(s)) ? '' : '<div class="sub">非工作日，推荐时自动顺延</div>';
  }
  function dailyDetail(plan, label, today) {
    if (!plan || !plan.daily || !plan.daily.length) return '';
    return '<details class="day-detail"><summary>' + esc(label || '每日分配明细') + '（' + plan.daily.length + ' 天）</summary>' +
      '<div class="day-list">' + plan.daily.map(function (d) {
        var late = d.date > (today || '9999-99-99');
        return '<span class="day-chip' + (late ? ' late' : '') + '">' + esc(d.date.slice(5)) + ' · ' + d.hours + 'h' +
          (d.preOccupied ? '（前有占用 ' + d.preOccupied + 'h）' : '') + '</span>';
      }).join('') + '</div></details>';
  }
  function periodCell(plan, rec, extra, today) {
    if (plan) return '<div class="period">' + esc(plan.start) + ' → ' + esc(plan.end) + '</div><div class="sub">' + plan.days + ' 个工作日 · 共 ' +
      Math.round(plan.daily.reduce(function (s, x) { return s + x.hours; }, 0) * 10) / 10 + 'h' + (extra || '') + '</div>' + dailyDetail(plan, '每日分配明细', today);
    if (rec) return '<div class="rec">推荐 ' + esc(rec.start) + ' → ' + esc(rec.end) + '</div><div class="sub">' + rec.days + ' 个工作日' +
      (rec.startLoad ? '<br>该人首日已有占用 ' + rec.startLoad + 'h' : '') + '</div>' + dailyDetail(rec, '推荐明细', today);
    return '<span class="muted">未推荐</span>';
  }
  function kindTag(kind) { return tag(kind, kind === '分析' ? 'amber' : (kind === '测试' ? 'purple' : 'blue')); }

  /* ======================= 视图 1：需求工作台 ======================= */
  /* ======================= 视图 1：需求工作台 ======================= */
  /* 1-A 需求队列（列表页）：进入工作台默认只看列表，点击某条需求才展开详情，避免一进来就平铺 */
  function vReqList() {
    var buckets = E.stageBuckets(DB);
    var risk = E.dueRiskMap(DB);
    var total = buckets.reduce(function (s, b) { return s + b.count; }, 0);

    /* --- 阶段流水线概览：五个阶段全部露出（空阶段淡显），一眼看出需求分布与流转方向 --- */
    var rail = '<div class="stage-rail">' + buckets.map(function (b, i) {
      return (i ? '<span class="rail-arrow">›</span>' : '') +
        '<div class="rail-node' + (b.count ? '' : ' empty') + '" style="' + stageVars(b.stage) + '" title="' + esc(b.stage) + '：' + b.count + ' 条">' +
        '<span class="rn-dot"></span><span class="rn-t">' + esc(b.stage) + '</span>' +
        '<span class="rn-n">' + b.count + '</span></div>';
    }).join('') + '<span class="rail-sum">共 ' + total + ' 条需求</span></div>';

    /* --- 单条需求摘要卡：序号 / 标题 / 标签 / 三条进度 / 门禁结论 --- */
    function card(r, i) {
      var p = E.progress(DB, r.id);
      var g = E.stageGate(DB, r.id);
      var k = risk[r.id] || {};
      var undone = g.items.filter(function (x) { return !x.pass; }).length;
      var pendingCr = (DB.changeRequests || []).filter(function (c) { return c.reqId === r.id && c.status === '待审批'; }).length;
      var foot = r.stage === '已验收'
        ? '<span class="ok-cell">已结项 · 纳入目标达成度统计</span>'
        : (g.ok ? '<span class="ok-cell">门禁通过，可提交「' + esc(g.next) + '」</span>'
                : '<span class="muted">门禁未通过，剩 ' + undone + ' 项</span>');
      return '<div class="req-card" data-act="pick-req" data-id="' + r.id + '">' +
        '<div class="rc-head"><span class="rc-idx">' + (i + 1) + '</span>' +
        '<div class="rc-main"><div class="rc-t">' + esc(r.title) + '</div>' +
        '<div class="rc-code">' + esc(r.code) + ' · ' + esc(r.source) + ' · 创建 ' + esc(r.createdAt) + '</div></div>' +
        '<div class="rc-pri">' + priTag(r.priority) + stageTag(r.stage) + '</div></div>' +
        '<div class="rc-tags">' +
        (r.confirmed ? tag('基准 ' + versionOf(r), 'green') : tag('功能点待确认', 'amber')) +
        tag('功能点 ' + fpsOf(r.id).length + ' 个', 'gray') +
        (pendingCr ? tag('变更待审批 ' + pendingCr, 'purple') : '') +
        (k.overdue ? tag('已超期', 'red') : (k.soon ? tag('临近到期', 'amber') : '')) +
        '</div>' +
        '<div class="rc-prog">' +
        '<div class="bar-row"><span class="lbl">分析</span>' + progBar(p.anaProgress) + '<span class="val">' + p.anaProgress + '%</span></div>' +
        '<div class="bar-row"><span class="lbl">开发</span>' + progBar(p.devProgress) + '<span class="val">' + p.devProgress + '%</span></div>' +
        '<div class="bar-row"><span class="lbl">测试</span>' + progBar(p.testProgress) + '<span class="val">' + p.testProgress + '%</span></div>' +
        '</div>' +
        '<div class="rc-foot">' + foot +
        '<button class="btn mini" data-act="pick-req" data-id="' + r.id + '">查看详情 ›</button></div></div>';
    }

    /* --- 阶段分组：只渲染有需求的阶段，避免空组噪声；组头带该阶段聚合指标 --- */
    var sections = buckets.filter(function (b) { return b.count > 0; }).map(function (b) {
      var ms = [];
      if (b.p0) ms.push('<span class="ss-m p0">P0 × ' + b.p0 + '</span>');
      if (b.overdue) ms.push('<span class="ss-m bad">已有超期 ' + b.overdue + '</span>');
      if (b.soon) ms.push('<span class="ss-m warn">临近到期 ' + b.soon + '</span>');
      if (b.blocked) ms.push('<span class="ss-m">门禁未过 ' + b.blocked + '</span>');
      if (b.stage !== '已验收') {
        ms.push('<span class="ss-m">均值 分析 ' + b.ana + '% · 开发 ' + b.dev + '% · 测试 ' + b.test + '%</span>');
      }
      return '<section class="stage-sec" style="' + stageVars(b.stage) + '">' +
        '<div class="ss-head"><span class="ss-flag"></span>' +
        '<span class="ss-t">' + esc(b.stage) + '</span>' +
        '<span class="ss-n">' + b.count + ' 条</span>' +
        '<span class="ss-owner">' + esc(stageOwnerLabel(b.stage)) + '</span>' +
        '<span class="ss-metrics">' + ms.join('') + '</span></div>' +
        '<div class="ss-note">' + esc(stageTheme(b.stage).desc) + '</div>' +
        '<div class="req-grid">' + b.reqs.map(card).join('') + '</div></section>';
    }).join('');

    return '<div class="alert blue"><div>' + roleTag() + ' · <b>需求队列</b>（共 ' + total + ' 条 · 按阶段归类）：点任意卡片进入详情页，进行导入拆解、功能点确认与阶段流转。' +
      (can('fp.edit') ? '当前身份可导入需求并拆解功能点。' : '当前身份对本页为只读查看。') +
      '<div class="sub">' + esc(curRole().desc) + '</div></div></div>' +
      rail + (sections || '<div class="empty">暂无需求</div>');
  }

  /* 1-B 需求详情页：只保留「需求信息 → 导入/拆解 → 功能点清单 → 阶段流转」四块主线 */
  function vReqDetail() {
    var req = reqById(UI.reqId) || DB.requirements[0];
    UI.reqId = req.id;
    var fps = fpsOf(req.id);
    var shown = (req.parseTotal && !req.aiDone) ? fps.slice(0, req.parseShown || 0) : fps;
    var gate = E.stageGate(DB, req.id);
    var locked = !!req.confirmed;
    var editable = can('fp.edit');
    var pr = E.progress(DB, req.id);
    var conf = fps.filter(function (f) { return f.confirmed; }).length;
    var pendingCr = (DB.changeRequests || []).filter(function (c) { return c.reqId === req.id && c.status === '待审批'; });
    var allCr = (DB.changeRequests || []).filter(function (c) { return c.reqId === req.id; });

    /* ---- 顶部：返回 + 需求切换 + 关键标签（替代原左侧常驻需求队列，压低信息密度） ---- */
    var head = '<div class="card tight"><div class="card-h">' +
      '<div class="row"><button class="btn mini" data-act="wb-back">‹ 返回需求队列</button>' +
      '<select id="selImportReq" style="max-width:320px">' + DB.requirements.map(function (r) {
        return '<option value="' + r.id + '" ' + (r.id === req.id ? 'selected' : '') + '>' + esc(r.code + ' ' + r.title) + '</option>';
      }).join('') + '</select>' + priTag(req.priority) + stageTag(req.stage) +
      (locked ? tag('基准 ' + versionOf(req), 'green') : tag('功能点待确认', 'amber')) + '</div>' +
      '<div class="row"><span class="hint">阶段流转责任人：' + stageOwnerName(req.stage) + '</span>' +
      '<span class="hint">分析 ' + pr.anaProgress + '% · 开发 ' + pr.devProgress + '% · 测试 ' + pr.testProgress + '%</span>' +
      (locked ? '<button class="btn mini" data-act="goto-schedule">去排期</button>' : '') + '</div></div>' +
      '<div class="sub">' + esc(req.code) + ' · 来源 ' + esc(req.source) + ' · 创建 ' + esc(req.createdAt) + '</div>' +
      '<div class="req-desc">' + esc(req.desc) + '</div></div>';

    /* ---- 需求导入（仅未拆解时出现） ---- */
    var importPanel = '';
    if (!req.aiDone) {
      importPanel = '<div class="card"><div class="card-h"><h2>需求导入 · AI 拆解</h2>' +
        (editable ? '<span class="hint">演示用预置解析结果（MOCK）</span>' : lockedHint('fp.edit', '仅产品经理可导入与拆解')) + '</div>' +
        '<div class="form-row"><label>需求描述（可直接编辑）</label>' +
        '<textarea id="txtImport" rows="3" ' + (editable ? '' : 'disabled') + '>' + esc(req.desc) + '</textarea></div>' +
        '<div class="row"><button class="btn primary" data-act="ai-parse" ' + (editable ? '' : 'disabled') + '>开始 AI 分析</button>' +
        (req.parseTotal ? '<span class="muted">解析中… ' + (req.parseShown || 0) + '/' + req.parseTotal + '</span>' : '') +
        '</div></div>';
    }

    /* ---- 功能点清单（核心，始终展示） ---- */
    var fpRows = shown.map(function (f) {
      var cr = f.pendingChange ? crOf(f.pendingChange) : null;
      return '<tr class="fade-in">' +
        '<td><div>' + esc(f.name) + '</div><div class="sub">' + esc(f.desc) + '</div></td>' +
        '<td><span class="sys-chip main">' + esc(sysOf(f.mainSys).name) + '</span>' +
        (f.relSys || []).map(function (s) { return '<span class="sys-chip rel">' + esc(sysOf(s).name) + '</span>'; }).join('') + '</td>' +
        '<td>' + priTag(f.priority) + '</td>' +
        '<td class="num">' + (f.analysisHours || 0) + 'h</td>' +
        '<td>' + esc(f.ac) + '</td>' +
        '<td>' + (f.confirmed ? tag('已锁定', 'green') : tag('待确认', 'amber')) +
        (cr ? '<div class="sub">' + tag('变更审批中', 'purple') + '</div>' : '') + '</td>' +
        '<td><div class="row">' +
        '<button class="btn mini" data-act="fp-edit" data-id="' + f.id + '" ' + (editable ? '' : 'disabled') + '>' + (locked ? '变更编辑' : '编辑') + '</button>' +
        '<button class="btn mini" data-act="fp-del" data-id="' + f.id + '" ' + ((locked || !editable) ? 'disabled' : '') + '>删除</button>' +
        '</div></td></tr>';
    }).join('');

    var fpHeader = '<div class="card-h"><h2>功能点清单' + (locked ? '（基准数据 SSOT · ' + versionOf(req) + '）' : '') + '</h2>' +
      '<div class="row"><span class="hint">共 ' + fps.length + ' 个 · 已锁定 ' + conf + ' 个</span>' +
      (req.aiDone && editable ? '<button class="btn mini" data-act="fp-add">' + (locked ? '变更新增功能点' : '新增功能点') + '</button>' : '') +
      (!locked && req.aiDone && fps.length ? '<button class="btn primary mini" data-act="confirm-fp" ' + (can('fp.confirm') ? '' : 'disabled') + '>确认拆解结果并锁定</button>' : '') +
      (locked && can('change.req') ? '<button class="btn mini" data-act="cr-new" data-id="' + req.id + '">发起需求变更</button>' : '') +
      '</div></div>';

    var lockNote = locked
      ? '<div class="note-line"><b>基准已锁定且不可解锁</b>：调整请用「变更编辑」/「变更新增功能点」，经管理者审批通过后自动生成新版本（当前 ' +
      versionOf(req) + '）并留痕。已提交变更 ' + allCr.length + ' 条' + (pendingCr.length ? '，待审批 ' + pendingCr.length + ' 条' : '') + '</div>'
      : '<div class="note-line amber"><b>功能点尚未锁定</b>：确认前可自由增删改，且不参与排期与验收计算。</div>';

    var fpCard = '<div class="card">' + fpHeader + lockNote +
      '<div class="table-wrap"><table><thead><tr><th>功能点</th><th>涉及系统（主 / 关联）</th><th>优先级</th>' +
      '<th class="num">分析工时</th><th>验收标准</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      (fpRows || '<tr><td colspan="7" class="empty">暂无功能点，请先执行 AI 分析</td></tr>') + '</tbody></table></div></div>';

    /* ---- 阶段流转（门禁 + 分角色提交）；里程碑折叠进详情，降低首屏密度 ---- */
    var msList = DB.milestones.filter(function (m) { return m.reqId === req.id; });
    var msHTML = msList.map(function (m) {
      var cls = m.status === '已通过' ? 'ok' : (m.status === '已驳回' ? 'no' : 'wait');
      return '<div class="tl-item ' + cls + '"><div class="row"><b>' + esc(m.title) + '</b>' + statusTag(m.status) +
        '</div><div class="sub">' + esc(m.stage) + ' · 提交 ' + esc(pname(m.submitter)) + ' · 审批 ' + esc(pname(m.approver)) +
        ' · ' + esc(m.createdAt) + (m.decidedAt ? ' → ' + esc(m.decidedAt) : '') +
        (m.note ? '<br>意见：' + esc(m.note) : '') + '</div></div>';
    }).join('');

    var undone = gate.items.filter(function (x) { return !x.pass; }).length;
    var stageCard = '<div class="card"><div class="card-h"><h2>阶段流转 · 门禁校验</h2>' +
      '<span class="hint">前一阶段结果全部闭环才可流转 · 本阶段由「' + stageOwnerName(req.stage) + '」提交</span></div>' +
      '<div class="stage-flow">' + STAGES.map(function (s) {
        var cur = s === req.stage;
        var done = STAGES.indexOf(s) < STAGES.indexOf(req.stage);
        return '<span class="step' + (cur ? ' cur' : (done ? ' done' : '')) + '">' + esc(s) + '</span>';
      }).join('<span class="step-arrow">›</span>') + '</div>' +
      '<div class="gate-list">' + gate.items.map(function (x) {
        return '<div class="gate ' + (x.pass ? 'ok' : 'no') + '"><span class="g-ico">' + (x.pass ? '✓' : '✕') + '</span>' +
          '<span class="g-t">' + esc(x.label) + '</span><span class="g-d">' + esc(x.detail) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="row" style="margin-top:8px">' +
      (gate.next
        ? '<button class="btn primary" data-act="stage-next" data-req="' + req.id + '" ' + (canSubmitStage(req) && gate.ok ? '' : 'disabled') + '>提交下一阶段（' + gate.next + '）</button>'
        : '<span class="muted">已到最终阶段（已验收）</span>') +
      (gate.next && !gate.ok ? '<span class="muted">门禁未通过：' + undone + ' 项待完成</span>' : '') +
      stageSubmitHint(req) + '</div>' +
      '<details class="fold"><summary>里程碑 / 审批节点（' + msList.length + '）</summary><div class="tl">' +
      (msHTML || '<div class="empty">暂无里程碑</div>') + '</div></details></div>';

    return head + importPanel + fpCard + stageCard;
  }

  function vWorkbench() { return UI.reqOpen ? vReqDetail() : vReqList(); }

/* ==========================================================================
 * 第 2 部分：排期中心（分析 / 开发 / 测试 三阶段计划分离） + 计划看板
 * ========================================================================== */

  /* 手动计划行（归入对应阶段计划中，标注来源） */
  function mpRow(mp, today) {
    var canM = can('plan.manual');
    var rec = mp.rec;
    return '<tr class="row-manual"><td><div>' + esc(mp.name) + '</div><div class="sub">' +
      tag('手动计划', 'gray') + ' ' + esc(mp.note || '计划外工作') + '</div></td>' +
      '<td>' + esc(pname(mp.personId)) + '</td>' +
      '<td class="num">' + mp.hours + 'h</td>' +
      '<td>' + esc(mp.earliest) + workdayNote(mp.earliest) + '</td>' +
      '<td>' + periodCell(mp.plan, rec, '', today) + '</td>' +
      '<td>' + (mp.plan ? tag('已排期', 'green') : tag('待排期', 'amber')) + '</td>' +
      '<td><div class="row">' + (canM
        ? (mp.plan
          ? '<button class="btn mini" data-act="adjust-date" data-id="' + mp.id + '" data-kind="plan">改期</button>' +
          '<button class="btn mini" data-act="mp-del" data-id="' + mp.id + '">删除</button>'
          : '<button class="btn mini" data-act="mp-rec" data-id="' + mp.id + '">推荐周期</button>' +
          (rec ? '<button class="btn primary mini" data-act="mp-accept" data-id="' + mp.id + '">采用</button>' : '') +
          '<button class="btn mini" data-act="mp-del" data-id="' + mp.id + '">删除</button>')
        : '<span class="muted">只读</span>') + '</div></td></tr>';
  }

  function vSchedule() {
    var reqId = UI.schedReqId;
    var req = reqById(reqId) || DB.requirements[0];
    UI.schedReqId = req.id;
    var fps = fpsConfirmed(req.id);
    var tasks = tasksOfReq(req.id);
    var trs = testsOfReq(req.id);
    var pr = E.progress(DB, req.id);
    var warns = E.relSysWarnings(DB, req.id).filter(function (w) {
      var f = fpById(w.fp.id);
      return f && !f.parallel;
    });
    var today = DB.meta.demoDate;
    var canA = can('sched.analysis'), canD = can('sched.dev'), canM = can('plan.manual'), canT = can('test.sched');
    var canAS = can('task.analysis'), canTS = can('task.test');

    var roleTip = '<div class="alert ' + ((canA || canD || canT) ? 'blue' : 'amber') + '"><div>' + roleTag() +
      ' · 本页能力：分析计划「' + (canA ? '可操作' : '只读') + '」· 开发计划「' + (canD ? '可操作' : '只读') +
      '」· 测试计划「' + (canT ? '可操作' : '只读') + '」· 手动添加计划「' + (canM ? '可操作（' + manualTypes().join('/') + '）' : '不可用') + '」' +
      '<div class="sub">' + esc(curRole().desc) + '</div></div>' +
      '<button class="btn mini" data-act="role-matrix">角色能力矩阵</button></div>';

    var head = '<div class="card"><div class="card-h"><h2>选择需求</h2><div class="row">' +
      '<select id="selSchedReq">' + DB.requirements.map(function (r) {
        return '<option value="' + r.id + '" ' + (r.id === req.id ? 'selected' : '') + '>' + esc(r.code + ' ' + r.title) + '</option>';
      }).join('') + '</select>' + priTag(req.priority) + stageTag(req.stage) +
      (req.confirmed ? tag('基准 ' + versionOf(req), 'green') : tag('功能点未锁定', 'amber')) + '</div></div>' +
      '<div class="grid c4" style="margin-top:4px">' +
      '<div class="kpi"><div class="k">分析完成</div><div class="v">' + pr.anaDone + '/' + pr.anaTotal + '</div><div class="sub">已排期 ' + pr.anaPlanned + ' 项</div></div>' +
      '<div class="kpi"><div class="k">开发完成</div><div class="v">' + pr.fpDevDone + '/' + pr.fpTotal + '</div><div class="sub">任务 ' + pr.taskDone + '/' + pr.taskTotal + ' 条</div></div>' +
      '<div class="kpi"><div class="k">测试完成</div><div class="v">' + pr.fpTestDone + '/' + pr.fpTotal + '</div><div class="sub">记录 ' + pr.testDone + '/' + pr.testTotal + ' 条</div></div>' +
      '<div class="kpi"><div class="k">门禁状态</div><div class="v">' + (E.stageGate(DB, req.id).ok ? '通过' : '未通过') + '</div><div class="sub">' +
      (nextStage(req.stage) ? '下一阶段：' + nextStage(req.stage) : '已到最终阶段') + '</div></div></div>' +
      '<div class="sub">' + esc(req.desc) + '</div></div>';

    /* ---------------- 1 · 分析阶段计划 ---------------- */
    var aRows = fps.map(function (f) {
      var rec = f.rec;
      var earliest = f.draftStart || DB.meta.demoDate;
      var done = f.analysisStatus === '已完成';
      return '<tr>' +
        '<td><div>' + esc(f.name) + '</div><div class="sub">' + esc(sysOf(f.mainSys).name) + ' · ' + f.priority + '</div></td>' +
        '<td class="num"><input type="number" style="width:62px" data-chg="analyst-hours" data-id="' + f.id + '" value="' +
        (f.draftHours != null ? f.draftHours : f.analysisHours) + '" ' + (f.analysisPlan || !canA ? 'disabled' : '') + '></td>' +
        '<td><select data-chg="analyst" data-id="' + f.id + '" ' + (f.analysisPlan || !canA ? 'disabled' : '') + '>' +
        '<option value="">选择执行人</option>' +
        peopleByRole('PM').map(function (p) {
          return '<option value="' + p.id + '" ' + ((f.draftAnalyst || f.analyst) === p.id ? 'selected' : '') + '>' + esc(p.name + ' · ' + p.title) + '</option>';
        }).join('') + '</select></td>' +
        '<td><input type="date" data-chg="analyst-start" data-id="' + f.id + '" value="' + esc(earliest) + '" ' +
        (f.analysisPlan || !canA ? 'disabled' : '') + '>' + workdayNote(earliest) + '</td>' +
        '<td>' + periodCell(f.analysisPlan, rec, f.analysisPlan && f.analyst ? ' · ' + pname(f.analyst) : '', today) + '</td>' +
        '<td><select data-chg="analysis-status" data-id="' + f.id + '" ' +
        (!f.analysisPlan || !canAS ? 'disabled' : '') + '>' +
        ['未开始', '进行中', '已完成'].map(function (s) { return '<option ' + (f.analysisStatus === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select>' + (done ? '<div class="sub ok-cell">已完成</div>' : '') + '</td>' +
        '<td><div class="row">' +
        (f.analysisPlan
          ? (canA ? '<button class="btn mini" data-act="adjust-date" data-id="' + f.id + '" data-kind="analysis">改期</button>' +
            '<button class="btn mini" data-act="clear-analysis" data-id="' + f.id + '">撤销</button>' : '<span class="muted">只读</span>')
          : (canA ? '<button class="btn mini" data-act="rec-analysis" data-id="' + f.id + '">推荐周期</button>' +
            (rec ? '<button class="btn primary mini" data-act="accept-analysis" data-id="' + f.id + '">采用</button>' : '') : '<span class="muted">只读</span>')) +
        '</div></td></tr>';
    }).concat(mpsOf(req.id, '分析').map(function (mp) { return mpRow(mp, today); })).join('');

    /* ---------------- 2 · 开发阶段计划 ---------------- */
    var introList = fps.map(function (f) {
      var introduced = tasks.filter(function (t) { return t.fpid === f.id; }).length > 0;
      return '<label><input type="checkbox" data-chg="pick" data-id="' + f.id + '" ' +
        (UI.pick[f.id] !== false ? 'checked' : '') + ' ' + (introduced || !canD ? 'disabled' : '') + '>' +
        esc(f.name) + (introduced ? ' ' + tag('已引入', 'gray') : (f.relSys && f.relSys.length ? ' ' + tag(f.relSys.length + ' 个关联系统', 'purple') : '')) +
        '</label>';
    }).join('');

    var tRows = tasks.map(function (t) {
      var f = fpById(t.fpid);
      var isMain = f && t.sysId === f.mainSys;
      var rec = t.rec;
      var earliest = t.draftStart || t.start || DB.meta.demoDate;
      return '<tr>' +
        '<td><div>' + esc(f ? f.name : '—') + '</div><div class="sub">' + (f ? f.priority : '') + '</div></td>' +
        '<td><span class="sys-chip ' + (isMain ? 'main' : 'rel') + '">' + esc(sysOf(t.sysId).name) + '</span></td>' +
        '<td>' + (isMain ? tag('主系统', 'blue') : tag('关联系统', 'purple')) + '</td>' +
        '<td><select data-chg="task-assignee" data-id="' + t.id + '" ' + (!canD ? 'disabled' : '') + '><option value="">选择实施人</option>' +
        peopleByRole('DEV').map(function (p) {
          return '<option value="' + p.id + '" ' + ((t.draftAssignee || t.assignee) === p.id ? 'selected' : '') + '>' + esc(p.name + ' · ' + p.title) + '</option>';
        }).join('') + '</select></td>' +
        '<td class="num"><input type="number" style="width:62px" data-chg="task-hours" data-id="' + t.id + '" value="' +
        (t.draftHours != null ? t.draftHours : (t.hours || 8)) + '" ' + (!canD ? 'disabled' : '') + '></td>' +
        '<td><input type="date" data-chg="task-start" data-id="' + t.id + '" value="' + esc(earliest) + '" ' + (!canD ? 'disabled' : '') + '>' +
        workdayNote(earliest) + '</td>' +
        '<td>' + periodCell(t.start ? { start: t.start, end: t.end, days: t.planDaily ? t.planDaily.length : E.diffDays(t.start, t.end) + 1, daily: t.planDaily || [] } : null,
          rec, t.assignee ? ' · ' + pname(t.assignee) : '', today) + '</td>' +
        '<td>' + (canD
          ? '<select data-chg="task-status" data-id="' + t.id + '">' +
            STATUS.map(function (s) { return '<option ' + (t.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select>'
          : statusTag(t.status)) + '</td>' +
        '<td><div class="row">' +
        (!canD ? '<span class="muted">只读</span>' :
          (rec ? '<button class="btn primary mini" data-act="accept-dev" data-id="' + t.id + '">采用推荐</button>' : '') +
          (t.start ? '<button class="btn mini" data-act="adjust-date" data-id="' + t.id + '" data-kind="dev">改期</button>' : '') +
          (t.start && t.status !== '已完成' ? '<button class="btn mini teal" data-act="task-done" data-id="' + t.id + '">标记完成</button>' : '') +
          (t.start ? '<button class="btn mini" data-act="task-change" data-id="' + t.id + '">发起计划变更</button>' : '')) +
        '</div></td></tr>';
    }).concat(mpsOf(req.id, '开发').map(function (mp) { return mpRow(mp, today); })).join('');

    /* ---------------- 3 · 测试阶段计划 ---------------- */
    var testRows = trs.map(function (r) {
      var f = fpById(r.fpid);
      var src = r.taskId ? taskById(r.taskId) : null;
      var rec = r.rec;
      var earliest = r.draftStart || r.start || DB.meta.demoDate;
      return '<tr>' +
        '<td><div>' + esc(f ? f.name : '—') + '</div><div class="sub">' + (src ? '源任务：' + esc(sysOf(src.sysId).name) + ' · ' + esc(pname(src.assignee))
          : '<span class="muted">手动测试计划</span>') + '</div></td>' +
        '<td><select data-chg="test-assignee" data-id="' + r.id + '" ' + (!canT ? 'disabled' : '') + '>' +
        '<option value="">选择测试人</option>' +
        peopleByRole('QA').map(function (p) {
          return '<option value="' + p.id + '" ' + ((r.draftAssignee || r.assignee) === p.id ? 'selected' : '') + '>' + esc(p.name + ' · ' + p.title) + '</option>';
        }).join('') + '</select></td>' +
        '<td class="num"><input type="number" style="width:62px" data-chg="test-hours" data-id="' + r.id + '" value="' +
        (r.draftHours != null ? r.draftHours : r.hours) + '" ' + (!canT ? 'disabled' : '') + '></td>' +
        '<td><input type="date" data-chg="test-start" data-id="' + r.id + '" value="' + esc(earliest) + '" ' + (!canT ? 'disabled' : '') + '>' +
        workdayNote(earliest) + '</td>' +
        '<td>' + periodCell(r.start ? { start: r.start, end: r.end, days: r.planDaily ? r.planDaily.length : E.diffDays(r.start, r.end) + 1, daily: r.planDaily || [] } : null,
          rec, r.assignee ? ' · ' + pname(r.assignee) : '', today) + '</td>' +
        '<td><select data-chg="test-status" data-id="' + r.id + '" ' + (!canTS ? 'disabled' : '') + '>' +
        STATUS.map(function (s) { return '<option ' + (r.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></td>' +
        '<td><div class="row">' +
        (!canT ? '<span class="muted">只读</span>' :
          (rec ? '<button class="btn primary mini" data-act="accept-test" data-id="' + r.id + '">采用推荐</button>' : '') +
          (r.start ? '<button class="btn mini" data-act="adjust-date" data-id="' + r.id + '" data-kind="test">改期</button>' : '') +
          (r.start && r.status !== '已完成' && canTS ? '<button class="btn mini teal" data-act="test-done" data-id="' + r.id + '">标记完成</button>' : '')) +
        '</div></td></tr>';
    }).concat(mpsOf(req.id, '测试').map(function (mp) { return mpRow(mp, today); })).join('');

    var warnHTML = warns.map(function (w) {
      return '<div class="alert amber"><div><b>关联系统排期晚于主系统</b>：功能点「' + esc(w.fp.name) + '」主系统 ' +
        esc(sysOf(w.main.sysId).name) + ' 完成于 ' + esc(w.main.end) + '，关联系统 ' + esc(sysOf(w.rel.sysId).name) +
        ' 完成于 ' + esc(w.rel.end) + '（晚 ' + w.gapDays + ' 天），整体交付受关联系统制约。</div>' +
        '<div class="actions">' + (canD
          ? '<button class="btn mini" data-act="shift-main" data-id="' + w.main.id + '" data-gap="' + w.gapDays + '">顺延主系统</button>' +
          '<button class="btn mini" data-act="mark-parallel" data-id="' + w.rel.id + '">标记并行</button>'
          : '<span class="muted">待开发负责人处置</span>') + '</div></div>';
    }).join('');

    var seqTip = '<span class="hint">排期规则：每天 7.6~8.5 小时，超出自动顺延后续工作日</span>';
    var mpBtn = function (kind) {
      return '<button class="btn mini" data-act="mp-add" data-kind="' + kind + '" ' + (canM ? '' : 'disabled') + '>手动添加' + kind + '计划</button>' +
        (canM ? '' : lockedHint('plan.manual', '仅产品经理 / 开发 / 测试可添加'));
    };

    /* ---------- 阶段流转卡：让开发 / 测试在自己的环节也能收口并提交 ---------- */
    var gate = E.stageGate(DB, req.id);
    var undone = gate.items.filter(function (x) { return !x.pass; }).length;
    var stageCard = '<div class="card"><div class="card-h"><h2>阶段流转 · 门禁校验</h2>' +
      '<span class="hint">本阶段「' + esc(req.stage) + '」由「' + stageOwnerName(req.stage) + '」提交；前一阶段结果闭环后才可流转</span></div>' +
      '<div class="stage-flow">' + STAGES.map(function (s) {
        var cur = s === req.stage;
        var done = STAGES.indexOf(s) < STAGES.indexOf(req.stage);
        return '<span class="step' + (cur ? ' cur' : (done ? ' done' : '')) + '">' + esc(s) + '</span>';
      }).join('<span class="step-arrow">›</span>') + '</div>' +
      '<div class="row" style="margin-top:8px">' +
      (gate.next
        ? '<button class="btn primary" data-act="stage-next" data-req="' + req.id + '" ' + (canSubmitStage(req) && gate.ok ? '' : 'disabled') + '>提交下一阶段（' + gate.next + '）</button>'
        : '<span class="muted">已到最终阶段（已验收）</span>') +
      (gate.next && !gate.ok ? '<span class="muted">门禁未通过：' + undone + ' 项待完成</span>' : '') +
      stageSubmitHint(req) + '</div>' +
      '<div class="collapse-wrap">' + gateListHTML(gate) + '</div></div>';

    return roleTip + head + stageCard +

      '<div class="card"><div class="card-h"><h2>1 · 分析阶段计划（产品经理）</h2>' + seqTip + '</div>' +
      '<div class="row" style="margin-bottom:8px">' +
      '<button class="btn primary mini" data-act="auto-analysis" ' + (canA ? '' : 'disabled') + '>一键自动排期（自动选人/日期）</button>' +
      '<button class="btn mini" data-act="accept-all-analysis" ' + (canA ? '' : 'disabled') + '>全部采用推荐</button>' +
      '<button class="btn mini" data-act="analysis-done-all" ' + (canAS ? '' : 'disabled') + '>一键标记分析完成</button>' +
      mpBtn('分析') +
      '<span class="spacer"></span><span class="hint">分析完成后「分析 → 开发」门禁才可通过</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>功能点</th><th class="num">分析工时</th><th>执行人</th>' +
      '<th>最早开始日</th><th>排期周期</th><th>分析状态</th><th>操作</th></tr></thead><tbody>' +
      (aRows || '<tr><td colspan="7" class="empty">该需求暂无已锁定的功能点，请先在「需求工作台」完成拆解确认</td></tr>') +
      '</tbody></table></div></div>' +

      '<div class="card"><div class="card-h"><h2>2 · 开发阶段计划（开发资源）</h2>' + seqTip + '</div>' +
      '<div class="chk-group" style="margin-bottom:10px">' + (introList || '<span class="muted">暂无可引入的功能点</span>') + '</div>' +
      '<div class="row" style="margin-bottom:10px">' +
      '<button class="btn primary" data-act="intro-dev" ' + (canD ? '' : 'disabled') + '>从已勾选功能点引入任务</button>' +
      '<button class="btn" data-act="auto-dev" ' + (canD ? '' : 'disabled') + '>一键自动排期（自动选人/日期）</button>' +
      '<button class="btn" data-act="accept-all-rec" ' + (canD ? '' : 'disabled') + '>全部采用推荐</button>' +
      '<button class="btn mini" data-act="bulk-dev-done" data-id="' + req.id + '" ' + (can('task.status') ? '' : 'disabled') + '>一键标记全部完成</button>' +
      mpBtn('开发') +
      '<span class="spacer"></span>' +
      '<button class="btn teal" data-act="plan-apply" ' + (canD ? '' : 'disabled') + '>计划生效（提交审批）</button></div>' +
      (!canD ? lockedHint('sched.dev', '开发计划由开发负责人操作') : '') +
      (warnHTML || '<div class="alert blue"><div>关联系统校验：当前无「关联系统晚于主系统」情况。</div></div>') +
      '<div class="table-wrap"><table><thead><tr><th>功能点</th><th>系统</th><th>类型</th><th>实施人</th>' +
      '<th class="num">实施工时</th><th>最早开始日</th><th>排期周期</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      (tRows || '<tr><td colspan="9" class="empty">暂无开发任务，请先引入功能点</td></tr>') + '</tbody></table></div>' +
      '<div class="sub">说明：状态可在本页直接维护（下拉或「标记完成」），完成后「开发 → 测试」门禁才可通过；' +
      '每生成一条开发任务，系统自动派生 1 条对应测试记录；计划生效时会冻结计划基准，供「计划 vs 实际」对比与变更评估。</div></div>' +

      '<div class="card"><div class="card-h"><h2>3 · 测试阶段计划（测试资源）</h2>' +
      '<span class="hint">与开发计划分离：测试记录由开发任务派生，可独立排期与维护；与开发仅为上下游关系</span></div>' +
      '<div class="row" style="margin-bottom:10px">' +
      '<button class="btn primary mini" data-act="auto-test" ' + (canT ? '' : 'disabled') + '>一键自动排期（测试人/日期）</button>' +
      '<button class="btn mini" data-act="accept-all-test" ' + (canT ? '' : 'disabled') + '>全部采用推荐</button>' +
      '<button class="btn mini" data-act="bulk-test-done" data-id="' + req.id + '" ' + (canTS ? '' : 'disabled') + '>一键标记全部完成</button>' +
      mpBtn('测试') +
      '<span class="spacer"></span><span class="hint">测试人按各自已有工作量推荐（不默认固定一人）；最早开始日接续开发完成日</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>功能点 / 源任务</th><th>测试人</th><th class="num">测试工时</th>' +
      '<th>最早开始日</th><th>排期周期</th><th>测试状态</th><th>操作</th></tr></thead><tbody>' +
      (testRows || '<tr><td colspan="7" class="empty">暂无测试记录，请先在开发阶段引入任务（自动派生测试记录）</td></tr>') +
      '</tbody></table></div></div>';
  }

  /* ======================= 视图 3：计划看板（可读性重做） ======================= */
  function vBoard() {
    var today = DB.meta.demoDate;
    var reqs = E.queueSorted(DB);
    var rem = E.reminders(DB);
    var conf = E.conflicts(DB);
    var pendingMs = (DB.milestones || []).filter(function (m) { return m.status === '待审批'; });
    var pendingCr = (DB.changeRequests || []).filter(function (c) { return c.status === '待审批'; });
    var openTasks = (DB.devTasks || []).filter(function (t) { return t.status !== '已完成'; });

    var kpis = '<div class="grid c5">' +
      '<div class="kpi"><div class="k">需求总数</div><div class="v">' + DB.requirements.length + '</div><div class="sub">在队列 ' + reqs.length + ' 条</div></div>' +
      '<div class="kpi"><div class="k">在办任务</div><div class="v">' + openTasks.length + '</div><div class="sub">开发任务共 ' + (DB.devTasks || []).length + ' 条</div></div>' +
      '<div class="kpi"><div class="k">资源冲突</div><div class="v ' + (conf.length ? 'bad' : '') + '">' + conf.length + '</div><div class="sub">按人检查排期重叠</div></div>' +
      '<div class="kpi"><div class="k">到期提醒</div><div class="v ' + (rem.length ? 'bad' : '') + '">' + rem.length + '</div><div class="sub">&gt;10h 提前 2 天 / ≤10h 提前 1 天</div></div>' +
      '<div class="kpi"><div class="k">待审批</div><div class="v">' + (pendingMs.length + pendingCr.length) + '</div><div class="sub">阶段 ' + pendingMs.length + ' · 变更 ' + pendingCr.length + '</div></div></div>';

    /* --- 排期时间轴（按人泳道） --- */
    var CELL = 58;
    var lane = E.scheduleLanes(DB, { from: today, count: 10 });
    var laneHead = '<div class="lane-head"><div class="lane-name">成员 / 日期</div>' +
      '<div class="lane-days">' + lane.days.map(function (d) {
        var wd = ['日', '一', '二', '三', '四', '五', '六'][E.toDate(d).getDay()];
        return '<div class="lane-day' + (d === today ? ' today' : '') + '" style="width:' + CELL + 'px">' +
          esc(d.slice(5)) + '<div class="wd">周' + wd + '</div></div>';
      }).join('') + '</div></div>';
    var laneRows = lane.rows.map(function (r) {
      var p = person(r.personId);
      var bars = r.bars.map(function (b) {
        var cls = 'lane-bar k-' + KIND_CLS[b.kind] + (b.status === '已完成' ? ' done' : (b.status === '进行中' ? ' doing' : ''));
        var w = Math.max(b.span * CELL - 6, 34);
        return '<div class="' + cls + '" style="left:' + (b.left * CELL + 3) + 'px;width:' + w + 'px" title="' +
          esc(b.kind + '｜' + b.label + '｜' + b.start + ' → ' + b.end + '｜' + b.status) + '">' + esc(b.label) + '</div>';
      }).join('');
      return '<div class="lane-row"><div class="lane-name">' + esc(p.name) +
        '<div class="lane-sub">' + esc(p.title) + ' · ' + r.count + ' 项</div></div>' +
        '<div class="lane-bars" style="--cell:' + CELL + 'px;width:' + (lane.days.length * CELL) + 'px">' + bars + '</div></div>';
    }).join('') || '<div class="empty">当前时间窗口内无排期</div>';

    var laneCard = '<div class="card"><div class="card-h"><h2>排期时间轴（按人泳道）</h2>' +
      '<div class="row"><span class="hint">自演示时点 ' + esc(today) + ' 起 10 个工作日</span>' +
      '<span class="legend"><i class="lg k-ana"></i>分析</span><span class="legend"><i class="lg k-dev"></i>开发</span>' +
      '<span class="legend"><i class="lg k-test"></i>测试</span>' +
      '<span class="legend"><i class="lg done"></i>已完成</span></div></div>' +
      '<div class="lane-wrap"><div class="lane">' + laneHead + laneRows + '</div></div>' +
      '<div class="sub">条状块为任务排期区间；灰化删除线表示已完成。横轴为工作日，可在侧边栏修改「演示时点」切换观察窗口。</div></div>';

    /* --- 需求插队看板 --- */
    var queueHTML = reqs.map(function (r, i) {
      var scope = E.impactScope(DB, r.id);
      var pr = E.progress(DB, r.id);
      return '<div class="queue-item' + (i === 0 ? ' q-top' : '') + '"><span class="pos">' + (i + 1) + '</span>' +
        '<div style="flex:1"><div class="q-t">' + esc(r.code) + ' · ' + esc(r.title) + '</div>' +
        '<div class="sub">' + priTag(r.priority) + ' ' + stageTag(r.stage) +
        ' · 功能点 ' + scope.fpCount + ' 个 · 任务 ' + scope.taskCount + ' 条 · 涉及 ' + scope.people.length + ' 人</div>' +
        '<div class="bar-row"><span class="lbl">开发</span>' + progBar(pr.devProgress) + '<span class="val">' + pr.devProgress + '%</span>' +
        '<span class="lbl">测试</span>' + progBar(pr.testProgress) + '<span class="val">' + pr.testProgress + '%</span></div></div></div>';
    }).join('');

    var imp = DB.lastInsertImpact;
    var impHTML = '';
    if (imp) {
      impHTML = '<div class="alert amber"><div><b>最近一次插队：</b>' + esc(imp.code) + ' ' + esc(imp.title) +
        ' 由第 ' + imp.from + ' 位插至第 ' + imp.to + ' 位（占用开发窗口 ' + imp.insertedDays + ' 天）<br>' +
        (imp.displaced.length
          ? '被插队需求：' + imp.displaced.map(function (d) {
            return esc(d.title) + '（顺延 ' + d.delayDays + ' 天，受影响任务 ' + d.taskCount + ' 条 / ' + d.people + ' 人）';
          }).join('；')
          : '无被插队需求') + '</div></div>';
    }

    /* --- 资源冲突 --- */
    var conflictHTML = conf.map(function (c) {
      return '<div class="conflict"><div class="c-head">' + esc(pname(c.personId)) + ' · ' + esc(c.from) + ' → ' + esc(c.to) +
        '（' + c.days + ' 天）' + tag('同时 2 条任务', 'red') + '</div>' +
        '<div class="c-row">' + esc(fpById(c.a.fpid) ? fpById(c.a.fpid).name : '') + ' / ' + esc(sysOf(c.a.sysId).name) +
        '<span class="muted"> ' + esc(c.a.start) + ' → ' + esc(c.a.end) + '</span></div>' +
        '<div class="c-row">' + esc(fpById(c.b.fpid) ? fpById(c.b.fpid).name : '') + ' / ' + esc(sysOf(c.b.sysId).name) +
        '<span class="muted"> ' + esc(c.b.start) + ' → ' + esc(c.b.end) + '</span></div></div>';
    }).join('') || '<div class="alert green"><div>当前无人员资源冲突。</div></div>';

    /* --- 到期提醒 --- */
    var remHTML = rem.map(function (x) {
      var t = x.task, f = fpById(t.fpid);
      var urgent = x.info.daysLeft <= 1;
      return '<div class="rem-card ' + (urgent ? 'urgent' : '') + '">' +
        '<div class="rc-top">' + tag(x.info.over10 ? '重任务提醒' : '到期提醒', urgent ? 'red' : 'amber') +
        '<span class="rc-days">剩 ' + x.info.daysLeft + ' 天</span></div>' +
        '<div class="rc-t">' + esc(f ? f.name : '') + '</div>' +
        '<div class="sub">' + esc(sysOf(t.sysId).name) + ' · 负责人 ' + esc(pname(t.assignee)) + ' · ' +
        t.hours + 'h · 截止 ' + esc(t.end) + '</div>' +
        '<div class="sub">触发规则：' + esc(x.info.ruleText) + '</div></div>';
    }).join('') || '<div class="alert green"><div>当前无到期提醒。</div></div>';

    var judgeRows = (DB.devTasks || []).filter(function (t) { return t.status !== '已完成' && t.end; }).map(function (t) {
      var info = E.dueInfo(t, today);
      return '<tr><td>' + esc(fpById(t.fpid) ? fpById(t.fpid).name : '') + '</td>' +
        '<td>' + esc(sysOf(t.sysId).name) + '</td><td>' + esc(pname(t.assignee)) + '</td>' +
        '<td class="num">' + t.hours + 'h</td><td>' + esc(t.end) + '</td>' +
        '<td class="num">' + info.daysLeft + '</td>' +
        '<td>' + esc(info.ruleText) + '</td>' +
        '<td>' + (info.remind ? tag('提醒', 'red') : tag('不提醒', 'gray')) + '</td></tr>';
    }).join('');

    /* --- 变更留痕 --- */
    var changeHTML = (DB.changes || []).slice(0, 40).map(function (c) {
      return '<tr><td class="sub">' + esc(c.at) + '</td><td>' + tag(c.type, 'purple') + '</td>' +
        '<td>' + esc(c.detail) + '</td><td class="sub">' + esc(c.before) + '</td><td class="sub">' + esc(c.after) + '</td>' +
        '<td class="sub">' + esc(c.reason) + '</td><td class="sub">' + esc(c.by) + '</td></tr>';
    }).join('');

    return todoCard() + kpis + laneCard +
      '<div class="grid c2b">' +
      '<div class="card"><div class="card-h"><h2>需求插队看板</h2>' +
      '<div class="row"><button class="btn primary mini" data-act="sim-insert" ' + (can('plan.insert') ? '' : 'disabled') + '>模拟插队</button>' +
      (!can('plan.insert') ? lockedHint('plan.insert', '仅管理者可调整队列') : '') + '</div></div>' +
      queueHTML + impHTML + '</div>' +

      '<div class="card"><div class="card-h"><h2>人员资源冲突</h2><span class="hint">按人检查重叠排期</span></div>' +
      conflictHTML + '</div></div>' +

      '<div class="card"><div class="card-h"><h2>任务到期提醒中心</h2>' +
      '<span class="hint">工作量 &gt;10h → 到期前 2 天提醒 · ≤10h → 到期前 1 天提醒</span></div>' +
      '<div class="rem-grid">' + remHTML + '</div>' +
      '<details style="margin-top:8px"><summary>查看全部在办任务的判定明细（用于验证提醒规则边界）</summary>' +
      '<div class="table-wrap"><table><thead><tr><th>功能点</th><th>系统</th><th>负责人</th><th class="num">工作量</th>' +
      '<th>截止日</th><th class="num">剩余天数</th><th>适用规则</th><th>判定</th></tr></thead><tbody>' +
      (judgeRows || '<tr><td colspan="8" class="empty">暂无在办任务</td></tr>') + '</tbody></table></div>' +
      '<div class="sub">提示：可在侧边栏修改「演示时点」观察提醒随日期变化。</div></details></div>' +

      '<div class="card"><div class="card-h"><h2>变更与插队留痕</h2><span class="hint">改前 / 改后 / 原因 / 操作人</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>时间</th><th>类型</th><th>变更内容</th><th>改前</th>' +
      '<th>改后</th><th>原因</th><th>操作人</th></tr></thead><tbody>' +
      (changeHTML || '<tr><td colspan="7" class="empty">暂无变更记录</td></tr>') + '</tbody></table></div></div>';
  }

/* ==========================================================================
 * 第 3 部分：执行跟踪 / 验收评估 / 事件处理 / 业务动作 / 初始化
 * ========================================================================== */

  /* 当前角色待办（角色差异化） */
  function todoCard() {
    var t = myTodos();
    if (!t.length) return '<div class="alert green"><div>' + roleTag() + ' 当前没有待办，可查看其他视图。</div></div>';
    return '<div class="card tight"><div class="card-h"><h2>我的待办（' + esc(curRole().name) + '）</h2>' +
      '<span class="hint">按角色汇总，点击可跳转</span></div><div class="row">' +
      t.slice(0, 8).map(function (x) {
        return '<button class="btn mini" data-act="todo-goto" data-id="' + esc(x.id) + '" data-view="' + esc(x.view) + '">' + esc(x.text) + '</button>';
      }).join('') + '</div></div>';
  }

  /* ======================= 视图 4：数据看板 ======================= */
  /* 三张看板：① 月度需求数量变化 ② 需求提出部门维度统计 ③ 月度分析/开发/测试工作量（四维度切换）
     全部用零依赖 SVG / CSS 绘制，不引入任何图表库 */

  var CHART_PALETTE = ['blue', 'amber', 'purple', 'green', 'teal', 'red'];
  function chartVar(k) { return 'var(--' + k + ')'; }
  function svgEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* 轴刻度取整：返回 { step, top }，保证刻度是 1/2/3/5/7.5/10 × 10^n 这类整齐值 */
  function niceAxis(max, ticks) {
    ticks = ticks || 4;
    var raw = Math.max(1, max) / ticks;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var mul = norm <= 1 ? 1 : (norm <= 2 ? 2 : (norm <= 3 ? 3 : (norm <= 5 ? 5 : (norm <= 7.5 ? 7.5 : 10))));
    var step = mul * mag;
    return { step: step, top: Math.ceil(max / step) * step };
  }
  function axisTicks(ax) {
    var out = [];
    for (var v = 0; v <= ax.top + 1e-9; v += ax.step) out.push(Math.round(v * 100) / 100);
    return out;
  }
  /* 环比变化标记：上升蓝 / 下降琥珀 / 持平灰（只表达方向，不带好坏判断） */
  function deltaTag(v, unit) {
    if (!v) return '<span class="delta flat">持平</span>';
    return '<span class="delta ' + (v > 0 ? 'up' : 'down') + '">' + (v > 0 ? '+' : '') + v + (unit || '') + '</span>';
  }
  /* 维度键 → 可读名称（键不是已知 id 时原样返回，兜底分组如「未指派人员」不会被误映射） */
  function dimLabel(dim, key) {
    if (dim === 'owner') {
      var p = (DB.people || []).filter(function (x) { return x.id === key; })[0];
      return p ? p.name : key;
    }
    if (dim === 'sys') {
      var s = (DB.systems || []).filter(function (x) { return x.id === key; })[0];
      return s ? s.name : key;
    }
    return key;
  }

  /* ---------- 图 1：月度需求数量变化（柱 + 趋势折线，本月高亮） ---------- */
  function reqTrendSVG() {
    var rows = E.monthlyReqCount(DB);
    if (!rows.length) return '<div class="empty">暂无数据</div>';
    var W = 680, H = 236, PL = 40, PR = 18, PT = 30, PB = 42;
    var pw = W - PL - PR, ph = H - PT - PB;
    var max = 1;
    rows.forEach(function (r) { if (r.total > max) max = r.total; });
    var ax = niceAxis(max, 3);
    var y = function (v) { return PT + ph - (v / ax.top) * ph; };
    var slot = pw / rows.length;
    var bw = Math.min(38, slot * 0.48);
    var g = [];

    axisTicks(ax).forEach(function (v) {
      var yy = y(v);
      g.push('<line class="grid-line" x1="' + PL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + yy.toFixed(1) + '"/>');
      g.push('<text class="axis-t" x="' + (PL - 9) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end">' + v + '</text>');
    });

    var cxOf = function (i) { return PL + slot * i + slot / 2; };
    rows.forEach(function (r, i) {
      var cx = cxOf(i), x = cx - bw / 2;
      var h = Math.max(1.5, (r.total / ax.top) * ph);
      var yy = PT + ph - h;
      var cur = i === rows.length - 1;
      g.push('<rect class="sv-bar" x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + h.toFixed(1) + '" rx="5" fill="' + chartVar(cur ? 'amber-line' : 'blue') + '" opacity="' + (cur ? 1 : 0.82) + '">' +
        '<title>' + r.month + ' 新增 ' + r.total + ' 条</title></rect>');
      g.push('<text class="pt-t" x="' + cx.toFixed(1) + '" y="' + (yy - 7).toFixed(1) + '" text-anchor="middle">' + r.total + '</text>');
    });

    var pts = rows.map(function (r, i) { return [cxOf(i), y(r.total)]; });
    g.push('<polyline fill="none" stroke="' + chartVar('teal') + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' +
      pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>');
    pts.forEach(function (p) {
      g.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.4" fill="#fff" stroke="' + chartVar('teal') + '" stroke-width="2"/>');
    });

    rows.forEach(function (r, i) {
      var cx = cxOf(i), cur = i === rows.length - 1;
      g.push('<text class="axis-t" x="' + cx.toFixed(1) + '" y="' + (PT + ph + 20) + '" text-anchor="middle"' +
        (cur ? ' style="fill:var(--amber);font-weight:500"' : '') + '>' + Number(r.month.slice(5)) + '月</text>');
      if (i === 0) g.push('<text class="axis-t" x="' + cx.toFixed(1) + '" y="' + (PT + ph + 34) + '" text-anchor="middle">' + r.month.slice(0, 4) + ' 年</text>');
    });

    return '<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + g.join('') + '</svg></div>' +
      '<div class="legend2">' +
      legendItem('blue', '每月新增需求数') + legendItem('teal', '趋势折线') + legendItem('amber-line', '本月（' + Number(rows[rows.length - 1].month.slice(5)) + ' 月）') +
      '</div>';
  }
  function legendItem(color, text, extra) {
    return '<span class="lg2"><i style="background:' + chartVar(color) + '"></i>' + esc(text) + (extra ? ' <b>' + esc(extra) + '</b>' : '') + '</span>';
  }

  /* ---------- 图 2：需求提出部门维度分布（横向占比条） ---------- */
  function deptBoard() {
    var rows = E.deptStats(DB);
    if (!rows.length) return '<div class="empty">暂无数据</div>';
    var max = rows[0].total || 1;
    return '<div class="dept-list">' + rows.map(function (r) {
      return '<div class="dept-row">' +
        '<div class="dr-name" title="' + esc(r.source) + '">' + esc(r.source) +
        '<div class="dr-sub">已验收 ' + r.done + ' · 在途 ' + r.doing + '</div></div>' +
        '<div class="dr-track" title="' + esc(r.source) + ' 共 ' + r.total + ' 条"><i style="width:' + Math.max(3, Math.round(r.total / max * 100)) + '%"></i></div>' +
        '<div class="dr-num"><b>' + r.total + '</b> 条' +
        '<div class="dr-sub">P0 ' + r.p0 + ' · P1 ' + r.p1 + ' · P2 ' + r.p2 + '</div></div>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* ---------- 图 3：月度工作量（堆叠柱，支持四维度切换） ---------- */
  function workStackSVG(dim) {
    var s = E.workloadSeries(DB, dim);
    if (!s.months.length) return '<div class="empty">暂无数据</div>';
    var W = 680, H = 258, PL = 46, PR = 18, PT = 28, PB = 44;
    var pw = W - PL - PR, ph = H - PT - PB;
    var ax = niceAxis(s.max, 4);
    var y = function (v) { return PT + ph - (v / ax.top) * ph; };
    var slot = pw / s.months.length;
    var bw = Math.min(42, slot * 0.5);
    var g = [];

    axisTicks(ax).forEach(function (v) {
      var yy = y(v);
      g.push('<line class="grid-line" x1="' + PL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + yy.toFixed(1) + '"/>');
      g.push('<text class="axis-t" x="' + (PL - 9) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end">' + v + '</text>');
    });

    s.months.forEach(function (m, i) {
      var cx = PL + slot * i + slot / 2, x = cx - bw / 2;
      var acc = 0;
      m.parts.forEach(function (p) {
        if (!p.hours) return;
        var y1 = y(acc + p.hours), y0 = y(acc);
        var hh = Math.max(1, y0 - y1 - 1);
        g.push('<rect class="sv-bar" x="' + x.toFixed(1) + '" y="' + (y1 + 0.5).toFixed(1) + '" width="' + bw.toFixed(1) +
          '" height="' + hh.toFixed(1) + '" fill="' + chartVar(p.color) + '">' +
          '<title>' + esc(m.month) + ' · ' + esc(dimLabel(dim, p.key)) + ' ' + p.hours + 'h</title></rect>');
        acc += p.hours;
      });
      var top = y(acc);
      g.push('<text class="pt-t" x="' + cx.toFixed(1) + '" y="' + (top - 7).toFixed(1) + '" text-anchor="middle">' + acc + 'h</text>');
      g.push('<text class="axis-t" x="' + cx.toFixed(1) + '" y="' + (PT + ph + 20) + '" text-anchor="middle"' +
        (i === s.months.length - 1 ? ' style="fill:var(--amber);font-weight:500"' : '') + '>' + Number(m.month.slice(5)) + '月</text>');
      if (i === 0) g.push('<text class="axis-t" x="' + cx.toFixed(1) + '" y="' + (PT + ph + 34) + '" text-anchor="middle">' + m.month.slice(0, 4) + ' 年</text>');
    });

    /* 各维度累计 */
    var totals = s.keys.map(function (k) { return { key: k, hours: 0 }; });
    s.months.forEach(function (m) {
      m.parts.forEach(function (p, i) { totals[i].hours += p.hours; });
    });

    return '<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + g.join('') + '</svg></div>' +
      '<div class="legend2">' + totals.map(function (t, i) {
        return legendItem(s.colors[i], dimLabel(dim, t.key), t.hours + 'h');
      }).join('') + '</div>';
  }

  /* ---------- 月度变化明细表（逐月 × 维度 × 环比） ---------- */
  function workTable(dim) {
    var s = E.workloadSeries(DB, dim);
    var head = '<tr><th>月份</th>' + s.keys.map(function (k) { return '<th class="num">' + esc(dimLabel(dim, k)) + '</th>'; }).join('') +
      '<th class="num">合计</th><th class="num">环比</th></tr>';
    var body = s.months.map(function (m, i) {
      return '<tr><td>' + esc(m.month) + (i === s.months.length - 1 ? ' <span class="tag amber">本月</span>' : '') + '</td>' +
        m.parts.map(function (p) { return '<td class="num">' + (p.hours || '—') + '</td>'; }).join('') +
        '<td class="num"><b>' + m.total + '</b></td>' +
        '<td class="num">' + deltaTag(m.delta, 'h') + '</td></tr>';
    }).join('');
    return '<div class="table-wrap"><table class="mini-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function vDash() {
    var kpi = E.dashboardKPI(DB);
    var dim = UI.dashDim || 'stage';
    var dimMeta = (E.WORKLOAD_DIMS || []).filter(function (d) { return d.key === dim; })[0] || E.WORKLOAD_DIMS[0];
    var rows = E.monthlyReqCount(DB);
    var peak = rows.reduce(function (a, r) { return r.total > a.total ? r : a; }, { total: 0, month: '—' });
    var depts = E.deptStats(DB);
    var curM = Number((kpi.curMonth || '').slice(5));
    var work = E.workloadSeries(DB, dim);
    var workLast = work.months[work.months.length - 1] || { delta: 0 };

    /* KPI 卡 */
    var kpis = [
      { k: '需求总数（近 ' + kpi.months + ' 个月）', v: kpi.total, u: '条', c: 'blue', c2: '覆盖 ' + kpi.deptCount + ' 个提出部门 · 累计 ' + kpi.hours + 'h 工时' },
      { k: '本月新增（' + curM + ' 月）', v: kpi.curCount, u: '条', c: 'amber', c2: '环比上月 ' + deltaTag(kpi.delta, ' 条') },
      { k: '在途需求', v: kpi.inFlight, u: '条', c: 'purple', c2: '未走到已验收，需继续推进' },
      { k: '已验收', v: kpi.done, u: '条', c: 'green', c2: '占总量 ' + (kpi.total ? Math.round(kpi.done / kpi.total * 100) : 0) + '%' },
      { k: '提出最多部门', v: kpi.topDeptCount, u: '条', c: 'teal', c2: esc(kpi.topDept) }
    ];

    return '<div class="alert blue"><div>' + roleTag() + ' · <b>数据看板</b>：月度需求数量变化、需求提出部门维度统计，以及按月、多维度查看分析 / 开发 / 测试工作量。' +
      '<div class="sub">历史月份为 MOCK 档案数据，本月（' + esc(kpi.curMonth) + '）由在跑需求的任务与工时实时折算并入；本页只读，不影响排期与验收口径。</div></div></div>' +

      '<div class="grid c5" style="margin-top:14px">' + kpis.map(function (x) {
        return '<div class="dash-kpi" style="--kc:var(--' + x.c + ')">' +
          '<div class="dk-k">' + esc(x.k) + '</div>' +
          '<div class="dk-v">' + x.v + '<small>' + esc(x.u) + '</small></div>' +
          '<div class="dk-c">' + x.c2 + '</div></div>';
      }).join('') + '</div>' +

      /* ① 月度需求数量 */
      '<div class="card"><div class="card-h"><h2>月度需求数量变化</h2>' +
      '<span class="hint">峰值 ' + esc(peak.month) + ' · ' + peak.total + ' 条；本月 ' + kpi.curCount + ' 条，环比 ' +
      (kpi.delta > 0 ? '增加 ' + kpi.delta : (kpi.delta < 0 ? '减少 ' + Math.abs(kpi.delta) : '持平')) + ' 条</span></div>' +
      reqTrendSVG() +
      '<div class="table-wrap" style="margin-top:12px"><table class="mini-table"><thead><tr><th>月份</th><th class="num">新增需求</th>' +
      '<th class="num">环比</th><th class="num">P0</th><th class="num">P1</th><th class="num">P2</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.month) + '</td><td class="num"><b>' + r.total + '</b></td>' +
          '<td class="num">' + deltaTag(r.delta, '') + '</td>' +
          '<td class="num">' + (r.byPriority.P0 || '—') + '</td>' +
          '<td class="num">' + (r.byPriority.P1 || '—') + '</td>' +
          '<td class="num">' + (r.byPriority.P2 || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      /* ② 部门维度 */
      '<div class="card"><div class="card-h"><h2>需求提出部门维度统计</h2>' +
      '<span class="hint">共 ' + depts.length + ' 个部门 · 按需求条数排序（条内为累计工时构成）</span></div>' +
      deptBoard() +
      '<div class="table-wrap" style="margin-top:12px"><table class="mini-table"><thead><tr><th>部门</th>' +
      '<th class="num">需求数</th><th class="num">已验收</th><th class="num">在途</th><th class="num">P0/P1/P2</th>' +
      '<th class="num">分析</th><th class="num">开发</th><th class="num">测试</th><th class="num">合计</th></tr></thead><tbody>' +
      depts.map(function (d) {
        return '<tr><td>' + esc(d.source) + '</td><td class="num"><b>' + d.total + '</b></td>' +
          '<td class="num">' + d.done + '</td><td class="num">' + d.doing + '</td>' +
          '<td class="num">' + d.p0 + '/' + d.p1 + '/' + d.p2 + '</td>' +
          '<td class="num">' + d.ana + 'h</td><td class="num">' + d.dev + 'h</td><td class="num">' + d.test + 'h</td>' +
          '<td class="num"><b>' + d.hours + 'h</b></td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      /* ③ 月度工作量（多维度） */
      '<div class="card"><div class="card-h"><h2>月度分析 / 开发 / 测试工作量</h2>' +
      '<div class="btn-group">' + E.WORKLOAD_DIMS.map(function (d) {
        return '<button class="btn' + (d.key === dim ? ' on' : '') + '" data-act="dash-dim" data-id="' + d.key + '">' + esc(d.name) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="note-line">当前维度：<b>' + esc(dimMeta.name) + '</b> —— ' + esc(dimMeta.note) +
      '；累计 ' + work.grand + 'h，最近一月环比 ' + deltaTag(workLast.delta, 'h') + '</div>' +
      workStackSVG(dim) +
      workTable(dim) + '</div>';
  }

  /* ======================= 视图 5：执行跟踪 ======================= */
  function vTrack() {
    var pending = (DB.milestones || []).filter(function (m) { return m.status === '待审批'; });
    var pendingCr = (DB.changeRequests || []).filter(function (c) { return c.status === '待审批'; });
    var allTasks = DB.devTasks || [];
    var allTests = DB.testRecords || [];
    var canD = can('task.status'), canT = can('task.test');

    var kpis = '<div class="grid c5">' +
      '<div class="kpi"><div class="k">需求总数</div><div class="v">' + DB.requirements.length + '</div><div class="sub">含已验收 ' +
      DB.requirements.filter(function (r) { return r.stage === '已验收'; }).length + ' 条</div></div>' +
      '<div class="kpi"><div class="k">开发任务</div><div class="v">' + allTasks.length + ' <span class="sub">已完成 ' +
      allTasks.filter(function (t) { return t.status === '已完成'; }).length + '</span></div><div class="sub">在办 ' +
      E.conflicts(DB).length + ' 处冲突</div></div>' +
      '<div class="kpi"><div class="k">测试记录</div><div class="v">' + allTests.length + ' <span class="sub">已完成 ' +
      allTests.filter(function (t) { return t.status === '已完成'; }).length + '</span></div></div>' +
      '<div class="kpi"><div class="k">待我审批</div><div class="v">' + pending.length + '</div><div class="sub">阶段里程碑</div></div>' +
      '<div class="kpi"><div class="k">待变更审批</div><div class="v">' + pendingCr.length + '</div><div class="sub">需求/计划变更</div></div></div>';

    var progHTML = DB.requirements.map(function (r) {
      var p = E.progress(DB, r.id);
      var g = E.stageGate(DB, r.id);
      return '<div class="prog-item"><div class="row"><b>' + esc(r.title) + '</b>' + stageTag(r.stage) +
        (g.ok ? tag('门禁通过', 'green') : tag('门禁未通过', 'amber')) +
        '<span class="spacer"></span><span class="muted">功能点 ' + p.fpDevDone + '/' + p.fpTotal + ' · 任务 ' + p.taskDone + '/' + p.taskTotal +
        ' · 测试 ' + p.testDone + '/' + p.testTotal + '</span></div>' +
        '<div class="bar-row"><span class="lbl">分析完成</span>' + progBar(p.anaProgress) + '<span class="val">' + p.anaProgress + '%</span></div>' +
        '<div class="bar-row"><span class="lbl">开发完成</span>' + progBar(p.devProgress) + '<span class="val">' + p.devProgress + '%</span></div>' +
        '<div class="bar-row"><span class="lbl">测试完成</span>' + progBar(p.testProgress) + '<span class="val">' + p.testProgress + '%</span></div></div>';
    }).join('');

    var msRows = (DB.milestones || []).slice().sort(function (a, b) {
      var w = function (m) { return m.status === '待审批' ? 0 : 1; };
      return w(a) - w(b);
    }).map(function (m) {
      var r = reqById(m.reqId);
      return '<tr><td>' + esc(r ? r.title : '') + '</td><td>' + stageTag(m.stage) + '</td><td>' + esc(m.title) + '</td>' +
        '<td>' + esc(pname(m.submitter)) + '</td><td class="sub">' + esc(m.createdAt) + '</td>' +
        '<td class="num">' + (m.status === '待审批' ? blockedDays(m) + ' 天' : '—') + '</td>' +
        '<td>' + statusTag(m.status) + (m.note ? '<div class="sub">' + esc(m.note) + '</div>' : '') + '</td>' +
        '<td>' + (m.status === '待审批'
          ? (can('approve') ? '<button class="btn primary mini" data-act="approve" data-id="' + m.id + '">通过</button> ' +
            '<button class="btn mini" data-act="reject" data-id="' + m.id + '">驳回</button>' : '<span class="muted">仅管理者可审批</span>')
          : '—') + '</td></tr>';
    }).join('');

    var crRows = (DB.changeRequests || []).slice().sort(function (a, b) {
      var w = function (c) { return c.status === '待审批' ? 0 : 1; };
      return w(a) - w(b);
    }).map(function (c) {
      var r = reqById(c.reqId);
      return '<tr class="' + (c.status === '待审批' ? 'row-todo' : '') + '"><td class="sub">' + esc(c.createdAt) + '</td>' +
        '<td>' + tag(c.kind, MODAL_KIND[c.kind] || 'purple') + '<div class="sub">' + esc(c.scene) + '</div></td>' +
        '<td>' + esc(r ? r.code : '') + '<div class="sub">' + esc(r ? r.title : '') + '</div></td>' +
        '<td>' + esc(c.title) + '<div class="sub">' + esc(c.before) + ' <b>→</b> ' + esc(c.after) + '</div></td>' +
        '<td class="sub">' + esc(c.reason) + '</td>' +
        '<td class="sub">' + esc(pname(c.submitter)) + '</td>' +
        '<td>' + statusTagCr(c.status) + (c.note ? '<div class="sub">' + esc(c.note) + '</div>' : '') + '</td>' +
        '<td>' + (c.status === '待审批'
          ? (can('cr.approve') ? '<button class="btn primary mini" data-act="cr-approve" data-id="' + c.id + '">通过并生效</button> ' +
            '<button class="btn mini" data-act="cr-reject" data-id="' + c.id + '">驳回</button>' : '<span class="muted">待管理者审批</span>')
          : '<span class="muted">' + esc(c.decidedAt || '') + '</span>') + '</td></tr>';
    }).join('');

    var taskRows = allTasks.slice().sort(function (a, b) { return (a.start || 'z') < (b.start || 'z') ? -1 : 1; }).map(function (t) {
      return '<tr><td class="sub">' + esc(reqById(t.reqId) ? reqById(t.reqId).code : '') + '</td>' +
        '<td>' + esc(fpById(t.fpid) ? fpById(t.fpid).name : '') + '</td>' +
        '<td>' + esc(sysOf(t.sysId).name) + '</td><td>' + esc(pname(t.assignee)) + '</td>' +
        '<td class="sub">' + (t.start ? esc(t.start) + ' → ' + esc(t.end) : '未排期') + '</td>' +
        '<td class="num">' + t.hours + 'h</td>' +
        '<td><select data-chg="task-status" data-id="' + t.id + '" ' + (canD ? '' : 'disabled') + '>' +
        STATUS.map(function (s) { return '<option ' + (t.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></td></tr>';
    }).join('');

    var testRows = allTests.slice().sort(function (a, b) { return (a.start || 'z') < (b.start || 'z') ? -1 : 1; }).map(function (r) {
      var src = r.taskId ? taskById(r.taskId) : null;
      return '<tr><td class="sub">' + esc(reqById(r.reqId) ? reqById(r.reqId).code : '') + '</td>' +
        '<td>' + esc(fpById(r.fpid) ? fpById(r.fpid).name : '') + '<div class="sub">' +
        (src ? '源任务：' + esc(sysOf(src.sysId).name) : '手动测试计划') + '</div></td>' +
        '<td>' + esc(pname(r.assignee)) + '</td>' +
        '<td class="sub">' + (r.start ? esc(r.start) + ' → ' + esc(r.end) : '未排期') + '</td>' +
        '<td class="num">' + r.hours + 'h</td>' +
        '<td><select data-chg="test-status" data-id="' + r.id + '" ' + (canT ? '' : 'disabled') + '>' +
        STATUS.map(function (s) { return '<option ' + (r.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></td></tr>';
    }).join('');

    return todoCard() + kpis +
      '<div class="grid c2b">' +
      '<div class="card"><div class="card-h"><h2>需求阶段进度（分析 / 开发 / 测试）</h2><span class="hint">逐笔状态驱动 + 门禁判定</span></div>' +
      progHTML + '</div>' +
      '<div class="card"><div class="card-h"><h2>阶段审批里程碑中心</h2><span class="hint">待审批优先，含阻塞天数</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>需求</th><th>阶段</th><th>节点</th><th>提交人</th>' +
      '<th>提交时间</th><th class="num">阻塞</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      (msRows || '<tr><td colspan="8" class="empty">暂无里程碑</td></tr>') + '</tbody></table></div></div></div>' +

      '<div class="card"><div class="card-h"><h2>变更审批中心（需求变更 / 计划变更）</h2>' +
      '<div class="row"><span class="hint">变更需管理者审批后生效，全程留痕</span>' + roleTag() +
      (can('cr.approve') ? '' : ' ' + lockedHint('cr.approve', '仅管理者可审批变更')) + '</div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>提交时间</th><th>类型</th><th>需求</th><th>变更内容</th>' +
      '<th>原因</th><th>提交人</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      (crRows || '<tr><td colspan="8" class="empty">暂无变更单</td></tr>') + '</tbody></table></div></div>' +

      '<div class="card"><div class="card-h"><h2>开发任务状态维护</h2>' +
      '<div class="row"><span class="hint">状态变化实时驱动进度与阶段门禁</span>' +
      '<button class="btn mini" data-act="bulk-dev-done" data-id="' + UI.schedReqId + '" ' + (canD ? '' : 'disabled') + '>批量标记全部完成</button>' +
      (!canD ? lockedHint('task.status', '开发状态由开发负责人维护') : '') + '</div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>需求</th><th>功能点</th><th>系统</th><th>实施人</th>' +
      '<th>排期周期</th><th class="num">工时</th><th>开发状态</th></tr></thead><tbody>' +
      (taskRows || '<tr><td colspan="7" class="empty">暂无任务</td></tr>') + '</tbody></table></div></div>' +

      '<div class="card"><div class="card-h"><h2>测试记录状态维护</h2>' +
      '<div class="row"><span class="hint">与开发计划分离维护</span>' +
      '<button class="btn mini" data-act="bulk-test-done" data-id="' + UI.schedReqId + '" ' + (canT ? '' : 'disabled') + '>批量标记全部完成</button>' +
      (!canT ? lockedHint('task.test', '测试状态由测试工程师维护') : '') + '</div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>需求</th><th>功能点 / 源任务</th><th>测试人</th>' +
      '<th>排期周期</th><th class="num">工时</th><th>测试状态</th></tr></thead><tbody>' +
      (testRows || '<tr><td colspan="6" class="empty">暂无测试记录</td></tr>') + '</tbody></table></div></div>';
  }
  function statusTagCr(s) { return tag(s, s === '已批准' ? 'green' : (s === '已驳回' ? 'red' : 'amber')); }

  /* ======================= 视图 5：验收评估（闭环） ======================= */
  function vVerify() {
    var reqId = UI.verifyReqId;
    var req = reqById(reqId) || DB.requirements[0];
    UI.verifyReqId = req.id;
    var ach = E.reqAchievement(DB, req.id);
    var varc = E.variance(DB, req.id);
    var goal = E.goalAchievement(DB, (DB.goals[0] || {}).id);
    var rev = ach.conclusion;
    var canW = can('accept.write'), canD2 = can('review.decide'), canR = can('retro.write');
    var gate = E.stageGate(DB, req.id);

    var kpis = '<div class="grid c4">' +
      '<div class="kpi"><div class="k">本次需求达成度</div><div class="v">' + ach.rate + ' <span class="sub">' + ach.grade + '</span></div>' +
      '<div class="sub">加权（P0=3 / P1=2 / P2=1）· 基准 ' + versionOf(req) + '</div></div>' +
      '<div class="kpi"><div class="k">已验收功能点</div><div class="v">' + ach.verifiedCount + '/' + ach.fpTotal + '</div>' +
      '<div class="sub">未验收 ' + ach.unverifiedCount + ' 个按 0 分计入</div></div>' +
      '<div class="kpi"><div class="k">计划 vs 实际</div><div class="v">' + varc.delayed + '/' + varc.total + '</div>' +
      '<div class="sub">延期任务 · 平均 ' + varc.avgDelay + ' 天 / 最大 ' + varc.maxDelay + ' 天</div></div>' +
      '<div class="kpi"><div class="k">部门目标达成度</div><div class="v">' + (goal ? goal.achieved : 0) + ' <span class="sub">/ 目标 ' +
      (goal ? goal.target : 0) + '</span></div><div class="sub">' + (goal ? (goal.reached ? '已达标' : '差 ' + Math.abs(goal.gap) + ' 分') : '—') + '</div></div></div>';

    var overview = '<div class="card"><div class="card-h"><h2>达成度评估</h2><div class="row">' +
      '<select id="selVerifyReq">' + DB.requirements.map(function (r) {
        return '<option value="' + r.id + '" ' + (r.id === req.id ? 'selected' : '') + '>' + esc(r.code + ' ' + r.title) + '</option>';
      }).join('') + '</select>' + stageTag(req.stage) + gradeTag(ach.grade) +
      (gate.ok && nextStage(req.stage) === '已验收' ? tag('可结项验收', 'green') : tag('阶段门禁：' + (gate.ok ? '通过' : '未通过'), gate.ok ? 'green' : 'amber')) + '</div></div>' +
      '<div class="bar-row"><span class="lbl">加权达成度</span>' + scoreBar(ach.rate) + '<span class="val">' + ach.rate + '</span></div>' +
      '<div class="bar-row"><span class="lbl">已验收加权均值</span>' + scoreBar(ach.verifiedRate) + '<span class="val">' + ach.verifiedRate + '</span></div>' +
      '<div class="bar-row"><span class="lbl">开发完成进度</span>' + progBar(ach.devProgress) + '<span class="val">' + ach.devProgress + '%</span></div>' +
      '<div class="bar-row"><span class="lbl">测试完成进度</span>' + progBar(ach.testProgress) + '<span class="val">' + ach.testProgress + '%</span></div>' +
      '<div class="sub">口径：达成度 = Σ(功能点权重 × 得分) / Σ权重；未验收功能点按 0 分计入，避免「做完即达标」的失真。</div></div>';

    var accRows = ach.items.map(function (x) {
      var a = x.acc;
      return '<tr class="' + (x.verified ? '' : 'row-todo') + '">' +
        '<td><div>' + esc(x.fp.name) + '</div><div class="sub">' + esc(sysOf(x.fp.mainSys).name) + '</div></td>' +
        '<td>' + priTag(x.fp.priority) + '<div class="sub">权重 ' + x.weight + '</div></td>' +
        '<td>' + esc(x.fp.ac) + '</td>' +
        '<td>' + (a ? esc(a.actual) : '<span class="muted">待填实测</span>') +
        (a && a.evidence ? '<div class="sub">证据：' + esc(a.evidence) + '</div>' : '') + '</td>' +
        '<td>' + (a ? tag(a.status, a.status === '已达成' ? 'green' : (a.status === '部分达成' ? 'amber' : 'red')) : tag('未验收', 'gray')) + '</td>' +
        '<td class="num">' + (a ? a.score : '—') + '</td>' +
        '<td class="sub">' + (a ? esc(pname(a.by)) + '<br>' + esc(a.at) : '—') + '</td>' +
        '<td><div class="row">' + (canW
          ? '<button class="btn mini" data-act="acc-edit" data-id="' + x.fp.id + '">' + (a ? '修改' : '验收') + '</button>' +
            (a ? '<button class="btn mini" data-act="acc-del" data-id="' + x.fp.id + '">清除</button>' : '')
          : '<span class="muted">只读</span>') + '</div></td></tr>';
    }).join('');

    var varRows = varc.items.map(function (x) {
      var f = fpById(x.task.fpid);
      return '<tr><td>' + esc(f ? f.name : '') + '</td><td>' + esc(sysOf(x.task.sysId).name) + '</td>' +
        '<td>' + esc(pname(x.task.assignee)) + '</td>' +
        '<td class="sub">' + esc(x.planStart) + ' → ' + esc(x.planEnd) + '<div>' + x.planDays + ' 天</div></td>' +
        '<td class="sub">' + (x.actStart ? esc(x.actStart) + ' → ' + esc(x.actEnd) : '未排期') + '</td>' +
        '<td class="num">' + (x.deltaDays > 0 ? '<span class="bad">+' + x.deltaDays + ' 天</span>' : (x.deltaDays < 0 ? x.deltaDays + ' 天' : '0')) + '</td>' +
        '<td>' + (x.overdue ? tag('延期', 'red') : tag('按期', 'green')) + '</td>' +
        '<td>' + statusTag(x.task.status) + '</td></tr>';
    }).join('');

    var goalRows = goal ? goal.rows.map(function (x) {
      var g2 = (DB.goalReviews || []).filter(function (g) { return g.reqId === x.req.id; })[0];
      return '<tr><td>' + esc(x.req.code) + ' ' + esc(x.req.title) + '</td>' +
        '<td class="num">' + x.ach.verifiedCount + '/' + x.ach.fpTotal + '</td>' +
        '<td><div class="bar-row">' + scoreBar(x.ach.rate) + '<span class="val">' + x.ach.rate + '</span></div></td>' +
        '<td>' + gradeTag(x.ach.grade) + '</td>' +
        '<td>' + (g2 ? tag(g2.result, g2.result === '验收通过' ? 'green' : (g2.result === '有条件通过' ? 'amber' : 'red')) : '<span class="muted">待组织验收</span>') + '</td></tr>';
    }).join('') : '';

    var goalCard = goal ? '<div class="card"><div class="card-h"><h2>部门目标验收（' + esc(goal.goal.name) + '）</h2>' +
      '<span class="hint">' + esc(goal.goal.code) + ' · 目标值 ' + goal.target + ' · 口径 ' + esc(goal.goal.metric) + '</span></div>' +
      '<div class="bar-row"><span class="lbl">目标达成度</span>' + scoreBar(goal.achieved) +
      '<span class="val">' + goal.achieved + '</span>' +
      '<span class="muted">目标 ' + goal.target + ' · ' + (goal.reached ? '已达标' : '差 ' + Math.abs(goal.gap) + ' 分') + '</span></div>' +
      '<div class="sub">' + esc(goal.goal.desc) + '</div>' +
      '<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>挂靠需求</th><th class="num">已验收</th>' +
      '<th>达成度</th><th>评级</th><th>组织验收结论</th></tr></thead><tbody>' +
      (goalRows || '<tr><td colspan="5" class="empty">无挂靠需求</td></tr>') + '</tbody></table></div>' +
      (goal.pending.length ? '<div class="alert amber"><div>以下需求尚未产生验收记录，暂未计入目标达成度：' +
        goal.pending.map(function (x) { return esc(x.req.code + ' ' + x.req.title); }).join('、') + '</div></div>' : '') +
      '</div>' : '';

    var revList = (DB.goalReviews || []).map(function (g) {
      var r = reqById(g.reqId);
      return '<tr><td>' + esc(r ? r.code : '') + ' ' + esc(r ? r.title : '') + '</td>' +
        '<td>' + tag(g.result, g.result === '验收通过' ? 'green' : (g.result === '有条件通过' ? 'amber' : 'red')) + '</td>' +
        '<td class="num">' + g.achieved + ' / ' + g.target + '</td>' +
        '<td class="sub">' + esc(g.note) + '</td><td class="sub">' + esc(pname(g.by)) + '</td><td class="sub">' + esc(g.at) + '</td></tr>';
    }).join('');

    var revCard = '<div class="card"><div class="card-h"><h2>组织验收结论</h2>' +
      '<div class="row">' + (rev ? tag('本次结论：' + rev.result, rev.result === '验收通过' ? 'green' : (rev.result === '有条件通过' ? 'amber' : 'red')) : '<span class="muted">本需求尚未组织验收</span>') +
      (canD2 ? '<button class="btn primary mini" data-act="review-write" data-id="' + req.id + '">填写 / 修订验收结论</button>'
        : lockedHint('review.decide', '仅管理者可做组织验收')) + '</div></div>' +
      (rev ? '<div class="alert ' + (rev.result === '验收通过' ? 'green' : (rev.result === '有条件通过' ? 'amber' : 'red')) + '"><div>' +
        '<b>' + esc(rev.result) + '</b>（达成度 ' + rev.achieved + ' / 目标 ' + rev.target + '）<br>' + esc(rev.note) +
        '<div class="sub">' + esc(pname(rev.by)) + ' · ' + esc(rev.at) + '</div></div></div>' : '') +
      '<div class="table-wrap"><table><thead><tr><th>需求</th><th>结论</th><th class="num">达成度 / 目标</th>' +
      '<th>意见</th><th>验收人</th><th>时间</th></tr></thead><tbody>' +
      (revList || '<tr><td colspan="6" class="empty">暂无验收结论</td></tr>') + '</tbody></table></div>' +
      '<div class="sub">组织验收结论生成验收里程碑并写入留痕，供后续审计与对比（首次验收 / 复验均可追溯）。</div></div>';

    var perRows = (DB.people || []).filter(function (p) { return p.role === 'DEV' || p.role === 'QA'; }).map(function (p) {
      var rt = E.personRetro(DB, p.id);
      if (!rt.taskCount && !rt.testCount) return '';
      return '<tr><td>' + esc(p.name) + '<div class="sub">' + esc(p.title) + '</div></td>' +
        '<td class="num">' + rt.doneCount + '/' + rt.taskCount + '</td>' +
        '<td class="num">' + rt.onTimeRate + '%</td>' +
        '<td class="num">' + rt.slipCount + '</td>' +
        '<td class="num">' + (rt.verifiedFp ? rt.avgScore + '（' + rt.verifiedFp + ' 项）' : '—') + '</td>' +
        '<td class="num">' + rt.testDone + '/' + rt.testCount + '</td>' +
        '<td>' + (rt.retros.length ? tag('已复盘 ' + rt.retros.length + ' 条', 'green') : tag('待复盘', 'gray')) +
        (canR ? ' <button class="btn mini" data-act="retro-write" data-id="' + p.id + '">记录复盘</button>' : '') + '</td></tr>';
    }).join('');

    var retroRows = (DB.retros || []).map(function (x) {
      return '<tr><td>' + esc(pname(x.personId)) + '</td><td>' + esc(x.good) + '</td><td>' + esc(x.bad) + '</td>' +
        '<td>' + esc(x.action) + '</td><td class="sub">' + esc(pname(x.by)) + '<br>' + esc(x.at) + '</td></tr>';
    }).join('');

    var retroCard = '<div class="card"><div class="card-h"><h2>员工复盘改进</h2>' +
      '<span class="hint">客观指标来自任务、验收与偏差数据，供个人改进参考</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>成员</th><th class="num">完成/任务</th><th class="num">按期率</th>' +
      '<th class="num">被顺延</th><th class="num">功能点均分</th><th class="num">测试完成</th><th>复盘</th></tr></thead><tbody>' +
      (perRows || '<tr><td colspan="7" class="empty">暂无执行数据</td></tr>') + '</tbody></table></div>' +
      '<details style="margin-top:10px"><summary>复盘改进记录（' + (DB.retros || []).length + ' 条）</summary>' +
      '<div class="table-wrap"><table><thead><tr><th>成员</th><th>保持</th><th>待改进</th><th>改进举措</th><th>记录人</th></tr></thead><tbody>' +
      (retroRows || '<tr><td colspan="5" class="empty">暂无复盘记录</td></tr>') + '</tbody></table></div></details></div>';

    var log = E.acceptanceLog(DB, req.id);
    var logCard = '<div class="card"><div class="card-h"><h2>验收记录追溯</h2>' +
      '<div class="row"><span class="hint">共 ' + log.length + ' 条 · 含验收标准对照与证据</span>' +
      '<button class="btn mini" data-act="export-csv">导出验收报告 CSV</button>' +
      '<button class="btn mini" data-act="export-json">导出 JSON</button></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>需求</th><th>功能点</th><th>验收标准</th><th>实测结果</th>' +
      '<th>结论</th><th class="num">得分</th><th>证据</th><th>验收人 / 时间</th></tr></thead><tbody>' +
      (log.map(function (x) {
        return '<tr><td class="sub">' + esc(x.reqCode) + '</td><td>' + esc(x.fpName) + '</td>' +
          '<td class="sub">' + esc(x.ac) + '</td><td>' + esc(x.actual) + '</td>' +
          '<td>' + tag(x.status, x.status === '已达成' ? 'green' : (x.status === '部分达成' ? 'amber' : 'red')) + '</td>' +
          '<td class="num">' + x.score + '</td><td class="sub">' + esc(x.evidence) + '</td>' +
          '<td class="sub">' + esc(pname(x.by)) + '<br>' + esc(x.at) + '</td></tr>';
      }).join('') || '<tr><td colspan="8" class="empty">该需求暂无验收记录</td></tr>') + '</tbody></table></div></div>';

    var crList = (DB.changeRequests || []).filter(function (c) { return c.reqId === req.id; });
    var crCard = '<div class="card"><div class="card-h"><h2>基准变更历史（可对比）</h2>' +
      '<span class="hint">当前基准 ' + versionOf(req) + ' · 变更 ' + crList.length + ' 条</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>时间</th><th>类型</th><th>变更内容</th><th>改前 → 改后</th>' +
      '<th>原因</th><th>状态</th><th>审批人 / 意见</th></tr></thead><tbody>' +
      (crList.map(function (c) {
        return '<tr><td class="sub">' + esc(c.createdAt) + '</td><td>' + tag(c.kind, MODAL_KIND[c.kind] || 'purple') + '</td>' +
          '<td>' + esc(c.title) + '</td><td class="sub">' + esc(c.before) + ' <b>→</b> ' + esc(c.after) + '</td>' +
          '<td class="sub">' + esc(c.reason) + '</td><td>' + statusTagCr(c.status) + '</td>' +
          '<td class="sub">' + esc(pname(c.approver)) + (c.note ? '<br>' + esc(c.note) : '') + '</td></tr>';
      }).join('') || '<tr><td colspan="7" class="empty">该需求暂无变更记录</td></tr>') + '</tbody></table></div></div>';

    return todoCard() + kpis + overview +
      '<div class="card"><div class="card-h"><h2>功能点逐条验收（对照验收标准）</h2>' +
      '<div class="row">' + roleTag() + ' · 验收结论与得分由产品经理 / 管理者填写' +
      (canW ? '' : lockedHint('accept.write', '验收填写需产品经理或管理者')) + '</div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>功能点</th><th>优先级 / 权重</th><th>验收标准（既定基准）</th>' +
      '<th>实测结果 / 证据</th><th>结论</th><th class="num">得分</th><th>验收人 / 时间</th><th>操作</th></tr></thead><tbody>' +
      (accRows || '<tr><td colspan="8" class="empty">该需求暂无已锁定功能点</td></tr>') + '</tbody></table></div></div>' +

      '<div class="card"><div class="card-h"><h2>计划 vs 实际偏差</h2>' +
      '<span class="hint">基准于「计划生效」或「计划变更审批通过」时冻结，可对比计划工期与实际排期</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>功能点</th><th>系统</th><th>负责人</th><th>计划周期（基准）</th>' +
      '<th>实际排期</th><th class="num">偏差</th><th>评价</th><th>状态</th></tr></thead><tbody>' +
      (varRows || '<tr><td colspan="8" class="empty">暂无带基准的计划数据（计划生效后自动生成）</td></tr>') + '</tbody></table></div></div>' +

      goalCard + revCard + retroCard + crCard + logCard;
  }

  /* ======================= 渲染与事件 ======================= */
  var VIEWS = { workbench: vWorkbench, schedule: vSchedule, board: vBoard, dash: vDash, track: vTrack, verify: vVerify };

  function renderNav() {
    var order = NAV_ORDER.filter(canView);
    if (order.indexOf(UI.view) < 0) UI.view = order[0] || 'workbench';
    $('#tabs').innerHTML = order.map(function (v) {
      var m = VIEW_META[v], b = navBadge(v);
      return '<button class="tab' + (UI.view === v ? ' active' : '') + '" data-view="' + v + '">' +
        '<span class="ni-idx">' + m.idx + '</span><span class="ni-body"><span class="ni-t">' + m.name + '</span>' +
        '<span class="ni-d">' + m.nav + '</span></span>' +
        (b ? '<span class="ni-badge">' + b + '</span>' : '') + '</button>';
    }).join('');
  }
  function renderHead() {
    var m = VIEW_META[UI.view] || VIEW_META.workbench;
    var req = reqById(UI.reqId);
    $('#pageHead').innerHTML = '<div class="ph-left"><h1>' + m.name + '</h1><div class="ph-desc">' + m.desc + '</div></div>' +
      '<div class="ph-right">' + roleTag() +
      (req ? '<span class="tag gray">当前需求：' + esc(req.code) + ' · ' + esc(req.title) + '</span>' : '') + '</div>';
  }
  function render() {
    var d = $('#demoDate'); if (d) d.value = DB.meta.demoDate;
    var rsel = $('#selRole'); if (rsel) rsel.value = UI.role;
    if (!canView(UI.view)) UI.view = curRole().home;
    renderNav(); renderHead();
    var fn = VIEWS[UI.view];
    $('#view').innerHTML = fn ? fn() : '<div class="empty">视图未实现</div>';
    persist();
  }
  function onTabClick(e) {
    var t = e.target.closest('.tab');
    if (!t) return;
    UI.view = t.dataset.view;
    if (UI.view === 'workbench') UI.reqOpen = false;   // 进入工作台默认展示需求队列列表
    render();
  }
  function switchRole(role) {
    UI.role = ROLES[role] ? role : 'PM';
    DB.meta.currentRole = UI.role;
    UI.view = curRole().home;
    UI.reqOpen = false;                                 // 切身份后回到列表页，避免直接摊开详情
    render();
    toast('已切换为「' + curRole().name + ' ' + pname(curRole().personId) + '」，可见视图与可操作项已按角色调整');
  }

  function onChange(e) {
    var el = e.target;
    var act = el.dataset.chg;
    if (!act) return;
    var today = DB.meta.demoDate;

    if (act === 'demo-date') { DB.meta.demoDate = el.value; render(); return; }
    if (act === 'role') { switchRole(el.value); return; }
    if (act === 'pick') { UI.pick[el.dataset.id] = el.checked; return; }

    /* 手动添加计划弹窗：计划类型 / 执行人 / 工时 / 最早开始日 联动预览 */
    if (act === 'mp-type' || act === 'mp-person' || act === 'mp-hours' || act === 'mp-earliest') {
      refreshManualPreview(act === 'mp-type');
      return;
    }

    if (act === 'analyst') {
      var f = fpById(el.dataset.id); f.draftAnalyst = el.value; f.rec = null;
      if (el.value) f.rec = E.recommendSchedule(DB, el.value, f.draftHours != null ? f.draftHours : f.analysisHours, f.draftStart || today, { excludeFpId: f.id });
      render(); return;
    }
    if (act === 'analyst-hours') {
      var fh = fpById(el.dataset.id);
      fh.draftHours = Number(el.value) || 0;
      fh.rec = fh.draftAnalyst ? E.recommendSchedule(DB, fh.draftAnalyst, fh.draftHours, fh.draftStart || today, { excludeFpId: fh.id }) : null;
      render(); return;
    }
    if (act === 'analyst-start') {
      var fs = fpById(el.dataset.id);
      fs.draftStart = el.value; fs.rec = null;
      if (fs.draftAnalyst) fs.rec = E.recommendSchedule(DB, fs.draftAnalyst, fs.draftHours != null ? fs.draftHours : fs.analysisHours, el.value, { excludeFpId: fs.id });
      render(); return;
    }
    if (act === 'analysis-status') {
      if (!can('task.analysis')) return deny('分析状态维护');
      var fa = fpById(el.dataset.id);
      var b0 = fa.analysisStatus; fa.analysisStatus = el.value;
      logChange({ reqId: fa.reqId, type: '进度更新', detail: '分析任务「' + fa.name + '」状态：' + b0 + ' → ' + el.value, before: b0, after: el.value, reason: '分析执行维护' });
      render(); return;
    }
    if (act === 'task-assignee' || act === 'task-hours' || act === 'task-start') {
      var t = taskById(el.dataset.id);
      if (act === 'task-assignee') t.draftAssignee = el.value;
      if (act === 'task-hours') t.draftHours = Number(el.value) || 0;
      if (act === 'task-start') t.draftStart = el.value;
      t.rec = null;
      var pid = t.draftAssignee || t.assignee;
      if (pid && act !== 'task-start') {
        t.rec = E.recommendSchedule(DB, pid, t.draftHours != null ? t.draftHours : t.hours, t.draftStart || today, { excludeTaskId: t.id });
      } else if (pid) {
        t.rec = E.recommendSchedule(DB, pid, t.draftHours != null ? t.draftHours : t.hours, el.value, { excludeTaskId: t.id });
      }
      render(); return;
    }
    if (act === 'test-assignee' || act === 'test-hours' || act === 'test-start') {
      if (!can('test.sched')) return deny('测试排期');
      var r0 = testById(el.dataset.id);
      if (act === 'test-assignee') r0.draftAssignee = el.value;
      if (act === 'test-hours') r0.draftHours = Number(el.value) || 0;
      if (act === 'test-start') r0.draftStart = el.value;
      r0.rec = null;
      var qid = r0.draftAssignee || r0.assignee;
      var e0 = act === 'test-start' ? el.value : (r0.draftStart || testEarliest(r0));
      if (qid) r0.rec = E.recommendSchedule(DB, qid, r0.draftHours != null ? r0.draftHours : r0.hours, e0, { excludeTestId: r0.id });
      render(); return;
    }
    if (act === 'task-status' || act === 'test-status') {
      if (act === 'task-status' && !can('task.status')) return deny('开发状态维护');
      if (act === 'test-status' && !can('task.test')) return deny('测试状态维护');
      handleStatusChange(act, el.dataset.id, el.value); return;
    }
    if (act === 'cr-reason') { UI.crReason = el.value; return; }
    if (act === 'cr-field') { updateCrDraft(el); return; }
    if (act === 'pc-reason') { UI.pcReason = el.value; return; }
  }

  function updateCrDraft(el) {
    if (!UI.crDraft) return;
    var idx = Number(el.dataset.idx), field = el.dataset.field;
    if (!UI.crDraft[idx]) return;
    UI.crDraft[idx][field] = el.value;
  }

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    var id = el.dataset.id;

    if (act === 'role-matrix') { openRoleMatrix(); return; }
    if (act === 'dash-dim') { UI.dashDim = id || 'stage'; render(); return; }
    if (act === 'pick-req') {
      UI.reqId = id; UI.schedReqId = id; UI.verifyReqId = id; UI.reqOpen = true; render(); return;
    }
    if (act === 'wb-back') { UI.reqOpen = false; render(); return; }
    if (act === 'goto-schedule') { UI.view = 'schedule'; UI.schedReqId = UI.reqId; render(); return; }
    if (act === 'ai-parse') { if (!can('fp.edit')) return deny('需求导入与拆解'); startParse(); return; }
    if (act === 'fp-add') {
      if (!can('fp.edit')) return deny('编辑功能点');
      var ra = reqById(UI.reqId);
      if (ra && ra.confirmed) { openCrEditor(ra.id, null, { newRow: true }); return; }   // 已锁定 → 以变更单新增
      openFpEditor(null); return;
    }
    if (act === 'fp-edit') {
      if (!can('fp.edit')) return deny('编辑功能点');
      var fe = fpById(id), rq = reqById(fe.reqId);
      if (rq && rq.confirmed) { openCrEditor(fe.reqId, fe.id); return; }   // 已锁定 → 以变更单承载编辑
      openFpEditor(fe); return;
    }
    if (act === 'fp-del') {
      if (!can('fp.edit')) return deny('编辑功能点');
      var fd = fpById(id), rd = reqById(fd.reqId);
      if (rd && rd.confirmed) { toast('功能点基准已锁定且不可解锁，删除须通过「发起需求变更」'); return; }
      DB.featurePoints = DB.featurePoints.filter(function (f) { return f.id !== id; });
      render(); toast('已删除功能点（未锁定阶段可自由增删）'); return;
    }
    if (act === 'confirm-fp') { if (!can('fp.confirm')) return deny('功能点确认锁定'); confirmFps(); return; }
    if (act === 'cr-new') { if (!can('change.req')) return deny('发起需求变更'); openCrEditor(id); return; }
    if (act === 'cr-add') { crAddRow(); return; }
    if (act === 'cr-del') { crDelRow(Number(el.dataset.idx)); return; }
    if (act === 'cr-save') { saveCrEditor(); return; }
    if (act === 'stage-next') {
      if (!can('stage.submit')) return deny('阶段提交');
      var sid = el.dataset.req || UI.reqId;
      var srq = reqById(sid);
      if (!srq) return;
      if (!canSubmitStage(srq)) {
        toast('「' + srq.stage + '」阶段由' + stageOwnerName(srq.stage) + '提交，当前身份无此环节权限');
        return;
      }
      stageNext(sid); return;
    }

    if (act === 'rec-analysis') { if (!can('sched.analysis')) return deny('分析排期'); recAnalysis(id); return; }
    if (act === 'accept-analysis') { if (!can('sched.analysis')) return deny('分析排期'); acceptAnalysis(id); return; }
    if (act === 'auto-analysis') { if (!can('sched.analysis')) return deny('分析排期'); autoAnalysis(); return; }
    if (act === 'accept-all-analysis') { if (!can('sched.analysis')) return deny('分析排期'); acceptAllAnalysis(); return; }
    if (act === 'analysis-done-all') { if (!can('task.analysis')) return deny('分析状态维护'); analysisDoneAll(); return; }
    if (act === 'clear-analysis') {
      if (!can('sched.analysis')) return deny('分析排期');
      var fc = fpById(id); fc.analysisPlan = null; fc.rec = null; fc.draftAnalyst = ''; fc.analysisStatus = '未开始';
      render(); toast('已撤销分析排期'); return;
    }
    if (act === 'intro-dev') { if (!can('sched.dev')) return deny('开发排期'); introDev(); return; }
    if (act === 'accept-dev') { if (!can('sched.dev')) return deny('开发排期'); acceptDev(id); return; }
    if (act === 'task-done') {
      if (!can('task.status')) return deny('开发状态维护');
      var td = taskById(id);
      if (!td || td.status === '已完成') { toast('该任务已完成'); return; }
      var tb = td.status; td.status = '已完成';
      logChange({ reqId: td.reqId, type: '进度更新', detail: '开发任务（' + pname(td.assignee) + ' · ' + sysOf(td.sysId).name + '）状态：' + tb + ' → 已完成', before: tb, after: '已完成', reason: '排期中心直接标记完成' });
      render(); toast('已标记完成，开发进度与阶段门禁同步更新');
      return;
    }
    if (act === 'test-done') {
      if (!can('task.test')) return deny('测试状态维护');
      var rd = testById(id);
      if (!rd || rd.status === '已完成') { toast('该测试记录已完成'); return; }
      var rb = rd.status; rd.status = '已完成';
      logChange({ reqId: rd.reqId, type: '进度更新', detail: '测试记录（' + pname(rd.assignee) + '）状态：' + rb + ' → 已完成', before: rb, after: '已完成', reason: '排期中心直接标记完成' });
      render(); toast('已标记测试完成，测试进度与阶段门禁同步更新');
      return;
    }
    if (act === 'accept-all-rec') { if (!can('sched.dev')) return deny('开发排期'); acceptAllRec(); return; }
    if (act === 'auto-dev') { if (!can('sched.dev')) return deny('开发排期'); autoDev(); return; }
    if (act === 'task-change') { if (!can('change.plan')) return deny('发起计划变更'); openTaskChange(id); return; }
    if (act === 'unschedule') {
      if (!can('sched.dev')) return deny('开发排期');
      var t = taskById(id); t.start = ''; t.end = ''; t.planDaily = []; render(); toast('已清空排期'); return;
    }
    if (act === 'auto-test') { if (!can('test.sched')) return deny('测试排期'); autoTest(); return; }
    if (act === 'accept-test') { if (!can('test.sched')) return deny('测试排期'); acceptTest(id); return; }
    if (act === 'accept-all-test') { if (!can('test.sched')) return deny('测试排期'); acceptAllTest(); return; }
    if (act === 'clear-test') {
      if (!can('test.sched')) return deny('测试排期');
      var tr = testById(id); tr.start = ''; tr.end = ''; tr.planDaily = []; render(); return;
    }
    if (act === 'adjust-date') { openAdjustDate(el.dataset.kind, id); return; }
    if (act === 'shift-main') { if (!can('sched.dev')) return deny('开发排期'); shiftMain(id, Number(el.dataset.gap) || 0); return; }
    if (act === 'mark-parallel') { if (!can('sched.dev')) return deny('开发排期'); markParallel(id); return; }
    if (act === 'plan-apply') { if (!can('plan.apply')) return deny('计划生效'); planApply(); return; }

    if (act === 'mp-add') { if (!can('plan.manual')) return deny('手动新增计划'); openPlanEditor(el.dataset.kind); return; }
    if (act === 'mp-rec') { if (!can('plan.manual')) return deny('手动新增计划'); recManualPlan(id); return; }
    if (act === 'mp-accept') { if (!can('plan.manual')) return deny('手动新增计划'); acceptManualPlan(id); return; }
    if (act === 'mp-del') {
      if (!can('plan.manual')) return deny('手动新增计划');
      DB.manualPlans = (DB.manualPlans || []).filter(function (m) { return m.id !== id; }); render(); toast('已删除计划'); return;
    }

    if (act === 'acc-edit') { if (!can('accept.write')) return deny('功能点验收'); openAccEditor(id); return; }
    if (act === 'acc-del') {
      if (!can('accept.write')) return deny('功能点验收');
      DB.acceptances = (DB.acceptances || []).filter(function (a) { return a.fpid !== id; });
      logChange({ reqId: UI.verifyReqId, type: '验收撤销', detail: '撤销功能点验收记录', before: '已验收', after: '未验收', reason: '重做验收' });
      render(); toast('已清除该功能点验收记录'); return;
    }
    if (act === 'review-write') { if (!can('review.decide')) return deny('组织验收'); openReviewModal(id); return; }
    if (act === 'retro-write') { if (!can('retro.write')) return deny('复盘记录'); openRetroModal(id); return; }
    if (act === 'export-csv') { exportReport('csv'); return; }
    if (act === 'export-json') { exportReport('json'); return; }

    if (act === 'sim-insert') { if (!can('plan.insert')) return deny('需求插队调整'); openInsertModal(); return; }
    if (act === 'apply-insert') { if (!can('plan.insert')) return deny('需求插队调整'); applyInsert(); return; }
    if (act === 'todo-goto') {
      var v = el.dataset.view;
      if (canView(v)) UI.view = v;
      if (id) { UI.reqId = id; UI.schedReqId = id; UI.verifyReqId = id; }
      render(); return;
    }
    if (act === 'bulk-dev-done') {
      if (!can('task.status')) return deny('开发状态维护');
      bulkDone('dev', id || UI.schedReqId); return;
    }
    if (act === 'bulk-test-done') {
      if (!can('task.test')) return deny('测试状态维护');
      bulkDone('test', id || UI.schedReqId); return;
    }
    if (act === 'approve') { if (!can('approve')) return deny('审批'); decide(id, '已通过', ''); return; }
    if (act === 'reject') { if (!can('approve')) return deny('审批'); openRejectModal(id); return; }
    if (act === 'cr-approve') { if (!can('cr.approve')) return deny('变更审批'); approveCr(id); return; }
    if (act === 'cr-reject') { if (!can('cr.approve')) return deny('变更审批'); openCrRejectModal(id); return; }
  }

  /* ======================= 业务动作：需求与功能点 ======================= */
  function startParse() {
    var reqId = $('#selImportReq') ? $('#selImportReq').value : UI.reqId;
    var req = reqById(reqId);
    var preset = (SEED.parsePresets || {})[reqId] || [];
    if (!preset.length) { toast('该需求暂无预置解析结果（MOCK）'); return; }
    var ids = preset.map(function (p) {
      if (typeof p === 'string') return p;
      var exist = fpById(p.id);
      if (!exist) { DB.featurePoints.push(clone(p)); return p.id; }
      return p.id;
    });
    req.parseTotal = ids.length; req.parseShown = 0; req.aiDone = false;
    req.desc = $('#txtImport') ? $('#txtImport').value : req.desc;
    if (UI.parseTimer) clearInterval(UI.parseTimer);
    UI.view = 'workbench'; UI.reqId = req.id;
    UI.parseTimer = setInterval(function () {
      req.parseShown = (req.parseShown || 0) + 1;
      if (req.parseShown >= req.parseTotal) {
        clearInterval(UI.parseTimer); UI.parseTimer = null; req.aiDone = true;
        toast('AI 拆解完成：' + req.parseTotal + ' 个功能点，请人工确认后锁定');
      }
      render();
    }, 140);
    render();
  }

  function openFpEditor(fp) {
    var isNew = !fp;
    var s = fp || {
      id: 'f' + (DB.seq.task++), name: '', desc: '', mainSys: DB.systems[0].id, relSys: [], priority: 'P2',
      ac: '', analysisHours: 8, reqId: UI.reqId, confirmed: false, analysisStatus: '未开始'
    };
    var body = '<div class="alert amber"><div>功能点尚未锁定：此处可自由增删改；<b>一旦确认锁定即不可解锁</b>。</div></div>' +
      '<div class="form-row"><label>功能点名称</label><input id="fpName" value="' + esc(s.name) + '"></div>' +
      '<div class="form-row"><label>描述</label><input id="fpDesc" value="' + esc(s.desc) + '"></div>' +
      '<div class="form-row"><label>主系统</label><select id="fpMain">' +
      DB.systems.map(function (x) { return '<option value="' + x.id + '" ' + (s.mainSys === x.id ? 'selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-row"><label>关联系统（可多选）</label><div class="chk-group">' +
      DB.systems.map(function (x) {
        return '<label><input type="checkbox" class="fpRel" value="' + x.id + '" ' + ((s.relSys || []).indexOf(x.id) >= 0 ? 'checked' : '') + '>' + esc(x.name) + '</label>';
      }).join('') + '</div></div>' +
      '<div class="form-row"><label>优先级</label><select id="fpPri">' +
      ['P0', 'P1', 'P2'].map(function (p) { return '<option ' + (s.priority === p ? 'selected' : '') + '>' + p + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-row"><label>验收标准（可衡量）</label><input id="fpAc" value="' + esc(s.ac) + '"></div>' +
      '<div class="form-row"><label>预估分析工时（小时）</label><input id="fpHours" type="number" value="' + (s.analysisHours || 8) + '"></div>';

    openModal({
      title: isNew ? '新增功能点' : '编辑功能点',
      bodyHTML: body,
      actions: [
        { label: '取消', onClick: closeModal },
        {
          label: '保存', cls: 'primary', onClick: function () {
            s.name = $('#fpName').value.trim();
            s.desc = $('#fpDesc').value.trim();
            s.mainSys = $('#fpMain').value;
            s.relSys = $$('.fpRel').filter(function (c) { return c.checked; }).map(function (c) { return c.value; })
              .filter(function (x) { return x !== s.mainSys; });
            s.priority = $('#fpPri').value;
            s.ac = $('#fpAc').value.trim();
            s.analysisHours = Number($('#fpHours').value) || 8;
            if (!s.name) { toast('功能点名称不能为空'); return; }
            if (isNew) DB.featurePoints.push(s);
            closeModal(); render(); toast(isNew ? '已新增功能点' : '已保存功能点');
          }
        }
      ]
    });
  }

  function confirmFps() {
    var fps = fpsOf(UI.reqId);
    if (!fps.length) { toast('暂无功能点可确认'); return; }
    var bad = fps.filter(function (f) { return !f.name || !f.mainSys || !f.ac; });
    if (bad.length) { toast('有 ' + bad.length + ' 个功能点缺少名称/主系统/验收标准'); return; }
    fps.forEach(function (f) {
      f.confirmed = true;
      if (!f.analysisStatus) f.analysisStatus = '未开始';
    });
    var req = reqById(UI.reqId);
    req.confirmed = true; req.aiDone = true;
    if (!req.fpVersion) req.fpVersion = 1;
    logChange({ reqId: req.id, type: '拆解确认', detail: '功能点清单确认锁定（' + fps.length + ' 个，基准 ' + versionOf(req) + '），作为排期与验收的唯一事实来源；锁定后不可解锁', before: '待确认', after: '已锁定 ' + versionOf(req), reason: '人在环确认' });
    render(); toast('已锁定 ' + fps.length + ' 个功能点作为基准（不可解锁，调整须走需求变更）');
  }

  /* ---- 需求变更单编辑器（承载已锁定功能点的编辑/新增/删除） ---- */
  function openCrEditor(reqId, onlyFpId, opts) {
    opts = opts || {};
    var req = reqById(reqId);
    if (!req) return;
    var fps = fpsOf(reqId).filter(function (f) { return f.confirmed; });
    if (onlyFpId) fps = fps.filter(function (f) { return f.id === onlyFpId; });
    if (!fps.length && !opts.newRow) { toast('该需求暂无可变更的已锁定功能点'); return; }
    UI.crDraftReqId = reqId;
    UI.crOnlyFpId = onlyFpId || '';
    UI.crReason = '';
    UI.crDraft = fps.map(function (f) {
      return {
        id: f.id, name: f.name, desc: f.desc, mainSys: f.mainSys, relSys: (f.relSys || []).join(','),
        priority: f.priority, ac: f.ac, analysisHours: f.analysisHours
      };
    });
    /* 已锁定需求「变更新增功能点」：直接带出一行空白行，保存后即新增 */
    if (opts.newRow) UI.crDraft.push({ id: '', name: '', desc: '', mainSys: DB.systems[0].id, relSys: '', priority: 'P2', ac: '', analysisHours: 8 });
    renderCrModal();
  }
  function renderCrModal() {
    var req = reqById(UI.crDraftReqId);
    var rows = (UI.crDraft || []).map(function (d, i) {
      var isNew = !d.id;
      return '<tr><td>' + (isNew ? tag('新增', 'green') : tag('已锁定', 'gray')) +
        '<div class="sub">' + esc(d.id || '新功能点') + '</div></td>' +
        '<td><input class="cr-in" data-chg="cr-field" data-field="name" data-idx="' + i + '" value="' + esc(d.name) + '">' +
        '<input class="cr-in" data-chg="cr-field" data-field="desc" data-idx="' + i + '" value="' + esc(d.desc) + '" placeholder="描述"></td>' +
        '<td><select data-chg="cr-field" data-field="priority" data-idx="' + i + '">' +
        ['P0', 'P1', 'P2'].map(function (p) { return '<option ' + (d.priority === p ? 'selected' : '') + '>' + p + '</option>'; }).join('') + '</select>' +
        '<input type="number" class="cr-num" data-chg="cr-field" data-field="analysisHours" data-idx="' + i + '" value="' + esc(d.analysisHours) + '"></td>' +
        '<td><select data-chg="cr-field" data-field="mainSys" data-idx="' + i + '">' +
        DB.systems.map(function (x) { return '<option value="' + x.id + '" ' + (d.mainSys === x.id ? 'selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' +
        '<input class="cr-in" data-chg="cr-field" data-field="relSys" data-idx="' + i + '" value="' + esc(d.relSys) + '" placeholder="关联系统逗号分隔"></td>' +
        '<td><input class="cr-in" data-chg="cr-field" data-field="ac" data-idx="' + i + '" value="' + esc(d.ac) + '"></td>' +
        '<td><button class="btn mini" data-act="cr-del" data-idx="' + i + '">移除</button></td></tr>';
    }).join('');
    openModal({
      wide: true,
      title: '需求变更单：' + esc(req.code + ' ' + req.title) + '（基准 ' + versionOf(req) + '）',
      bodyHTML: '<div class="alert purple"><div>已锁定基准不可解锁：变更内容将作为变更单提交，<b>管理者审批通过后</b>自动生成新基准版本并留痕。' +
        '移除行 = 删除功能点，新增行 = 新增功能点。</div></div>' +
        '<div class="table-wrap"><table><thead><tr><th>状态</th><th>名称 / 描述</th><th>优先级 / 分析工时</th>' +
        '<th>主系统 / 关联系统</th><th>验收标准</th><th>操作</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="6" class="empty">无变更行</td></tr>') + '</tbody></table></div>' +
        '<div class="row" style="margin-top:8px"><button class="btn mini" data-act="cr-add">新增一行功能点</button>' +
        '<span class="hint">关联系统用英文逗号分隔，例如：s_chn,s_pay</span></div>' +
        '<div class="form-row" style="margin-top:10px"><label>变更原因（必填，将随变更单提交审批）</label>' +
        '<textarea id="crReason" rows="2" data-chg="cr-reason" placeholder="例如：业务新增渠道入口诉求，需补充功能点并调整验收标准">' + esc(UI.crReason || '') + '</textarea></div>',
      actions: [
        { label: '取消', onClick: function () { UI.crDraft = null; closeModal(); } },
        { label: '提交变更单（待审批）', cls: 'primary', onClick: saveCrEditor }
      ]
    });
  }
  function crAddRow() {
    UI.crDraft = UI.crDraft || [];
    UI.crDraft.push({ id: '', name: '', desc: '', mainSys: DB.systems[0].id, relSys: '', priority: 'P2', ac: '', analysisHours: 8 });
    renderCrModal();
  }
  function crDelRow(idx) {
    UI.crDraft = (UI.crDraft || []).filter(function (d, i) { return i !== idx; });
    renderCrModal();
  }
  function saveCrEditor() {
    var reqId = UI.crDraftReqId, req = reqById(reqId);
    var reason = (UI.crReason || '').trim();
    if (!reason) { toast('请填写变更原因'); return; }
    var draft = UI.crDraft || [];
    var items = [], dels = [], changeCount = 0;
    draft.forEach(function (d) {
      var rel = (d.relSys || '').split(/[,，\s]+/).filter(function (x) { return !!x && x !== d.mainSys; });
      if (!d.id) {
        if (!d.name) return;
        items.push({ id: '', action: '新增', name: d.name, desc: d.desc, mainSys: d.mainSys, relSys: rel, priority: d.priority, ac: d.ac, analysisHours: Number(d.analysisHours) || 8 });
        changeCount++; return;
      }
      var f = fpById(d.id);
      if (!f) return;
      var diff = (f.name !== d.name) || (f.desc !== d.desc) || (f.mainSys !== d.mainSys) ||
        ((f.relSys || []).join(',') !== rel.join(',')) || (f.priority !== d.priority) ||
        (f.ac !== d.ac) || (Number(f.analysisHours) !== Number(d.analysisHours));
      if (diff) {
        items.push({ id: d.id, action: '修改', name: d.name, desc: d.desc, mainSys: d.mainSys, relSys: rel, priority: d.priority, ac: d.ac, analysisHours: Number(d.analysisHours) || 8 });
        changeCount++;
      }
    });
    if (!UI.crOnlyFpId) {
      fpsOf(reqId).filter(function (f) { return f.confirmed; }).forEach(function (f) {
        if (!draft.some(function (d) { return d.id === f.id; })) { dels.push(f.id); changeCount++; }
      });
    }
    if (!changeCount) { toast('变更内容与原基准一致，无需提交'); return; }
    var first = items[0] || {};
    var cr = {
      id: 'cr' + (DB.seq.cr++), reqId: reqId, kind: '需求变更', scene: UI.crOnlyFpId ? '功能点调整' : '功能点清单调整',
      title: UI.crOnlyFpId
        ? '功能点「' + ((fpById(UI.crOnlyFpId) || {}).name || '') + '」调整'
        : '功能点清单调整（修改 ' + items.filter(function (x) { return x.action === '修改'; }).length +
        ' / 新增 ' + items.filter(function (x) { return x.action === '新增'; }).length + ' / 删除 ' + dels.length + '）',
      before: '基准 ' + versionOf(req) + '，共 ' + fpsOf(reqId).filter(function (f) { return f.confirmed; }).length + ' 个功能点',
      after: first.ac ? ('验收标准：' + (first.ac || '').slice(0, 26)) : ('共 ' + (fpsOf(reqId).length + items.length - dels.length) + ' 个功能点'),
      reason: reason, status: '待审批', submitter: curRole().personId, approver: 'm1',
      createdAt: nowStamp(), decidedAt: '', note: '',
      payload: { type: 'fp', items: items, deleted: dels, scope: UI.crOnlyFpId ? 'single' : 'all' }
    };
    if (first.id) { var pf = fpById(first.id); if (pf) { pf.pendingChange = cr.id; cr.before = '功能点「' + pf.name + '」：' + (pf.ac || '').slice(0, 24); } }
    DB.changeRequests = DB.changeRequests || [];
    DB.changeRequests.unshift(cr);
    logChange({
      reqId: reqId, type: '变更申请', detail: '提交需求变更单（' + cr.title + '）：待管理者审批', before: cr.before, after: cr.after,
      reason: reason
    });
    UI.crDraft = null; UI.crOnlyFpId = ''; closeModal(); render();
    toast('需求变更单已提交，等待管理者审批（变更审批中心）');
  }

  /* ---- 计划变更单（排期/工时/人员调整） ---- */
  function openTaskChange(taskId) {
    var t = taskById(taskId);
    if (!t) return;
    var f = fpById(t.fpid);
    var body = '<div class="alert blue"><div>计划变更需管理者审批后生效；生效时同步刷新计划基准并留痕。</div></div>' +
      '<div class="form-row"><label>变更对象</label><input value="' + esc((f ? f.name : '') + ' · ' + sysOf(t.sysId).name) + '" disabled></div>' +
      '<div class="row"><div class="form-row" style="flex:1"><label>实施工时（小时）</label>' +
      '<input id="pcHours" type="number" value="' + (t.hours || 8) + '"></div>' +
      '<div class="form-row" style="flex:1"><label>实施人</label><select id="pcAssignee">' +
      peopleByRole('DEV').map(function (p) { return '<option value="' + p.id + '" ' + (t.assignee === p.id ? 'selected' : '') + '>' + esc(p.name + ' · ' + p.title) + '</option>'; }).join('') +
      '</select></div></div>' +
      '<div class="row"><div class="form-row" style="flex:1"><label>开始日</label><input type="date" id="pcStart" value="' + esc(t.start || DB.meta.demoDate) + '"></div>' +
      '<div class="form-row" style="flex:1"><label>完成日</label><input type="date" id="pcEnd" value="' + esc(t.end || E.fmtDate(E.nextWorkday(E.toDate(DB.meta.demoDate)))) + '"></div></div>' +
      '<div class="form-row"><label>变更原因（必填）</label><textarea id="pcReason" rows="2" data-chg="pc-reason" placeholder="例如：受插队影响需整体顺延 2 天"></textarea></div>' +
      '<div class="sub">当前计划：' + esc(t.start || '未排期') + ' → ' + esc(t.end || '未排期') + ' · ' + t.hours +
      'h · ' + esc(pname(t.assignee)) + '（审批通过后按新计划写入并提供给验收偏差对比）</div>';
    openModal({
      title: '发起计划变更',
      bodyHTML: body,
      actions: [
        { label: '取消', onClick: closeModal },
        {
          label: '提交变更单（待审批）', cls: 'primary', onClick: function () {
            var px = {
              hours: Number($('#pcHours').value) || 0,
              assignee: $('#pcAssignee').value,
              start: $('#pcStart').value,
              end: $('#pcEnd').value
            };
            var reason = ($('#pcReason').value || '').trim();
            if (!reason) { toast('请填写变更原因'); return; }
            if (px.start && px.end && px.start > px.end) { toast('完成日不能早于开始日'); return; }
            var diff = E.planDiff(t, px);
            if (!diff.length) { toast('变更内容与当前计划一致，无需提交'); return; }
            var cr = {
              id: 'cr' + (DB.seq.cr++), reqId: t.reqId, kind: '计划变更', scene: '开发排期调整',
              title: (f ? f.name : t.id) + ' · ' + sysOf(t.sysId).name + ' 计划变更',
              before: (t.start || '未排期') + ' → ' + (t.end || '未排期') + ' · ' + t.hours + 'h · ' + pname(t.assignee),
              after: (px.start || '未排期') + ' → ' + (px.end || '未排期') + ' · ' + px.hours + 'h · ' + pname(px.assignee),
              reason: reason, status: '待审批', submitter: curRole().personId, approver: 'm1',
              createdAt: nowStamp(), decidedAt: '', note: '',
              payload: { type: 'plan', tasks: [{ id: t.id, hours: px.hours, assignee: px.assignee, start: px.start, end: px.end }] }
            };
            DB.changeRequests = DB.changeRequests || [];
            DB.changeRequests.unshift(cr);
            logChange({ reqId: t.reqId, type: '变更申请', detail: '提交计划变更单（' + cr.title + '）：待管理者审批', before: cr.before, after: cr.after, reason: reason });
            closeModal(); render(); toast('计划变更单已提交，等待管理者审批');
          }
        }
      ]
    });
  }

  /* ---- 变更审批 ---- */
  function approveCr(id) {
    var cr = crOf(id);
    if (!cr || cr.status !== '待审批') return;
    applyChangeRequest(cr);
    cr.status = '已批准';
    cr.decidedAt = nowStamp();
    cr.approver = curRole().personId;
    (DB.featurePoints || []).forEach(function (f) { if (f.pendingChange === cr.id) f.pendingChange = ''; });
    logChange({
      reqId: cr.reqId, type: '变更生效', detail: cr.kind + '「' + cr.title + '」审批通过并生效', before: cr.before, after: cr.after, reason: cr.reason
    });
    render(); toast('变更已通过并生效（' + cr.kind + '）');
  }
  function applyChangeRequest(cr) {
    var p = cr.payload || {};
    if (p.type === 'plan') {
      (p.tasks || []).forEach(function (x) {
        var t = taskById(x.id);
        if (!t) return;
        t.hours = x.hours; t.assignee = x.assignee; t.start = x.start; t.end = x.end;
        t.draftHours = x.hours; t.draftAssignee = x.assignee; t.rec = null;
        t.planDaily = planDailyBetween(x.start, x.end, x.hours);
        t.baselineStart = x.start; t.baselineEnd = x.end;   // 变更审批通过 → 刷新计划基准
      });
      return;
    }
    if (p.type === 'fp') {
      (p.items || []).forEach(function (it) {
        if (it.action === '新增') {
          DB.featurePoints.push({
            id: 'f' + (DB.seq.task++), reqId: cr.reqId, name: it.name, desc: it.desc, mainSys: it.mainSys,
            relSys: it.relSys || [], priority: it.priority, ac: it.ac, analysisHours: it.analysisHours,
            confirmed: true, analyst: '', analysisPlan: null, analysisStatus: '未开始'
          });
          return;
        }
        var f = fpById(it.id);
        if (!f) return;
        f.name = it.name; f.desc = it.desc; f.mainSys = it.mainSys; f.relSys = it.relSys || [];
        f.priority = it.priority; f.ac = it.ac; f.analysisHours = it.analysisHours;
      });
      (p.deleted || []).forEach(function (fid) {
        DB.featurePoints = DB.featurePoints.filter(function (f) { return f.id !== fid; });
      });
      var req = reqById(cr.reqId);
      if (req) req.fpVersion = Math.round((Number(req.fpVersion || 1) + 0.1) * 10) / 10;
    }
  }
  function planDailyBetween(start, end, hours) {
    if (!start || !end) return [];
    var days = [], c = E.toDate(start), g = 0;
    while (c <= E.toDate(end) && g++ < 400) { if (E.isWorkday(c)) days.push(E.fmtDate(c)); c = E.addDays(c, 1); }
    if (!days.length) return [];
    var per = Math.round(Number(hours) / days.length * 10) / 10;
    return days.map(function (d) { return { date: d, hours: per }; });
  }
  function openCrRejectModal(id) {
    openModal({
      title: '驳回变更单',
      bodyHTML: '<div class="form-row"><label>驳回意见（必填，将同步给提交人）</label>' +
        '<textarea id="crRejNote" rows="3" placeholder="例如：变更原因不充分，请补充影响评估"></textarea></div>',
      actions: [
        { label: '取消', onClick: closeModal },
        {
          label: '确认驳回', cls: 'primary', onClick: function () {
            var note = ($('#crRejNote').value || '').trim();
            if (!note) { toast('请填写驳回意见'); return; }
            var cr = crOf(id);
            cr.status = '已驳回'; cr.note = note; cr.decidedAt = nowStamp(); cr.approver = curRole().personId;
            (DB.featurePoints || []).forEach(function (f) { if (f.pendingChange === cr.id) f.pendingChange = ''; });
            logChange({ reqId: cr.reqId, type: '变更驳回', detail: cr.kind + '「' + cr.title + '」被驳回', before: '待审批', after: '已驳回', reason: note });
            closeModal(); render(); toast('已驳回变更单并记录意见');
          }
        }
      ]
    });
  }

  /* ======================= 业务动作：阶段流转 ======================= */
  function gateListHTML(gate) {
    return '<div class="gate-list">' + gate.items.map(function (x) {
      return '<div class="gate ' + (x.pass ? 'ok' : 'no') + '"><span class="g-ico">' + (x.pass ? '✓' : '✕') + '</span>' +
        '<span class="g-t">' + esc(x.label) + '</span><span class="g-d">' + esc(x.detail) + '</span></div>';
    }).join('') + '</div>';
  }
  function stageNext(reqId) {
    var req = reqById(reqId || UI.reqId);
    if (!req) return;
    var gate = E.stageGate(DB, req.id);
    if (!gate.next) { toast('已到最终阶段'); return; }
    if (!gate.ok) {
      openModal({
        title: '阶段门禁未通过（' + req.stage + ' → ' + gate.next + '）',
        bodyHTML: '<div class="alert amber"><div>前一阶段结果尚未全部闭环，不允许流转。请先完成以下事项：</div></div>' + gateListHTML(gate),
        actions: [{ label: '知道了', cls: 'primary', onClick: closeModal }]
      });
      return;
    }
    addMilestone({ reqId: req.id, stage: req.stage, title: req.stage + '完成评审', submitter: curRole().personId });
    var from = req.stage;
    req.stage = gate.next;
    logChange({
      reqId: req.id, type: '阶段流转',
      detail: '前一阶段结果校验通过（' + gate.items.length + ' 项全部通过），需求阶段由「' + from + '」流转至「' + gate.next + '」，由' +
        curRole().name + '提交管理者审批',
      before: from, after: gate.next, reason: '阶段门禁通过'
    });
    render(); toast('门禁校验通过，已提交「' + from + '完成评审」等待审批');
  }
  function bulkDone(kind, reqId) {
    var n = 0;
    if (kind === 'dev') {
      tasksOfReq(reqId).forEach(function (t) { if (t.status !== '已完成') { t.status = '已完成'; n++; } });
      logChange({ reqId: reqId, type: '进度更新', detail: '批量标记开发任务完成 ' + n + ' 条', before: '在办', after: '全部完成', reason: '执行跟踪批量维护' });
    } else {
      testsOfReq(reqId).forEach(function (t) { if (t.status !== '已完成') { t.status = '已完成'; n++; } });
      logChange({ reqId: reqId, type: '进度更新', detail: '批量标记测试完成 ' + n + ' 条', before: '在办', after: '全部完成', reason: '执行跟踪批量维护' });
    }
    render(); toast('已批量标记完成 ' + n + ' 条' + (kind === 'dev' ? '开发任务' : '测试记录'));
  }
  function analysisDoneAll() {
    var n = 0;
    fpsConfirmed(UI.schedReqId).forEach(function (f) {
      if (f.analysisPlan && f.analysisStatus !== '已完成') { f.analysisStatus = '已完成'; n++; }
    });
    if (!n) { toast('没有可标记的分析任务（需先排期）'); return; }
    logChange({ reqId: UI.schedReqId, type: '进度更新', detail: '批量标记分析完成 ' + n + ' 项', before: '执行中', after: '全部完成', reason: '分析阶段收尾' });
    render(); toast('已标记 ' + n + ' 项分析任务完成，可提交阶段流转');
  }

  /* ======================= 业务动作：排期 ======================= */
  function recAnalysis(fpId) {
    var f = fpById(fpId);
    var pid = f.draftAnalyst;
    if (!pid) { toast('请先选择执行人'); return; }
    f.rec = E.recommendSchedule(DB, pid, f.draftHours != null ? f.draftHours : f.analysisHours, f.draftStart || DB.meta.demoDate, { excludeFpId: f.id });
    render();
    if (f.rec) toast('已按 ' + pname(pid) + ' 现有工作推荐周期：' + f.rec.start + ' → ' + f.rec.end);
  }
  function acceptAnalysis(fpId) {
    var f = fpById(fpId);
    if (!f.rec) { toast('请先推荐周期'); return; }
    f.analysisPlan = clone(f.rec); f.analyst = f.draftAnalyst; f.rec = null;
    if (!f.analysisStatus) f.analysisStatus = '未开始';
    logChange({ reqId: f.reqId, type: '排期采用', detail: '功能点「' + f.name + '」分析排期采用推荐：' + f.analysisPlan.start + ' → ' + f.analysisPlan.end, before: '未排期', after: f.analysisPlan.start + ' → ' + f.analysisPlan.end, reason: '按每日 7.6~8.5h 规则自动排期' });
    render(); toast('已采用分析排期：' + f.analysisPlan.start + ' → ' + f.analysisPlan.end);
  }
  function autoAnalysis() {
    var fps = fpsConfirmed(UI.schedReqId).filter(function (f) { return !f.analysisPlan; });
    if (!fps.length) { toast('没有待排期的分析工作'); return; }
    var n = 0;
    fps.forEach(function (f) {
      if (!f.draftAnalyst) f.draftAnalyst = (pickLightest(peopleByRole('PM')) || {}).id || '';
      if (!f.draftStart) f.draftStart = E.fmtDate(E.nextWorkday(E.toDate(DB.meta.demoDate)));
      if (f.draftAnalyst) {
        f.rec = E.recommendSchedule(DB, f.draftAnalyst, f.draftHours != null ? f.draftHours : f.analysisHours, f.draftStart, { excludeFpId: f.id });
        if (f.rec) n++;
      }
    });
    render();
    toast('已为 ' + n + ' 个功能点自动选择执行人与日期并给出推荐周期，可点「全部采用推荐」写入排期');
  }
  function acceptAllAnalysis() {
    var n = 0;
    fpsConfirmed(UI.schedReqId).forEach(function (f) {
      if (f.rec && !f.analysisPlan) {
        f.analysisPlan = clone(f.rec); f.analyst = f.draftAnalyst; f.rec = null;
        if (!f.analysisStatus) f.analysisStatus = '未开始';
        n++;
      }
    });
    if (n) logChange({ reqId: UI.schedReqId, type: '排期采用', detail: '批量采用分析排期 ' + n + ' 项', before: '待排期', after: '已排期', reason: '按 7.6~8.5h/天规则自动排期' });
    render(); toast(n ? '已采用 ' + n + ' 项分析排期' : '没有可采用的推荐');
  }
  function autoDev() {
    var ts = tasksOfReq(UI.schedReqId).filter(function (t) { return !t.start; });
    if (!ts.length) { toast('没有待排期的开发任务'); return; }
    var devs = peopleByRole('DEV'), n = 0, cursor = {};
    ts.forEach(function (t) {
      if (!t.draftAssignee) t.draftAssignee = SYS_OWNER[t.sysId] || (pickLightest(devs) || {}).id || '';
      if (!t.draftStart) t.draftStart = E.fmtDate(E.nextWorkday(E.toDate(DB.meta.demoDate)));
      var base = t.draftStart;
      /* 同批内同一人多条任务：接续上一条的完成日，避免推荐周期重叠 */
      if (cursor[t.draftAssignee] && cursor[t.draftAssignee] >= base) {
        base = E.fmtDate(E.nextWorkday(E.toDate(cursor[t.draftAssignee])));
        t.draftStart = base;
      }
      t.rec = t.draftAssignee
        ? E.recommendSchedule(DB, t.draftAssignee, t.draftHours != null ? t.draftHours : t.hours, base, { excludeTaskId: t.id })
        : null;
      if (t.rec) { cursor[t.draftAssignee] = t.rec.end; n++; }
    });
    render();
    toast('已为 ' + n + ' 条任务自动选择实施人与最早开始日并给出推荐周期');
  }
  function acceptAllRec() {
    var n = 0;
    (DB.devTasks || []).forEach(function (t) {
      if (t.rec && t.reqId === UI.schedReqId) {
        t.assignee = t.draftAssignee || t.assignee;
        t.hours = t.draftHours != null ? t.draftHours : t.hours;
        t.start = t.rec.start; t.end = t.rec.end; t.planDaily = t.rec.daily; t.rec = null; n++;
      }
    });
    if (n) logChange({ reqId: UI.schedReqId, type: '排期采用', detail: '批量采用开发排期 ' + n + ' 条', before: '待排期', after: '已排期', reason: '按实施人现有任务自动排期' });
    render(); toast(n ? '已采用 ' + n + ' 条任务的推荐排期' : '没有可采用的推荐');
  }
  function testEarliest(r) {
    var src = r.taskId ? taskById(r.taskId) : null;
    var base = (src && src.end) ? E.fmtDate(E.nextWorkday(E.toDate(src.end))) : E.fmtDate(E.nextWorkday(E.toDate(DB.meta.demoDate)));
    return base > DB.meta.demoDate ? base : E.fmtDate(E.nextWorkday(E.toDate(DB.meta.demoDate)));
  }
  /* 测试排期与开发排期同一算法：逐条按测试人当前已有工作量选人，唯一差异是与开发的上下游关系（最早开始日接续开发完成日） */
  function autoTest() {
    var trs = testsOfReq(UI.schedReqId).filter(function (r) { return !r.start; });
    if (!trs.length) { toast('没有待排期的测试记录'); return; }
    var qas = peopleByRole('QA'), n = 0, cursor = {}, extra = {};
    trs.forEach(function (r) {
      var h = r.draftHours != null ? r.draftHours : r.hours;
      if (!r.draftAssignee) {
        var pick = qas.slice().sort(function (a, b) {
          return (loadSum(a.id) + (extra[a.id] || 0)) - (loadSum(b.id) + (extra[b.id] || 0));
        })[0];
        r.draftAssignee = pick ? pick.id : '';
      }
      extra[r.draftAssignee] = (extra[r.draftAssignee] || 0) + h;
      if (!r.draftStart) r.draftStart = testEarliest(r);
      var base = r.draftStart;
      if (cursor[r.draftAssignee] && cursor[r.draftAssignee] >= base) {
        base = E.fmtDate(E.nextWorkday(E.toDate(cursor[r.draftAssignee])));
        r.draftStart = base;
      }
      r.rec = r.draftAssignee ? E.recommendSchedule(DB, r.draftAssignee, h, base, { excludeTestId: r.id }) : null;
      if (r.rec) { cursor[r.draftAssignee] = r.rec.end; n++; }
    });
    render(); toast('已为 ' + n + ' 条测试记录按各自工作量推荐测试人与周期（与开发排期同一算法，开始日接续开发完成日）');
  }
  function acceptTest(id) {
    var r = testById(id);
    if (!r.rec) { toast('请先推荐周期'); return; }
    r.assignee = r.draftAssignee || r.assignee;
    r.hours = r.draftHours != null ? r.draftHours : r.hours;
    r.start = r.rec.start; r.end = r.rec.end; r.planDaily = r.rec.daily; r.rec = null;
    logChange({ reqId: r.reqId, type: '排期采用', detail: '测试记录（' + pname(r.assignee) + '）排期采用推荐：' + r.start + ' → ' + r.end, before: '未排期', after: r.start + ' → ' + r.end, reason: '测试阶段独立排期' });
    render(); toast('已采用测试排期：' + r.start + ' → ' + r.end);
  }
  function acceptAllTest() {
    var n = 0;
    testsOfReq(UI.schedReqId).forEach(function (r) {
      if (r.rec) {
        r.assignee = r.draftAssignee || r.assignee;
        r.hours = r.draftHours != null ? r.draftHours : r.hours;
        r.start = r.rec.start; r.end = r.rec.end; r.planDaily = r.rec.daily; r.rec = null; n++;
      }
    });
    if (n) logChange({ reqId: UI.schedReqId, type: '排期采用', detail: '批量采用测试排期 ' + n + ' 条', before: '待排期', after: '已排期', reason: '测试阶段独立排期' });
    render(); toast(n ? '已采用 ' + n + ' 条测试排期' : '没有可采用的推荐');
  }

  var SYS_OWNER = { s_core: 'p2', s_chn: 'p3', s_pay: 'p4', s_data: 'p6' };
  function loadSum(personId) {
    var l = E.personLoad(DB, personId), s = 0;
    Object.keys(l).forEach(function (k) { s += l[k]; });
    return Math.round(s * 10) / 10;
  }
  function pickLightest(list) {
    return list.slice().sort(function (a, b) { return loadSum(a.id) - loadSum(b.id); })[0];
  }
  function openAdjustDate(kind, id) {
    var cur = null, title = '调整排期周期', total = 8;
    if (kind === 'analysis') { var f = fpById(id); cur = f.analysisPlan; total = f.draftHours != null ? f.draftHours : f.analysisHours; title = '调整分析排期：' + f.name; }
    else if (kind === 'dev') { var t = taskById(id); cur = t.start ? { start: t.start, end: t.end } : null; total = t.draftHours != null ? t.draftHours : t.hours; title = '调整开发排期：' + (fpById(t.fpid) ? fpById(t.fpid).name : ''); }
    else if (kind === 'test') { var r = testById(id); cur = r.start ? { start: r.start, end: r.end } : null; total = r.draftHours != null ? r.draftHours : r.hours; title = '调整测试排期：' + (fpById(r.fpid) ? fpById(r.fpid).name : ''); }
    else { var mp = mpById(id); cur = mp.plan; total = mp.hours; title = '调整计划排期：' + mp.name; }
    var s = (cur && cur.start) || DB.meta.demoDate, e = (cur && cur.end) || E.fmtDate(E.nextWorkday(E.toDate(DB.meta.demoDate)));
    openModal({
      title: title,
      bodyHTML: '<div class="form-row"><label>开始日</label><input type="date" id="adjStart" value="' + esc(s) + '"></div>' +
        '<div class="form-row"><label>结束日</label><input type="date" id="adjEnd" value="' + esc(e) + '"></div>' +
        '<div class="sub">系统将自动跳过周末并按工作日平均分配工时（共 ' + total + 'h）；单日建议不超过 8.5 小时。</div>',
      actions: [
        { label: '取消', onClick: closeModal },
        {
          label: '保存周期', cls: 'primary', onClick: function () {
            var s2 = $('#adjStart').value, e2 = $('#adjEnd').value;
            if (!s2 || !e2) { toast('请填写完整日期'); return; }
            if (s2 > e2) { toast('结束日不能早于开始日'); return; }
            var daily = planDailyBetween(s2, e2, total);
            if (!daily.length) { toast('所选区间没有工作日'); return; }
            var per = daily[0].hours;
            var plan = { start: s2, end: e2, days: daily.length, daily: daily, manual: true, ruleText: '人工指定周期（' + daily.length + ' 个工作日 × ' + per + 'h）' };
            applyPlan(kind, id, plan);
            closeModal();
            logChange({ reqId: UI.schedReqId, type: '排期改期', detail: title + ' 改为 ' + s2 + ' → ' + e2 + '（' + daily.length + ' 个工作日 × ' + per + 'h）', before: cur && cur.start ? cur.start + ' → ' + cur.end : '未排期', after: s2 + ' → ' + e2, reason: '人工指定排期日期' });
            render(); toast('已保存排期周期：' + s2 + ' → ' + e2 + (per > 8.5 ? '（注意：单日均 ' + per + 'h，超过 8.5h 上限）' : ''));
          }
        }
      ]
    });
  }
  function applyPlan(kind, id, plan) {
    if (kind === 'analysis') {
      var f = fpById(id);
      f.analysisPlan = plan;
      if (f.draftAnalyst) f.analyst = f.draftAnalyst;
      f.rec = null;
    } else if (kind === 'dev') {
      var t = taskById(id);
      t.start = plan.start; t.end = plan.end; t.planDaily = plan.daily; t.rec = null;
      if (t.draftAssignee) t.assignee = t.draftAssignee;
      if (t.draftHours != null) t.hours = t.draftHours;
    } else if (kind === 'test') {
      var r = testById(id);
      r.start = plan.start; r.end = plan.end; r.planDaily = plan.daily; r.rec = null;
      if (r.draftAssignee) r.assignee = r.draftAssignee;
      if (r.draftHours != null) r.hours = r.draftHours;
    } else {
      var mp = mpById(id); mp.plan = plan; mp.rec = null;
    }
  }
  /* 手动添加计划弹窗的联动：切换类型自动换执行人候选，并实时预览推荐周期 */
  function refreshManualPreview(rebuildPeople) {
    var typeSel = $('#mpType');
    if (!typeSel) return;
    var type = typeSel.value;
    var personSel = $('#mpPerson');
    if (!personSel) return;

    if (rebuildPeople) {
      var list = personForKind(type);
      personSel.innerHTML = list.map(function (p) {
        return '<option value="' + p.id + '">' + esc(p.name + ' · ' + p.title) + '</option>';
      }).join('');
      if (list.length) personSel.value = list[0].id;
    }

    var prev = $('#mpPreview');
    if (!prev) return;
    var personId = personSel.value;
    var hours = Number(($('#mpHours') || {}).value) || 0;
    var earliest = ($('#mpEarliest') || {}).value || DB.meta.demoDate;
    if (!personId || !hours) {
      prev.className = 'mp-preview';
      prev.innerHTML = '<span class="muted">填写执行人与工作量后，此处实时预览推荐周期</span>';
      return;
    }
    var rec = E.recommendSchedule(DB, personId, hours, earliest, {});
    if (!rec) {
      prev.className = 'mp-preview';
      prev.innerHTML = '<span class="muted">暂无法推荐（请检查工作量与最早开始日）</span>';
      return;
    }
    prev.className = 'mp-preview ok';
    prev.innerHTML = '<b>推荐周期：' + esc(rec.start) + ' → ' + esc(rec.end) + '</b>（' + rec.days + ' 个工作日）' +
      '<div class="sub">依据：' + esc(pname(personId)) + ' 当前已排 ' + rec.startLoad + 'h/日，按每天 7.6~8.5h 填充空档后自动顺延</div>';
  }

  function openPlanEditor(kind) {
    var types = manualTypes();
    var k = kind && types.indexOf(kind) >= 0 ? kind : types[0];
    var body = '<div class="form-row"><label>计划名称</label><input id="mpName" placeholder="例如：还款链路压测专项工作"></div>' +
      '<div class="form-row"><label>计划类型</label><select id="mpType" data-chg="mp-type">' +
      types.map(function (t) { return '<option value="' + t + '" ' + (t === k ? 'selected' : '') + '>' + t + '计划</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-row"><label>归属需求</label><select id="mpReq">' +
      DB.requirements.map(function (r) { return '<option value="' + r.id + '" ' + (r.id === UI.schedReqId ? 'selected' : '') + '>' + esc(r.code + ' ' + r.title) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-row"><label>执行人</label><select id="mpPerson" data-chg="mp-person">' +
      personForKind(k).map(function (p) { return '<option value="' + p.id + '">' + esc(p.name + ' · ' + p.title) + '</option>'; }).join('') +
      '</select><span class="hint">按计划类型自动匹配角色（分析→产品经理 / 开发→开发 / 测试→测试）</span></div>' +
      '<div class="form-row"><label>工作量（小时）</label><input id="mpHours" type="number" value="8" data-chg="mp-hours"></div>' +
      '<div class="form-row"><label>最早开始日</label><input id="mpEarliest" type="date" value="' + esc(E.fmtDate(E.nextWorkday(E.toDate(DB.meta.demoDate)))) + '" data-chg="mp-earliest"></div>' +
      '<div class="form-row"><label>备注</label><input id="mpNote" placeholder="计划外工作说明"></div>' +
      '<div id="mpPreview" class="mp-preview"></div>' +
      '<div class="sub">说明：手动计划会计入执行人占用日历，后续推荐周期会自动避开；该计划将出现在对应阶段的计划清单中。</div>';
    openModal({
      title: '手动添加' + k + '计划',
      bodyHTML: body,
      actions: [
        { label: '取消', onClick: closeModal },
        {
          label: '保存并推荐周期', cls: 'primary', onClick: function () {
            var name = ($('#mpName').value || '').trim();
            if (!name) { toast('请填写计划名称'); return; }
            var reqSel = $('#mpReq');
            var mpReq = (reqSel && reqSel.value && reqById(reqSel.value)) ? reqSel.value : (reqById(UI.schedReqId) ? UI.schedReqId : DB.requirements[0].id);
            var type = $('#mpType').value;
            var personSel = $('#mpPerson');
            var personId = (personSel && personSel.value) || (personForKind(type)[0] || {}).id || '';
            var mp = {
              id: 'mp' + (DB.seq.plan++), reqId: mpReq, name: name, type: type, personId: personId,
              hours: Number($('#mpHours').value) || 8,
              earliest: $('#mpEarliest').value || DB.meta.demoDate,
              note: ($('#mpNote').value || '').trim(), plan: null, rec: null, manual: true
            };
            DB.manualPlans = DB.manualPlans || [];
            DB.manualPlans.push(mp);
            mp.rec = E.recommendSchedule(DB, mp.personId, mp.hours, mp.earliest, { excludePlanId: mp.id });
            UI.schedReqId = mp.reqId;
            logChange({ reqId: mp.reqId, type: '手动计划', detail: '新增' + type + '计划「' + mp.name + '」（' + pname(mp.personId) + ' · ' + mp.hours + 'h）', before: '无', after: '已登记', reason: '计划外工作登记' });
            closeModal(); render();
            toast(mp.rec ? '已登记并推荐周期：' + mp.rec.start + ' → ' + mp.rec.end : '已登记计划');
          }
        }
      ]
    });
    refreshManualPreview(false);   // 打开即按默认执行人 + 8h 预览一次推荐周期
  }
  function recManualPlan(id) {
    var mp = mpById(id);
    mp.rec = E.recommendSchedule(DB, mp.personId, mp.hours, mp.earliest, { excludePlanId: mp.id });
    render(); toast(mp.rec ? '推荐周期：' + mp.rec.start + ' → ' + mp.rec.end : '无法推荐（工时为 0？）');
  }
  function acceptManualPlan(id) {
    var mp = mpById(id);
    if (!mp.rec) { toast('请先推荐周期'); return; }
    mp.plan = clone(mp.rec); mp.rec = null;
    logChange({ reqId: mp.reqId, type: '排期采用', detail: mp.type + '计划「' + mp.name + '」采用排期 ' + mp.plan.start + ' → ' + mp.plan.end, before: '未排期', after: mp.plan.start + ' → ' + mp.plan.end, reason: '手动计划排期' });
    render(); toast('已采用排期：' + mp.plan.start + ' → ' + mp.plan.end);
  }

  /* ======================= 业务动作：任务引入 / 校验 / 生效 ======================= */
  function introDev() {
    var reqId = UI.schedReqId;
    var fps = fpsConfirmed(reqId).filter(function (f) { return UI.pick[f.id] !== false; });
    if (!fps.length) { toast('请先勾选要引入的功能点'); return; }
    var withRel = fps.filter(function (f) { return (f.relSys || []).length; });
    if (withRel.length) {
      openModal({
        title: '关联系统任务创建确认',
        bodyHTML: '<div>检测到 <b>' + withRel.length + '</b> 个功能点存在关联系统：</div><div style="margin:8px 0">' +
          withRel.map(function (f) {
            return '<div>' + esc(f.name) + '：主 <span class="sys-chip main">' + esc(sysOf(f.mainSys).name) + '</span>' +
              (f.relSys).map(function (s) { return '<span class="sys-chip rel">' + esc(sysOf(s).name) + '</span>'; }).join('') + '</div>';
          }).join('') + '</div><div class="sub">是否为所有关联系统自动创建该功能点的任务？</div>',
        actions: [
          { label: '仅创建主系统任务', onClick: function () { closeModal(); doIntro(false); } },
          { label: '为所有关联系统自动创建任务', cls: 'primary', onClick: function () { closeModal(); doIntro(true); } }
        ]
      });
    } else { doIntro(false); }
  }
  function doIntro(autoRel) {
    var reqId = UI.schedReqId;
    var fps = fpsConfirmed(reqId).filter(function (f) { return UI.pick[f.id] !== false; });
    var created = 0, testCreated = 0;
    fps.forEach(function (f) {
      var exists = tasksOfReq(reqId).some(function (t) { return t.fpid === f.id; });
      if (exists) return;
      var devHours = Math.max(4, Math.round((f.analysisHours || 8) * 1.5));
      var list = [{ sysId: f.mainSys, isMain: true }];
      if (autoRel) (f.relSys || []).forEach(function (s) { list.push({ sysId: s, isMain: false }); });
      list.forEach(function (item) {
        var tid = 't' + (DB.seq.task++);
        DB.devTasks.push({
          id: tid, fpid: f.id, reqId: reqId, sysId: item.sysId, assignee: '', hours: devHours,
          start: '', end: '', status: '未开始', draftHours: devHours, rec: null
        });
        created++;
        var testHours = Math.max(2, Math.round(devHours * 0.5));
        DB.testRecords.push({
          id: 'tc' + (DB.seq.test++), taskId: tid, fpid: f.id, reqId: reqId,
          assignee: '', hours: testHours, status: '未开始',
          start: '', end: '', draftAssignee: '', draftHours: testHours, rec: null
        });
        testCreated++;
      });
    });
    logChange({
      reqId: reqId, type: '任务引入',
      detail: '引入 ' + fps.length + ' 个功能点的开发任务（' + (autoRel ? '含关联系统自动创建' : '仅主系统') + '），共 ' + created +
        ' 条任务，自动派生 ' + testCreated + ' 条测试记录',
      before: '0 条任务', after: created + ' 条任务 / ' + testCreated + ' 条测试记录', reason: '开发排期'
    });
    render();
    toast('已引入 ' + created + ' 条开发任务，自动创建 ' + testCreated + ' 条测试记录');
  }
  function acceptDev(taskId) {
    var t = taskById(taskId);
    if (!t.rec) { toast('请先选择实施人并推荐周期'); return; }
    var before = t.start ? t.start + ' → ' + t.end : '未排期';
    t.assignee = t.draftAssignee || t.assignee;
    t.hours = t.draftHours != null ? t.draftHours : t.hours;
    t.start = t.rec.start; t.end = t.rec.end; t.planDaily = t.rec.daily; t.rec = null;
    logChange({ reqId: t.reqId, type: '排期采用', detail: '任务（' + pname(t.assignee) + ' · ' + sysOf(t.sysId).name + '）排期采用推荐：' + t.start + ' → ' + t.end, before: before, after: t.start + ' → ' + t.end, reason: '按实施人现有任务自动排期' });
    render(); toast('已采用排期：' + t.start + ' → ' + t.end);
  }
  function shiftMain(taskId, gap) {
    var t = taskById(taskId);
    var before = t.start + ' → ' + t.end;
    t.start = E.fmtDate(E.addDays(E.toDate(t.start), gap));
    t.end = E.fmtDate(E.addDays(E.toDate(t.end), gap));
    t.planDaily = planDailyBetween(t.start, t.end, t.hours);
    logChange({ reqId: t.reqId, type: '关联系统校验处置', detail: '主系统任务顺延 ' + gap + ' 天与关联系统对齐', before: before, after: t.start + ' → ' + t.end, reason: '关联系统排期晚于主系统' });
    render(); toast('主系统任务已顺延 ' + gap + ' 天');
  }
  function markParallel(taskId) {
    var t = taskById(taskId);
    var f = fpById(t.fpid);
    f.parallel = true;
    logChange({ reqId: t.reqId, type: '关联系统校验处置', detail: '功能点「' + f.name + '」的关联系统任务标记为并行推进', before: '串行', after: '并行', reason: '人工确认可并行' });
    render(); toast('已标记为并行推进（不再提示）');
  }
  function planApply() {
    var req = reqById(UI.schedReqId);
    var ts = tasksOfReq(req.id);
    if (!ts.length) { toast('请先引入开发任务'); return; }
    var un = ts.filter(function (t) { return !t.start; });
    ts.forEach(function (t) { if (t.start) { t.baselineStart = t.start; t.baselineEnd = t.end; } });
    addMilestone({ reqId: req.id, stage: '开发', title: '开发计划生效审批', submitter: curRole().personId });
    logChange({ reqId: req.id, type: '计划生效', detail: '开发计划提交生效，共 ' + ts.length + ' 条任务，已冻结计划基准' + (un.length ? '（其中 ' + un.length + ' 条未排期）' : ''), before: '草稿', after: '待审批生效', reason: '提交管理者审批' });
    render(); toast('计划已提交生效审批，并冻结计划基准供验收对比' + (un.length ? '（' + un.length + ' 条任务未排期）' : ''));
  }

  /* ======================= 状态 / 审批 / 插队 ======================= */
  function handleStatusChange(act, id, value) {
    if (act === 'task-status') {
      var t = taskById(id);
      var before = t.status; t.status = value;
      logChange({ reqId: t.reqId, type: '进度更新', detail: '开发任务（' + pname(t.assignee) + ' · ' + sysOf(t.sysId).name + '）状态：' + before + ' → ' + value, before: before, after: value, reason: '执行跟踪维护' });
    } else if (act === 'test-status') {
      var r = testById(id);
      var b2 = r.status; r.status = value;
      logChange({ reqId: r.reqId, type: '进度更新', detail: '测试记录状态：' + b2 + ' → ' + value + (r.taskId ? '（源任务 ' + r.taskId + '）' : '（手动测试计划）'), before: b2, after: value, reason: '测试维护' });
    }
    render();
  }
  function decide(id, status, note) {
    var ms = (DB.milestones || []).filter(function (m) { return m.id === id; })[0];
    if (!ms) return;
    var before = ms.status;
    ms.status = status;
    ms.decidedAt = nowStamp();
    ms.note = note || '';
    logChange({ reqId: ms.reqId, type: '审批' + (status === '已通过' ? '通过' : '驳回'), detail: ms.title + '（' + ms.stage + '）审批结果：' + status + (note ? '，意见：' + note : ''), before: before, after: status, reason: '管理者审批', by: '王总' });
    render(); toast('审批已' + (status === '已通过' ? '通过' : '驳回'));
  }
  function openRejectModal(id) {
    openModal({
      title: '驳回审批',
      bodyHTML: '<div class="form-row"><label>驳回意见（必填，将同步给提交人）</label>' +
        '<textarea id="rejNote" rows="3" placeholder="例如：工时颗粒度不足，请按关联系统补充"></textarea></div>',
      actions: [
        { label: '取消', onClick: closeModal },
        {
          label: '确认驳回', cls: 'primary', onClick: function () {
            var note = ($('#rejNote').value || '').trim();
            if (!note) { toast('请填写驳回意见'); return; }
            closeModal(); decide(id, '已驳回', note);
          }
        }
      ]
    });
  }
  function openInsertModal() {
    var q = E.queueSorted(DB);
    openModal({
      title: '模拟需求插队',
      bodyHTML: '<div class="form-row"><label>选择要插队的需求</label><select id="insReq">' +
        q.map(function (r) { return '<option value="' + r.id + '">' + esc(r.code + ' ' + r.title) + '（当前第 ' + (q.indexOf(r) + 1) + ' 位 · ' + r.priority + '）</option>'; }).join('') +
        '</select></div>' +
        '<div class="form-row"><label>插队到第几位</label><select id="insPos">' +
        q.map(function (r, i) { return '<option value="' + (i + 1) + '">第 ' + (i + 1) + ' 位</option>'; }).join('') +
        '</select></div>' +
        '<div id="insPreview" class="muted" style="margin-top:6px">点击「预览影响」查看插队对后续需求的影响</div>',
      actions: [
        { label: '取消', onClick: closeModal },
        { label: '预览影响', onClick: function () { previewInsert(); } },
        { label: '确认插队', cls: 'primary', onClick: function () { applyInsert(); } }
      ]
    });
  }
  function previewInsert() {
    var reqId = $('#insReq').value, pos = Number($('#insPos').value);
    var r = E.queueImpact(DB, reqId, pos);
    if (!r) { $('#insPreview').innerHTML = '无法计算影响'; return; }
    var req = reqById(reqId);
    $('#insPreview').innerHTML = '<div class="alert amber"><div><b>插队预览：</b>' + esc(req.title) +
      ' 由第 ' + r.from + ' 位插至第 ' + r.to + ' 位，占用开发窗口 ' + r.insertedDays + ' 天。<br>' +
      (r.displaced.length
        ? '被插队需求及顺延：' + r.displaced.map(function (d) {
          var sc = E.impactScope(DB, d.req.id);
          return '<br>· ' + esc(d.req.title) + ' 后移 ' + d.shift + ' 位 → 顺延 ' + d.delayDays + ' 天（受影响任务 ' + sc.taskCount + ' 条 / ' + sc.people.length + ' 人）';
        }).join('')
        : '<br>无其他需求被插队') + '</div></div>';
  }
  function applyInsert() {
    var reqId = $('#insReq').value, pos = Number($('#insPos').value);
    var r = E.queueImpact(DB, reqId, pos);
    if (!r) { toast('无法计算影响'); return; }
    var req = reqById(reqId);
    r.moved.forEach(function (x, i) { var o = reqById(x.id); if (o) o.order = i + 1; });
    var displacedInfo = [];
    r.displaced.forEach(function (d) {
      var sc = E.impactScope(DB, d.req.id);
      tasksOfReq(d.req.id).forEach(function (t) {
        if (t.status === '已完成' || !t.start) return;
        t.start = E.fmtDate(E.addDays(E.toDate(t.start), d.delayDays));
        t.end = E.fmtDate(E.addDays(E.toDate(t.end), d.delayDays));
        t.planDaily = planDailyBetween(t.start, t.end, t.hours);
      });
      displacedInfo.push({ id: d.req.id, title: d.req.title, shift: d.shift, delayDays: d.delayDays, taskCount: sc.taskCount, people: sc.people.length });
      logChange({ reqId: d.req.id, type: '排期顺延', detail: '受 ' + req.code + ' 插队影响，位次后移 ' + d.shift + ' 位，相关任务整体顺延 ' + d.delayDays + ' 天', before: '原计划', after: '顺延 ' + d.delayDays + ' 天', reason: '资源抢占（插队）' });
    });
    logChange({ reqId: req.id, type: '插队', detail: '需求插队：由第 ' + r.from + ' 位插至第 ' + r.to + ' 位', before: '队列位置 ' + r.from, after: '队列位置 ' + r.to, reason: '业务优先级调整' });
    DB.lastInsertImpact = {
      reqId: req.id, code: req.code, title: req.title, from: r.from, to: r.to,
      insertedDays: r.insertedDays, displaced: displacedInfo
    };
    closeModal(); UI.view = 'board'; render();
    toast('插队已生效，影响 ' + displacedInfo.length + ' 个需求');
  }

  /* ======================= 验收 / 复盘 / 导出 ======================= */
  function openAccEditor(fpid) {
    var f = fpById(fpid);
    var a = E.accOf(DB, fpid) || {};
    var body = '<div class="alert blue"><div><b>验收标准（既定基准）：</b>' + esc(f.ac) + '</div></div>' +
      '<div class="form-row"><label>实测结果（客观数据）</label><textarea id="accActual" rows="3" placeholder="例如：触达率 99.2%，响应 240ms">' + esc(a.actual || '') + '</textarea></div>' +
      '<div class="form-row"><label>证据 / 附件说明</label><input id="accEvidence" value="' + esc(a.evidence || '') + '" placeholder="例如：压测报告 RPT-2026-1012"></div>' +
      '<div class="form-row"><label>验收结论</label><select id="accStatus">' +
      ['已达成', '部分达成', '未达成'].map(function (s) { return '<option ' + (a.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-row"><label>达成得分（0~100，按权重计入需求达成度）</label><input id="accScore" type="number" value="' + (a.score != null ? a.score : 85) + '"></div>' +
      '<div class="sub">功能点权重：P0=3 / P1=2 / P2=1；得分与结论将进入需求达成度与部门目标达成度计算，可追溯、可对比。</div>';
    openModal({
      title: '功能点验收：' + f.name,
      bodyHTML: body,
      actions: [
        { label: '取消', onClick: closeModal },
        {
          label: '保存验收结果', cls: 'primary', onClick: function () {
            var status = $('#accStatus').value;
            var score = Number($('#accScore').value);
            if (isNaN(score)) score = 0;
            score = Math.max(0, Math.min(100, score));
            var exist = E.accOf(DB, fpid);
            var before = exist ? exist.status + '（' + exist.score + '）' : '未验收';
            if (exist) {
              exist.status = status; exist.score = score;
              exist.actual = $('#accActual').value.trim(); exist.evidence = $('#accEvidence').value.trim();
              exist.by = curRole().personId; exist.at = nowStamp();
            } else {
              DB.acceptances = DB.acceptances || [];
              DB.acceptances.push({
                id: 'a' + (DB.seq.accept++), reqId: f.reqId, fpid: fpid, status: status, score: score,
                actual: $('#accActual').value.trim(), evidence: $('#accEvidence').value.trim(),
                by: curRole().personId, at: nowStamp()
              });
            }
            logChange({ reqId: f.reqId, type: '验收记录', detail: '功能点「' + f.name + '」验收：' + status + '（' + score + ' 分）', before: before, after: status + '（' + score + '）', reason: '对照验收标准客观评估' });
            UI.verifyReqId = f.reqId;
            closeModal(); render();
            var na = E.reqAchievement(DB, f.reqId);
            toast('已记录验收：' + status + '，该需求达成度 ' + na.rate + '（' + na.grade + '）');
          }
        }
      ]
    });
    var sel = $('#accStatus'), sc = $('#accScore');
    if (sel && sc) {
      var suggest = { '已达成': 90, '部分达成': 70, '未达成': 40 };
      sel.onchange = function () { sc.value = suggest[sel.value] != null ? suggest[sel.value] : sc.value; };
    }
  }
  function openReviewModal(reqId) {
    var req = reqById(reqId);
    var ach = E.reqAchievement(DB, reqId);
    var goal = E.goalAchievement(DB, (DB.goals[0] || {}).id);
    var exist = ach.conclusion || {};
    openModal({
      title: '组织验收：' + req.code + ' ' + req.title,
      bodyHTML: '<div class="alert ' + (ach.rate >= 75 ? 'green' : 'amber') + '"><div>本需求加权达成度 <b>' + ach.rate + '</b>（' + ach.grade + '）· 已验收 ' +
        ach.verifiedCount + '/' + ach.fpTotal + ' 个功能点 · 延期任务 ' + ach.delayedTasks + ' 条 · 基准 ' + versionOf(req) +
        (goal ? '<br>部门目标「' + esc(goal.goal.name) + '」当前达成度 ' + goal.achieved + ' / 目标 ' + goal.target : '') + '</div></div>' +
        '<div class="form-row"><label>验收结论</label><select id="rvResult">' +
        ['验收通过', '有条件通过', '验收不通过'].map(function (s) { return '<option ' + (exist.result === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="form-row"><label>验收意见（将同步给需求负责人）</label><textarea id="rvNote" rows="3">' + esc(exist.note || '') + '</textarea></div>' +
        '<div class="sub">结论将生成「验收里程碑」并写入变更留痕，形成可追溯的组织验收记录。</div>',
      actions: [
        { label: '取消', onClick: closeModal },
        {
          label: '提交验收结论', cls: 'primary', onClick: function () {
            var result = $('#rvResult').value, note = $('#rvNote').value.trim();
            DB.goalReviews = DB.goalReviews || [];
            var g = (DB.goalReviews || []).filter(function (x) { return x.reqId === reqId; })[0];
            var before = g ? g.result : '未验收';
            if (g) {
              g.result = result; g.note = note; g.achieved = ach.rate; g.target = goal ? goal.target : 0;
              g.by = curRole().personId; g.at = nowStamp();
            } else {
              DB.goalReviews.push({
                id: 'gr' + (DB.seq.review++), reqId: reqId, goalId: goal ? goal.goal.id : '', result: result,
                achieved: ach.rate, target: goal ? goal.target : 0, note: note,
                by: curRole().personId, at: nowStamp()
              });
            }
            addMilestone({ reqId: reqId, stage: '验收', title: '组织验收结论', submitter: curRole().personId });
            logChange({ reqId: reqId, type: '组织验收', detail: '验收结论：' + result + '（达成度 ' + ach.rate + ' / 基准 ' + versionOf(req) + '）', before: before, after: result, reason: note || '组织验收' });
            closeModal(); render(); toast('已提交验收结论：' + result);
          }
        }
      ]
    });
  }
  function openRetroModal(personId) {
    var rt = E.personRetro(DB, personId);
    openModal({
      title: '复盘改进：' + pname(personId),
      bodyHTML: '<div class="alert blue"><div>客观指标：完成任务 ' + rt.doneCount + '/' + rt.taskCount + ' · 按期率 ' + rt.onTimeRate +
        '% · 被顺延 ' + rt.slipCount + ' 次 · 涉及功能点 ' + rt.fpCount + ' 个' +
        (rt.verifiedFp ? ' · 功能点验收均分 ' + rt.avgScore : '') + '</div></div>' +
        '<div class="form-row"><label>做得好的（保持）</label><textarea id="rtGood" rows="2"></textarea></div>' +
        '<div class="form-row"><label>待改进（基于客观数据）</label><textarea id="rtBad" rows="2"></textarea></div>' +
        '<div class="form-row"><label>改进举措</label><textarea id="rtAction" rows="2"></textarea></div>',
      actions: [
        { label: '取消', onClick: closeModal },
        {
          label: '保存复盘', cls: 'primary', onClick: function () {
            var action = ($('#rtAction').value || '').trim();
            if (!action) { toast('请填写改进举措'); return; }
            DB.retros = DB.retros || [];
            DB.retros.unshift({
              id: 'rt' + (DB.seq.retro++), personId: personId, reqId: UI.verifyReqId,
              good: $('#rtGood').value.trim(), bad: $('#rtBad').value.trim(), action: action,
              by: curRole().personId, at: nowStamp()
            });
            logChange({ reqId: UI.verifyReqId, type: '复盘记录', detail: '为 ' + pname(personId) + ' 记录复盘改进：' + action, before: '未复盘', after: '已复盘', reason: '员工复盘' });
            closeModal(); render(); toast('已保存复盘记录');
          }
        }
      ]
    });
  }
  function openRoleMatrix() {
    openModal({
      wide: true,
      title: '角色能力矩阵（当前身份：' + curRole().name + ' ' + pname(curRole().personId) + '）',
      bodyHTML: roleMatrixHTML() + '<div class="sub" style="margin-top:8px">说明：同一平台按角色收敛可见视图与可操作项，避免越权操作，也便于管理者聚焦审批与验收。</div>',
      actions: [{ label: '关闭', onClick: closeModal }]
    });
  }
  function csvCell(v) { var s = String(v == null ? '' : v); return '"' + s.replace(/"/g, '""') + '"'; }
  function exportReport(fmt) {
    try {
      var rows = E.acceptanceLog(DB);
      var goal = E.goalAchievement(DB, (DB.goals[0] || {}).id);
      var stamp = DB.meta.demoDate;
      if (fmt === 'csv') {
        var head = ['需求编号', '需求名称', '功能点', '验收标准', '实测结果', '结论', '得分', '证据', '验收人', '验收时间'];
        var lines = [head.map(csvCell).join(',')];
        rows.forEach(function (x) { lines.push([x.reqCode, x.reqTitle, x.fpName, x.ac, x.actual, x.status, x.score, x.evidence, x.by, x.at].map(csvCell).join(',')); });
        lines.push('');
        if (goal) lines.push([csvCell('部门目标'), csvCell(goal.goal.name), csvCell('达成度'), csvCell(goal.achieved), csvCell('目标值'), csvCell(goal.target)].join(','));
        download('验收报告-' + stamp + '.csv', '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
        toast('已导出验收报告 CSV（' + rows.length + ' 条记录）');
      } else {
        var payload = {
          meta: { demoDate: stamp, mock: true, exportedAt: stamp },
          goal: goal ? { name: goal.goal.name, target: goal.target, achieved: goal.achieved, reached: goal.reached } : null,
          requirements: DB.requirements.map(function (r) {
            var a = E.reqAchievement(DB, r.id);
            var v = E.variance(DB, r.id);
            return {
              code: r.code, title: r.title, stage: r.stage, baseVersion: versionOf(r), rate: a.rate, grade: a.grade,
              verified: a.verifiedCount + '/' + a.fpTotal, conclusion: a.conclusion ? a.conclusion.result : '',
              delayedTasks: v.delayed, items: a.items.map(function (x) {
                return { fp: x.fp.name, priority: x.fp.priority, weight: x.weight, score: x.verified ? x.score : null, status: x.status };
              })
            };
          }),
          changeRequests: DB.changeRequests, changeLog: DB.changes, acceptanceLog: rows
        };
        download('验收报告-' + stamp + '.json', JSON.stringify(payload, null, 2), 'application/json');
        toast('已导出验收报告 JSON');
      }
    } catch (e) { toast('当前环境不支持导出（浏览器中可用）'); }
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /* ======================= 初始化 ======================= */
  function init() {
    var loaded = false, reseeded = false;
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var cached = JSON.parse(raw);
        /* 仅当缓存指纹与当前种子一致才沿用；不一致说明 mock 数据变过，重新播种 */
        if (cached && cached.meta && cached.meta.seedSig === SEED_SIG) { DB = cached; loaded = true; }
        else reseeded = true;
      }
    } catch (e) { }
    if (!DB || !DB.requirements) { DB = clone(SEED); }
    if (DB.meta) DB.meta.seedSig = SEED_SIG;
    if (!DB.seq) DB.seq = clone(SEQ_DEFAULT);
    Object.keys(SEQ_DEFAULT).forEach(function (k) { if (DB.seq[k] == null) DB.seq[k] = SEQ_DEFAULT[k]; });
    if (!DB.manualPlans) DB.manualPlans = [];
    if (!DB.changeRequests) DB.changeRequests = clone(SEED.changeRequests || []);
    if (!DB.acceptances) DB.acceptances = (SEED.acceptances || []).slice();
    if (!DB.goalReviews) DB.goalReviews = (SEED.goalReviews || []).slice();
    if (!DB.retros) DB.retros = (SEED.retros || []).slice();
    if (!DB.goals || !DB.goals.length) DB.goals = clone(SEED.goals || []);
    DB.requirements.forEach(function (r) { if (!r.fpVersion) r.fpVersion = r.confirmed ? 1 : 0; });
    DB.featurePoints.forEach(function (f) { if (!f.analysisStatus) f.analysisStatus = '未开始'; });
    UI.role = ROLES[DB.meta.currentRole] ? DB.meta.currentRole : 'PM';
    UI.view = curRole().home;
    /* 深链：支持 #视图名 / #需求id 直达（越权自动回落本角色首页） */
    try {
      var h = (location.hash || '').replace('#', '');
      if (h) {
        if (VIEWS[h] && canView(h)) UI.view = h;
        else {
          var hr = reqById(h);
          if (hr) { UI.view = 'workbench'; UI.reqOpen = true; UI.reqId = hr.id; UI.schedReqId = hr.id; UI.verifyReqId = hr.id; }
        }
      }
    } catch (e) { }

    document.addEventListener('click', function (e) {      if (e.target.closest && e.target.closest('.tab')) { onTabClick(e); return; }
      if (e.target.classList && e.target.classList.contains('modal-mask')) { closeModal(); return; }
      onClick(e);
    });
    document.addEventListener('change', function (e) {
      if (e.target.id === 'selSchedReq') { UI.schedReqId = e.target.value; UI.pick = {}; render(); return; }
      if (e.target.id === 'selVerifyReq') { UI.verifyReqId = e.target.value; render(); return; }
      if (e.target.id === 'selRole') { switchRole(e.target.value); return; }
      if (e.target.id === 'selImportReq') { UI.reqId = e.target.value; render(); return; }
      onChange(e);
    });
    $('#btnReset').onclick = function () {
      openModal({
        title: '重置演示数据',
        bodyHTML: '<div>将清空你的所有操作，恢复为初始 MOCK 数据（含验收、变更记录与复盘记录）。确定继续？</div>',
        actions: [{ label: '取消', onClick: closeModal }, { label: '确认重置', cls: 'primary', onClick: function () { closeModal(); resetData(); toast('已重置演示数据'); } }]
      });
    };
    $('#btnMatrix').onclick = openRoleMatrix;
    persist();   /* 落一次缓存，保证下次启动能校验种子指纹 */
    render();
    if (loaded) toast('已恢复上次操作数据（可点侧边栏重置）');
    else if (reseeded) toast('演示数据已更新为最新版本（含新增 mock 需求）');
  }

  /* 测试钩子：仅供离线自动化验证脚本读取状态，不影响业务逻辑 */
  globalThis.__app = { getDB: function () { return DB; }, UI: UI };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
