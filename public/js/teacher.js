/* 创见 BizLab V3 — 教师端 + 管理员端视图 */
"use strict";

const Teacher = {
  async courses() {
    const d = await Api.get("/api/teacher/courses");
    const cards = (d.courses || []).map(c =>
      '<div class="card"><h3>' + Tool.esc(c.title) + '</h3><div class="meta">' +
      '<span>📋 ' + c.students + ' 名学生</span><span>📝 ' + c.submissions + ' 份提交</span>' +
      (c.pending ? '<span class="stat-pill amber">' + c.pending + ' 待批改</span>' : '<span class="stat-pill green">无待批</span>') + '</div>' +
      '<div class="desc">邀请码：<code class="mono">' + Tool.esc(c.inviteCode) + '</code></div>' +
      '<div class="row-actions"><button class="btn sm" onclick="App.go(\'tcourse\',\'' + c.id + '\')">进入课程</button></div></div>').join("");
    return '<div class="page-head"><h2>我的课程</h2><p>创建课程后，将邀请码发送给学生即可加入。</p></div>' +
      '<button class="btn sm" onclick="Teacher.newCourse()">＋ 创建新课程</button>' +
      '<div class="cards" style="margin-top:16px">' + (cards || '<div class="empty">还没有课程，点击上方按钮创建</div>') + '</div>';
  },
  async newCourse() {
    App.modal("<h3>创建新课程</h3>" +
      '<div class="field"><label>课程名称</label><input id="ncTitle" placeholder="如：SYB 创业课程" maxlength="50"></div>' +
      '<div class="field"><label>课程简介</label><textarea id="ncDesc" maxlength="100" placeholder="一句话简介（可选）"></textarea></div>' +
      '<p class="hint">课程将使用系统内置的六阶段实训模板（机会识别 → 计划书），创建后可在课程内调整各阶段内容。</p>' +
      "<div class='m-foot'><button class='btn ghost' onclick='App.closeModal()'>取消</button><button class='btn' onclick='Teacher.doCreate()'>创建</button></div>");
  },
  async doCreate() {
    const title = document.getElementById("ncTitle").value.trim();
    if (!title) { App.toast("请输入课程名称"); return; }
    try {
      const d = await Api.post("/api/teacher/courses", { title, desc: document.getElementById("ncDesc").value.trim() });
      App.closeModal();
      App.toast("课程已创建，邀请码：" + d.course.inviteCode);
      App.go("tcourse", d.course.id);
    } catch (e) { App.toast(e.message); }
  },
  async course(courseId) {
    const d = await Api.get("/api/teacher/courses/" + courseId);
    const c = d.course;
    const studentRows = (d.students || []).map(s =>
      '<tr><td>' + Tool.esc(s.name) + '</td><td>' + Tool.esc(s.account) + '</td><td>' + Tool.fmtTime(s.joinedAt) + '</td>' +
      '<td><button class="btn danger sm" onclick="Teacher.removeStudent(\'' + courseId + '\',\'' + s.id + '\')">移除</button></td></tr>').join("");
    const stageRows = (d.stages || []).map(st =>
      '<tr><td style="border-left:4px solid ' + st.color + '">阶段 ' + st.id + ' ' + Tool.esc(st.name) + '</td>' +
      '<td>' + Tool.deliverName(st.deliverable) + '</td><td>' + (st.quiz || []).length + ' 题自测</td>' +
      '<td><button class="btn ghost sm" onclick="Teacher.editStage(\'' + courseId + '\',\'' + st.id + '\')">编辑内容</button></td></tr>').join("");
    return '<div class="page-head"><h2>' + Tool.esc(c.title) + '</h2>' +
      '<p>邀请码：<code class="mono">' + Tool.esc(c.inviteCode) + '</code> ' +
      '<button class="btn ghost sm" onclick="Teacher.resetInvite(\'' + courseId + '\')">重置邀请码</button>' +
      '<button class="btn ghost sm" onclick="Teacher.editCourseMeta(\'' + courseId + '\')">编辑信息</button></p></div>' +
      '<div class="toolbar">' +
      '<button class="btn sm" onclick="Teacher.review(\'' + courseId + '\')">📝 评阅中心</button>' +
      '<button class="btn sm green" onclick="Teacher.exportCsv(\'' + courseId + '\')">⬇ 导出成绩 CSV</button>' +
      '<button class="btn sm amber" onclick="Teacher.dashboard(\'' + courseId + '\')">📊 进度看板</button>' +
      '</div>' +
      '<div class="panel"><h3>👨‍🎓 学生名单（' + (d.students || []).length + '）</h3>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>姓名</th><th>账号</th><th>加入时间</th><th></th></tr></thead><tbody>' +
      (studentRows || '<tr><td colspan="4" class="empty">还没有学生加入</td></tr>') + '</tbody></table></div></div>' +
      '<div class="panel"><h3>🧩 六阶段实训模板</h3>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>阶段</th><th>交付物</th><th>自测</th><th></th></tr></thead><tbody>' +
      (stageRows || "") + '</tbody></table></div>' +
      '<p class="hint" style="margin-top:8px">教师可调整各阶段的知识精讲、任务与自测题，以适应不同教学班次。</p></div>';
  },
  async removeStudent(courseId, studentId) {
    if (!confirm("确定将该学生移出本课程？其提交记录将一并移除。")) return;
    try { await Api.del("/api/teacher/courses/" + courseId + "/students/" + studentId); App.toast("已移除"); App.go("tcourse", courseId); }
    catch (e) { App.toast(e.message); }
  },
  async resetInvite(courseId) {
    try { const d = await Api.post("/api/teacher/courses/" + courseId + "/reset-invite"); App.toast("新邀请码：" + d.inviteCode); App.go("tcourse", courseId); }
    catch (e) { App.toast(e.message); }
  },
  async editCourseMeta(courseId) {
    try {
      const d = await Api.get("/api/teacher/courses/" + courseId);
      const c = d.course;
      App.modal("<h3>编辑课程信息</h3>" +
        '<div class="field"><label>课程名称</label><input id="ecTitle" value="' + Tool.esc(c.title) + '" maxlength="50"></div>' +
        '<div class="field"><label>课程简介</label><textarea id="ecDesc" maxlength="100">' + Tool.esc(c.desc || "") + '</textarea></div>' +
        "<div class='m-foot'><button class='btn ghost' onclick='App.closeModal()'>取消</button><button class='btn' onclick='Teacher.saveCourseMeta(\"" + courseId + "\")'>保存</button></div>");
    } catch (e) { App.toast(e.message); }
  },
  async saveCourseMeta(courseId) {
    try {
      await Api.put("/api/teacher/courses/" + courseId, { title: document.getElementById("ecTitle").value.trim(), desc: document.getElementById("ecDesc").value.trim() });
      App.closeModal(); App.toast("已保存"); App.go("tcourse", courseId);
    } catch (e) { App.toast(e.message); }
  },
  /* 阶段内容编辑：知识每行一条 / 任务每行一条 / 工具文本 / 自测题格式化 */
  async editStage(courseId, stageId) {
    try {
      const d = await Api.get("/api/teacher/courses/" + courseId);
      const st = (d.stages || []).find(s => String(s.id) === String(stageId));
      if (!st) return;
      const quizTxt = (st.quiz || []).map(q => [q.q, q.opts[0], q.opts[1], q.opts[2], q.answer, q.explain || ""].join("||")).join("\n");
      App.modal("<h3>编辑阶段 " + st.id + " · " + Tool.esc(st.name) + "</h3>" +
        '<div class="field"><label>阶段简介</label><input id="esBrief" value="' + Tool.esc(st.brief || "") + '" maxlength="200"></div>' +
        '<div class="field"><label>知识精讲（每行一条）</label><textarea id="esKnowledge" rows="6">' + Tool.esc((st.knowledge || []).join("\n")) + '</textarea></div>' +
        '<div class="field"><label>实战工具说明</label><textarea id="esTools" rows="4">' + Tool.esc(st.tools || "") + '</textarea></div>' +
        '<div class="field"><label>实训任务（每行一条）</label><textarea id="esTasks" rows="5">' + Tool.esc((st.tasks || []).join("\n")) + '</textarea></div>' +
        '<div class="field"><label>自测题（每行一题，格式：题目||选项A||选项B||选项C||答案序号0-2||解析）</label>' +
        '<textarea id="esQuiz" rows="8" placeholder="例：商业模式画布有几个模块？||8||9||7||0||标准画布为9个模块">' + Tool.esc(quizTxt) + '</textarea></div>' +
        "<div class='m-foot'><button class='btn ghost' onclick='App.closeModal()'>取消</button><button class='btn' onclick='Teacher.saveStage(\"" + courseId + "\"," + stageId + ")'>保存</button></div>");
    } catch (e) { App.toast(e.message); }
  },
  async saveStage(courseId, stageId) {
    const knowledge = document.getElementById("esKnowledge").value.split("\n").map(s => s.trim()).filter(Boolean);
    const tasks = document.getElementById("esTasks").value.split("\n").map(s => s.trim()).filter(Boolean);
    const quiz = [];
    const lines = document.getElementById("esQuiz").value.split("\n").map(s => s.trim()).filter(Boolean);
    let bad = false;
    lines.forEach(line => {
      const parts = line.split("||");
      if (parts.length < 5) { bad = true; return; }
      const answer = Number(parts[4]);
      if (!Number.isInteger(answer) || answer < 0 || answer > 2 || parts[1] === "" || parts[2] === "" || parts[3] === "") { bad = true; return; }
      quiz.push({ q: parts[0], opts: [parts[1], parts[2], parts[3]], answer, explain: parts[5] || "" });
    });
    if (bad) { App.toast("自测题格式有误：每行须为「题目||选项A||选项B||选项C||答案0-2||解析」且选项不能为空"); return; }
    try {
      await Api.put("/api/teacher/courses/" + courseId + "/stages/" + stageId, {
        brief: document.getElementById("esBrief").value.trim(),
        knowledge, tools: document.getElementById("esTools").value.trim(), tasks, quiz,
      });
      App.closeModal(); App.toast("阶段内容已保存"); App.go("tcourse", courseId);
    } catch (e) { App.toast(e.message); }
  },
  /* 评阅中心 */
  async review(courseId) {
    const d = await Api.get("/api/teacher/courses/" + courseId + "/submissions");
    const course = d && d.submissions ? true : false;
    const rows = (d.submissions || []).map(s =>
      '<tr><td>' + Tool.esc(s.student) + '</td><td>阶段 ' + s.stageId + ' ' + Tool.esc(s.stageName) + '</td>' +
      '<td>' + Tool.statusBadge(s.status) + '</td><td class="num">' + Tool.scoreCell(s) + '</td>' +
      '<td class="num">v' + s.versionCount + '</td><td>' + Tool.fmtTime(s.submittedAt) + '</td>' +
      '<td><button class="btn sm" onclick="Teacher.reviewDetail(\'' + courseId + '\',\'' + s.id + '\')">' + (s.status === "submitted" ? "批改" : "查看重评") + '</button></td></tr>').join("");
    return '<div class="page-head"><h2>评阅中心</h2><p>按提交时间排序；点击「批改」评阅最新版本。</p></div>' +
      '<div class="toolbar"><button class="btn ghost sm" onclick="App.go(\'tcourse\',\'' + courseId + '\')">← 返回课程</button>' +
      '<label class="muted">按阶段筛选：</label><select onchange="Teacher.filterStage(\'' + courseId + '\',this.value)">' +
      '<option value="">全部阶段</option>' + [1, 2, 3, 4, 5, 6].map(i => '<option value="' + i + '">阶段 ' + i + '</option>').join("") + '</select></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>学生</th><th>阶段</th><th>状态</th><th>分数</th><th>版本</th><th>提交时间</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7" class="empty">暂无提交</td></tr>') + '</tbody></table></div>';
  },
  async filterStage(courseId, stage) {
    try {
      const d = await Api.get("/api/teacher/courses/" + courseId + "/submissions?stage=" + stage);
      Teacher.submitFilterResult(courseId, d.submissions);
    } catch (e) { App.toast(e.message); }
  },
  submitFilterResult(courseId, subs) {
    // 简单实现：重渲染评阅列表 using 已获取数据
    const rows = (subs || []).map(s =>
      '<tr><td>' + Tool.esc(s.student) + '</td><td>阶段 ' + s.stageId + ' ' + Tool.esc(s.stageName) + '</td>' +
      '<td>' + Tool.statusBadge(s.status) + '</td><td class="num">' + Tool.scoreCell(s) + '</td>' +
      '<td class="num">v' + s.versionCount + '</td><td>' + Tool.fmtTime(s.submittedAt) + '</td>' +
      '<td><button class="btn sm" onclick="Teacher.reviewDetail(\'' + courseId + '\',\'' + s.id + '\')">批改</button></td></tr>').join("");
    document.querySelector("#main .tbl-wrap").innerHTML =
      '<table class="tbl"><thead><tr><th>学生</th><th>阶段</th><th>状态</th><th>分数</th><th>版本</th><th>提交时间</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7" class="empty">该阶段暂无提交</td></tr>') + '</tbody></table>';
  },
  async reviewDetail(courseId, submissionId) {
    try {
      const d = await Api.get("/api/teacher/courses/" + courseId + "/submissions/" + submissionId);
      const s = d.submission;
      const st = { deliverable: s.deliverable };
      const verList = s.versions.slice().reverse().map((v, idx) => {
        const isReviewed = s.reviewedVersion === v.version;
        return '<div class="version-item"><b>v' + v.version + '</b> ' + Tool.fmtTime(v.at) +
          (isReviewed ? ' <span class="badge brand">教师评阅版本（v' + s.reviewedVersion + '，成绩 ' + (s.score != null ? s.score : "-") + '）</span>' : "") +
          (idx === 0 ? ' <span class="badge passed">当前版本</span>' : "") +
          (v.quiz ? ' <span class="muted">练习：' + v.quiz.score + '/' + v.quiz.total + '</span>' : "") + '</div>';
      }).join("");
      const current = s.versions[s.versions.length - 1];
      App.modal("<h3>评阅 · " + Tool.esc(s.student) + " · 阶段 " + s.stageId + " " + Tool.esc(s.stageName || "") + "</h3>" +
        '<p class="muted">状态：' + Tool.statusBadge(s.status) + ' ｜ 当前版本 v' + s.versionCount + ' ｜ 最近提交 ' + Tool.fmtTime(s.submittedAt) + '</p>' +
        '<div class="version-list">' + verList + '</div>' +
        '<h4 style="margin-top:12px">当前版本内容</h4><div class="plain-pre">' + Stage.renderContent(s.deliverable, current) + '</div>' +
        (s.feedback ? '<h4 style="margin-top:12px">历史评语</h4><div class="plain-pre">' + Tool.esc(s.feedback) + '</div>' : "") +
        '<h4 style="margin-top:16px">本次批改</h4>' +
        '<div class="field"><label>成绩（0–100 整数）</label><input id="rvScore" type="number" min="0" max="100" value="' + (s.score != null ? s.score : 80) + '"></div>' +
        '<div class="field"><label>评语</label><textarea id="rvFeedback" rows="4" placeholder="指出优点与修改建议…"></textarea></div>' +
        '<div class="field"><label>结论</label><select id="rvDecision"><option value="approved">通过</option><option value="revise">退回修改</option></select></div>' +
        '<p class="hint">评阅的是最新版本（v' + s.versionCount + '）。若学生于评阅后又提交了新版本，本页显示的新版本需重新评判。</p>' +
        "<div class='m-foot'><button class='btn ghost' onclick='App.closeModal()'>取消</button><button class='btn' onclick='Teacher.saveReview(\"" + courseId + "\",\"" + submissionId + "\")'>提交评阅</button></div>");
    } catch (e) { App.toast(e.message); }
  },
  async saveReview(courseId, submissionId) {
    const score = Number(document.getElementById("rvScore").value);
    const decision = document.getElementById("rvDecision").value;
    const feedback = document.getElementById("rvFeedback").value.trim();
    if (!Number.isInteger(score) || score < 0 || score > 100) { App.toast("成绩须为 0–100 的整数"); return; }
    try {
      await Api.put("/api/teacher/courses/" + courseId + "/submissions/" + submissionId + "/review", { score, decision, feedback });
      App.closeModal(); App.toast("评阅已提交"); App.go("tcourse", courseId);
    } catch (e) { App.toast(e.message); }
  },
  /* 看板 */
  async dashboard(courseId) {
    const d = await Api.get("/api/teacher/courses/" + courseId + "/dashboard");
    const stages = d.stages || [];
    const totalSub = stages.reduce((a, s) => a + s.submitted, 0);
    const totalPending = stages.reduce((a, s) => a + s.pending, 0);
    const gradedAll = stages.reduce((a, s) => a + s.gradedCount, 0);
    const avgAll = (() => { const n = stages.filter(s => s.avgScore != null); return n.length ? Math.round((n.reduce((a, s) => a + s.avgScore, 0) / n.length) * 10) / 10 : null; })();
    const bars = stages.map(s => {
      const rate = s.total ? Math.round((s.submitted / s.total) * 100) : 0;
      const dist = [["90-100", s.distribution["90-100"]], ["80-89", s.distribution["80-89"]], ["70-79", s.distribution["70-79"]], ["60-69", s.distribution["60-69"]], ["<60", s.distribution["<60"]]]
        .map(x => '<span class="muted">' + x[0] + '：' + x[1] + '人</span>').join("  ");
      return '<div class="panel"><div class="toolbar" style="margin:0"><h4 style="flex:1">阶段 ' + s.stageId + ' ' + Tool.esc(s.name) + '</h4>' +
        '<span class="muted">' + s.submitted + '/' + s.total + ' 已提交</span></div>' +
        '<div class="bar"><i style="width:' + rate + '%"></i></div>' +
        '<div class="toolbar" style="margin-top:8px"><span class="muted">平均成绩：<b>' + (s.avgScore != null ? s.avgScore : "-") + '</b></span>' +
        '<span class="muted">待批改：' + s.pending + '</span><span class="muted">练习正确率：' + Tool.pct(s.quizAccuracy) + '（' + s.quizCount + ' 人参加过）</span></div>' +
        '<div style="margin-top:4px">' + dist + '</div></div>';
    }).join("");
    return '<div class="page-head"><h2>进度看板</h2><p>整体：' + totalSub + ' 份提交（' + totalPending + ' 待批改）｜ 有成绩阶段平均 ' + (avgAll == null ? "-" : avgAll) + ' 分。</p></div>' +
      '<div class="toolbar"><button class="btn ghost sm" onclick="App.go(\'tcourse\',\'' + courseId + '\')">← 返回课程</button>' +
      '<button class="btn sm" onclick="Teacher.exportCsv(\'' + courseId + '\')">⬇ 导出成绩 CSV</button></div>' +
      bars;
  },
  /* 成绩导出：一次性票据（ticket 不进 URL，M6） */
  async exportCsv(courseId) {
    try {
      const d = await Api.post("/api/teacher/courses/" + courseId + "/export", {});
      const url = "/files/grades.csv?ticket=" + encodeURIComponent(d.token);
      location.href = url;
      App.toast("成绩表下载中（票据 60 秒有效）…");
    } catch (e) { App.toast(e.message); }
  },
  /* 评阅中心全局入口（所有课程有待批显示） */
  async reviewAll() {
    const d = await Api.get("/api/teacher/courses");
    const courses = (d.courses || []).filter(c => c.pending > 0);
    const cards = (courses.length ? courses : d.courses || []).map(c =>
      '<div class="card"><h3>' + Tool.esc(c.title) + '</h3><div class="meta">' +
      (c.pending ? '<span class="stat-pill amber">' + c.pending + ' 份待批改</span>' : '<span class="stat-pill green">无待批改</span>') + '</div>' +
      '<div class="row-actions"><button class="btn sm" onclick="Teacher.review(\'' + c.id + '\')">进入评阅</button></div></div>').join("");
    return '<div class="page-head"><h2>评阅中心</h2><p>查看各课程待批改提交。</p></div>' +
      '<div class="cards">' + (cards || '<div class="empty">还没有课程</div>') + '</div>';
  },
  /* 案例库 */
  async cases() {
    return await Common.cases(true);
  },
  async newCase() {
    App.modal("<h3>新建案例</h3>" +
      '<div class="field"><label>案例标题</label><input id="csTitle" maxlength="100"></div>' +
      '<div class="grid-2"><div class="field"><label>行业</label><input id="csIndustry" maxlength="50"></div>' +
      '<div class="field"><label>适配阶段（可选）</label><select id="csStage"><option value="0">不指定</option>' + [1, 2, 3, 4, 5, 6].map(i => '<option value="' + i + '">阶段 ' + i + '</option>').join("") + '</select></div></div>' +
      '<div class="field"><label>案例正文</label><textarea id="csBody" rows="10"></textarea></div>' +
      '<div class="field"><label>教学要点</label><textarea id="csInsights" rows="3"></textarea></div>' +
      "<div class='m-foot'><button class='btn ghost' onclick='App.closeModal()'>取消</button><button class='btn' onclick='Teacher.saveCase()'>保存</button></div>");
  },
  async saveCase() {
    const title = document.getElementById("csTitle").value.trim();
    if (!title) { App.toast("请输入案例标题"); return; }
    try {
      await Api.post("/api/teacher/cases", {
        title, industry: document.getElementById("csIndustry").value.trim(),
        stage: Number(document.getElementById("csStage").value),
        body: document.getElementById("csBody").value, insights: document.getElementById("csInsights").value.trim(),
      });
      App.closeModal(); App.toast("案例已保存"); location.reload();
    } catch (e) { App.toast(e.message); }
  },
  async delCase(id) {
    if (!confirm("确定删除该案例？")) return;
    try { await Api.del("/api/teacher/cases/" + id); App.toast("已删除"); location.reload(); }
    catch (e) { App.toast(e.message); }
  },
};

const Admin = {
  async teachers() {
    const d = await Api.get("/api/admin/teachers");
    const rows = (d.teachers || []).map(t =>
      '<tr><td>' + Tool.esc(t.name) + '</td><td>' + Tool.esc(t.account) + '</td><td>' + (t.status === "active" ? '<span class="badge passed">启用</span>' : '<span class="badge revised">停用</span>') + '</td>' +
      '<td class="num">' + t.courses + '</td><td>' + Tool.fmtTime(t.createdAt) + '</td>' +
      '<td><button class="btn ghost sm" onclick="Admin.resetPwd(\'' + t.id + '\')">重置密码</button> ' +
      '<button class="btn ' + (t.status === "active" ? "danger" : "ghost") + ' sm" onclick="Admin.toggle(\'' + t.id + '\',\'' + (t.status === "active" ? "disabled" : "active") + '\')">' + (t.status === "active" ? "停用" : "启用") + '</button></td></tr>').join("");
    return '<div class="page-head"><h2>教师账号管理</h2><p>教师账号由管理员统一创建（禁止自助注册）；可重置密码或启停。</p></div>' +
      '<button class="btn sm" onclick="Admin.newTeacher()">＋ 创建教师账号</button>' +
      '<div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>姓名</th><th>账号</th><th>状态</th><th>课程数</th><th>创建时间</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6" class="empty">暂无教师</td></tr>') + '</tbody></table></div>';
  },
  async newTeacher() {
    App.modal("<h3>创建教师账号</h3>" +
      '<div class="field"><label>账号（3–32 位字母/数字/._-）</label><input id="ntAccount"></div>' +
      '<div class="field"><label>姓名</label><input id="ntName"></div>' +
      '<div class="field"><label>初始密码（6–64 位）</label><input id="ntPassword" type="password"></div>' +
      "<div class='m-foot'><button class='btn ghost' onclick='App.closeModal()'>取消</button><button class='btn' onclick='Admin.doCreate()'>创建</button></div>");
  },
  async doCreate() {
    try {
      await Api.post("/api/admin/teachers", {
        account: document.getElementById("ntAccount").value.trim(),
        name: document.getElementById("ntName").value.trim(),
        password: document.getElementById("ntPassword").value,
      });
      App.closeModal(); App.toast("教师账号已创建"); location.reload();
    } catch (e) { App.toast(e.message); }
  },
  async resetPwd(id) {
    App.modal("<h3>重置教师密码</h3>" +
      '<div class="field"><label>新密码（6–64 位）</label><input id="rpPwd" type="password"></div>' +
      "<div class='m-foot'><button class='btn ghost' onclick='App.closeModal()'>取消</button><button class='btn' onclick='Admin.doReset(\"" + id + "\")'>重置</button></div>");
  },
  async doReset(id) {
    const pwd = document.getElementById("rpPwd").value;
    if (pwd.length < 6) { App.toast("密码至少 6 位"); return; }
    try { await Api.put("/api/admin/teachers/" + id + "/reset-password", { password: pwd }); App.closeModal(); App.toast("密码已重置"); }
    catch (e) { App.toast(e.message); }
  },
  async toggle(id, status) {
    try { await Api.put("/api/admin/teachers/" + id + "/status", { status }); App.toast("已" + (status === "active" ? "启用" : "停用")); location.reload(); }
    catch (e) { App.toast(e.message); }
  },
};