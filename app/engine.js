/* ==========================================================================
 * engine.js —— 确定性计算引擎（排期推荐 / 到期提醒 / 冲突 / 校验 / 进度 / 插队影响）
 * 纯函数，无副作用，可在浏览器与 Node 中运行（用于自动化验证）
 * ========================================================================== */

globalThis.Engine = (function () {
  var DAY_CAP = 8.5;   // 单日工时上限（规则：每天 7.6 ~ 8.5 小时）
  var DAY_MIN = 7.6;   // 单日目标工时下限（正常日填满，尾端可不足）

  /* 需求阶段链路：分析 → 开发 → 测试 → 验收 → 已验收（终态） */
  var STAGES = ['分析', '开发', '测试', '验收', '已验收'];
  function nextStage(s) {
    var i = STAGES.indexOf(s);
    return i < 0 || i === STAGES.length - 1 ? null : STAGES[i + 1];
  }
  function findById(list, id) {
    var hit = (list || []).filter(function (x) { return x.id === id; })[0];
    return hit || null;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toDate(s) { return new Date(s + 'T00:00:00'); }
  function fmtDate(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
  function addDays(dt, n) { var x = new Date(dt.getTime()); x.setDate(x.getDate() + n); return x; }
  function isWorkday(dt) { var w = dt.getDay(); return w !== 0 && w !== 6; }
  function round1(n) { return Math.round(n * 10) / 10; }

  function normStart(s) {
    var d = toDate(s);
    var guard = 0;
    while (!isWorkday(d) && guard++ < 30) d = addDays(d, 1);
    return d;
  }
  function nextWorkday(dt) {
    var d = addDays(dt, 1), guard = 0;
    while (!isWorkday(d) && guard++ < 30) d = addDays(d, 1);
    return d;
  }
  function eachDate(start, end) {
    var out = [], c = toDate(start), e = toDate(end), guard = 0;
    while (c <= e && guard++ < 400) { out.push(fmtDate(c)); c = addDays(c, 1); }
    return out;
  }
  function diffDays(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }

  /* ---------- 人员占用日历（开发任务 + 已采用的分析排期） ---------- */
  function personLoad(DB, personId, opts) {
    opts = opts || {};
    var load = {};
    (DB.devTasks || []).forEach(function (t) {
      if (t.assignee !== personId) return;
      if (opts.excludeTaskId && t.id === opts.excludeTaskId) return;
      if (!t.start || !t.end) return;
      var days = eachDate(t.start, t.end).filter(function (k) { return isWorkday(toDate(k)); });
      var per = round1(t.hours / Math.max(days.length, 1));
      days.forEach(function (k) { load[k] = round1((load[k] || 0) + per); });
    });
    (DB.featurePoints || []).forEach(function (f) {
      if (f.analyst !== personId || !f.analysisPlan) return;
      if (opts.excludeFpId && f.id === opts.excludeFpId) return;
      (f.analysisPlan.daily || []).forEach(function (x) { load[x.date] = round1((load[x.date] || 0) + x.hours); });
    });
    /* 测试记录（与开发任务 1:1 派生）同样占用测试人日历 */
    (DB.testRecords || []).forEach(function (r) {
      if (r.assignee !== personId) return;
      if (opts.excludeTestId && r.id === opts.excludeTestId) return;
      if (!r.start || !r.end) return;
      var days = eachDate(r.start, r.end).filter(function (k) { return isWorkday(toDate(k)); });
      var per = round1(r.hours / Math.max(days.length, 1));
      days.forEach(function (k) { load[k] = round1((load[k] || 0) + per); });
    });
    /* 计划外工作 / 手动新增计划同样占用人员日历 */
    (DB.manualPlans || []).forEach(function (mp) {
      if (mp.personId !== personId || !mp.plan) return;
      if (opts.excludePlanId && mp.id === opts.excludePlanId) return;
      (mp.plan.daily || []).forEach(function (x) { load[x.date] = round1((load[x.date] || 0) + x.hours); });
    });
    return load;
  }

  /* ---------- 排期周期推荐（核心引擎） ---------- */
  function recommendSchedule(DB, personId, hours, earliestStart, opts) {
    opts = opts || {};
    var load = personLoad(DB, personId, opts);
    var cur = normStart(earliestStart || DB.meta.demoDate);
    var remaining = round1(hours);
    var daily = [], guard = 0;

    if (remaining <= 0) return null;

    while (remaining > 0 && guard++ < 200) {
      var key = fmtDate(cur);
      var used = load[key] || 0;
      var cap = round1(DAY_CAP - used);
      if (cap > 0) {
        var take = round1(Math.min(remaining, cap));
        daily.push({ date: key, hours: take, preOccupied: used });
        load[key] = round1(used + take);
        remaining = round1(remaining - take);
      }
      if (remaining > 0) cur = nextWorkday(cur);
    }
    if (!daily.length) return null;

    var firstKey = daily[0].date;
    return {
      start: firstKey,
      end: daily[daily.length - 1].date,
      daily: daily,
      days: daily.length,
      startLoad: load[firstKey] - daily[0].hours, // 首日此前已有占用
      dayCap: DAY_CAP,
      dayMin: DAY_MIN,
      ruleText: '每天工时 7.6~8.5 小时，单日超出自动顺延至后续工作日'
    };
  }

  /* ---------- 到期提醒规则 ---------- */
  function dueInfo(task, demoDate) {
    var daysLeft = diffDays(demoDate, task.end);
    var over10 = task.hours > 10;
    var win = over10 ? 2 : 1;
    return {
      daysLeft: daysLeft,
      window: win,
      over10: over10,
      ruleText: over10 ? '工作量 >10h → 到期前 2 天提醒' : '工作量 ≤10h → 到期前 1 天提醒',
      remind: daysLeft >= 0 && daysLeft <= win
    };
  }
  function reminders(DB) {
    var out = [];
    (DB.devTasks || []).forEach(function (t) {
      if (t.status === '已完成') return;
      if (!t.end) return;
      var info = dueInfo(t, DB.meta.demoDate);
      if (info.remind) out.push({ task: t, info: info });
    });
    return out.sort(function (a, b) { return a.info.daysLeft - b.info.daysLeft; });
  }

  /* ---------- 人员冲突检测 ---------- */
  function conflicts(DB) {
    var map = {};
    (DB.devTasks || []).forEach(function (t) {
      if (!t.start || !t.end || t.status === '已完成') return;
      (map[t.assignee] = map[t.assignee] || []).push(t);
    });
    var out = [];
    Object.keys(map).forEach(function (pid) {
      var arr = map[pid];
      for (var i = 0; i < arr.length; i++) {
        for (var j = i + 1; j < arr.length; j++) {
          var a = arr[i], b = arr[j];
          var s = a.start > b.start ? a.start : b.start;
          var e = a.end < b.end ? a.end : b.end;
          if (s <= e) out.push({ personId: pid, a: a, b: b, from: s, to: e, days: diffDays(s, e) + 1 });
        }
      }
    });
    return out;
  }

  /* ---------- 关联系统排期校验 ---------- */
  function relSysWarnings(DB, reqId) {
    var out = [];
    (DB.featurePoints || []).forEach(function (f) {
      if (reqId && f.reqId !== reqId) return;
      var ts = (DB.devTasks || []).filter(function (t) { return t.fpid === f.id && t.start && t.end; });
      var main = ts.filter(function (t) { return t.sysId === f.mainSys; })[0];
      if (!main) return;
      ts.forEach(function (t) {
        if (t.sysId === f.mainSys) return;
        if (t.end > main.end) {
          out.push({ fp: f, main: main, rel: t, gapDays: diffDays(main.end, t.end) });
        }
      });
    });
    return out;
  }

  /* ---------- 进度统计 ---------- */
  function progress(DB, reqId) {
    var fps = (DB.featurePoints || []).filter(function (f) { return f.reqId === reqId && f.confirmed; });
    var ids = fps.map(function (f) { return f.id; });
    var ts = (DB.devTasks || []).filter(function (t) { return ids.indexOf(t.fpid) >= 0; });
    var trs = (DB.testRecords || []).filter(function (r) { return ids.indexOf(r.fpid) >= 0; });
    var devDoneFp = fps.filter(function (f) {
      var ft = ts.filter(function (t) { return t.fpid === f.id; });
      return ft.length > 0 && ft.every(function (t) { return t.status === '已完成'; });
    });
    var testDoneFp = fps.filter(function (f) {
      var rt = trs.filter(function (r) { return r.fpid === f.id; });
      return rt.length > 0 && rt.every(function (r) { return r.status === '已完成'; });
    });
    var testDone = trs.filter(function (r) { return r.status === '已完成'; });
    var anaPlanned = fps.filter(function (f) { return !!f.analysisPlan; });
    var anaDone = fps.filter(function (f) { return f.analysisStatus === '已完成'; });
    return {
      fpTotal: fps.length,
      fpDevDone: devDoneFp.length,
      fpTestDone: testDoneFp.length,
      devProgress: fps.length ? Math.round(devDoneFp.length / fps.length * 100) : 0,
      taskTotal: ts.length,
      taskDone: ts.filter(function (t) { return t.status === '已完成'; }).length,
      testTotal: trs.length,
      testDone: testDone.length,
      testProgress: fps.length ? Math.round(testDoneFp.length / fps.length * 100) : 0,
      /* 分析阶段：已排期数 / 已完成数（阶段门禁依据） */
      anaTotal: fps.length,
      anaPlanned: anaPlanned.length,
      anaDone: anaDone.length,
      anaProgress: fps.length ? Math.round(anaDone.length / fps.length * 100) : 0
    };
  }

  /* ======================= 阶段门禁：前一阶段结果校验 =======================
   * 规则：只有当前阶段的关键产出全部闭环，才允许流转到下一阶段。
   * 返回 { ok, next, items:[{label, pass, detail}] }
   * ======================================================================== */
  function stageGate(DB, reqId) {
    var req = findById(DB.requirements, reqId);
    if (!req) return { ok: false, next: null, items: [{ label: '需求不存在', pass: false, detail: '' }] };
    var stage = req.stage, next = nextStage(stage), items = [];
    var fps = (DB.featurePoints || []).filter(function (f) { return f.reqId === reqId && f.confirmed; });
    var ts = (DB.devTasks || []).filter(function (t) { return t.reqId === reqId; });
    var trs = (DB.testRecords || []).filter(function (r) { return r.reqId === reqId; });
    var p = progress(DB, reqId);
    var ach = reqAchievement(DB, reqId);
    var crs = (DB.changeRequests || []).filter(function (c) { return c.reqId === reqId && c.status === '待审批'; });

    if (stage === '分析') {
      items.push({ label: '功能点已人工确认锁定', pass: !!req.confirmed && fps.length > 0, detail: fps.length ? fps.length + ' 个功能点已锁定为基准' : '尚未确认拆解结果' });
      var noPlan = fps.filter(function (f) { return !f.analysisPlan; });
      items.push({ label: '全部分析工作已排期', pass: fps.length > 0 && noPlan.length === 0, detail: noPlan.length ? '未排期 ' + noPlan.length + ' 项：' + noPlan.slice(0, 3).map(function (f) { return f.name; }).join('、') : '已排期 ' + fps.length + '/' + fps.length });
      var unDone = fps.filter(function (f) { return f.analysisStatus !== '已完成'; });
      items.push({ label: '分析任务全部完成', pass: fps.length > 0 && unDone.length === 0, detail: unDone.length ? '未完成 ' + unDone.length + ' 项：' + unDone.slice(0, 3).map(function (f) { return f.name; }).join('、') : '已完成 ' + p.anaDone + '/' + fps.length });
    } else if (stage === '开发') {
      items.push({ label: '开发任务已引入并排期', pass: ts.length > 0 && ts.every(function (t) { return !!t.start; }), detail: ts.length ? '已排期 ' + ts.filter(function (t) { return !!t.start; }).length + '/' + ts.length + ' 条任务' : '尚未引入开发任务' });
      var devOpen = ts.filter(function (t) { return t.status !== '已完成'; });
      items.push({ label: '开发任务全部完成', pass: ts.length > 0 && devOpen.length === 0, detail: devOpen.length ? '未完成 ' + devOpen.length + ' 条：' + devOpen.slice(0, 3).map(function (t) { var f = findById(DB.featurePoints, t.fpid); return f ? f.name : t.id; }).join('、') : '开发完成 ' + ts.length + '/' + ts.length });
      items.push({ label: '功能点维度开发进度 100%', pass: fps.length > 0 && p.devProgress === 100, detail: '当前 ' + p.fpDevDone + '/' + p.fpTotal + ' 个功能点全部系统任务已完成' });
    } else if (stage === '测试') {
      items.push({ label: '测试记录已生成并排期', pass: trs.length > 0 && trs.every(function (r) { return !!r.start; }), detail: trs.length ? '已排期 ' + trs.filter(function (r) { return !!r.start; }).length + '/' + trs.length + ' 条测试记录' : '暂无测试记录' });
      var testOpen = trs.filter(function (r) { return r.status !== '已完成'; });
      items.push({ label: '测试任务全部完成', pass: trs.length > 0 && testOpen.length === 0, detail: testOpen.length ? '未完成 ' + testOpen.length + ' 条' : '测试完成 ' + trs.length + '/' + trs.length });
      items.push({ label: '功能点维度测试进度 100%', pass: fps.length > 0 && p.testProgress === 100, detail: '当前 ' + p.fpTestDone + '/' + p.fpTotal + ' 个功能点测试全部完成' });
    } else if (stage === '验收') {
      items.push({ label: '功能点逐条验收完成', pass: ach.fpTotal > 0 && ach.unverifiedCount === 0, detail: '已验收 ' + ach.verifiedCount + '/' + ach.fpTotal + ' 个功能点' });
      items.push({ label: '组织验收结论已形成', pass: !!ach.conclusion, detail: ach.conclusion ? ach.conclusion.result + '（达成度 ' + ach.conclusion.achieved + '）' : '尚未填写组织验收结论' });
      items.push({ label: '达成度达到目标值', pass: ach.rate >= 75, detail: '当前加权达成度 ' + ach.rate + '（评级 ' + ach.grade + '）' });
    }
    if (crs.length) items.push({ label: '无待审批的变更单', pass: false, detail: '存在 ' + crs.length + ' 条待审批变更，请先完成变更审批' });

    return { ok: items.length > 0 && items.every(function (x) { return x.pass; }), next: next, stage: stage, items: items };
  }

  /* ======================= 计划看板：排期时间轴（按人泳道） ======================= */
  function laneDays(DB, opts) {
    opts = opts || {};
    var count = opts.count || 10, out = [];
    var c = normStart(opts.from || DB.meta.demoDate), guard = 0;
    while (out.length < count && guard++ < 200) {
      if (isWorkday(c)) out.push(fmtDate(c));
      c = addDays(c, 1);
    }
    return out;
  }
  function scheduleLanes(DB, opts) {
    opts = opts || {};
    var days = laneDays(DB, opts);
    var people = {};
    function spanOf(start, end) {
      if (!start || !end) return null;
      var l = -1, r = -1;
      for (var i = 0; i < days.length; i++) {
        if (days[i] >= start && days[i] <= end) { if (l < 0) l = i; r = i; }
      }
      return l < 0 ? null : { left: l, span: r - l + 1 };
    }
    function add(pid, kind, label, sub, plan, reqId, status) {
      if (!pid) return;
      var sp = spanOf(plan && plan.start, plan && plan.end);
      if (!sp) return;
      (people[pid] = people[pid] || []).push({
        kind: kind, label: label, sub: sub, reqId: reqId,
        left: sp.left, span: sp.span, start: plan.start, end: plan.end, status: status || ''
      });
    }
    (DB.featurePoints || []).forEach(function (f) {
      if (!f.analysisPlan) return;
      add(f.analyst, '分析', f.name, '分析 · ' + (f.analysisStatus || '未开始'), f.analysisPlan, f.reqId, f.analysisStatus);
    });
    (DB.devTasks || []).forEach(function (t) {
      var f = findById(DB.featurePoints, t.fpid);
      add(t.assignee, '开发', f ? f.name : t.id, '开发 · ' + t.status, t, t.reqId, t.status);
    });
    (DB.testRecords || []).forEach(function (r) {
      var f = findById(DB.featurePoints, r.fpid);
      add(r.assignee, '测试', f ? f.name : r.id, '测试 · ' + r.status, r, r.reqId, r.status);
    });
    (DB.manualPlans || []).forEach(function (mp) {
      add(mp.personId, mp.type, mp.name, '手动计划 · ' + mp.type, mp.plan, mp.reqId, mp.plan ? '已排期' : '待排期');
    });
    var rows = Object.keys(people).map(function (pid) {
      var bars = people[pid].slice().sort(function (a, b) { return a.left - b.left || a.span - b.span; });
      return { personId: pid, bars: bars, count: bars.length };
    });
    return { days: days, rows: rows };
  }
  /* 计划变更影响：把任务按当前排期与变更后排期做 diff（用于变更单影响预览） */
  function planDiff(task, next) {
    var out = [];
    if (!task) return out;
    function push(label, a, b) { if (String(a || '') !== String(b || '')) out.push({ label: label, before: a, after: b }); }
    push('实施工时', task.hours + 'h', next.hours + 'h');
    push('实施人', task.assignee, next.assignee);
    push('开始日', task.start, next.start);
    push('完成日', task.end, next.end);
    return out;
  }

  /* ---------- 插队影响评估 ---------- */
  function estimateDays(DB, reqId) {
    var ts = (DB.devTasks || []).filter(function (t) { return t.reqId === reqId && t.start && t.end; });
    if (ts.length) {
      var starts = ts.map(function (t) { return t.start; }).sort();
      var ends = ts.map(function (t) { return t.end; }).sort();
      return diffDays(starts[0], ends[ends.length - 1]) + 1;
    }
    var fps = (DB.featurePoints || []).filter(function (f) { return f.reqId === reqId; });
    var total = fps.reduce(function (s, f) { return s + (f.analysisHours || 0); }, 0);
    return Math.max(1, Math.ceil(total / DAY_CAP));
  }
  function queueSorted(DB) {
    return (DB.requirements || []).slice().sort(function (a, b) { return a.order - b.order; });
  }
  function queueImpact(DB, reqId, targetPos) {
    var q = queueSorted(DB);
    var from = -1;
    q.forEach(function (r, i) { if (r.id === reqId) from = i; });
    if (from < 0) return null;
    var moved = q.slice();
    var item = moved.splice(from, 1)[0];
    moved.splice(targetPos - 1, 0, item);

    var insertedDays = estimateDays(DB, reqId);
    var displaced = [];
    q.forEach(function (r, i) {
      if (r.id === reqId) return;
      var ni = -1;
      moved.forEach(function (x, k) { if (x.id === r.id) ni = k; });
      if (ni > i) {
        displaced.push({ req: r, shift: ni - i, delayDays: insertedDays * (ni - i) });
      }
    });
    return { from: from + 1, to: targetPos, moved: moved, insertedDays: insertedDays, displaced: displaced };
  }
  /* 计算某需求影响的人与功能点（用于影响卡） */
  function impactScope(DB, reqId) {
    var fps = (DB.featurePoints || []).filter(function (f) { return f.reqId === reqId; });
    var ids = fps.map(function (f) { return f.id; });
    var ts = (DB.devTasks || []).filter(function (t) { return ids.indexOf(t.fpid) >= 0; });
    var people = {};
    ts.forEach(function (t) { people[t.assignee] = true; });
    return { fpCount: fps.length, taskCount: ts.length, people: Object.keys(people) };
  }

  /* ======================= 验收 / 达成度 / 复盘（闭环评估） ======================= */

  var PRI_W = { P0: 3, P1: 2, P2: 1 };  // 达成度权重：优先级越高，对目标达成度影响越大

  function gradeOf(rate) {
    if (rate >= 90) return '优秀';
    if (rate >= 75) return '达成';
    if (rate >= 60) return '部分达成';
    return '未达成';
  }

  function accOf(DB, fpid) {
    return (DB.acceptances || []).filter(function (a) { return a.fpid === fpid; })[0] || null;
  }

  /* 需求达成度：按功能点优先级加权；未验收功能点计 0 分并单独标注 */
  function reqAchievement(DB, reqId) {
    var fps = (DB.featurePoints || []).filter(function (f) { return f.reqId === reqId && f.confirmed; });
    var items = fps.map(function (f) {
      var a = accOf(DB, f.id);
      var w = PRI_W[f.priority] || 1;
      return { fp: f, weight: w, acc: a, verified: !!a, status: a ? a.status : '未验收', score: a ? (Number(a.score) || 0) : 0 };
    });
    var weightTotal = items.reduce(function (s, x) { return s + x.weight; }, 0);
    var weighted = items.reduce(function (s, x) { return s + x.weight * (x.verified ? x.score : 0); }, 0);
    var verified = items.filter(function (x) { return x.verified; });
    var rate = weightTotal ? Math.round(weighted / weightTotal) : 0;
    var verifiedRate = verified.length
      ? Math.round(verified.reduce(function (s, x) { return s + x.weight * x.score; }, 0) / verified.reduce(function (s, x) { return s + x.weight; }, 0))
      : 0;
    var p = progress(DB, reqId);
    var v = variance(DB, reqId);
    return {
      fpTotal: items.length, verifiedCount: verified.length, unverifiedCount: items.length - verified.length,
      weightTotal: weightTotal, rate: rate, verifiedRate: verifiedRate, grade: gradeOf(rate),
      items: items, devProgress: p.devProgress, testProgress: p.testProgress,
      delayedTasks: v.delayed, avgDelay: v.avgDelay, maxDelay: v.maxDelay,
      conclusion: (DB.goalReviews || []).filter(function (g) { return g.reqId === reqId; })[0] || null,
      complete: items.length > 0 && items.every(function (x) { return x.verified; })
    };
  }

  /* 计划 vs 实际偏差（baseline 在计划生效时冻结） */
  function variance(DB, reqId) {
    var ts = (DB.devTasks || []).filter(function (t) { return t.reqId === reqId && t.baselineStart && t.baselineEnd; });
    var items = ts.map(function (t) {
      var planDays = diffDays(t.baselineStart, t.baselineEnd) + 1;
      var deltas = [];
      if (t.start && t.baselineStart) deltas.push(diffDays(t.baselineStart, t.start));
      if (t.end && t.baselineEnd) deltas.push(diffDays(t.baselineEnd, t.end));
      var delta = deltas.length ? Math.max.apply(null, deltas) : 0;
      return {
        task: t, planStart: t.baselineStart, planEnd: t.baselineEnd,
        actStart: t.start || '', actEnd: t.end || '', planDays: planDays,
        deltaDays: delta, overdue: delta > 0, done: t.status === '已完成'
      };
    });
    var delayed = items.filter(function (x) { return x.overdue; });
    return {
      items: items, total: items.length, delayed: delayed.length,
      onTime: items.length - delayed.length,
      maxDelay: items.length ? items.reduce(function (s, x) { return Math.max(s, x.deltaDays); }, 0) : 0,
      avgDelay: items.length ? round1(items.reduce(function (s, x) { return s + Math.max(0, x.deltaDays); }, 0) / items.length) : 0
    };
  }

  /* 部门目标达成度：挂靠需求达成的平均（仅计入已有验收记录的需求），并列出待验收需求 */
  function goalAchievement(DB, goalId) {
    var g = (DB.goals || []).filter(function (x) { return x.id === goalId; })[0];
    if (!g) return null;
    var rows = (g.reqIds || []).map(function (id) {
      var r = (DB.requirements || []).filter(function (x) { return x.id === id; })[0];
      if (!r) return null;
      return { req: r, ach: reqAchievement(DB, id) };
    }).filter(Boolean);
    var scored = rows.filter(function (x) { return x.ach.verifiedCount > 0; });
    var achieved = scored.length ? Math.round(scored.reduce(function (s, x) { return s + x.ach.rate; }, 0) / scored.length) : 0;
    return {
      goal: g, rows: rows, scoredCount: scored.length,
      pending: rows.filter(function (x) { return x.ach.verifiedCount === 0; }),
      achieved: achieved, target: g.target, gap: achieved - g.target, reached: achieved >= g.target
    };
  }

  /* 员工复盘：个人承担与交付的客观指标 */
  function personRetro(DB, personId) {
    var ts = (DB.devTasks || []).filter(function (t) { return t.assignee === personId; });
    var done = ts.filter(function (t) { return t.status === '已完成'; });
    var onTime = done.filter(function (t) { return !(t.end && t.baselineEnd && t.end > t.baselineEnd); });
    var slipped = ts.filter(function (t) { return t.start && t.baselineStart && t.start > t.baselineStart; });
    var fpIds = {};
    ts.forEach(function (t) { fpIds[t.fpid] = true; });
    var fpList = Object.keys(fpIds).map(function (id) {
      return (DB.featurePoints || []).filter(function (f) { return f.id === id; })[0];
    }).filter(Boolean);
    var scored = fpList.map(function (f) { return accOf(DB, f.id); }).filter(Boolean);
    var trs = (DB.testRecords || []).filter(function (r) { return r.assignee === personId; });
    return {
      personId: personId, taskCount: ts.length, doneCount: done.length,
      onTimeRate: done.length ? Math.round(onTime.length / done.length * 100) : 0,
      slipCount: slipped.length, fpCount: fpList.length,
      avgScore: scored.length ? Math.round(scored.reduce(function (s, a) { return s + (Number(a.score) || 0); }, 0) / scored.length) : 0,
      verifiedFp: scored.length, testCount: trs.length,
      testDone: trs.filter(function (r) { return r.status === '已完成'; }).length,
      retros: (DB.retros || []).filter(function (x) { return x.personId === personId; })
    };
  }

  /* 某需求验收汇总（供导出与追溯） */
  function acceptanceLog(DB, reqId) {
    return (DB.acceptances || [])
      .filter(function (a) { return !reqId || a.reqId === reqId; })
      .slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; })
      .map(function (a) {
        var f = (DB.featurePoints || []).filter(function (x) { return x.id === a.fpid; })[0] || {};
        var r = (DB.requirements || []).filter(function (x) { return x.id === a.reqId; })[0] || {};
        return {
          reqCode: r.code || '', reqTitle: r.title || '', fpName: f.name || '', ac: f.ac || '',
          actual: a.actual || '', status: a.status || '', score: a.score, evidence: a.evidence || '',
          by: a.by || '', at: a.at || ''
        };
      });
  }

  /* 每个需求的到期风险：soon = 有未完成任务命中提醒规则；overdue = 有未完成任务已超期
     口径与 reminders() 一致：工作量 >10h → 到期前 2 天，≤10h → 到期前 1 天 */
  function dueRiskMap(DB) {
    var today = DB.meta && DB.meta.demoDate;
    var map = {};
    function put(reqId, key) {
      if (!reqId) return;
      if (!map[reqId]) map[reqId] = { soon: false, overdue: false };
      map[reqId][key] = true;
    }
    function scan(items) {
      (items || []).forEach(function (x) {
        if (x.status === '已完成' || !x.end || !x.reqId) return;
        var d = diffDays(today, x.end);
        if (d < 0) put(x.reqId, 'overdue');
        else if (d <= (x.hours > 10 ? 2 : 1)) put(x.reqId, 'soon');
      });
    }
    scan(DB.devTasks);
    scan(DB.testRecords);
    return map;
  }

  /* 按阶段把需求分桶（工作台「按阶段分类」的数据源）
     返回 STAGES 顺序的桶数组，空桶也保留（由视图决定是否隐藏），每桶附聚合指标：
       count   条数
       p0      P0 条数
       blocked 门禁未通过的条数（已验收不计）
       soon    有任务即将到期的条数
       overdue 有任务已超期的条数
       ana/dev/test 该桶内需求的平均进度（无需求时为 0） */
  function stageBuckets(DB) {
    var q = queueSorted(DB);
    var risk = dueRiskMap(DB);
    return STAGES.map(function (s) {
      var list = q.filter(function (r) { return r.stage === s; });
      var n = list.length || 1;
      var sum = { ana: 0, dev: 0, test: 0 };
      var blocked = 0, soon = 0, overdue = 0, p0 = 0;
      list.forEach(function (r) {
        var p = progress(DB, r.id);
        sum.ana += p.anaProgress; sum.dev += p.devProgress; sum.test += p.testProgress;
        if (r.priority === 'P0') p0++;
        if (s !== '已验收' && !stageGate(DB, r.id).ok) blocked++;
        var k = risk[r.id];
        if (s !== '已验收' && k) { if (k.soon) soon++; if (k.overdue) overdue++; }
      });
      return {
        stage: s, reqs: list, count: list.length, p0: p0,
        blocked: blocked, soon: soon, overdue: overdue,
        ana: Math.round(sum.ana / n), dev: Math.round(sum.dev / n), test: Math.round(sum.test / n)
      };
    });
  }

  /* ==========================================================================
   * 数据看板：月度需求数量 / 部门维度 / 月度工作量（多维度）
   * 口径说明：历史月份取 DB.reqArchive（MOCK 档案）；当前演示月由在跑需求实时折算并入。
   * 本区块的所有函数只读，不写 DB，也不参与排期 / 门禁 / 达成度等既有计算。
   * ========================================================================== */

  /* 当前演示月（YYYY-MM） */
  function demoMonth(DB) { return (DB.meta && DB.meta.demoDate || '').slice(0, 7); }

  /* 把在跑需求折算成与档案同构的记录：工时取「功能点分析工时 / 开发任务工时 / 测试记录工时」，
     主系统与实施人取出现次数最多者（用于按系统 / 按人员维度拆分） */
  function liveRecords(DB) {
    var m = demoMonth(DB);
    var pick = function (counter) {
      var best = '', n = -1;
      Object.keys(counter).forEach(function (k) { if (counter[k] > n) { n = counter[k]; best = k; } });
      return best;
    };
    return (DB.requirements || []).map(function (r) {
      var fps = (DB.featurePoints || []).filter(function (f) { return f.reqId === r.id; });
      var ids = fps.map(function (f) { return f.id; });
      var ts = (DB.devTasks || []).filter(function (t) { return ids.indexOf(t.fpid) >= 0; });
      var trs = (DB.testRecords || []).filter(function (x) { return ids.indexOf(x.fpid) >= 0; });
      var sysC = {}, ownC = {};
      fps.forEach(function (f) { if (f.mainSys) sysC[f.mainSys] = (sysC[f.mainSys] || 0) + 1; });
      ts.forEach(function (t) { if (t.assignee) ownC[t.assignee] = (ownC[t.assignee] || 0) + 1; });
      return {
        id: r.id, code: r.code, month: m, source: r.source, priority: r.priority, stage: r.stage,
        sys: pick(sysC), owner: pick(ownC), live: true,
        ana: fps.reduce(function (s, f) { return s + (f.analysisHours || 0); }, 0),
        dev: ts.reduce(function (s, t) { return s + (t.hours || 0); }, 0),
        test: trs.reduce(function (s, x) { return s + (x.hours || 0); }, 0)
      };
    });
  }

  /* 看板总数据集 = 历史档案 + 在跑需求（当前月） */
  function allRecords(DB) { return (DB.reqArchive || []).concat(liveRecords(DB)); }

  /* 月份序列（升序，含当前演示月，去重） */
  function monthList(DB) {
    var set = {};
    (DB.reqArchive || []).forEach(function (h) { if (h.month) set[h.month] = true; });
    var m = demoMonth(DB);
    if (m) set[m] = true;
    return Object.keys(set).sort();
  }

  /* 月度需求数量变化：每月总数 + 环比 + 部门/优先级拆分 */
  function monthlyReqCount(DB) {
    var recs = allRecords(DB);
    var prev = 0;
    return monthList(DB).map(function (m) {
      var list = recs.filter(function (x) { return x.month === m; });
      var bySource = {}, byPriority = {};
      list.forEach(function (x) {
        bySource[x.source] = (bySource[x.source] || 0) + 1;
        byPriority[x.priority] = (byPriority[x.priority] || 0) + 1;
      });
      var row = {
        month: m, total: list.length, bySource: bySource, byPriority: byPriority,
        delta: list.length - prev, prev: prev
      };
      prev = list.length;
      return row;
    });
  }

  /* 部门维度统计：总量 / 已验收 / 在途 / 优先级构成 / 三阶段工时 */
  function deptStats(DB) {
    var recs = allRecords(DB);
    var names = [];
    recs.forEach(function (x) { if (x.source && names.indexOf(x.source) < 0) names.push(x.source); });
    var rows = names.map(function (s) {
      var list = recs.filter(function (x) { return x.source === s; });
      var count = function (p) { return list.filter(function (x) { return x.priority === p; }).length; };
      var sum = function (k) { return list.reduce(function (a, x) { return a + (x[k] || 0); }, 0); };
      var ana = sum('ana'), dev = sum('dev'), test = sum('test');
      return {
        source: s, total: list.length,
        done: list.filter(function (x) { return x.stage === '已验收'; }).length,
        doing: list.filter(function (x) { return x.stage !== '已验收'; }).length,
        p0: count('P0'), p1: count('P1'), p2: count('P2'),
        ana: ana, dev: dev, test: test, hours: ana + dev + test,
        live: list.filter(function (x) { return x.live; }).length
      };
    });
    return rows.sort(function (a, b) { return b.total - a.total || b.hours - a.hours; });
  }

  /* 工作量看板支持的维度 */
  var WORKLOAD_DIMS = [
    { key: 'stage', name: '按阶段', note: '分析 / 开发 / 测试 三阶段工时构成' },
    { key: 'source', name: '按部门', note: '按需求提出业务部门拆分工时' },
    { key: 'sys', name: '按系统', note: '按功能点主系统拆分工时' },
    { key: 'owner', name: '按人员', note: '按主要实施人拆分工时' }
  ];

  /* 月度工作量序列：支持按 阶段 / 部门 / 系统 / 人员 四个维度拆分
     返回 { dim, dimName, note, keys, colors, months:[{month, parts:[{key,hours}], total, delta}], max, grand } */
  function workloadSeries(DB, dim) {
    dim = dim || 'stage';
    var meta = WORKLOAD_DIMS.filter(function (d) { return d.key === dim; })[0] || WORKLOAD_DIMS[0];
    dim = meta.key;   // 未知维度统一回退到按阶段，避免出现无法归类的空键
    var recs = allRecords(DB);
    var months = monthList(DB);
    var totalOf = function (x) { return (x.ana || 0) + (x.dev || 0) + (x.test || 0); };

    /* 维度取键器 */
    var catOf = function (x) {
      if (dim === 'source') return x.source || '未指派部门';
      if (dim === 'sys') return x.sys || '未指定系统';
      if (dim === 'owner') return x.owner || '未指派人员';
      return null;   // 阶段维度不需要分类键
    };

    /* 键集合（阶段维度固定三键；其余按出现顺序稳定排序） */
    var keys = [];
    if (dim === 'stage') {
      keys = ['分析', '开发', '测试'];
    } else {
      recs.forEach(function (x) { var k = catOf(x); if (keys.indexOf(k) < 0) keys.push(k); });
      keys.sort();
    }
    /* 颜色：阶段维度沿用与分析/开发/测试一致的色系；其余维度循环取板 */
    var CYCLE = ['blue', 'amber', 'purple', 'green', 'teal', 'red'];
    var colors = keys.map(function (k, i) {
      if (dim === 'stage') return k === '分析' ? 'amber' : (k === '开发' ? 'blue' : 'purple');
      return CYCLE[i % CYCLE.length];
    });

    var prevTotal = 0;
    var rows = months.map(function (m) {
      var list = recs.filter(function (x) { return x.month === m; });
      var parts = keys.map(function (k, i) {
        var hours;
        if (dim === 'stage') {
          hours = list.reduce(function (s, x) {
            return s + (k === '分析' ? (x.ana || 0) : (k === '开发' ? (x.dev || 0) : (x.test || 0)));
          }, 0);
        } else {
          hours = list.filter(function (x) { return catOf(x) === k; })
            .reduce(function (s, x) { return s + totalOf(x); }, 0);
        }
        return { key: k, hours: hours, color: colors[i] };
      });
      var total = parts.reduce(function (s, p) { return s + p.hours; }, 0);
      var row = { month: m, parts: parts, total: total, delta: total - prevTotal, prev: prevTotal };
      prevTotal = total;
      return row;
    });

    var max = 1, grand = 0;
    rows.forEach(function (r) { if (r.total > max) max = r.total; grand += r.total; });
    return {
      dim: dim, dimName: meta.name, note: meta.note,
      keys: keys, colors: colors, months: rows, max: max, grand: grand
    };
  }

  /* 看板顶部 KPI */
  function dashboardKPI(DB) {
    var recs = allRecords(DB);
    var months = monthList(DB);
    var cur = months[months.length - 1] || '';
    var prevM = months.length > 1 ? months[months.length - 2] : '';
    var at = function (m) { return recs.filter(function (x) { return x.month === m; }).length; };
    var sum = function (k) { return recs.reduce(function (a, x) { return a + (x[k] || 0); }, 0); };
    var depts = deptStats(DB);
    return {
      total: recs.length,
      months: months.length,
      curMonth: cur, curCount: at(cur), prevMonth: prevM, prevCount: prevM ? at(prevM) : 0,
      delta: at(cur) - (prevM ? at(prevM) : 0),
      inFlight: (DB.requirements || []).filter(function (r) { return r.stage !== '已验收'; }).length,
      done: recs.filter(function (x) { return x.stage === '已验收'; }).length,
      deptCount: depts.length,
      topDept: depts[0] ? depts[0].source : '—',
      topDeptCount: depts[0] ? depts[0].total : 0,
      ana: sum('ana'), dev: sum('dev'), test: sum('test'), hours: sum('ana') + sum('dev') + sum('test')
    };
  }

  return {
    DAY_CAP: DAY_CAP,
    DAY_MIN: DAY_MIN,
    PRI_W: PRI_W,
    STAGES: STAGES,
    stageBuckets: stageBuckets,
    dueRiskMap: dueRiskMap,
    demoMonth: demoMonth,
    liveRecords: liveRecords,
    allRecords: allRecords,
    monthList: monthList,
    monthlyReqCount: monthlyReqCount,
    deptStats: deptStats,
    WORKLOAD_DIMS: WORKLOAD_DIMS,
    workloadSeries: workloadSeries,
    dashboardKPI: dashboardKPI,
    nextStage: nextStage,
    findById: findById,
    toDate: toDate,
    fmtDate: fmtDate,
    addDays: addDays,
    isWorkday: isWorkday,
    nextWorkday: nextWorkday,
    diffDays: diffDays,
    personLoad: personLoad,
    recommendSchedule: recommendSchedule,
    dueInfo: dueInfo,
    reminders: reminders,
    conflicts: conflicts,
    relSysWarnings: relSysWarnings,
    progress: progress,
    stageGate: stageGate,
    laneDays: laneDays,
    scheduleLanes: scheduleLanes,
    planDiff: planDiff,
    estimateDays: estimateDays,
    queueSorted: queueSorted,
    queueImpact: queueImpact,
    impactScope: impactScope,
    gradeOf: gradeOf,
    accOf: accOf,
    reqAchievement: reqAchievement,
    variance: variance,
    goalAchievement: goalAchievement,
    personRetro: personRetro,
    acceptanceLog: acceptanceLog
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = globalThis.Engine; }
