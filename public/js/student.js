/* 创见 BizLab V3 — 学生端视图 */
"use strict";

/* 交付物编辑器状态：key -> 数据对象 */
let EditorState = {};

const Editor = {
  modifiers: {
    matrix: { name: "机会评估矩阵", dims: ["市场规模与成长性", "痛点强度与频率", "付费意愿", "竞争强度（低=优）", "团队匹配度"] },
    vpc: {
      name: "价值主张画布",
      cols: [
        { key: "jobs", title: "客户任务" }, { key: "pains", title: "痛点" }, { key: "gains", title: "收益" },
        { key: "products", title: "产品与服务" }, { key: "painkillers", title: "止痛剂" }, { key: "gaincreators", title: "增益创造器" },
      ],
    },
    bmc: {
      name: "商业模式画布",
      cols: [
        { key: "keyPartners", title: "关键伙伴" }, { key: "keyActivities", title: "关键活动" }, { key: "keyResources", title: "关键资源" },
        { key: "valueProps", title: "价值主张" }, { key: "customerRelations", title: "客户关系" }, { key: "channels", title: "渠道" },
        { key: "customerSegments", title: "客户细分" }, { key: "costs", title: "成本结构" }, { key: "revenues", title: "收入来源" },
      ],
    },
  },
  noteRow(note, k, i) {
    const field = "note_" + k + "_" + i;
    return '<div class="canvas-note"><input id="' + field + '" value="' + Tool.esc(note) + '" placeholder="输入想法…" oninput="Editor.capture(\'' + k + '\',' + i + ',this.value)"></div>';
  },
  canvasHTML(type, canvas) {
    const m = this.modifiers[type];
    const c = canvas || {};
    const gridCls = type === "bmc" ? "canvas-grid bmc" : "canvas-grid";
    let html = '<div class="' + gridCls + '">';
    m.cols.forEach(col => {
      const notes = (c[col.key] || []).map((n, i) => this.noteRow(n, col.key, i)).join("");
      html += '<div class="canvas-col"><h5>' + col.title + '</h5>' + notes +
        '<button class="canvas-add" onclick="Editor.addNote(\'' + type + '\',\'' + col.key + '\')">＋ 添加</button></div>';
    });
    html += '</div>';
    return html;
  },
  addNote(type, key) {
    if (!EditorState.canvas) EditorState.canvas = {};
    if (!Array.isArray(EditorState.canvas[key])) EditorState.canvas[key] = [];
    EditorState.canvas[key].push("");
    Stage.renderEditor(App.currentCourseId, App.currentStage, App.currentStageData);
  },
  capture(key, i, val) {
    if (!EditorState.canvas) EditorState.canvas = {};
    if (!Array.isArray(EditorState.canvas[key])) EditorState.canvas[key] = [];
    EditorState.canvas[key][i] = val;
  },
  clearCanvasNotes(key) {
    if (EditorState.canvas && EditorState.canvas[key]) EditorState.canvas[key] = EditorState.canvas[key].filter(n => n && n.trim());
  },
  /* 假设清单 */
  hypRow(it, i) {
    return '<div class="panel" style="padding:12px 14px">' +
      '<div class="field"><label>假设内容（关于什么，我们相信什么）</label>' +
      '<textarea id="hyp_a_' + i + '" oninput="Editor.hyp(\'a\',' + i + ',this.value)">' + Tool.esc(it.assumption || "") + '</textarea></div>' +
      '<div class="grid-2">' +
      '<div class="field"><label>涉及画布模块</label><input id="hyp_m_' + i + '" value="' + Tool.esc(it.module || "") + '" placeholder="如：客户细分 / 收入来源" oninput="Editor.hyp(\'m\',' + i + ',this.value)"></div>' +
      '<div class="field"><label>不确定度</label><select id="hyp_u_' + i + '" onchange="Editor.hyp(\'u\',' + i + ',this.value)">' +
      ['high', 'mid', 'low'].map(u => '<option value="' + u + '"' + (it.uncertainty === u ? " selected" : "") + '>' + Tool.qa(u) + '</option>').join("") + '</select></div>' +
      '<div class="field"><label>致命度</label><select id="hyp_f_' + i + '" onchange="Editor.hyp(\'f\',' + i + ',this.value)">' +
      ['high', 'mid', 'low'].map(u => '<option value="' + u + '"' + (it.fatality === u ? " selected" : "") + '>' + Tool.qa(u) + '</option>').join("") + '</select></div>' +
      '<div class="field"><label>验证方式</label><input id="hyp_v_' + i + '" value="' + Tool.esc(it.method || "") + '" placeholder="访谈 / 落地页 / 预售 / 原型" oninput="Editor.hyp(\'v\',' + i + ',this.value)"></div>' +
      '<div class="field"><label>量化判定标准</label><input id="hyp_c_' + i + '" value="' + Tool.esc(it.criteria || "") + '" placeholder="如：转化率 ≥ 5%" oninput="Editor.hyp(\'c\',' + i + ',this.value)"></div>' +
      '</div>' +
      '<button class="btn danger sm" onclick="Editor.delHyp(' + i + ')">删除此假设</button>' +
      '</div>';
  },
  hyp(kind, i, val) {
    if (!EditorState.hypothesis) EditorState.hypothesis = { items: [], experiment: {} };
    const it = EditorState.hypothesis.items[i] || (EditorState.hypothesis.items[i] = {});
    const map = { a: "assumption", m: "module", u: "uncertainty", f: "fatality", v: "method", c: "criteria" };
    it[map[kind]] = val;
  },
  delHyp(i) {
    if (!EditorState.hypothesis) return;
    EditorState.hypothesis.items.splice(i, 1);
    Stage.renderEditor(App.currentCourseId, App.currentStage, App.currentStageData);
  },
  addHyp() {
    if (!EditorState.hypothesis) EditorState.hypothesis = { items: [], experiment: {} };
    EditorState.hypothesis.items.push({});
    Stage.renderEditor(App.currentCourseId, App.currentStage, App.currentStageData);
  },
  /* 机会评估矩阵 */
  oppRow(o, i) {
    let cells = "";
    for (let d = 0; d < 5; d++) {
      cells += '<td><input type="number" min="1" max="5" id="opp_d' + i + '_' + d + '" value="' + (o.dims ? (o.dims[d] || "") : "") +
        '" style="width:56px" oninput="Editor.opp(\'d\',' + i + ',' + d + ',this.value)"></td>';
    }
    const total = o.dims && o.dims.length === 5 ? o.dims.reduce((a, b) => a + (Number(b) || 0), 0) : 0;
    return '<tr><td><input id="opp_n' + i + '" value="' + Tool.esc(o.name || "") + '" placeholder="机会名称" style="min-width:150px" oninput="Editor.opp(\'n\',' + i + ',0,this.value)"></td>' +
      cells + '<td><b class="num" id="opp_t' + i + '">' + total + '</b></td>' +
      '<td><input type="radio" name="chosenOpp" value="' + i + '"' + (EditorState.matrix && EditorState.matrix.chosenId === i ? " checked" : "") + ' onchange="Editor.matrixChosen(' + i + ')"></td>' +
      '<td><button class="btn danger sm" onclick="Editor.delOpp(' + i + ')">删除</button></td></tr>';
  },
  opp(kind, i, d, val) {
    if (!EditorState.matrix) EditorState.matrix = { opportunities: [] };
    const o = EditorState.matrix.opportunities[i] || (EditorState.matrix.opportunities[i] = { dims: [null, null, null, null, null] });
    if (kind === "n") { o.name = val; return; }
    o.dims[d] = Number(val);
    const total = o.dims.every(x => x != null && !isNaN(x)) ? o.dims.reduce((a, b) => a + b, 0) : 0;
    const el = document.getElementById("opp_t" + i);
    if (el) el.textContent = total;
  },
  matrixChosen(i) {
    if (!EditorState.matrix) EditorState.matrix = { opportunities: [] };
    EditorState.matrix.chosenId = i;
    const el = document.getElementById("reasonWrap");
    if (el) el.style.display = "block";
  },
  matrixTotal() {
    if (!EditorState.matrix) return;
    return (EditorState.matrix.opportunities || []).map(o => (o.dims || []).reduce((a, b) => a + (Number(b) || 0), 0));
  },
  delOpp(i) {
    if (!EditorState.matrix) return;
    EditorState.matrix.opportunities.splice(i, 1);
    if (EditorState.matrix.chosenId >= EditorState.matrix.opportunities.length) EditorState.matrix.chosenId = null;
    Stage.renderEditor(App.currentCourseId, App.currentStage, App.currentStageData);
  },
  addOpp() {
    if (!EditorState.matrix) EditorState.matrix = { opportunities: [] };
    EditorState.matrix.opportunities.push({ dims: [null, null, null, null, null] });
    Stage.renderEditor(App.currentCourseId, App.currentStage, App.currentStageData);
  },
  matrixHTML(m) {
    const mm = m || { opportunities: [], chosenId: null, reason: "" };
    const rows = mm.opportunities.map((o, i) => this.oppRow(o, i)).join("");
    const heads = this.modifiers.matrix.dims.map(d => "<th>" + d + "</th>").join("");
    const hideReason = mm.chosenId == null ? " style='display:none'" : "";
    return '<p class="muted" style="margin-bottom:10px">按 5 个维度为每个候选机会打分（1–5）；总分 ≥ 18 分值得进入深挖。建议评估 2–4 个机会后横向比较。</p>' +
      '<table class="tbl" style="min-width:760px"><thead><tr><th>机会名称</th>' + heads + '<th>总分</th><th>选定</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="9" class="muted">尚未添加候选机会</td></tr>') + '</tbody></table>' +
      '<button class="btn ghost sm" style="margin-top:10px" onclick="Editor.addOpp()">＋ 添加候选机会</button>' +
      '<div class="field" id="reasonWrap"' + hideReason + ' style="margin-top:12px"><label>选择理由（为什么选它进入下一阶段）</label>' +
      '<textarea id="matrixReason" oninput="Editor.matrixReason(this.value)">' + Tool.esc(mm.reason || "") + '</textarea></div>';
  },
  matrixReason(v) {
    if (!EditorState.matrix) EditorState.matrix = { opportunities: [] };
    EditorState.matrix.reason = v;
  },
  /* 财务测算 */
  finHTML(f) {
    const p = (f && f.params) || {};
    const snapshot = Stage.financeCalc(p);
    // 参数输入行（onclick 中通过全局函数 Editor.fin 采集）
    const paramRow = (label, key, def) =>
      '<div class="field"><label>' + label + '</label><input type="number" id="fin_' + key + '" value="' + (p[key] != null ? p[key] : def) + '" oninput="Editor.fin(\'' + key + '\',this.value)"></div>';
    const m = (id, label, val, extra) => '<div class="fin-metric"><span>' + label + '</span><b id="finM_' + id + '">' + val + '</b>' + (extra || "") + '</div>';
    return '<p class="muted" style="margin-bottom:12px">录入你的商业模式关键财务参数，系统实时测算盈亏平衡点、边际贡献与 LTV/CAC 等指标。</p>' +
      '<div class="fin-grid"><div class="panel" style="margin:0"><h4>成本与定价</h4>' +
      paramRow("月固定成本（元）", "fixedCost", 10000) +
      paramRow("单位可变成本（元/单）", "unitVar", 20) +
      paramRow("客单价（元/单）", "price", 100) +
      paramRow("月销量（单/月）", "units", 200) +
      '<h4 style="margin-top:16px">获客与生命周期</h4>' +
      paramRow("获客成本 CAC（元/客户）", "cac", 150) +
      paramRow("客户生命周期价值 LTV（元/客户）", "ltv", 600) +
      '</div><div>' +
      '<div class="fin-result"><h4>实时测算指标</h4>' +
      m("revenue", "月度营收", "¥" + (snapshot.revenue || 0).toLocaleString()) +
      m("cost", "月度总成本", "¥" + (snapshot.totalCost || 0).toLocaleString()) +
      m("profit", "月度利润", "¥" + (snapshot.profit || 0).toLocaleString(), snapshot.profit >= 0 ? "" : "（亏损）") +
      m("bep", "盈亏平衡月销量", (snapshot.bep || 0).toLocaleString(), " 单/月") +
      m("margin", "边际贡献率", Tool.pct(snapshot.marginRate)) +
      m("ltv", "LTV / CAC", (snapshot.ltvCac == null ? "-" : snapshot.ltvCac.toFixed(2)), snapshot.ltvCac != null && snapshot.ltvCac >= 3 ? " ✓健康" : "") +
      '</div>' +
      '<div class="panel" style="margin-top:12px"><h4>财务结论（任务文本）</h4>' +
      '<textarea id="finText" style="min-height:110px" placeholder="说明盈亏平衡销量的含义、LTV/CAC 是否健康及调整策略、最敏感变量与三档情景结论" ' +
      'oninput="EditorState.financeText=this.value">' + Tool.esc((f && f.financeText) || "") + '</textarea></div>' +
      '</div></div>';
  },
  fin(key, val) {
    if (!EditorState.finance) EditorState.finance = { params: {}, financeText: "" };
    EditorState.finance.params[key] = Number(val);
    // 实时刷新指标
    const snap = Stage.financeCalc(EditorState.finance.params);
    const set = (id, txt) => { const el = document.getElementById("finM_" + id); if (el) el.textContent = txt; };
    set("revenue", "¥" + snap.revenue.toLocaleString());
    set("cost", "¥" + snap.totalCost.toLocaleString());
    set("profit", "¥" + snap.profit.toLocaleString() + (snap.profit < 0 ? "（亏损）" : ""));
    set("bep", (snap.bep == null ? "-" : snap.bep.toLocaleString()) + " 单/月");
    set("margin", snap.marginRate != null ? (Math.round(snap.marginRate * 1000) / 10) + "%" : "-");
    set("ltv", snap.ltvCac == null ? "-" : snap.ltvCac.toFixed(2) + (snap.ltvCac >= 3 ? " ✓健康" : ""));
  },
};

const Stage = {
  financeCalc(p) {
    const fixed = Number(p.fixedCost) || 0, unit = Number(p.unitVar) || 0, price = Number(p.price) || 0;
    const units = Number(p.units) || 0, cac = Number(p.cac) || 0, ltv = Number(p.ltv) || 0;
    const revenue = price * units;
    const totalCost = fixed + unit * units;
    const profit = revenue - totalCost;
    const contrib = price - unit;
    const bep = contrib > 0 ? Math.ceil(fixed / contrib) : null;
    const marginRate = price > 0 ? contrib / price : 0;
    const ltvCac = (cac > 0 && ltv > 0) ? ltv / cac : null;
    return { revenue, totalCost, profit, bep, marginRate, ltvCac };
  },
  planSections: ["execSummary", "company", "product", "market", "marketing", "operations", "team", "finance", "risk"],
  planNames: { execSummary: "执行摘要", company: "公司概述", product: "产品与服务", market: "市场分析", marketing: "营销与销售", operations: "运营计划", team: "管理团队", finance: "财务计划", risk: "风险与融资需求" },
  planHTML(p) {
    const s = (p && p.sections) || {};
    return '<p class="muted" style="margin-bottom:12px">按九节结构撰写商业计划书，提交后教师按节批阅。建议每节先列要点再成文。</p>' +
      '<div class="grid-2">' + this.planSections.map(k =>
      '<div class="field"><label>' + this.planNames[k] + '</label><textarea style="min-height:120px" data-plan="' + k + '" placeholder="填写 ' + this.planNames[k] + ' 内容…">' +
      Tool.esc(s[k] || "") + '</textarea></div>').join("") + '</div>';
  },
  hypHTML(h) {
    const hh = h || { items: [], experiment: {} };
    const rows = hh.items.map((it, i) => Editor.hypRow(it, i)).join("");
    const ex = hh.experiment || {};
    const f = (k, label, ph) => '<div class="field"><label>' + label + '</label><input id="hyp_ex_' + k + '" value="' + Tool.esc(ex[k] || "") + '" placeholder="' + ph + '" oninput="Stage.hypExp(\'' + k + '\',this.value)"></div>';
    return '<p class="muted" style="margin-bottom:10px">从商业模式画布提取最关键的假设，标记不确定度与致命度，并设计一个 MVP 验证实验。</p>' +
      (rows || '<div class="empty">尚未添加假设</div>') +
      '<button class="btn ghost sm" style="margin:8px 0" onclick="Editor.addHyp()">＋ 添加假设</button>' +
      '<div class="panel" style="margin-top:10px"><h4>MVP 验证实验设计</h4><div class="grid-2">' +
      f("form", "实验形式", "落地页 / 访谈 / 预售 / 原型") +
      f("sample", "样本量", "如：50 名目标用户") +
      f("criteria", "量化判定标准", "如：转化率 ≥ 5% 则假设成立") +
      f("schedule", "时间表", "如：2 周内完成") +
      f("metric", "1 个核心行为指标", "如：注册完成率") +
      '</div></div>';
  },
  hypExp(k, v) {
    if (!EditorState.hypothesis) EditorState.hypothesis = { items: [], experiment: {} };
    if (!EditorState.hypothesis.experiment) EditorState.hypothesis.experiment = {};
    EditorState.hypothesis.experiment[k] = v;
  },
  /* 从 DOM 收集所有编辑器内容 */
  collect() {
    const st = stageState.deliverable;
    let taskText = "";
    const tt = document.getElementById("stageTaskText");
    if (tt) taskText = tt.value;
    const payload = { taskText, confirm: !!stageState.confirm };
    if (st === "matrix") {
      const opps = (EditorState.matrix && EditorState.matrix.opportunities) || [];
      payload.matrix = {
        opportunities: opps.map((o, idx) => ({ id: (o.id != null ? o.id : idx), name: o.name || "", dims: (o.dims || []).map(d => Number(d) || 0) })),
        chosenId: EditorState.matrix ? EditorState.matrix.chosenId : null,
        reason: EditorState.matrix ? (EditorState.matrix.reason || "") : "",
      };
    } else if (st === "vpc" || st === "bmc") {
      const mod = Editor.modifiers[st];
      const canvas = {};
      mod.cols.forEach(c => { canvas[c.key] = (EditorState.canvas && EditorState.canvas[c.key] || []).map(s => (s || "").trim()).filter(Boolean); });
      payload.canvas = canvas;
    } else if (st === "hypothesis") {
      const items = (EditorState.hypothesis && EditorState.hypothesis.items || []).map(it => ({
        assumption: it.assumption || "", module: it.module || "", uncertainty: it.uncertainty || "mid",
        fatality: it.fatality || "mid", method: it.method || "", criteria: it.criteria || "",
      }));
      const ex = (EditorState.hypothesis && EditorState.hypothesis.experiment) || {};
      payload.hypothesis = { items, experiment: { form: ex.form || "", sample: ex.sample || "", criteria: ex.criteria || "", schedule: ex.schedule || "", metric: ex.metric || "" } };
    } else if (st === "finance") {
      const params = (EditorState.finance && EditorState.finance.params) || {};
      payload.finance = { params: { fixedCost: Number(params.fixedCost) || 0, unitVar: Number(params.unitVar) || 0, price: Number(params.price) || 0, units: Number(params.units) || 0, cac: Number(params.cac) || 0, ltv: Number(params.ltv) || 0 } };
      const ft = document.getElementById("finText");
      payload.finance.financeText = ft ? ft.value : ((EditorState.finance && EditorState.finance.financeText) || "");
    } else if (st === "plan") {
      const sections = {};
      document.querySelectorAll("[data-plan]").forEach(el => { sections[el.dataset.plan] = el.value; });
      payload.plan = { sections };
    }
    return payload;
  },
  renderEditor(courseId, stage, stageData) {
    const wrap = document.getElementById("editorWrap");
    if (!wrap) return;
    wrap.innerHTML = Stage.editorHTML(stage, stageData);
  },
  editorHTML(stage, stageData) {
    // 从 EditorState 读取当前编辑数据（无历史则为空模板）
    let editorHtml;
    switch (stage.deliverable) {
      case "matrix": editorHtml = Editor.matrixHTML(EditorState.matrix || null); break;
      case "vpc": case "bmc": editorHtml = Editor.canvasHTML(stage.deliverable, EditorState.canvas || null); break;
      case "hypothesis": editorHtml = Stage.hypHTML(EditorState.hypothesis || null); break;
      case "finance": editorHtml = Editor.finHTML(EditorState.finance || null); break;
      case "plan": editorHtml = Stage.planHTML(EditorState.plan || null); break;
      default: editorHtml = "";
    }
    const historyText = stageData && stageData.submissions && stageData.submissions[0] && stageData.submissions[0].versions ?
      stageData.submissions[0].versions[stageData.submissions[0].versions.length - 1].taskText : "";
    const curText = (EditorState && typeof EditorState.taskText === "string") ? EditorState.taskText : historyText;
    return '<div class="field"><label>实训任务文本（任务 1/2 的作答说明与结论）</label>' +
      '<textarea id="stageTaskText" oninput="EditorState.taskText=this.value" placeholder="填写任务作答内容…">' + Tool.esc(curText) + '</textarea></div>' + editorHtml;
  },
  renderContent(deliverable, version) {
    /* 只读渲染已提交内容（教师/历史查看） */
    const v = version || {};
    let body = '';
    if (deliverable === "matrix" && v.matrix) {
      const m = v.matrix;
      body = '<table class="tbl" style="min-width:600px"><thead><tr><th>机会名称</th>' + Editor.modifiers.matrix.dims.map(d => '<th>' + d + '</th>').join("") + '<th>总分</th></tr></thead><tbody>' +
        m.opportunities.map(o => '<tr><td>' + Tool.esc(o.name) + '</td>' + o.dims.map(d => '<td class="num">' + d + '</td>').join("") + '<td class="num"><b>' + o.dims.reduce((a, b) => a + (Number(b) || 0), 0) + '</b></td></tr>').join("") +
        '</tbody></table><p style="margin-top:8px"><b>选定机会：</b>' + Tool.esc((m.opportunities[m.chosenId] && m.opportunities[m.chosenId].name) || "未选定") + '</p>' +
        (m.reason ? '<p><b>选择理由：</b>' + Tool.nl2br(m.reason) + '</p>' : "");
    } else if ((deliverable === "vpc" || deliverable === "bmc") && v.canvas) {
      const mod = Editor.modifiers[deliverable];
      const grid = deliverable === "bmc" ? "canvas-grid bmc" : "canvas-grid";
      body = '<div class="' + grid + '">' + mod.cols.map(c =>
        '<div class="canvas-col"><h5>' + c.title + '</h5>' + (v.canvas[c.key] || []).map(n => '<div class="canvas-note">' + Tool.esc(n) + '</div>').join("") + '</div>').join("") + '</div>';
    } else if (deliverable === "hypothesis" && v.hypothesis) {
      const h = v.hypothesis;
      body = '<table class="tbl"><thead><tr><th>假设内容</th><th>画布模块</th><th>不确定度</th><th>致命度</th><th>验证方式</th><th>量化判定</th></tr></thead><tbody>' +
        (h.items || []).map(it => '<tr><td>' + Tool.esc(it.assumption || "") + '</td><td>' + Tool.esc(it.module || "") + '</td><td>' + Tool.qa(it.uncertainty) + '</td><td>' + Tool.qa(it.fatality) + '</td><td>' + Tool.esc(it.method || "") + '</td><td>' + Tool.esc(it.criteria || "") + '</td></tr>').join("") +
        '</tbody></table>' + (h.experiment && h.experiment.form ? '<p style="margin-top:8px"><b>MVP 实验：</b>' +
        [["形式", h.experiment.form], ["样本量", h.experiment.sample], ["量化判定", h.experiment.criteria], ["时间表", h.experiment.schedule], ["核心指标", h.experiment.metric]]
          .map(x => x[1] ? x[0] + "：" + Tool.esc(x[1]) : "").filter(Boolean).join(" ｜ ") + '</p>' : "");
    } else if (deliverable === "finance" && v.finance) {
      const f = v.finance;
      const snap = Stage.financeCalc(f.params || {});
      body = '<div class="fin-grid"><div class="panel" style="margin:0"><h4>录入参数</h4>' +
        '<div class="plain-pre">' + [["月固定成本", f.params.fixedCost + " 元"], ["单位可变成本", f.params.unitVar + " 元"], ["客单价", f.params.price + " 元"], ["月销量", f.params.units + " 单"], ["CAC", f.params.cac + " 元"], ["LTV", f.params.ltv + " 元"]]
          .map(x => x[0] + "：<b>" + x[1] + "</b>").join("<br>") + '</div></div>' +
        '<div class="fin-result"><h4>测算结果</h4>' +
        '<div class="fin-metric"><span>月度营收</span><b>¥' + snap.revenue.toLocaleString() + '</b></div>' +
        '<div class="fin-metric"><span>月度利润</span><b>¥' + snap.profit.toLocaleString() + '</b></div>' +
        '<div class="fin-metric"><span>盈亏平衡月销量</span><b>' + (snap.bep == null ? "-" : snap.bep.toLocaleString()) + ' 单</b></div>' +
        '<div class="fin-metric"><span>LTV/CAC</span><b>' + (snap.ltvCac == null ? "-" : snap.ltvCac.toFixed(2)) + '</b></div></div></div>' +
        (f.financeText ? '<p style="margin-top:10px"><b>财务结论：</b>' + Tool.nl2br(f.financeText) + '</p>' : "");
    } else if (deliverable === "plan" && v.plan) {
      body = '<div class="grid-2">' + Stage.planSections.map(k => {
        const txt = (v.plan.sections || {})[k] || "";
        return txt ? '<div class="panel" style="margin:0"><h4>' + Stage.planNames[k] + '</h4><div class="plain-pre">' + Tool.esc(txt) + '</div></div>' : "";
      }).join("") + '</div>';
    } else {
      body = "";
    }
    return '<p><b>任务文本：</b>' + Tool.nl2br(v.taskText || "") + '</p>' + body;
  },
  quizHTML(stage, quizOnly) {
    const q = (stage.quiz || []).map((item, i) =>
      '<div class="quiz-q"><div class="qq">' + (i + 1) + '. ' + Tool.esc(item.q) + '</div><div class="opts">' +
      item.opts.map((o, oi) => '<label class="opt" data-q="' + i + '" onclick="Quiz.pick(this,' + i + ',' + oi + ')"><span>' + oi + '.</span><span>' + Tool.esc(o) + '</span></label>').join("") +
      '</div></div>').join("");
    const last = quizOnly || null;
    const lastBox = last ? '<div class="quiz-result"><b>上次练习：</b>' + last.score + '/' + last.total + ' 题 (正确率 ' + (last.total ? Math.round((last.score / last.total) * 100) : 0) + '%)</div>' : "";
    return '<p class="muted" style="margin-bottom:10px">阶段自测 · 练习模式：交卷后即时反馈对错与解析，不记入成绩。可多次练习。</p>' +
      (q || '<div class="empty">本阶段暂无自测题</div>') +
      (q ? '<button class="btn block" style="margin-top:12px" onclick="Quiz.submit()">交卷查看结果</button>' : "") + lastBox;
  },
};

const Quiz = {
  sel: {},
  answers: [],
  pick(el, qi, oi) {
    Quiz.sel[qi] = oi;
    document.querySelectorAll('.quiz-q .opt[data-q="' + qi + '"]').forEach(o => o.classList.remove("sel"));
    el.classList.add("sel");
  },
  async submit() {
    const stage = App.currentStage;
    const n = (stage.quiz || []).length;
    const answers = [];
    for (let i = 0; i < n; i++) {
      if (Quiz.sel[i] == null) { App.toast("请完成第 " + (i + 1) + " 题再交卷"); return; }
      answers.push(Quiz.sel[i]);
    }
    const btn = document.querySelector("#quizZone button.btn");
    if (btn) { btn.disabled = true; btn.textContent = "判分中…"; }
    try {
      const d = await Api.post("/api/courses/" + App.currentCourseId + "/stages/" + stage.id + "/quiz", { answers });
      Quiz.showResult(stage, d);
    } catch (e) { App.toast(e.message); if (btn) { btn.disabled = false; btn.textContent = "交卷查看结果"; } }
  },
  showResult(stage, d) {
    const zone = document.getElementById("quizZone");
    const answers = Quiz.sel;
    let html = '<div class="quiz-result"><h4>本次练习：' + d.score + '/' + d.total + ' 题正确（' + Math.round((d.score / d.total) * 100) + '%）</h4>';
    stage.quiz.forEach((item, i) => {
      const r = d.results[i];
      html += '<div class="quiz-q"><div class="qq">' + (i + 1) + '. ' + Tool.esc(item.q) + '</div><div class="opts">' +
        item.opts.map((o, oi) => {
          let cls = "opt";
          if (oi === r.answerI) cls += " correct";
          else if (oi === answers[i]) cls += " wrong";
          return '<div class="' + cls + '"><span>' + oi + '.</span><span>' + Tool.esc(o) + (oi === r.answerI ? ' <span class="tag y">正确答案</span>' : "") + (oi === answers[i] && oi !== r.answerI ? ' <span class="tag n">你的选择</span>' : "") + '</span></div>';
        }).join("") + '</div>' +
        (r.correct ? "" : '<div class="explain"><b>解析：</b>' + Tool.esc(r.explain) + '</div>') + '</div>';
    });
    html += '<button class="btn ghost sm" onclick="App.go(\'stage\',\'' + App.currentCourseId + '\',\'' + stage.id + '\')">重做一次</button></div>';
    zone.innerHTML = html;
  },
};

const Student = {
  async courses() {
    const d = await Api.get("/api/courses");
    const cards = (d.courses || []).map(c =>
      '<div class="card"><h3>' + Tool.esc(c.title) + '</h3><div class="meta"><span>👨‍🏫 ' + Tool.esc(c.teacher) + '</span><span>六阶段 · ' + c.stages + ' 个</span></div>' +
      '<div class="desc">' + Tool.esc(c.desc || "（无简介）") + '</div><div class="meta">' +
      '<span>已完成 ' + c.submitted + '/' + c.stages + '</span><span>通过 ' + c.approved + '</span></div>' +
      '<div class="row-actions"><button class="btn sm" onclick="App.go(\'course\',\'' + c.id + '\')">进入学习</button></div></div>').join("");
    return '<div class="page-head"><h2>我的课程</h2><p>通过教师提供的邀请码加入实训课程。</p></div>' +
      '<form class="inline-form" onsubmit="return Student.join(event)"><input id="inviteCode" placeholder="输入课程邀请码，如 AB1234" required><button class="btn">加入课程</button></form>' +
      (cards ? '<div class="cards">' + cards + '</div>' : '<div class="empty"><div class="big">📚</div>还没有加入任何课程</div>');
  },
  async join(e) {
    e.preventDefault();
    try {
      const d = await Api.post("/api/courses/join", { code: document.getElementById("inviteCode").value.trim() });
      App.toast(d.title ? "已加入课程：" + d.title : "你已在该课程中");
      App.currentCourseId = d.courseId;
      App.go("course", d.courseId);
    } catch (err) { App.toast(err.message); }
  },
  async course(courseId) {
    const d = await Api.get("/api/courses/" + courseId);
    const c = d.course;
    const cards = (d.stages || []).map(s => {
      const cls = "stage-card";
      const warn = s.gateWarning ? '<div class="warn">⚠ 建议先完成上一阶段再开始本阶段（不作强制拦截）</div>' : "";
      return '<div class="stage-card" style="--sc:' + s.color + '"><span class="sb">阶段 ' + s.id + '</span>' +
        '<h3>' + Tool.esc(s.name) + '</h3><div class="brief">' + Tool.esc(s.brief || "") + '</div>' + warn +
        '<div class="foot"><span class="muted">' + Tool.deliverName(s.deliverable) + ' · ' + s.taskCount + ' 项任务</span>' +
        '<button class="btn sm" onclick="App.go(\'stage\',\'' + courseId + '\',\'' + s.id + '\')">' + (s.submitted ? "继续学习" : "开始学习") + '</button></div>' +
        '<div class="foot" style="margin-top:6px"><span class="status">' + Tool.statusBadge(s.status) + (s.score != null ? ' <b class="num">' + s.score + ' 分</b>' : "") + '</span></div></div>';
    }).join("");
    return '<div class="page-head"><h2>' + Tool.esc(c.title) + '</h2><p>授课教师：' + Tool.esc(c.teacher) + '</p></div>' +
      '<div class="toolbar"><button class="btn ghost sm" onclick="App.go(\'courses\')">← 返回课程列表</button><button class="btn ghost sm" onclick="Student.history(\'' + courseId + '\')">我的提交历史</button></div>' +
      '<div class="stage-row">' + cards + '</div>';
  },
  async history(courseId) {
    const d = await Api.get("/api/courses/" + courseId + "/mysubmissions");
    const rows = (d.submissions || []).map(s => {
      const stage = null;
      return '<tr><td>阶段 ' + s.stageId + '</td><td>' + Tool.statusBadge(s.status) + '</td><td class="num">' + Tool.scoreCell(s) + '</td>' +
        '<td class="num">v' + s.versionCount + '</td><td>' + Tool.fmtTime(s.submittedAt) + '</td>' +
        '<td>' + (s.feedback ? '<button class="btn ghost sm" onclick="Student.feedback(\'' + JSON.stringify(s.feedback).replace(/"/g, "&quot;") + '\')">查看评语</button><br><span class="muted">' + Tool.fmtTime(s.gradedAt) + '</span>' : '-') + '</td></tr>';
    }).join("");
    return '<div class="page-head"><h2>我的提交历史</h2></div>' +
      '<div class="toolbar"><button class="btn ghost sm" onclick="App.go(\'course\',\'' + courseId + '\')">← 返回</button></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>阶段</th><th>状态</th><th>分数</th><th>版本</th><th>提交时间</th><th>教师评语</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6" class="empty">还没有任何提交</td></tr>') + '</tbody></table></div>';
  },
  feedback(fb) {
    App.modal("<h3>教师评语</h3><div class='plain-pre'>" + Tool.esc(fb) + "</div><div class='m-foot'><button class='btn' onclick='App.closeModal()'>关闭</button></div>");
  },
  async stage(courseId, stageId) {
    // 重新拉取课程详情以拿到最新状态与阶段内容
    const d = await Api.get("/api/courses/" + courseId);
    const stage = (d.stages || []).find(s => String(s.id) === String(stageId));
    const c = d.course;
    if (!stage) { App.toast("阶段不存在"); App.go("course", courseId); return; }
    const mysubs = d.quizOnly;
    const q = mysubs[stage.id] || null;

    const quizZoneId = "quizZone";
    const editorWrapId = "editorWrap";
    const subStatus = stage.status;
    const hist = await (async () => {
      try { const h = await Api.get("/api/courses/" + courseId + "/mysubmissions"); return h.submissions.find(s => s.stageId === Number(stageId)); }
      catch (e) { return null; }
    })();
    App.currentStage = stage;
    App.currentStageData = { quizOnly: d, submissions: hist ? [hist] : [] };

    const btnLabel = subStatus === "submitted" ? "重新提交（已提交待批改）" : subStatus === "revise" ? "修改后重新提交" : "提交本阶段成果";
    const warn = stage.gateWarning ? '<div class="warn">⚠ 你尚未提交上一阶段成果。建议先完成上一阶段，当前阶段仍可正常提交（软门控）。</div>' : "";

    return '<div class="page-head"><h2>' + Tool.esc(c.title) + ' · 阶段 ' + stage.id + ' ' + Tool.esc(stage.name) + '</h2>' +
      '<p>交付物：' + Tool.deliverName(stage.deliverable) + ' ｜ 状态：' + Tool.statusBadge(stage.status) +
      (stage.score != null ? ' ｜ 成绩：<b class="num">' + stage.score + '</b>/100' : "") + '</p></div>' +
      '<div class="toolbar"><button class="btn ghost sm" onclick="App.go(\'course\',\'' + courseId + '\')">← 返回课程</button>' +
      '<button class="btn ghost sm" id="showVerBtn" onclick="Student.showVersions(\'' + courseId + '\',' + stageId + ')">查看提交版本历史</button></div>' + warn +

      '<div class="panel"><h3>📖 知识精讲</h3><ul class="knowledge">' +
      (stage.knowledge || []).map(k => '<li>' + Tool.esc(k) + '</li>').join("") + '</ul></div>' +

      (stage.tools ? '<div class="panel"><h3>🛠 实战工具</h3><div class="tool-box">' + Tool.nl2br(stage.tools) + '</div></div>' : "") +

      '<div class="panel"><h3>📋 实训任务</h3>' +
      '<ol>' + (stage.tasks || []).map(t => '<li style="margin-bottom:8px">' + Tool.esc(t) + '</li>').join("") + '</ol>' +
      '<hr style="border:none;border-top:1px solid var(--line);margin:14px 0">' +
      '<div id="' + editorWrapId + '"></div>' +
      '</div>' +

      '<div class="panel"><h3>📤 提交</h3>' +
      (subStatus === "submitted" ? '<div class="diff-old">你的提交已送达教师，等待批改。再次提交会创建新版本并覆盖待批状态。</div>' : "") +
      '<button class="btn block" style="margin-top:6px" onclick="Student.submit(\'' + courseId + '\',' + stageId + ')">' + btnLabel + '</button>' +
      (hist && hist.feedback ? '<div class="panel" style="margin-top:12px"><h4>最近一次教师评语</h4><div class="plain-pre">' + Tool.esc(hist.feedback) + '</div>' +
        (hist.gradedAt ? '<p class="muted">批改时间：' + Tool.fmtTime(hist.gradedAt) + '（打回修改请勿直接覆盖原成绩 —— 系统已要求二次确认）</p>' : "") + '</div>' : "") +
      '</div>' +

      '<div class="panel" id="' + quizZoneId + '"><h3>✏️ 阶段自测（练习）</h3>' + Stage.quizHTML(stage, q) + '</div>';

    // 渲染器在 DOM 挂载后填充
  },
  async showVersions(courseId, stageId) {
    try {
      const h = await Api.get("/api/courses/" + courseId + "/mysubmissions");
      const sub = h.submissions.find(s => s.stageId === Number(stageId));
      if (!sub || !sub.versions.length) { App.toast("还没有版本记录"); return; }
      const st = App.currentStage;
      let html = "<h3>提交版本历史（共 " + sub.versions.length + " 版）</h3>";
      sub.versions.slice().reverse().forEach((v, idx) => {
        const current = idx === 0;
        html += '<div class="version-item"><b>v' + v.version + '</b> ' + Tool.fmtTime(v.at) +
          (sub.reviewedVersion === v.version ? ' <span class="badge brand">教师评阅版本</span>' : "") +
          (current ? ' <span class="badge passed">最新</span>' : "") +
          (v.quiz ? ' <span class="muted">练习：' + v.quiz.score + '/' + v.quiz.total + '</span>' : "") +
          '</div>' +
          (idx === 1 && sub.reviewedVersion != null && sub.reviewedVersion !== v.version ? '<div class="diff-old">此版本提交于教师评阅（v' + sub.reviewedVersion + '）之后，成绩已清空待重新批改（M3 重提交保护）。</div>' : '') +
          '<div class="plain-pre" style="margin:8px 0 14px">' + Stage.renderContent(st.deliverable, v) + '</div>';
      });
      App.modal(html + "<div class='m-foot'><button class='btn' onclick='App.closeModal()'>关闭</button></div>");
    } catch (e) { App.toast(e.message); }
  },
  async submit(courseId, stageId) {
    const stage = App.currentStage;
    const payload = Stage.collect();
    try {
      const d = await Api.post("/api/courses/" + courseId + "/stages/" + stageId + "/submit", payload);
      if (d.gate && d.gate.warning) App.toast("提交成功！注意：你尚未提交前置阶段 " + d.gate.prevStageName + "，建议补齐以获得完整实训体验。");
      else App.toast("提交成功（v" + d.submission.versionCount + "）");
      App.go("stage", courseId, stageId);
    } catch (err) {
      if (err.code === "NEEDS_CONFIRM") {
        if (confirm("本次提交将覆盖教师已给出的成绩与评语（成绩清空待重新批改）。确定继续吗？")) {
          stageState.confirm = true;
          try {
            const d = await Api.post("/api/courses/" + courseId + "/stages/" + stageId + "/submit", Object.assign({}, payload, { confirm: true }));
            App.toast("已确认覆盖并重新提交（v" + d.submission.versionCount + "），等待教师重新批改");
            App.go("stage", courseId, stageId);
          } catch (e2) { App.toast(e2.message); }
        }
      } else App.toast(err.message);
    }
  },
};

let stageState = { deliverable: null, confirm: false };
const App = {
  user: null,
  role: null,
  currentCourseId: null,
  currentStage: null,
  currentStageData: null,
  async init() {
    try {
      const d = await Api.get("/api/auth/me");
      App.user = d.user;
      App.role = d.user.role;
      document.getElementById("ubName").textContent = d.user.name || d.user.account;
      document.getElementById("ubAcct").textContent = d.user.account + "（" + (d.user.role === "teacher" ? "教师" : d.user.role === "admin" ? "管理员" : "学生") + "）";
      App.renderNav();
      const route = (location.hash || "#courses").slice(1);
      App.dispatch(route);
    } catch (e) {
      location.href = "/index.html";
    }
  },
  renderNav() {
    const nav = document.getElementById("sideNav");
    const items = [];
    if (App.role === "student") {
      items.push(["courses", "📚 我的课程"], ["cases", "📁 案例库"]);
    } else if (App.role === "teacher") {
      items.push(["tcourses", "📚 课程管理"], ["treviewAll", "📝 评阅中心"], ["tcases", "📁 案例库"]);
    } else if (App.role === "admin") {
      items.push(["ateachers", "👩‍🏫 教师账号"]);
    }
    items.push(["account", "⚙️ 账号设置"]);
    nav.innerHTML = items.map(it => '<button class="nav-item" id="nav_' + it[0] + '" onclick="App.go(\'' + it[0] + '\')">' + it[1] + '</button>').join("");
  },
  setNav(active) {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("on"));
    const el = document.getElementById("nav_" + active);
    if (el) el.classList.add("on");
  },
  go(view, param1, param2) {
    location.hash = "#" + view + (param1 ? "/" + param1 : "") + (param2 ? "/" + param2 : "");
    App.dispatch(view + (param1 ? "/" + param1 : "") + (param2 ? "/" + param2 : ""));
  },
  async dispatch(route) {
    const main = document.getElementById("main");
    const [view, p1, p2] = route.split("/");
    App.setNav(view === "course" || view === "stage" ? "courses" : view === "tcourse" ? "tcourses" : view);
    try {
      if (App.role === "student") {
        if (view === "courses" || view === "course") { main.innerHTML = '<div class="empty">加载中…</div>'; main.innerHTML = view === "courses" ? await Student.courses() : await Student.course(p1); }
        else if (view === "cases") { main.innerHTML = await Common.cases(false); }
        else if (view === "stage") {
          App.currentCourseId = p1;
          const html = await Student.stage(p1, p2);
          main.innerHTML = html;
          // 初始化编辑器状态（从最近一次版本回填）
          const st = App.currentStage;
          stageState.deliverable = st.deliverable;
          stageState.confirm = false;
          EditorState = {};
          const sub = ((App.currentStageData && App.currentStageData.submissions) || [])[0];
          const v = sub && sub.versions && sub.versions.length ? sub.versions[sub.versions.length - 1] : null;
          if (v) {
            EditorState.taskText = v.taskText || "";
            if (st.deliverable === "matrix" && v.matrix) EditorState.matrix = JSON.parse(JSON.stringify(v.matrix));
            if ((st.deliverable === "vpc" || st.deliverable === "bmc") && v.canvas) EditorState.canvas = JSON.parse(JSON.stringify(v.canvas));
            if (st.deliverable === "hypothesis" && v.hypothesis) EditorState.hypothesis = JSON.parse(JSON.stringify(v.hypothesis));
            if (st.deliverable === "finance" && v.finance) EditorState.finance = JSON.parse(JSON.stringify(v.finance));
            if (st.deliverable === "plan" && v.plan) EditorState.plan = JSON.parse(JSON.stringify(v.plan));
          }
          Stage.renderEditor(p1, st, App.currentStageData);
        }
      } else if (App.role === "teacher") {
        if (view === "tcourses" || view === "tcourse") { main.innerHTML = view === "tcourses" ? await Teacher.courses() : await Teacher.course(p1); }
        else if (view === "treviewAll") { main.innerHTML = await Teacher.reviewAll(); }
        else if (view === "tcases") { main.innerHTML = await Teacher.cases(); }
      } else if (App.role === "admin") {
        if (view === "ateachers") { main.innerHTML = await Admin.teachers(); }
      }
      if (view === "account") main.innerHTML = App.accountHTML();
    } catch (e) {
      if (e.status === 401) { location.href = "/index.html"; return; }
      main.innerHTML = '<div class="empty"><div class="big">⚠</div>' + Tool.esc(e.message) + '</div>';
    }
  },
  accountHTML() {
    return '<div class="page-head"><h2>账号设置</h2></div>' +
      '<div class="cards"><div class="card" style="max-width:420px"><h3>修改密码</h3><form class="field" onsubmit="return App.changePwd(event)">' +
      '<div class="field"><label>原密码</label><input id="op" type="password" required></div>' +
      '<div class="field"><label>新密码（6–64 位）</label><input id="np" type="password" required></div>' +
      '<div class="field"><label>确认新密码</label><input id="np2" type="password" required></div>' +
      '<button class="btn block">保存新密码</button></form></div></div>';
  },
  async changePwd(e) {
    e.preventDefault();
    const np = document.getElementById("np").value, np2 = document.getElementById("np2").value;
    if (np !== np2) { App.toast("两次输入的新密码不一致"); return; }
    try {
      await Api.post("/api/auth/password", { oldPassword: document.getElementById("op").value, newPassword: np });
      App.toast("密码已修改");
      document.getElementById("op").value = document.getElementById("np").value = document.getElementById("np2").value = "";
    } catch (err) { App.toast(err.message); }
  },
  async cases(teacher) {
    return await Common.cases(teacher);
  },
  logout() {
    Api.post("/api/auth/logout").catch(() => {});
    Api.setToken("");
    location.href = "/index.html";
  },
  toast(msg) {
    const old = document.getElementById("toastBox");
    if (old) old.remove();
    const div = document.createElement("div");
    div.id = "toastBox";
    div.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#111c33;color:#fff;padding:10px 18px;border-radius:10px;font-size:13.5px;z-index:99;box-shadow:0 8px 30px rgba(0,0,0,.25);max-width:80%";
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3200);
  },
  modal(html) {
    document.getElementById("modalBox").innerHTML = html;
    document.getElementById("modalMask").classList.add("show");
  },
  closeModal() {
    document.getElementById("modalMask").classList.remove("show");
  },
};

/* 公共：案例库浏览 */
const Common = {
  async cases(manage) {
    const d = await Api.get("/api/cases");
    const cards = (d.cases || []).map(c =>
      '<div class="card"><h3>' + Tool.esc(c.title) + '</h3><div class="meta"><span>行业：' + Tool.esc(c.industry || "未归类") + '</span>' +
      (c.stage ? '<span>适配阶段 ' + c.stage + '</span>' : '') + '</div><div class="desc">' + (c.insights ? '<b>要点：</b>' + Tool.esc(c.insights.slice(0, 80)) : "（无要点摘要）") + '</div>' +
      '<div class="row-actions"><button class="btn ghost sm" onclick="Common.viewCase(\'' + c.id + '\')">查看案例</button>' +
      (manage ? '<button class="btn danger sm" onclick="Teacher.delCase(\'' + c.id + '\')">删除</button>' : '') + '</div></div>').join("");
    const head = manage ? '<h2>案例库管理</h2><p>维护供学生研读的商业模式案例。</p>' : '<h2>案例库</h2><p>研读真实与模拟案例，理解六阶段方法在实际中的应用。</p>';
    return '<div class="page-head">' + head + '</div>' +
      (manage ? '<button class="btn sm" onclick="Teacher.newCase()">＋ 新建案例</button>' : '') +
      '<div class="cards" style="margin-top:16px">' + (cards || '<div class="empty">暂无案例</div>') + '</div>';
  },
  viewCase(id) {
    Api.get("/api/cases").then(d => {
      const c = (d.cases || []).find(x => x.id === id);
      if (!c) return;
      App.modal("<h3>" + Tool.esc(c.title) + "</h3>" +
        '<p class="muted">行业：' + Tool.esc(c.industry || "未归类") + (c.stage ? " ｜ 适配阶段 " + c.stage : "") + '</p>' +
        '<div class="plain-pre" style="max-height:50vh;overflow:auto">' + Tool.esc(c.body) + '</div>' +
        (c.insights ? '<h4 style="margin-top:10px">教学要点</h4><div class="plain-pre">' + Tool.esc(c.insights) + '</div>' : "") +
        "<div class='m-foot'><button class='btn' onclick='App.closeModal()'>关闭</button></div>");
    });
  },
};

/* 页面就绪 */
document.addEventListener("DOMContentLoaded", () => {
  if (location.pathname.endsWith("app.html")) App.init();
});