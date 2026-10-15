/* verify.js —— 离线验证引擎规则（不启动服务、不连数据库）
 * 运行： node verify.js
 */
const path = require('path');
require(path.join(__dirname, 'data.js'));
require(path.join(__dirname, 'engine.js'));
const E = globalThis.Engine, SEED = globalThis.SEED;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
}
function DB() { const d = JSON.parse(JSON.stringify(SEED)); return d; }

console.log('\n[1] 工作日与日期工具');
const d15 = E.toDate('2026-10-15'), d17 = E.toDate('2026-10-17'), d18 = E.toDate('2026-10-18');
ok('2026-10-15 是工作日（周四）', E.isWorkday(d15));
ok('2026-10-17 非工作日（周六）', !E.isWorkday(d17));
ok('2026-10-18 非工作日（周日）', !E.isWorkday(d18));
ok('10-17 → 10-19 为 2 天', E.diffDays('2026-10-17', '2026-10-19') === 2);

console.log('\n[2] 排期周期推荐（规则：每天 7.6~8.5h，超出顺延工作日）');
const db2 = DB();
const r = E.recommendSchedule(db2, 'p4', 20, db2.meta.demoDate);
console.log('    推荐结果：' + r.start + ' → ' + r.end + ' | ' + r.daily.map(x => x.date + ':' + x.hours + 'h').join(', '));
ok('返回起止日期', !!(r.start && r.end));
ok('每日工时均 ≤ 8.5h', r.daily.every(x => x.hours <= 8.5 + 1e-9), JSON.stringify(r.daily));
ok('工作日总数与排期天数一致', r.daily.every(x => E.isWorkday(E.toDate(x.date))));
ok('工时总量守恒（20h）', Math.abs(r.daily.reduce((s, x) => s + x.hours, 0) - 20) < 0.01);
ok('已在 10-16 占用 12h 的日期不再叠加', r.daily.every(x => !(x.date === '2026-10-16')));
const r2 = E.recommendSchedule(db2, 'p4', 8, '2026-10-19');
const r3t = E.recommendSchedule(db2, 'p1', 8, '2026-10-19');
ok('单日可完成的 8h 任务只占 1 天（无占用的执行人）', r3t.days === 1 && Math.abs(r3t.daily[0].hours - 8) < 0.01, JSON.stringify(r3t.daily));
ok('同日已占用 5h 时，剩余 3.5h 为当日上限', r2.daily[0].hours === 3.5 && r2.daily[0].preOccupied === 5, JSON.stringify(r2.daily));

console.log('\n[3] 到期提醒规则（>10h 提前 2 天；≤10h 提前 1 天）');
const db3 = DB();
const rem = E.reminders(db3).map(x => x.task.id);
console.log('    触发提醒的任务：' + rem.join(', ') || '（无）');
ok('t3（12h，剩 1 天）触发提醒', rem.indexOf('t3') >= 0);
ok('t7（6h，剩 1 天）触发提醒', rem.indexOf('t7') >= 0);
ok('t8（8h，剩 7 天）不触发提醒', rem.indexOf('t8') < 0);
ok('已完成任务 t4 不触发提醒', rem.indexOf('t4') < 0);
const bd = E.dueInfo(db3.devTasks.find(t => t.id === 't3'), '2026-10-14');
ok('同一任务（12h）在剩 2 天时仍提醒', bd.remind === true && bd.daysLeft === 2);
const bd2 = E.dueInfo(db3.devTasks.find(t => t.id === 't8'), '2026-10-16');
ok('8h 任务在剩 2 天时不提醒（边界）', bd2.remind === false && bd2.daysLeft === 6);

console.log('\n[4] 人员资源冲突检测');
const db4 = DB();
const cf = E.conflicts(db4);
console.log('    冲突：' + cf.map(c => c.personId + '(' + c.a.id + '/' + c.b.id + ' ' + c.from + '→' + c.to + ')').join(', '));
ok('检出 p2（李伟）的重叠排期', cf.some(c => c.personId === 'p2'));
ok('冲突区间计算正确（10-20~10-21）', cf.some(c => c.personId === 'p2' && c.from === '2026-10-20' && c.to === '2026-10-21' && c.days === 2));

console.log('\n[5] 关联系统排期校验（关联系统晚于主系统 → 提示）');
const db5 = DB();
const w = E.relSysWarnings(db5, 'r3');
console.log('    告警：' + w.map(x => x.fp.name + ' 主' + x.main.end + ' vs 关联' + x.rel.end + ' 晚' + x.gapDays + '天').join(' | '));
ok('检出 f12 关联系统晚于主系统 4 天', w.some(x => x.fp.id === 'f12' && x.gapDays === 4));
ok('无告警的 r1 返回空数组', E.relSysWarnings(db5, 'r1').length === 0);

console.log('\n[6] 进度统计（开发 / 测试）');
const db6 = DB();
const p = E.progress(db6, 'r2');
console.log('    r2 进度：' + JSON.stringify(p));
ok('功能点总数 4', p.fpTotal === 4);
ok('开发完成功能点 1（f10 全部任务完成）', p.fpDevDone === 1 && p.devProgress === 25);
ok('测试完成功能点 1（按功能点维度）', p.fpTestDone === 1 && p.testProgress === 25);
ok('测试记录 5 条（含 1 个功能点 2 条任务）/ 完成 1 条', p.testTotal === 5 && p.testDone === 1);

console.log('\n[7] 插队影响评估');
const db7 = DB();
const im = E.queueImpact(db7, 'r4', 1);
console.log('    r4 由第 ' + im.from + ' 位插至第 ' + im.to + ' 位，占用窗口 ' + im.insertedDays + ' 天；被插队：' +
  im.displaced.map(d => d.req.title + '(后移' + d.shift + '位/顺延' + d.delayDays + '天)').join('、'));
ok('r4 由第 4 位插至第 1 位', im.from === 4 && im.to === 1);
ok('被插队需求 3 个', im.displaced.length === 3);
ok('被插队需求各自顺延 1 个位次', im.displaced.every(d => d.shift === 1));
ok('顺延天数 = 插入需求窗口天数', im.displaced.every(d => d.delayDays === im.insertedDays));
ok('插队后队列首位为 r4', im.moved[0].id === 'r4');

console.log('\n[8] 数据规模自检');
const db8 = DB();
ok('关联系统 4 个', db8.systems.length === 4);
ok('人员 9 人（含 2 名测试工程师，用于多人测试排期）', db8.people.length === 9);
ok('测试工程师 2 人（测试排期不默认固定一人）', db8.people.filter(p => p.role === 'QA').length === 2);
ok('需求 5 条（含 1 条全新未拆解需求 r5）', db8.requirements.length === 5, String(db8.requirements.length));
ok('r5 尚未分析：无功能点 / 未确认 / 未拆解', db8.requirements.some(r => r.id === 'r5' && r.aiDone === false && r.parsed === false),
  JSON.stringify(db8.requirements.filter(r => r.id === 'r5')[0] || {}));
ok('r5 提供预置解析结果（可走完整导入流程）', (db8.parsePresets.r5 || []).length === 5,
  String((db8.parsePresets.r5 || []).length));
ok('开发任务 9 条 / 测试记录 9 条（1:1 派生）', db8.devTasks.length === 9 && db8.testRecords.length === 9 &&
  db8.devTasks.every(t => db8.testRecords.filter(r => r.taskId === t.id).length === 1));

console.log('\n[9] 验收达成度（按优先级加权 + 评级）');
const db9 = DB();
const a2 = E.reqAchievement(db9, 'r2');
console.log('    r2 达成度：' + a2.rate + '（' + a2.grade + '）· 权重合计 ' + a2.weightTotal + ' · 已验收 ' + a2.verifiedCount + '/' + a2.fpTotal);
ok('r2 权重合计 = 7（P1×3 + P2×1）', a2.weightTotal === 7, 'weightTotal=' + a2.weightTotal);
ok('r2 加权达成度 = 78（(92+70+88)×2 + 45×1 = 545 / 7）', a2.rate === 78, 'rate=' + a2.rate);
ok('r2 评级 = 达成（≥75）', a2.grade === '达成', a2.grade);
ok('已验收加权均值与整体一致（全部已验收）', a2.verifiedRate === 78 && a2.unverifiedCount === 0);
const a3 = E.reqAchievement(db9, 'r3');
ok('r3 达成度 = 82（P0 权重 3）', a3.rate === 82 && a3.weightTotal === 6, 'rate=' + a3.rate);
ok('r1 未锁定功能点 → 达成度 0 且评级未达成', E.reqAchievement(db9, 'r1').rate === 0 && E.reqAchievement(db9, 'r1').grade === '未达成');

/* 未验收功能点必须按 0 分计入（避免"做完即达标"失真） */
const db9b = DB();
db9b.acceptances = db9b.acceptances.filter(a => a.fpid !== 'f10');
const a2b = E.reqAchievement(db9b, 'r2');
ok('移除 1 条验收后达成度下降（78 → 71）', a2b.rate === 71, 'rate=' + a2b.rate);
ok('未验收功能点计为 0 分并单独统计', a2b.verifiedCount === 3 && a2b.unverifiedCount === 1);
ok('未验收时 complete 为 false', a2b.complete === false);
ok('优先级权重映射正确（P0=3 / P1=2 / P2=1）', E.PRI_W.P0 === 3 && E.PRI_W.P1 === 2 && E.PRI_W.P2 === 1);
ok('评级边界正确（90 优秀 / 75 达成 / 60 部分达成 / 59 未达成）',
  E.gradeOf(90) === '优秀' && E.gradeOf(89.9) === '达成' && E.gradeOf(75) === '达成' &&
  E.gradeOf(74.9) === '部分达成' && E.gradeOf(60) === '部分达成' && E.gradeOf(59.9) === '未达成',
  [E.gradeOf(90), E.gradeOf(89.9), E.gradeOf(75), E.gradeOf(74.9), E.gradeOf(60), E.gradeOf(59.9)].join(','));

console.log('\n[10] 计划 vs 实际偏差（基准冻结后对比）');
const db10 = DB();
const v3 = E.variance(db10, 'r3');
console.log('    r3 偏差：' + v3.items.map(x => x.task.id + ' ' + x.planEnd + '→' + (x.actEnd || '-') + ' 偏差' + x.deltaDays + '天').join(' | '));
ok('r3 带基准任务 4 条', v3.total === 4);
ok('r3 延期任务 2 条（t6 晚 2 天 / t8 晚 3 天）', v3.delayed === 2 && v3.maxDelay === 3, JSON.stringify({ delayed: v3.delayed, max: v3.maxDelay }));
ok('r3 平均延期 = 1.3 天', v3.avgDelay === 1.3, 'avgDelay=' + v3.avgDelay);
ok('按期任务识别正确', v3.onTime === 2 && v3.items.filter(x => x.task.id === 't7')[0].overdue === false);
const v2 = E.variance(db10, 'r2');
ok('r2 延期任务 2 条（t1 / t5）', v2.delayed === 2 && v2.maxDelay === 3, JSON.stringify({ delayed: v2.delayed, max: v2.maxDelay }));
ok('无基准任务时返回空集（不报错）', E.variance({ devTasks: [], featurePoints: [] }, 'rX').total === 0);

console.log('\n[11] 部门目标达成度（挂靠需求回溯）');
const db11 = DB();
const g = E.goalAchievement(db11, 'g1');
console.log('    目标 ' + g.goal.name + '：达成度 ' + g.achieved + ' / 目标值 ' + g.target + '（缺口 ' + g.gap + '）· 待验收 ' + g.pending.length + ' 条');
ok('挂靠需求 3 条', g.rows.length === 3);
ok('仅计入已有验收记录的需求（r2 / r3）', g.scoredCount === 2);
ok('目标达成度 = (78 + 82) / 2 = 80', g.achieved === 80, 'achieved=' + g.achieved);
ok('目标值 85 未达标，缺口 -5', g.target === 85 && g.gap === -5 && g.reached === false);
ok('未验收需求被单列为待验收（r1）', g.pending.length === 1 && g.pending[0].req.id === 'r1');
const db11b = DB();
db11b.requirements.filter(r => r.id === 'r1').forEach(r => { r.confirmed = true; });
db11b.featurePoints.filter(f => f.reqId === 'r1').forEach(f => { f.confirmed = true; });
db11b.acceptances.push({ id: 'ax', reqId: 'r1', fpid: 'f1', status: '已达成', score: 90, actual: 'x', evidence: 'y', by: 'p1', at: '2026-10-15 10:00' });
const g2 = E.goalAchievement(db11b, 'g1');
ok('新增验收后目标达成度实时重算（80 → 60）', g2.achieved === 60, 'achieved=' + g2.achieved);
ok('r1 达成度按权重 = 90×2/9 ≈ 20', E.reqAchievement(db11b, 'r1').rate === 20, 'rate=' + E.reqAchievement(db11b, 'r1').rate);
ok('目标不存在时返回 null', E.goalAchievement(db11, 'gX') === null);

console.log('\n[12] 员工复盘指标与手动计划占用');
const db12 = DB();
const rt2 = E.personRetro(db12, 'p2');
console.log('    ' + 'p2 李伟：任务 ' + rt2.taskCount + ' · 完成 ' + rt2.doneCount + ' · 被顺延 ' + rt2.slipCount + ' · 功能点均分 ' + rt2.avgScore);
ok('p2 承担任务 2 条 / 涉及功能点 2 个', rt2.taskCount === 2 && rt2.fpCount === 2, JSON.stringify({ t: rt2.taskCount, f: rt2.fpCount }));
ok('p2 被顺延任务 1 条（t6 相对基准后移）', rt2.slipCount === 1, 'slip=' + rt2.slipCount);
ok('p2 功能点验收均分 = 83（(70+95)/2）', rt2.avgScore === 83, 'avg=' + rt2.avgScore);
const rt6 = E.personRetro(db12, 'p6');
ok('p6 按期率 100%（唯一完成任务按期）', rt6.onTimeRate === 100 && rt6.doneCount === 1, JSON.stringify({ rate: rt6.onTimeRate, done: rt6.doneCount }));
ok('p6 关联到 1 条复盘记录', rt6.retros.length === 1);
const rt5 = E.personRetro(db12, 'p5');
ok('测试角色统计测试记录 9 / 完成 1', rt5.testCount === 9 && rt5.testDone === 1, JSON.stringify({ total: rt5.testCount, done: rt5.testDone }));
const db12b = DB();
db12b.manualPlans.push({ id: 'mpx', reqId: 'r1', name: '专项工作', type: '分析', personId: 'p1', hours: 8, earliest: '2026-10-19', plan: { start: '2026-10-19', end: '2026-10-19', days: 1, daily: [{ date: '2026-10-19', hours: 8 }] } });
ok('手动计划计入执行人占用日历', E.personLoad(db12b, 'p1')['2026-10-19'] === 8, JSON.stringify(E.personLoad(db12b, 'p1')));
const recMp = E.recommendSchedule(db12b, 'p1', 8, '2026-10-19');
ok('推荐周期自动避开手动计划占用（当日仅剩 0.5h）', recMp.daily[0].hours === 0.5 && recMp.days === 2, JSON.stringify(recMp.daily));
const recEx = E.recommendSchedule(db12b, 'p1', 8, '2026-10-19', { excludePlanId: 'mpx' });
ok('排除该计划后恢复为单日 8h', recEx.days === 1 && recEx.daily[0].hours === 8, JSON.stringify(recEx.daily));
const log = E.acceptanceLog(db12);
ok('验收记录可追溯（含需求/功能点/验收标准/证据）', log.length === 6 && !!log[0].ac && !!log[0].evidence,
  JSON.stringify(log.slice(0, 1)));

console.log('\n[13] 阶段门禁（前一阶段结果校验）');
const dbGate = DB();
const gt1 = E.stageGate(dbGate, 'r1');   // r1 未拆解未排期
ok('r1 分析阶段门禁未通过', gt1.ok === false);
ok('门禁列出功能点未确认', gt1.items.some(x => x.label.indexOf('功能点已人工确认锁定') >= 0 && !x.pass));
ok('门禁下一阶段为「开发」', gt1.next === '开发');
gt1.items.forEach(function (x) { console.log('    ' + (x.pass ? '✓' : '✕') + ' ' + x.label + ' —— ' + x.detail); });
const gt2 = E.stageGate(dbGate, 'r2');   // r2 开发中（t1/t2/t3/t5 未完成）
ok('r2 开发阶段门禁未通过（存在未完成任务）', gt2.ok === false);
ok('门禁列出未完成的开发任务', gt2.items.some(x => x.label.indexOf('开发任务全部完成') >= 0 && !x.pass));
ok('r3 开发阶段门禁未通过', E.stageGate(dbGate, 'r3').ok === false);

/* r3 全部门禁条件满足后应通过：完成开发任务 + 功能点维度 100% */
const dbGate2 = DB();
dbGate2.devTasks.filter(t => t.reqId === 'r3').forEach(t => { t.status = '已完成'; });
const gt3b = E.stageGate(dbGate2, 'r3');
ok('r3 开发任务全部完成后门禁通过', gt3b.ok === true, JSON.stringify(gt3b.items.filter(x => !x.pass).map(x => x.label)));
/* 待审批变更单会阻塞门禁 */
dbGate2.changeRequests.push({ id: 'crx', reqId: 'r3', kind: '计划变更', status: '待审批', title: 'x' });
const gt3c = E.stageGate(dbGate2, 'r3');
ok('存在待审批变更单时门禁被阻塞', gt3c.ok === false && gt3c.items.some(x => x.label.indexOf('变更单') >= 0 && !x.pass));
/* 测试阶段门禁 */
const dbGate3 = DB();
dbGate3.requirements.filter(r => r.id === 'r2')[0].stage = '测试';
dbGate3.testRecords.filter(t => t.reqId === 'r2').forEach(t => { t.status = '已完成'; });
ok('r2 存在待审批变更单时测试阶段门禁被阻塞', E.stageGate(dbGate3, 'r2').ok === false);
dbGate3.changeRequests.forEach(c => { c.status = '已批准'; });
const gt4 = E.stageGate(dbGate3, 'r2');
ok('r2 测试阶段门禁通过（测试全完成 + 功能点维度 100%）', gt4.ok === true,
  JSON.stringify(gt4.items.filter(x => !x.pass).map(x => x.label + ':' + x.detail)));
/* 验收阶段门禁：达成度门槛 */
const dbGate4 = DB();
dbGate4.requirements.filter(r => r.id === 'r2')[0].stage = '验收';
dbGate4.goalReviews = [];                       // 清掉种子里的历史验收结论
dbGate4.changeRequests.forEach(c => { c.status = '已批准'; });
const gt5 = E.stageGate(dbGate4, 'r2');
ok('r2 验收阶段门禁因缺少组织验收结论不通过', gt5.ok === false && gt5.items.some(x => x.label.indexOf('组织验收结论') >= 0 && !x.pass));
dbGate4.goalReviews.push({ id: 'grx', reqId: 'r2', result: '验收通过', achieved: 78, target: 85 });
ok('补齐组织验收结论后验收阶段门禁通过', E.stageGate(dbGate4, 'r2').ok === true);
ok('阶段链路终态为「已验收」', E.nextStage('验收') === '已验收' && E.nextStage('已验收') === null);
ok('阶段链路顺序为 分析→开发→测试→验收→已验收',
  E.nextStage('分析') === '开发' && E.nextStage('开发') === '测试' && E.nextStage('测试') === '验收');

console.log('\n[14] 分析阶段进度与状态口径');
const dbAna = DB();
const pAna = E.progress(dbAna, 'r2');
ok('r2 分析阶段：已排期 4 / 已完成 4', pAna.anaPlanned === 4 && pAna.anaDone === 4 && pAna.anaProgress === 100, JSON.stringify(pAna));
const dbAna2 = DB();
dbAna2.featurePoints.filter(f => f.id === 'f7')[0].analysisStatus = '进行中';
const pAna2 = E.progress(dbAna2, 'r2');
ok('分析状态未完成时进度下降为 75%', pAna2.anaDone === 3 && pAna2.anaProgress === 75, JSON.stringify(pAna2));
const pAnaR1 = E.progress(DB(), 'r1');
ok('r1 未锁定功能点不进入分析口径', pAnaR1.anaTotal === 0 && pAnaR1.anaProgress === 0, JSON.stringify(pAnaR1));

console.log('\n[15] 计划看板泳道数据');
const laneData = E.scheduleLanes(DB(), { from: '2026-10-15', count: 10 });
ok('泳道窗口为 10 个工作日且全为工作日', laneData.days.length === 10 && laneData.days.every(d => E.isWorkday(E.toDate(d))), JSON.stringify(laneData.days));
ok('泳道按人分组且每人有条目', laneData.rows.length > 0 && laneData.rows.every(r => r.bars.length > 0 && !!r.personId));
const laneBars = laneData.rows.reduce((a, r) => a.concat(r.bars), []);
ok('泳道含种子期的开发 / 测试条目', ['开发', '测试'].every(k => laneBars.some(b => b.kind === k)),
  JSON.stringify(laneBars.map(b => b.kind).filter((v, i, s) => s.indexOf(v) === i)));
const dbLane2 = DB();
const dbLaneFp = dbLane2.featurePoints.filter(f => f.id === 'f7')[0];
dbLaneFp.analysisPlan = { start: '2026-10-16', end: '2026-10-16', days: 1, daily: [{ date: '2026-10-16', hours: 4 }] };
const laneData2 = E.scheduleLanes(dbLane2, { from: '2026-10-15', count: 10 });
const laneBars2 = laneData2.rows.reduce((a, r) => a.concat(r.bars), []);
ok('窗口内的分析排期以「分析」条呈现（seed 分析期为历史，默认不显示）',
  ['分析', '开发', '测试'].every(k => laneBars2.some(b => b.kind === k)),
  JSON.stringify(laneBars2.map(b => b.kind).filter((v, i, s) => s.indexOf(v) === i)));
ok('泳道条目位置在窗口内（left ≥ 0 且 span ≥ 1）', laneBars.every(b => b.left >= 0 && b.span >= 1));
ok('泳道窗口外任务被裁剪（不出现越界）', laneBars.every(b => b.left + b.span <= laneData.days.length));
const laneTestOnly = laneData.rows.filter(r => r.personId === 'p5')[0];
ok('测试人 p5 泳道含测试条目', !!laneTestOnly && laneTestOnly.bars.some(b => b.kind === '测试'));
const lanePM = laneData.rows.filter(r => r.personId === 'p1')[0];
ok('产品经理 p1 泳道只含分析条目（历史窗口外的分析不计入）', !lanePM || lanePM.bars.every(b => b.kind === '分析'),
  JSON.stringify(lanePM && lanePM.bars.map(b => b.kind + ':' + b.start)));

console.log('\n[16] 计划变更影响 diff');
const planTask = DB().devTasks.filter(t => t.id === 't2')[0];
const planDelta = E.planDiff(planTask, { hours: 32, assignee: 'p2', start: '2026-10-21', end: '2026-10-23' });
ok('检出工时/周期差异共 3 项', planDelta.length === 3, JSON.stringify(planDelta.map(x => x.label)));
ok('参数一致时无差异（不产生空变更单）', E.planDiff(planTask, { hours: 24, assignee: 'p2', start: '2026-10-19', end: '2026-10-21' }).length === 0);
ok('实施人变化可检出', E.planDiff(planTask, { hours: 24, assignee: 'p4', start: '2026-10-19', end: '2026-10-21' }).length === 1);

console.log('\n[17] 测试记录占用与派生日历');
const dbTest = DB();
ok('测试记录计入测试人占用日历', E.personLoad(dbTest, 'p5')['2026-10-19'] > 0, JSON.stringify(E.personLoad(dbTest, 'p5')['2026-10-19']));
const testRec1 = dbTest.testRecords.filter(r => r.id === 'tc1')[0];
ok('tc1 排期为 10-21 → 10-22（接续开发完成日后）', testRec1.start === '2026-10-21' && testRec1.end === '2026-10-22');
const recTestQ = E.recommendSchedule(dbTest, 'p5', 6, '2026-10-19');
ok('测试人排期推荐不突破单日上限', recTestQ && recTestQ.daily.every(x => x.hours <= 8.5), JSON.stringify(recTestQ && recTestQ.daily));
const recTestQ2 = E.recommendSchedule(dbTest, 'p5', 6, '2026-10-20', { excludeTestId: 'tc3' });
ok('排除测试记录自身占用后推荐可提前', recTestQ2 && recTestQ2.start === '2026-10-20', JSON.stringify(recTestQ2 && recTestQ2.start));

console.log('\n[18] 工作台按阶段分类（stageBuckets / dueRiskMap）');
const dbBk = DB();
const buckets = E.stageBuckets(dbBk);
ok('返回 5 个桶且顺序与 STAGES 一致', buckets.map(b => b.stage).join(',') === E.STAGES.join(','),
  buckets.map(b => b.stage).join(','));
ok('桶内需求数合计等于需求总数', buckets.reduce((s, b) => s + b.count, 0) === dbBk.requirements.length);
ok('每条需求恰好归入一个桶（不重不漏）',
  buckets.reduce((a, b) => a.concat(b.reqs.map(r => r.id)), []).sort().join(',') ===
  dbBk.requirements.map(r => r.id).sort().join(','));
ok('桶的 count 与 reqs 长度一致', buckets.every(b => b.count === b.reqs.length));
ok('空桶保留（count = 0 且 reqs 为空）', buckets.some(b => b.count === 0 && b.reqs.length === 0));
const bkDev = buckets.filter(b => b.stage === '开发')[0];
ok('开发桶含 2 条（r2 / r3）', bkDev.count === 2, JSON.stringify(bkDev.reqs.map(r => r.id)));
ok('开发桶 P0 计 1 条（r3）', bkDev.p0 === 1, String(bkDev.p0));
ok('开发桶门禁未过 2 条（r2 / r3 均未闭环）', bkDev.blocked === 2, String(bkDev.blocked));
ok('开发桶临近到期 2 条（r2 / r3 均有任务命中提醒窗口）', bkDev.soon === 2, String(bkDev.soon));
ok('开发桶平均进度：分析 100 / 开发 13 / 测试 13',
  bkDev.ana === 100 && bkDev.dev === 13 && bkDev.test === 13,
  [bkDev.ana, bkDev.dev, bkDev.test].join('/'));
const bkAna = buckets.filter(b => b.stage === '分析')[0];
const anaExp = dbBk.requirements.filter(r => r.stage === '分析').length;
ok('分析桶条数与数据一致（r1 / r4 / r5）且进度均为 0（未拆解未确认）',
  bkAna.count === anaExp && bkAna.ana === 0 && bkAna.dev === 0 && bkAna.test === 0,
  bkAna.count + ' vs ' + anaExp);
ok('分析桶含全新未拆解需求 r5（无功能点）', bkAna.reqs.some(r => r.id === 'r5'));
ok('已验收桶不计入门禁未过 / 临近到期',
  buckets.filter(b => b.stage === '已验收').every(b => b.blocked === 0 && b.soon === 0 && b.overdue === 0));

const risk = E.dueRiskMap(dbBk);
ok('r2 / r3 命中「临近到期」且未超期', risk.r2 && risk.r2.soon && !risk.r2.overdue && risk.r3.soon && !risk.r3.overdue,
  JSON.stringify(risk));
ok('无需求命中「已超期」（演示时点 10-15 无逾期任务）', Object.keys(risk).every(k => !risk[k].overdue));
const dbLate = DB();
dbLate.devTasks.filter(t => t.id === 't3')[0].end = '2026-10-14';   // 改到演示时点之前
ok('任务截止日早于演示时点 → 标记超期', E.dueRiskMap(dbLate).r2.overdue === true);
const dbFin = DB();
dbFin.devTasks.forEach(t => { t.status = '已完成'; });
dbFin.testRecords.forEach(r => { r.status = '已完成'; });
ok('全部任务完成后不再有到期风险', Object.keys(E.dueRiskMap(dbFin)).length === 0);

console.log('\n[19] 数据看板（月度趋势 / 部门维度 / 多维度工作量）');
const dbD = DB();
const months = E.monthList(dbD);
ok('月份序列为 6 个月且升序去重', months.length === 6 && months.join(',') === months.slice().sort().join(','), months.join(','));
ok('月份序列含当前演示月', months[months.length - 1] === E.demoMonth(dbD), months[months.length - 1] + ' vs ' + E.demoMonth(dbD));

const live = E.liveRecords(dbD);
ok('在跑需求逐条折算为记录（条数 = 需求数）', live.length === dbD.requirements.length, String(live.length));
ok('未拆解需求（r5）折算后三阶段工时均为 0 且无主系统',
  live.some(x => x.id === 'r5' && x.ana === 0 && x.dev === 0 && x.test === 0 && !x.sys && !x.owner));
ok('在跑需求全部落在演示月', live.every(x => x.month === E.demoMonth(dbD)));
ok('在跑记录含三阶段工时（分析 / 开发 / 测试）', live.every(x => x.ana >= 0 && x.dev >= 0 && x.test >= 0));
const liveR2 = live.filter(x => x.id === 'r2')[0];
ok('r2 折算：分析工时 = 功能点分析工时合计',
  liveR2.ana === dbD.featurePoints.filter(f => f.reqId === 'r2').reduce((s, f) => s + f.analysisHours, 0), String(liveR2.ana));
ok('r2 折算：开发工时 = 开发任务工时合计',
  liveR2.dev === dbD.devTasks.filter(t => t.reqId === 'r2').reduce((s, t) => s + t.hours, 0), String(liveR2.dev));
ok('r2 折算：测试工时 = 测试记录工时合计',
  liveR2.test === dbD.testRecords.filter(t => t.reqId === 'r2').reduce((s, t) => s + t.hours, 0), String(liveR2.test));
ok('r2 折算主系统 / 实施人取出现最多者', !!liveR2.sys && !!liveR2.owner, liveR2.sys + '/' + liveR2.owner);
ok('总数据集 = 档案 + 在跑', E.allRecords(dbD).length === (dbD.reqArchive || []).length + live.length);

const mc = E.monthlyReqCount(dbD);
ok('月度序列每月总数合计 = 总数据集条数', mc.reduce((s, r) => s + r.total, 0) === E.allRecords(dbD).length);
ok('月度环比链正确（本月 - 上月）', mc.every((r, i) => r.delta === r.total - (i ? mc[i - 1].total : 0)),
  JSON.stringify(mc.map(r => r.month + ':' + r.total + '(' + r.delta + ')')));
ok('月度按优先级拆分合计等于当月总数', mc.every(r => (r.byPriority.P0 || 0) + (r.byPriority.P1 || 0) + (r.byPriority.P2 || 0) === r.total));

const dept = E.deptStats(dbD);
ok('部门统计 6 个部门', dept.length === 6, String(dept.length));
ok('部门统计条数合计 = 总数据集条数', dept.reduce((s, d) => s + d.total, 0) === E.allRecords(dbD).length);
ok('部门已验收 + 在途 = 部门总数', dept.every(d => d.done + d.doing === d.total));
ok('部门三阶段工时合计自洽', dept.every(d => d.ana + d.dev + d.test === d.hours));
ok('部门按需求条数降序', dept.every((d, i) => i === 0 || dept[i - 1].total >= d.total));
const cc = dept.filter(d => d.source === '信用卡中心')[0];
ok('信用卡中心为提出最多的部门（7 条）', cc && cc.total === 7 && dept[0].source === '信用卡中心', cc && String(cc.total));

ok('工作量维度有 4 个（阶段 / 部门 / 系统 / 人员）',
  E.WORKLOAD_DIMS.length === 4 && E.WORKLOAD_DIMS.map(d => d.key).join(',') === 'stage,source,sys,owner',
  E.WORKLOAD_DIMS.map(d => d.key).join(','));
const wStage2 = E.workloadSeries(dbD, 'stage');
ok('阶段维度三键固定为 分析/开发/测试', wStage2.keys.join(',') === '分析,开发,测试', wStage2.keys.join(','));
ok('阶段维度配色与阶段主题一致（amber/blue/purple）', wStage2.colors.join(',') === 'amber,blue,purple', wStage2.colors.join(','));
ok('每月分段工时合计 = 该月合计', wStage2.months.every(m => m.parts.reduce((s, p) => s + p.hours, 0) === m.total));
ok('月度环比链正确', wStage2.months.every((m, i) => m.delta === m.total - (i ? wStage2.months[i - 1].total : 0)));
ok('max 等于各月合计最大值', wStage2.max === Math.max(...wStage2.months.map(m => m.total)), String(wStage2.max));
ok('grand 等于各月合计之和', wStage2.grand === wStage2.months.reduce((s, m) => s + m.total, 0));
const grands = ['stage', 'source', 'sys', 'owner'].map(d => E.workloadSeries(dbD, d).grand);
ok('四个维度的工时总量一致（换维度不丢数）', grands.every(g => g === grands[0]), grands.join('/'));
const wOwn2 = E.workloadSeries(dbD, 'owner');
ok('人员维度键为人员 id 或未指派兜底', wOwn2.keys.every(k => k === '未指派人员' || /^p\d+$/.test(k)), wOwn2.keys.join(','));
const wSys2 = E.workloadSeries(dbD, 'sys');
ok('系统维度键为系统 id 或未指定兜底', wSys2.keys.every(k => k === '未指定系统' || /^s_/.test(k)), wSys2.keys.join(','));
ok('未知维度回退为按阶段', E.workloadSeries(dbD, 'nope').dim === 'stage');

const kpi = E.dashboardKPI(dbD);
ok('KPI 需求总数 = 总数据集条数', kpi.total === E.allRecords(dbD).length);
ok('KPI 本月条数 = 在跑需求数（5 条）', kpi.curCount === 5 && kpi.curMonth === E.demoMonth(dbD), kpi.curCount + '@' + kpi.curMonth);
ok('KPI 环比 = 本月 - 上月', kpi.delta === kpi.curCount - kpi.prevCount, kpi.delta + ' = ' + kpi.curCount + '-' + kpi.prevCount);
ok('KPI 累计工时 = 三阶段之和', kpi.hours === kpi.ana + kpi.dev + kpi.test, kpi.hours + ' = ' + kpi.ana + '+' + kpi.dev + '+' + kpi.test);
ok('KPI 部门数 = 部门统计条数', kpi.deptCount === dept.length);
ok('KPI 在途需求与看板口径一致（非已验收）',
  kpi.inFlight === dbD.requirements.filter(r => r.stage !== '已验收').length, String(kpi.inFlight));

/* 隔离性：看板数据不得参与任何既有计算（排期 / 门禁 / 达成度 / 提醒） */
const dbIso = DB();
const beforeIso = {
  prog: JSON.stringify(E.progress(dbIso, 'r2')),
  gate: JSON.stringify(E.stageGate(dbIso, 'r2')),
  goal: E.goalAchievement(dbIso, 'g1').rate,
  rem: E.reminders(dbIso).length,
  load: JSON.stringify(E.personLoad(dbIso, 'p2'))
};
dbIso.reqArchive.forEach(h => { h.ana = 9999; h.dev = 9999; h.test = 9999; h.source = '外部部门'; });
dbIso.reqArchive.push({ id: 'hx', month: '2026-01', source: '外部部门', priority: 'P0', stage: '已验收', sys: 's_core', owner: 'p2', ana: 1, dev: 1, test: 1 });
ok('改动看板档案不影响进度计算', JSON.stringify(E.progress(dbIso, 'r2')) === beforeIso.prog);
ok('改动看板档案不影响阶段门禁', JSON.stringify(E.stageGate(dbIso, 'r2')) === beforeIso.gate);
ok('改动看板档案不影响目标达成度', E.goalAchievement(dbIso, 'g1').rate === beforeIso.goal);
ok('改动看板档案不影响到期提醒', E.reminders(dbIso).length === beforeIso.rem);
ok('改动看板档案不影响人员占用日历', JSON.stringify(E.personLoad(dbIso, 'p2')) === beforeIso.load);
ok('但看板自身会随之变化（数据源正确）', E.monthlyReqCount(dbIso).filter(r => r.month === '2026-01').length === 1);

console.log('\n===== 结果：' + pass + ' 通过 / ' + fail + ' 失败 =====\n');
process.exit(fail ? 1 : 0);
