/* ui-smoke.js —— 无依赖 DOM 桩驱动的全链路冒烟测试
 * 覆盖：角色化侧边导航 / 导入拆解 / 功能点锁定（不可解锁）+ 需求变更审批 /
 *       分析·开发·测试三阶段计划分离 / 手动添加计划 / 阶段门禁与全链路流转 /
 *       计划变更审批 / 插队 / 到期提醒 / 验收评估闭环 / 视图结构自检
 * 运行： node ui-smoke.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------- 极简 DOM 桩 ---------------- */
function makeEl(tag) {
  const el = {
    tagName: tag || 'div', innerHTML: '', textContent: '', value: '', checked: false,
    children: [], style: {}, dataset: {}, onclick: null, onchange: null, _q: {}, _listeners: {},
    classList: {
      _s: {},
      add(c) { this._s[c] = true; }, remove(c) { this._s[c] = false; },
      toggle() { }, contains(c) { return !!this._s[c]; }
    },
    querySelector(sel) { this._q[sel] = this._q[sel] || makeEl(sel); return this._q[sel]; },
    querySelectorAll() { return []; },
    addEventListener(t, f) { this._listeners[t] = f; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { return c; },
    closest() { return null; },
    click() { if (this.onclick) this.onclick(); },
    focus() { }
  };
  return el;
}
const registry = {};
function q(sel) { registry[sel] = registry[sel] || makeEl(sel); return registry[sel]; }

/* 让 #modalRoot 的 innerHTML 赋值同时清空已注册子元素（与浏览器一致），
 * 否则多次 openModal 会累积历史弹窗按钮，导致点击命中失效的旧按钮 */
const modalRoot = q('#modalRoot');
let _modalHTML = '';
Object.defineProperty(modalRoot, 'innerHTML', {
  get() { return _modalHTML; },
  set(v) { _modalHTML = v; modalRoot._q = {}; }
});

const tabStubs = ['workbench', 'schedule', 'board', 'track', 'verify'].map(function (v) {
  const t = makeEl('button'); t.dataset.view = v; return t;
});

const docListeners = {};
const documentStub = {
  readyState: 'complete',
  querySelector: q,
  querySelectorAll(sel) { return sel === '#tabs .tab' ? tabStubs : []; },
  createElement: makeEl,
  addEventListener(t, f) { docListeners[t] = f; },
  body: makeEl('body')
};

const intervals = [];
const sandbox = {
  console: console,
  document: documentStub,
  localStorage: { getItem() { return null; }, setItem() { }, removeItem() { } },
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval(fn) { intervals.push(fn); return intervals.length; },
  clearInterval() { },
  Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
  isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, Error: Error, RegExp: RegExp, Boolean: Boolean
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

const errors = [];
process.on('uncaughtException', e => errors.push(String(e)));

['data.js', 'engine.js', 'app.js'].forEach(function (f) {
  const code = fs.readFileSync(path.join(__dirname, f), 'utf8');
  try { vm.runInContext(code, sandbox, { filename: f }); }
  catch (e) { errors.push('加载 ' + f + ' 失败: ' + e.message + '\n' + (e.stack || '')); }
});

if (errors.length) { console.log('\n!! 加载期错误：\n' + errors.join('\n')); }
if (!sandbox.__app) { console.log('\n!! app.js 未完成初始化（未暴露测试钩子），后续用例无法执行'); process.exit(1); }

const app = sandbox.__app;
const DB = app.getDB();
const E = sandbox.Engine;

/* ---------------- 事件模拟 ---------------- */
function fireClick(target) { if (docListeners.click) docListeners.click({ target: target }); }
function clickAct(act, id, extra) {
  const ds = Object.assign({ act: act, id: id || '' }, extra || {});
  fireClick({ dataset: ds, classList: { contains() { return false; } }, closest(sel) { return sel === '[data-act]' ? this : null; } });
}
function changeAct(chg, id, value) {
  if (docListeners.change) docListeners.change({ target: { dataset: { chg: chg, id: id }, value: value, id: '' } });
}
function crField(field, idx, value) {
  if (docListeners.change) docListeners.change({ target: { dataset: { chg: 'cr-field', field: field, idx: String(idx) }, value: value, id: '' } });
}
function changeById(id, value) {
  if (docListeners.change) docListeners.change({ target: { id: id, value: value, dataset: {} } });
}
function clickTab(view) {
  const t = tabStubs.filter(x => x.dataset.view === view)[0];
  fireClick({ dataset: t.dataset, closest: sel => (sel === '.tab' ? t : null), classList: { contains: () => false } });
}
function modalButtons() { return q('#modalRoot')._q['.modal-f'] ? q('#modalRoot')._q['.modal-f'].children : []; }
function clickModalByText(text) {
  const b = modalButtons().filter(x => String(x.textContent).indexOf(text) >= 0)[0];
  if (!b) { errors.push('未找到弹窗按钮：' + text); fail++; console.log('  ✗ 弹窗按钮缺失：' + text); return false; }
  b.onclick(); return true;
}
function view() { return q('#view').innerHTML; }
function nav() { return q('#tabs').innerHTML; }
function head() { return q('#pageHead').innerHTML; }
function modalHTML() { return q('#modalRoot').innerHTML; }
function hasModal() { return modalHTML().length > 0; }
function runIntervals(times) { intervals.forEach(fn => { for (let i = 0; i < times; i++) fn(); }); }
function role(r) { changeAct('role', '', r); }
const pname = id => (DB.people.filter(p => p.id === id)[0] || {}).name || id;
const fpOf = id => DB.featurePoints.filter(f => f.id === id)[0];
const reqOf = id => DB.requirements.filter(r => r.id === id)[0];

/* ---------------- 断言 ---------------- */
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
}
function has(name, s) { ok(name, view().indexOf(s) >= 0, '页面未包含「' + s + '」'); }
function notHas(name, s) { ok(name, view().indexOf(s) < 0, '页面不应包含「' + s + '」'); }
function hasNav(name, s) { ok(name, nav().indexOf(s) >= 0, '导航未包含「' + s + '」'); }
function notHasNav(name, s) { ok(name, nav().indexOf(s) < 0, '导航不应包含「' + s + '」'); }

/* ================= 闭环驱动 ================= */
console.log('\n[1] 角色化侧边导航与页头');
ok('默认角色为产品经理', app.UI.role === 'PM', app.UI.role);
ok('默认落点为需求工作台', app.UI.view === 'workbench', app.UI.view);
hasNav('导航含 5 个视图（含编号）', '需求工作台');
ok('导航项数量 = 5', (nav().match(/data-view=/g) || []).length === 5, (nav().match(/data-view=/g) || []).length);
ok('导航为侧边纵向列表渲染（非页签隐藏式）', nav().indexOf('ni-body') >= 0 && nav().indexOf('ni-d') >= 0);
ok('页头渲染当前视图标题', head().indexOf('需求工作台') >= 0, head().slice(0, 80));

console.log('\n[2] 需求工作台 · 列表页 / 详情页分离 + 导入拆解');
clickTab('workbench');
ok('进入工作台默认落在需求队列列表页', app.UI.reqOpen === false, String(app.UI.reqOpen));
has('渲染需求队列', '需求队列');
ok('列表页不直接摊开功能点清单', view().indexOf('功能点清单') < 0);
has('显示当前身份', '当前身份：产品经理');
clickAct('pick-req', 'r1');
ok('点击需求后进入详情页', app.UI.reqOpen === true);
has('详情页展示功能点清单', '功能点清单');
has('详情页提供返回列表入口', '返回需求队列');
clickAct('wb-back');
ok('可返回需求队列列表', app.UI.reqOpen === false);
clickAct('pick-req', 'r1');
has('未拆解需求显示 AI 分析入口', '开始 AI 分析');

q('#selImportReq').value = 'r1';
q('#txtImport').value = 'MOCK 需求文本';
const fpBefore = DB.featurePoints.length;
clickAct('ai-parse');
runIntervals(6);
const req1 = reqOf('r1');
ok('拆解演出完成（6 个功能点）', req1.aiDone === true && req1.parseShown >= 6, JSON.stringify({ aiDone: req1.aiDone, shown: req1.parseShown }));
ok('功能点数量未重复写入', DB.featurePoints.length === fpBefore, DB.featurePoints.length + ' vs ' + fpBefore);
has('功能点出现在界面', '跨行还款订单创建');
has('提示功能点尚未锁定', '功能点尚未锁定');

/* 表单填值辅助：DOM 桩不会重建元素，需显式写入每个字段，避免残留旧值 */
function fillFp(o) {
  q('#fpName').value = o.name || '';
  q('#fpDesc').value = o.desc || '';
  q('#fpMain').value = o.main || 's_core';
  q('#fpPri').value = o.pri || 'P2';
  q('#fpAc').value = o.ac || '';
  q('#fpHours').value = String(o.hours == null ? 8 : o.hours);
}

/* 未锁定 → 可新增 */
clickAct('fp-add');
ok('未锁定可打开新增功能点弹窗', modalHTML().indexOf('新增功能点') >= 0);
fillFp({ name: '含手续费试算（临时）', desc: '用于验证未锁定阶段可自由增删', pri: 'P2', ac: '试算准确率 100%', hours: 4 });
clickModalByText('保存');
const added = DB.featurePoints.filter(f => f.name === '含手续费试算（临时）')[0];
ok('未锁定阶段新增功能点成功', !!added);
/* 未锁定 → 可删除 */
if (added) { clickAct('fp-del', added.id); }
ok('未锁定阶段可删除功能点', !DB.featurePoints.some(f => f.name === '含手续费试算（临时）'));

/* 未锁定 → 直接编辑（不走变更单） */
clickAct('fp-edit', 'f1');
ok('未锁定阶段编辑为直接编辑', modalHTML().indexOf('功能点尚未锁定') >= 0);
fillFp({ name: '跨行还款订单创建', desc: '发起跨行还款并生成还款订单', main: 's_core', pri: 'P1', ac: '订单创建成功率 ≥99.9%，幂等校验通过（试运行）', hours: 6 });
clickModalByText('保存');
ok('未锁定阶段编辑立即生效', fpOf('f1').ac.indexOf('试运行') >= 0);
ok('编辑未污染其它字段（优先级/工时不变）', fpOf('f1').priority === 'P1' && fpOf('f1').analysisHours === 6,
  JSON.stringify([fpOf('f1').priority, fpOf('f1').analysisHours]));

/* 锁定 */
clickAct('confirm-fp');
ok('功能点全部锁定为基准数据', DB.featurePoints.filter(f => f.reqId === 'r1').every(f => f.confirmed === true));
ok('需求标记为已确认且生成基准版本 v1.0', req1.confirmed === true && req1.fpVersion === 1);
ok('变更留痕写入「拆解确认」', DB.changes.some(c => c.type === '拆解确认'));
has('锁定后展示基准版本', '基准数据 SSOT');
has('锁定后明确提示不可解锁', '基准已锁定且不可解锁');

console.log('\n[3] 锁定语义：不可解锁 / 不可直接删除 / 新增与编辑均走需求变更审批');
const fpCountLocked = DB.featurePoints.filter(f => f.reqId === 'r1').length;
clickAct('fp-del', 'f1');
ok('锁定后不可直接删除功能点', !!fpOf('f1'));
ok('界面无「解锁」入口按钮', view().indexOf('data-act="fp-unlock"') < 0);
has('界面提供「变更新增功能点」入口', '变更新增功能点');

clickAct('fp-edit', 'f1');
ok('锁定后编辑转为需求变更单', modalHTML().indexOf('需求变更单') >= 0, modalHTML().slice(0, 80));
crField('analysisHours', 0, '10');
changeAct('cr-reason', '', '业务复核后分析工时上调至 10h');
clickModalByText('提交变更单');
const cr1 = (DB.changeRequests || []).filter(c => c.status === '待审批' && c.reqId === 'r1')[0];
ok('生成待审批的需求变更单', !!cr1, JSON.stringify((DB.changeRequests || []).map(c => c.id + ':' + c.status)));
ok('变更未审批前基准不被修改（f1 分析工时仍为 6）', fpOf('f1').analysisHours === 6, 'hours=' + fpOf('f1').analysisHours);
ok('功能点标记为变更审批中', fpOf('f1').pendingChange === cr1.id);
ok('变更申请写入留痕', DB.changes.some(c => c.type === '变更申请'));
const gateWithCr = E.stageGate(DB, 'r1');
ok('待审批变更单会阻塞阶段门禁', gateWithCr.items.some(x => x.label.indexOf('变更单') >= 0 && !x.pass));

role('MGR');
clickTab('track');
has('变更审批中心渲染变更单', '变更审批中心');
has('表单展示变更前后差异', '→');
clickAct('cr-approve', cr1.id);
ok('管理者审批通过后变更生效', fpOf('f1').analysisHours === 10, 'hours=' + fpOf('f1').analysisHours);
ok('基准版本升级为 v1.1', reqOf('r1').fpVersion === 1.1, 'v=' + reqOf('r1').fpVersion);
ok('变更生效写入留痕', DB.changes.some(c => c.type === '变更生效'));
ok('变更单状态更新为已批准', cr1.status === '已批准');
ok('审批后解除「变更审批中」标记', !fpOf('f1').pendingChange);

/* 驳回路径 */
const crRejId = cr1.id;
role('PM');
clickTab('workbench');
clickAct('pick-req', 'r1');
clickAct('fp-edit', 'f2');
crField('analysisHours', 0, '99');
changeAct('cr-reason', '', '临时验证驳回路径');
clickModalByText('提交变更单');
const cr2 = (DB.changeRequests || []).filter(c => c.status === '待审批' && c.reqId === 'r1')[0];
role('MGR');
clickTab('track');
clickAct('cr-reject', cr2.id);
q('#crRejNote').value = '工时依据不足，请补充评估说明后重新提交';
clickModalByText('确认驳回');
ok('变更单可被驳回', cr2.status === '已驳回' && cr2.note.indexOf('工时依据') >= 0);
ok('驳回后基准未被修改', fpOf('f2').analysisHours === 8, 'hours=' + fpOf('f2').analysisHours);
ok('驳回后解除变更中标记', !fpOf('f2').pendingChange);
ok('变更驳回写入留痕', DB.changes.some(c => c.type === '变更驳回'));

/* 已锁定需求「变更新增功能点」→ 变更单 → 管理者审批 → 写入基准 */
role('PM');
clickTab('workbench');
clickAct('pick-req', 'r1');
clickAct('fp-add');
ok('锁定后新增功能点转为需求变更单', modalHTML().indexOf('需求变更单') >= 0, modalHTML().slice(0, 80));
ok('变更单自动带出空白新增行', (app.UI.crDraft || []).some(d => !d.id), JSON.stringify((app.UI.crDraft || []).map(d => d.id)));
const newRowIdx = (app.UI.crDraft || []).length - 1;
crField('name', newRowIdx, '还款限额校验（新增）');
crField('ac', newRowIdx, '超限拦截准确率 100%');
changeAct('cr-reason', '', '业务要求补充还款限额校验能力');
clickModalByText('提交变更单');
const crAdd = (DB.changeRequests || []).filter(c => c.status === '待审批' && c.reqId === 'r1')[0];
ok('生成待审批的新增功能点变更单', !!crAdd && (crAdd.payload.items || []).some(x => x.action === '新增'));
ok('未审批前不写入基准（功能点数量不变）', DB.featurePoints.filter(f => f.reqId === 'r1').length === fpCountLocked,
  DB.featurePoints.filter(f => f.reqId === 'r1').length + ' vs ' + fpCountLocked);
role('MGR');
clickTab('track');
clickAct('cr-approve', crAdd.id);
ok('审批通过后新增功能点写入基准', DB.featurePoints.filter(f => f.reqId === 'r1').some(f => f.name === '还款限额校验（新增）'));
ok('新增功能点自动进入基准版本（已锁定）', DB.featurePoints.filter(f => f.name === '还款限额校验（新增）')[0].confirmed === true);
const newFp = DB.featurePoints.filter(f => f.name === '还款限额校验（新增）')[0];
role('PM');
clickTab('workbench');
clickAct('pick-req', 'r1');

console.log('\n[4] 排期中心 · 三阶段计划分离 + 手动添加计划');
role('PM');
clickTab('schedule');
changeById('selSchedReq', 'r1');
has('渲染分析阶段计划卡', '分析阶段计划');
has('渲染开发阶段计划卡', '开发阶段计划');
has('渲染测试阶段计划卡', '测试阶段计划');
has('三块计划分别有手动添加入口', '手动添加分析计划');
has('开发块有手动添加入口', '手动添加开发计划');
has('测试块有手动添加入口', '手动添加测试计划');
has('显示排期规则', '7.6~8.5');
has('提供最早开始日选择器', '最早开始日');
has('提供一键自动排期', '一键自动排期');
has('渲染阶段进度 KPI', '门禁状态');

const f1 = fpOf('f1');
changeAct('analyst', 'f1', 'p1');
ok('选择执行人后自动给出推荐周期', !!f1.rec, JSON.stringify(f1.rec && f1.rec.daily));
ok('推荐每日工时 ≤ 8.5h', f1.rec && f1.rec.daily.every(x => x.hours <= 8.5));
changeAct('analyst-start', 'f1', '2026-10-20');
ok('手动选择开始日后推荐周期从该日起算', f1.rec && f1.rec.start === '2026-10-20', JSON.stringify(f1.rec && f1.rec.start));
changeAct('analyst-hours', 'f1', 12);
ok('修改分析工时后推荐周期重算', f1.rec && Math.abs(f1.rec.daily.reduce((s, x) => s + x.hours, 0) - 12) < 0.01);
clickAct('accept-analysis', 'f1');
ok('采用后写入分析排期周期', !!f1.analysisPlan && f1.analysisPlan.start === '2026-10-20');
ok('采用后执行人落库', f1.analyst === 'p1');

clickAct('auto-analysis');
const others = DB.featurePoints.filter(f => f.reqId === 'r1' && f.id !== 'f1');
ok('一键自动排期为其余功能点自动选人/选日期', others.every(f => !!f.rec && !!f.draftAnalyst && !!f.draftStart),
  JSON.stringify(others.map(f => ({ id: f.id, rec: !!f.rec, a: f.draftAnalyst, s: f.draftStart }))));
ok('自动选择的日期为工作日', others.every(f => E.isWorkday(E.toDate(f.draftStart))));
clickAct('accept-all-analysis');
ok('全部采用后所有功能点均有分析排期', DB.featurePoints.filter(f => f.reqId === 'r1').every(f => !!f.analysisPlan));

clickAct('adjust-date', 'f1', { kind: 'analysis' });
q('#adjStart').value = '2026-10-22';
q('#adjEnd').value = '2026-10-26';
clickModalByText('保存周期');
ok('手动改期后周期被覆盖', f1.analysisPlan.start === '2026-10-22' && f1.analysisPlan.end === '2026-10-26');
ok('手动改期按工作日分配（22 周四 ~ 26 周一 = 3 个工作日）', f1.analysisPlan.days === 3, 'days=' + f1.analysisPlan.days);

/* 分析状态维护 */
changeAct('analysis-status', 'f1', '已完成');
ok('分析状态可逐笔维护', f1.analysisStatus === '已完成');
ok('分析状态变更留痕', DB.changes.some(c => c.type === '进度更新' && c.detail.indexOf('分析任务') >= 0));
clickAct('analysis-done-all');
ok('一键标记分析完成', DB.featurePoints.filter(f => f.reqId === 'r1').every(f => f.analysisStatus === '已完成'));

/* 手动添加计划（三种类型） */
function addManualPlan(kind, name, type, personId, hours, earliest) {
  clickAct('mp-add', '', { kind: kind });
  q('#mpName').value = name;
  q('#mpType').value = type;
  q('#mpReq').value = 'r1';
  q('#mpPerson').value = personId;
  q('#mpHours').value = String(hours);
  q('#mpEarliest').value = earliest;
  clickModalByText('保存并推荐周期');
}
addManualPlan('分析', '还款链路压测专项分析', '分析', 'p7', 12, '2026-10-19');
const mpA = (DB.manualPlans || [])[0];
ok('产品经理可手动添加分析计划', !!mpA && mpA.type === '分析');
addManualPlan('开发', '还款链路灰度开关开发', '开发', 'p3', 8, '2026-10-20');
const mpD = (DB.manualPlans || [])[1];
ok('产品经理可手动添加开发计划', !!mpD && mpD.type === '开发');
ok('手动计划自动给出推荐周期', !!mpD.rec && mpD.rec.start === '2026-10-20', JSON.stringify(mpD.rec && mpD.rec.start));
clickAct('mp-accept', mpD.id);
ok('手动计划采用后写入排期', !!mpD.plan);
ok('手动计划计入执行人占用日历', E.personLoad(DB, 'p3')['2026-10-20'] > 0, JSON.stringify(E.personLoad(DB, 'p3')['2026-10-20']));
has('手动计划出现在对应阶段计划中', '还款链路灰度开关开发');
has('手动计划标注来源', '手动计划');

/* 手动添加计划弹窗联动：切换计划类型自动切换执行人候选 + 实时预览推荐周期 */
clickAct('mp-add', '', { kind: '分析' });
q('#mpType').value = '测试';
changeAct('mp-type', '', '测试');
const personOpts = q('#mpPerson').innerHTML;
ok('切换计划类型为「测试」后执行人候选自动切为测试角色', personOpts.indexOf('陈静') >= 0 && personOpts.indexOf('李伟') < 0, personOpts.slice(0, 80));
ok('执行人默认选中该角色第一人', q('#mpPerson').value === 'p5', q('#mpPerson').value);
q('#mpHours').value = '6';
changeAct('mp-hours', '', '6');
const prev1 = q('#mpPreview').innerHTML;
ok('填写工作量后实时预览推荐周期', prev1.indexOf('推荐周期') >= 0, prev1.slice(0, 100));
q('#mpHours').value = '0';
changeAct('mp-hours', '', '0');
ok('工作量为 0 时预览提示待补充而非报错', q('#mpPreview').innerHTML.indexOf('填写执行人与工作量') >= 0, q('#mpPreview').innerHTML);
clickModalByText('取消');
changeAct('mp-type', '', '测试');
ok('弹窗关闭后触发联动不抛异常', errors.length === 0, errors.join(' | '));
changeAct('mp-type', '', '分析');
changeAct('mp-person', '', 'p1');
q('#mpHours').value = '5';
changeAct('mp-hours', '', '5');
ok('弹窗未打开时联动安全返回', errors.length === 0, errors.join(' | '));

/* 角色限制：测试角色只能登记测试计划 */
role('QA');
clickTab('schedule');
changeById('selSchedReq', 'r1');
clickAct('mp-add', '', { kind: '分析' });
q('#mpName').value = '测试角色登记的手动计划';
q('#mpType').value = '测试';
q('#mpReq').value = 'r1';
q('#mpPerson').value = 'p5';
q('#mpHours').value = '4';
q('#mpEarliest').value = '2026-10-21';
clickModalByText('保存并推荐周期');
const mpT = (DB.manualPlans || []).filter(m => m.name === '测试角色登记的手动计划')[0];
ok('测试角色可手动添加测试计划', !!mpT && mpT.type === '测试');

console.log('\n[5] 阶段门禁 · 全链路流转（分析 → 开发 → 测试 → 验收 → 已验收）');
role('PM');
clickTab('workbench');
clickAct('pick-req', 'r1');
const gateAna = E.stageGate(DB, 'r1');
ok('分析阶段门禁三项校验齐备', gateAna.items.length >= 3, JSON.stringify(gateAna.items.map(x => x.label)));
ok('分析阶段门禁通过（排期 + 任务完成 + 无待审批变更）', gateAna.ok === true, JSON.stringify(gateAna.items.filter(x => !x.pass).map(x => x.label)));
clickAct('stage-next');
ok('门禁通过后阶段流转到「开发」', reqOf('r1').stage === '开发', reqOf('r1').stage);
ok('阶段流转生成待审批里程碑', DB.milestones.some(m => m.reqId === 'r1' && m.stage === '分析' && m.status === '待审批'));
ok('阶段流转留痕注明门禁校验', DB.changes.some(c => c.type === '阶段流转' && c.detail.indexOf('校验通过') >= 0));

/* 门禁拦截：未完成开发时不能流转 */
clickAct('pick-req', 'r2');
const gateDev2 = E.stageGate(DB, 'r2');
ok('前一阶段未完成时门禁不通过', gateDev2.ok === false);
ok('门禁给出未通过原因', gateDev2.items.some(x => !x.pass && x.detail.length > 0));
clickAct('pick-req', 'r1');

role('DEV');
clickTab('schedule');
changeById('selSchedReq', 'r1');
const tBefore = DB.devTasks.length;
clickAct('intro-dev');
ok('命中关联系统时弹出确认框', modalButtons().length >= 2);
clickModalByText('为所有关联系统自动创建任务');
const newTasks = DB.devTasks.filter(t => t.reqId === 'r1');
const newTests = DB.testRecords.filter(t => t.reqId === 'r1');
const expectTasks = DB.featurePoints.filter(f => f.reqId === 'r1').reduce((s, f) => s + 1 + (f.relSys || []).length, 0);
ok('按功能点 ×（主系统 + 关联系统）建任务', newTasks.length === expectTasks, newTasks.length + ' vs ' + expectTasks);
ok('每条开发任务派生 1 条测试记录', newTests.length === newTasks.length && newTasks.every(t => DB.testRecords.filter(r => r.taskId === t.id).length === 1));
ok('测试记录引入时不再默认固定测试人（排期阶段按工作量分配）', newTests.every(r => r.assignee === '' && r.draftAssignee === ''));
ok('变更留痕写入「任务引入」', DB.changes.some(c => c.type === '任务引入'));

const t0 = newTasks[0];
changeAct('task-assignee', t0.id, 'p2');
ok('选择实施人后按该人已有任务推荐周期', !!t0.rec);
changeAct('task-start', t0.id, '2026-10-21');
ok('最早开始日为推荐下限（该人当天已满时自动顺延）', t0.rec && t0.rec.start >= '2026-10-21', JSON.stringify(t0.rec && t0.rec.start));
ok('推荐排期不突破单日 8.5h 上限', t0.rec && t0.rec.daily.every(x => x.hours <= 8.5), JSON.stringify(t0.rec && t0.rec.daily));
changeAct('task-hours', t0.id, 30);
ok('修改工时后推荐周期跟随重算', !!t0.rec && Math.abs(t0.rec.daily.reduce((s, x) => s + x.hours, 0) - 30) < 0.01);
clickAct('accept-dev', t0.id);
ok('采用推荐后任务写入排期', !!t0.start && !!t0.end);
clickAct('auto-dev');
clickAct('accept-all-rec');
ok('批量采用后全部开发任务已排期', newTasks.every(t => !!t.start));
clickAct('plan-apply');
ok('计划生效冻结计划基准', newTasks.some(t => t.baselineStart && t.baselineEnd));

/* 排期中心收口：行内「标记完成」（此前排期完成后没有完成的口子） */
const tDone = newTasks.filter(t => t.status !== '已完成')[0];
clickAct('task-done', tDone.id);
ok('排期中心可直接标记开发任务完成（无需切到执行跟踪）', tDone.status === '已完成');
ok('标记完成写入进度留痕', DB.changes.some(c => c.type === '进度更新' && c.reason.indexOf('排期中心直接标记完成') >= 0));

/* 计划变更单（开发负责人发起 → 管理者审批） */
clickAct('task-change', t0.id);
ok('开发负责人可发起计划变更', modalHTML().indexOf('发起计划变更') >= 0);
q('#pcHours').value = '32';
q('#pcStart').value = '2026-10-22';
q('#pcEnd').value = '2026-10-26';
q('#pcReason').value = '受插队影响需整体顺延并增加联调工时';
clickModalByText('提交变更单');
const pcr = (DB.changeRequests || []).filter(c => c.status === '待审批' && c.kind === '计划变更')[0];
ok('生成待审批的计划变更单', !!pcr);
ok('计划变更未审批前任务不变', t0.hours !== 32, 'hours=' + t0.hours);
role('MGR');
clickTab('track');
clickAct('cr-approve', pcr.id);
ok('计划变更审批通过后任务按新计划写入', t0.hours === 32 && t0.start === '2026-10-22' && t0.end === '2026-10-26',
  JSON.stringify([t0.hours, t0.start, t0.end]));
ok('计划变更生效后刷新基准', t0.baselineStart === '2026-10-22' && t0.baselineEnd === '2026-10-26');
ok('计划变更生效留痕', DB.changes.some(c => c.type === '变更生效' && c.detail.indexOf('计划变更') >= 0));

role('DEV');
clickTab('track');
clickAct('bulk-dev-done', 'r1');
ok('开发任务批量完成', newTasks.every(t => t.status === '已完成'));

/* 分角色阶段流转：开发阶段由开发负责人提交，产品经理无此环节权限 */
clickTab('schedule');
changeById('selSchedReq', 'r1');
ok('开发阶段门禁通过（任务全完成 + 功能点维度 100%）', E.stageGate(DB, 'r1').ok === true,
  JSON.stringify(E.stageGate(DB, 'r1').items.filter(x => !x.pass).map(x => x.label + ':' + x.detail)));
has('排期中心提供阶段流转卡（开发/测试角色可在此收口）', '阶段流转 · 门禁校验');
changeById('selRole', 'PM');
clickTab('schedule');
changeById('selSchedReq', 'r1');
clickAct('stage-next', 'r1', { req: 'r1' });
ok('产品经理无「开发」阶段提交权限（环节未到）', reqOf('r1').stage === '开发', reqOf('r1').stage);
changeById('selRole', 'DEV');
clickTab('schedule');
changeById('selSchedReq', 'r1');
clickAct('stage-next', 'r1', { req: 'r1' });
ok('开发负责人提交后阶段流转到「测试」', reqOf('r1').stage === '测试', reqOf('r1').stage);
ok('阶段流转留痕记录提交角色', DB.changes.some(c => c.type === '阶段流转' && c.detail.indexOf('开发负责人') >= 0));

/* 测试排期：与开发同一算法（按测试人已有工作量推荐），唯一差异是接续开发完成日 */
role('QA');
clickTab('schedule');
changeById('selSchedReq', 'r1');
clickAct('auto-test');
clickAct('accept-all-test');
ok('测试记录可独立排期', newTests.every(r => !!r.start));
ok('测试排期按测试人各自工作量推荐（不默认固定一人）', newTests.every(r => !!r.assignee),
  JSON.stringify(newTests.map(r => r.assignee)));
const qaPick = newTests[0].assignee;
ok('测试排期计入该测试人占用日历', Object.keys(E.personLoad(DB, qaPick)).length > 0, qaPick);
ok('测试最早开始日接续开发完成日（仅上下游关系）', newTests.every(r => {
  const src = DB.devTasks.filter(t => t.id === r.taskId)[0];
  return !src || !src.end || r.start >= src.end;
}));
ok('测试完成前阶段门禁不通过', E.stageGate(DB, 'r1').ok === false);
clickAct('bulk-test-done', 'r1');
ok('排期中心可直接批量标记测试完成', newTests.every(r => r.status === '已完成'));
const tTestDone = newTests.filter(r => r.status !== '已完成')[0];
if (tTestDone) { clickAct('test-done', tTestDone.id); }
ok('测试阶段门禁通过', E.stageGate(DB, 'r1').ok === true,
  JSON.stringify(E.stageGate(DB, 'r1').items.filter(x => !x.pass).map(x => x.label)));
clickAct('stage-next', 'r1', { req: 'r1' });
ok('测试工程师提交后阶段流转到「验收」', reqOf('r1').stage === '验收', reqOf('r1').stage);

/* 验收阶段：逐条验收 → 组织验收结论 → 结项 */
role('PM');
clickTab('verify');
changeById('selVerifyReq', 'r1');
const scores = { f1: 95, f2: 85, f3: 80, f4: 70, f5: 72, f6: 68 };
scores[newFp.id] = 74;
Object.keys(scores).forEach(function (id) {
  clickAct('acc-edit', id);
  q('#accStatus').value = '已达成';
  q('#accScore').value = String(scores[id]);
  q('#accActual').value = '实测达标（' + id + '）';
  q('#accEvidence').value = 'EV-' + id;
  clickModalByText('保存验收结果');
});
const r1ach = E.reqAchievement(DB, 'r1');
ok('r1 全部功能点已验收（含变更新增的那一个）', r1ach.verifiedCount === 7 && r1ach.unverifiedCount === 0,
  JSON.stringify({ v: r1ach.verifiedCount, u: r1ach.unverifiedCount }));
ok('r1 加权达成度 = 80（(2×95+2×85+2×80+1×70+1×72+1×68+1×74)/10）', r1ach.rate === 80, 'rate=' + r1ach.rate);
role('MGR');
clickTab('verify');
changeById('selVerifyReq', 'r1');
clickAct('review-write', 'r1');
q('#rvResult').value = '验收通过';
q('#rvNote').value = '7 个功能点全部验收达标，目标达成度 80，同意结项。';
clickModalByText('提交验收结论');
ok('组织验收结论写入', (DB.goalReviews || []).some(g => g.reqId === 'r1' && g.result === '验收通过'));
role('PM');
clickTab('workbench');
clickAct('pick-req', 'r1');
ok('验收阶段门禁通过（含达成度 ≥75）', E.stageGate(DB, 'r1').ok === true,
  JSON.stringify(E.stageGate(DB, 'r1').items.filter(x => !x.pass).map(x => x.label)));
clickAct('stage-next');
ok('阶段流转到终态「已验收」', reqOf('r1').stage === '已验收', reqOf('r1').stage);

console.log('\n[6] 角色越权校验与视图收敛');
role('DEV');
clickTab('workbench');
ok('开发角色访问工作台被回落到本角色首页', app.UI.view === 'schedule', app.UI.view);
notHasNav('开发角色导航不含需求工作台', 'data-view="workbench"');
role('QA');
clickTab('workbench');
ok('测试角色同样无法进入工作台', app.UI.view === 'schedule', app.UI.view);
clickAct('confirm-fp');
ok('测试角色确认功能点被拒绝', DB.featurePoints.filter(f => f.reqId === 'r4').every(f => !f.confirmed));
role('MGR');
clickTab('verify');
ok('管理者落点为验收评估', app.UI.view === 'verify', app.UI.view);
ok('管理者导航含全部 5 个视图', (nav().match(/data-view=/g) || []).length === 5);
changeById('selRole', 'PM');
ok('身份切换后回到产品经理首页', app.UI.view === 'workbench', app.UI.view);

console.log('\n[7] 计划看板 · 泳道时间轴 / 插队 / 冲突 / 提醒');
clickTab('board');
has('渲染排期时间轴泳道', '排期时间轴（按人泳道）');
has('渲染泳道图例', 'lane-bar');
has('渲染需求插队看板', '需求插队看板');
has('渲染资源冲突区', '人员资源冲突');
has('渲染提醒中心', '到期提醒中心');
has('渲染变更留痕', '变更与插队留痕');
const lanes = E.scheduleLanes(DB, { from: DB.meta.demoDate, count: 10 });
ok('泳道返回 10 个工作日', lanes.days.length === 10, lanes.days.length + ' 天');
ok('泳道按人分组', lanes.rows.length > 0 && lanes.rows.every(r => !!r.personId));
ok('泳道同时包含分析 / 开发 / 测试三类条', ['分析', '开发', '测试'].every(k => lanes.rows.some(r => r.bars.some(b => b.kind === k))),
  JSON.stringify(lanes.rows.map(r => r.bars.map(b => b.kind).join('/'))));
ok('泳道条均在窗口内（left ≥ 0 且 width > 0）', lanes.rows.every(r => r.bars.every(b => b.left >= 0 && b.span > 0)));
const remIds = E.reminders(DB).map(x => x.task.id);
ok('提醒规则命中 >10h 且剩 1 天（t3）', remIds.indexOf('t3') >= 0, remIds.join(','));
ok('提醒规则命中 ≤10h 且剩 1 天（t7）', remIds.indexOf('t7') >= 0);
ok('剩余 7 天的任务不提醒（t8）', remIds.indexOf('t8') < 0);
ok('检出人员资源冲突', E.conflicts(DB).length > 0);
const warn = E.relSysWarnings(DB, 'r3');
ok('检出关联系统晚于主系统', warn.length > 0, JSON.stringify(warn.map(x => x.fp.name)));
const t6before = DB.devTasks.filter(t => t.id === 't6')[0];
const t6start0 = t6before.start;
clickAct('shift-main', t6before.id, { gap: '2' });
ok('产品经理无开发排期权限，顺延被拒绝', t6before.start === t6start0, t6before.start);
role('DEV');
clickTab('board');
clickAct('shift-main', t6before.id, { gap: '2' });
ok('开发负责人可顺延主系统任务（关联系统校验处置）', t6before.start > t6start0, t6start0 + ' → ' + t6before.start);

role('MGR');
clickTab('board');
clickAct('sim-insert');
ok('管理者可发起插队，弹窗打开', modalButtons().length >= 3);
q('#insReq').value = 'r4'; q('#insPos').value = '1';
clickModalByText('预览影响');
ok('插队预览输出影响卡', q('#insPreview').innerHTML.indexOf('插队预览') >= 0);
const r2t = DB.devTasks.filter(t => t.reqId === 'r2' && t.status !== '已完成')[0];
const before2 = r2t.start;
clickModalByText('确认插队');
ok('插队后队列顺序更新', reqOf('r4').order === 1 && reqOf('r3').order === 2,
  JSON.stringify({ r4: reqOf('r4').order, r3: reqOf('r3').order }));
ok('被插队需求任务整体顺延', r2t.start > before2, before2 + ' → ' + r2t.start);
ok('插队影响卡写入（含受影响人数）', !!(DB.lastInsertImpact && DB.lastInsertImpact.displaced.length));
ok('变更留痕写入「插队」「排期顺延」', DB.changes.some(c => c.type === '插队') && DB.changes.some(c => c.type === '排期顺延'));

console.log('\n[8] 验收评估闭环 · 达成度 / 目标回溯 / 复盘 / 导出');
const goalBefore = E.goalAchievement(DB, 'g1');
ok('r2 达成度按优先级加权 = 78', E.reqAchievement(DB, 'r2').rate === 78, 'rate=' + E.reqAchievement(DB, 'r2').rate);
ok('r2 评级为「达成」', E.reqAchievement(DB, 'r2').grade === '达成');
ok('部门目标达成度 = (81 + 78 + 82)/3 ≈ 80', goalBefore.achieved === 80, 'achieved=' + goalBefore.achieved);
ok('目标值 85 未达标，缺口 -5', goalBefore.gap === -5);
ok('存在计划 vs 实际偏差数据', E.variance(DB, 'r2').total > 0);
role('MGR');
clickTab('verify');
has('渲染功能点逐条验收', '功能点逐条验收');
has('渲染计划 vs 实际偏差', '计划 vs 实际偏差');
has('渲染部门目标验收', '部门目标验收');
has('渲染员工复盘改进', '员工复盘改进');
has('渲染验收记录追溯', '验收记录追溯');
has('渲染基准变更历史', '基准变更历史');
changeById('selVerifyReq', 'r2');
has('切换到 r2 后展示其功能点', '通知模板配置');
clickAct('acc-del', 'f7');
ok('可清除验收记录（可重做）', !DB.acceptances.filter(a => a.fpid === 'f7').length);
clickAct('acc-edit', 'f7');
q('#accStatus').value = '部分达成';
q('#accScore').value = '70';
clickModalByText('保存验收结果');
ok('复验覆盖原记录（同一条记录更新）', DB.acceptances.filter(a => a.fpid === 'f7').length === 1);
const retroBefore = (DB.retros || []).length;
clickAct('retro-write', 'p2');
q('#rtGood').value = '核心链路改造交付稳定';
q('#rtBad').value = '跨系统联调排期预估偏乐观';
q('#rtAction').value = '引入联调缓冲期，联调前完成接口冻结评审';
clickModalByText('保存复盘');
ok('复盘改进记录写入', (DB.retros || []).length === retroBefore + 1);
ok('复盘记录含客观指标依据', E.personRetro(DB, 'p2').taskCount > 0);
clickAct('export-csv');
clickAct('export-json');
ok('导出动作不抛异常（浏览器中可下载）', true);
ok('验收记录可追溯（含验收标准对照）', E.acceptanceLog(DB).length > 0 && !!E.acceptanceLog(DB)[0].ac);

console.log('\n[9] 角色能力矩阵');
clickAct('role-matrix');
ok('角色能力矩阵弹窗打开', modalHTML().indexOf('角色能力矩阵') >= 0);
ok('矩阵含不可解锁说明', modalHTML().indexOf('不可解锁') >= 0);
clickModalByText('关闭');

console.log('\n[10] 视图结构自检（模板标签闭合平衡）');
function countTags(h, s) { return (h.match(new RegExp('<' + s + '[ >]', 'g')) || []).length; }
function countClose(h, s) { return (h.match(new RegExp('</' + s + '>', 'g')) || []).length; }
function balanceCheck(name) {
  const h = view();
  const bad = ['div', 'span', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'details', 'summary', 'label', 'select']
    .filter(t => countTags(h, t) !== countClose(h, t));
  ok(name + ' 标签闭合平衡', bad.length === 0, bad.map(t => t + ' ' + countTags(h, t) + '/' + countClose(h, t)).join(', ') + ' | 长度 ' + h.length);
}
role('PM');
clickTab('workbench'); balanceCheck('需求工作台（需求队列列表页）');
clickAct('pick-req', 'r1'); balanceCheck('需求工作台（需求详情页）');
clickTab('schedule'); balanceCheck('排期中心');
clickTab('board'); balanceCheck('计划看板');
clickTab('track'); balanceCheck('执行跟踪');
clickTab('verify'); balanceCheck('验收评估');
role('MGR'); clickTab('board'); balanceCheck('计划看板（管理者）');
role('PM'); clickTab('workbench'); clickAct('pick-req', 'r4');
clickAct('ai-parse');
ok('详情页可对另一条需求重新触发拆解演出', app.UI.reqOpen === true);
runIntervals(4);
notHas('视图不残留未填占位', 'undefined');
ok('导航内不残留隐藏页签类', nav().indexOf('hidden-tab') < 0);

/* 全角色 × 全视图渲染自检：任何组合都不得抛异常或渲染空白 */
['PM', 'DEV', 'QA', 'MGR'].forEach(function (r) {
  role(r);
  ['workbench', 'schedule', 'board', 'track', 'verify'].forEach(function (v) {
    clickTab(v);
    ok('渲染 ' + r + ' / ' + v + ' 非空且无异常', view().length > 50 && errors.length === 0, errors.join(' | '));
  });
});

console.log('\n[11] 运行时异常检查');
ok('全流程无未捕获异常', errors.length === 0, errors.join(' | '));

console.log('\n===== UI 冒烟结果：' + pass + ' 通过 / ' + fail + ' 失败 =====\n');
process.exit(fail ? 1 : 0);
