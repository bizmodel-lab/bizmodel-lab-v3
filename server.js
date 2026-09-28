/**
 * 创见 BizLab V3 — 商业模式设计实训系统服务端
 * 零依赖（Node 内置模块）：HTTP 服务 + 静态文件 + REST API + JSON 文件数据库
 * 启动：node server.js  （默认端口 8700，可用环境变量 PORT 覆盖）
 *
 * V3 相对 V2 的关键改进（见 docs/产品开发需求说明书）：
 *  M1 教师账号禁止自助注册（仅管理员可创建 / 可选注册码机制）
 *  M2 自测接口不下发标准答案，明确练习定位，指标命名"自测练习正确率"
 *  M3 重提交保护（覆盖已批成绩需 confirm）+ 提交版本历史
 *  M4 阶段推进"前置阶段已提交"软门控
 *  M5 阶段1/4 结构化交付物（机会评估矩阵 / 假设清单 + MVP 实验设计）
 *  M6 登录限速（账号 5 次锁定 15 分钟 + IP 每分钟 30 次）、部署文档与代码一致性、案例库
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db, save, nextId, initDb, flush } = require("./db");
const { defaultCourse } = require("./default-course");

const PORT = process.env.PORT || 8700;
const PUBLIC_DIR = path.join(__dirname, "public");
const TOKEN_TTL = 30 * 24 * 3600 * 1000;   // 30 天
const MAX_BODY = 2 * 1024 * 1024;          // 请求体上限 2MB
const TICKET_TTL = 60 * 1000;              // 导出票据 60 秒
const LOCK_AFTER = 5;                      // 连续失败次数
const LOCK_MS = 15 * 60 * 1000;            // 锁定 15 分钟
const IP_WINDOW_MS = 60 * 1000;            // IP 统计窗口 1 分钟
const IP_MAX = 30;                         // IP 每分钟最大尝试次数

/* ================= 工具函数 ================= */
const now = () => new Date().toISOString();
const genToken = () => crypto.randomBytes(24).toString("hex");
const genCode = () => {
  // 排除易混淆字符 0/O/1/I
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString("hex");
}
function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(String(password), salt, 32).toString("hex");
  const a = Buffer.from(h, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function publicUser(u) {
  return { id: u.id, role: u.role, account: u.account, name: u.name, status: u.status, createdAt: u.createdAt };
}

function cleanSessions() {
  const t = Date.now();
  let changed = false;
  for (const [tok, s] of Object.entries(db.sessions)) {
    if (new Date(s.expires).getTime() < t) { delete db.sessions[tok]; changed = true; }
  }
  if (changed) save();
}
function cleanTickets() {
  const t = Date.now();
  let changed = false;
  for (const [tok, s] of Object.entries(db.exportTickets)) {
    if (s.expires < t) { delete db.exportTickets[tok]; changed = true; }
  }
  if (changed) save();
}

function getUser(req) {
  let token = null;
  const auth = req.headers["authorization"] || "";
  if (auth.startsWith("Bearer ")) token = auth.slice(7);
  if (!token) return null;
  const session = db.sessions[token];
  if (!session) return null;
  if (new Date(session.expires).getTime() < Date.now()) {
    delete db.sessions[token];
    save();
    return null;
  }
  return db.users.find(u => u.id === session.userId) || null;
}

/* ================= 登录限速（M6） ================= */
function checkLoginLimit(account, ip) {
  const t = Date.now();
  const acc = db.loginAttempts["acc:" + account];
  if (acc && acc.lockUntil && acc.lockUntil > t) {
    return { locked: true, remainSec: Math.ceil((acc.lockUntil - t) / 1000) };
  }
  const rec = db.loginAttempts["ip:" + ip];
  if (rec && rec.windowStart && t - rec.windowStart < IP_WINDOW_MS && rec.count >= IP_MAX) {
    return { locked: true, remainSec: Math.ceil((IP_WINDOW_MS - (t - rec.windowStart)) / 1000) };
  }
  return { locked: false };
}
function noteLoginFailure(account, ip) {
  const t = Date.now();
  const acc = db.loginAttempts["acc:" + account] || { failCount: 0, lockUntil: 0 };
  acc.failCount = (acc.failCount || 0) + 1;
  if (acc.failCount >= LOCK_AFTER) { acc.lockUntil = t + LOCK_MS; acc.failCount = 0; }
  db.loginAttempts["acc:" + account] = acc;
  const rec = db.loginAttempts["ip:" + ip] || { windowStart: t, count: 0 };
  if (t - (rec.windowStart || 0) >= IP_WINDOW_MS) { rec.windowStart = t; rec.count = 0; }
  rec.count = (rec.count || 0) + 1;
  db.loginAttempts["ip:" + ip] = rec;
  save();
}
function resetLoginSuccess(account) {
  if (db.loginAttempts["acc:" + account]) { delete db.loginAttempts["acc:" + account]; save(); }
}

/* ================= 业务辅助 ================= */
function getCourse(id) { return db.courses.find(c => c.id === id) || null; }
function isStudentOf(courseId, studentId) {
  return db.enrollments.some(e => e.courseId === courseId && e.studentId === studentId);
}
function findSubmission(courseId, studentId, stageId) {
  return db.submissions.find(s => s.courseId === courseId && s.studentId === studentId && s.stageId === stageId) || null;
}
function getVersions(submissionId) {
  return db.submissionVersions
    .filter(v => v.submissionId === submissionId)
    .sort((a, b) => a.version - b.version);
}
function latestQuiz(courseId, studentId, stageId) {
  return db.quizLog["quiz_" + courseId + "_" + studentId + "_" + stageId] || null;
}

/* 阶段对外视图：includeAnswers=true 仅限教师/管理员（M2：学生端绝不下发答案） */
function sanitizeStage(stage, includeAnswers) {
  const s = {
    id: stage.id, name: stage.name, color: stage.color, brief: stage.brief || "",
    knowledge: stage.knowledge || [], tools: stage.tools || "",
    tasks: stage.tasks || [], deliverable: stage.deliverable || "none",
  };
  if (stage.quiz && stage.quiz.length) {
    s.quiz = includeAnswers
      ? stage.quiz.map(q => ({ q: q.q, opts: q.opts, answer: q.answer, explain: q.explain }))
      : stage.quiz.map(q => ({ q: q.q, opts: q.opts }));
  }
  return s;
}

/* 自测判分（服务端保存答案，交卷后按题返回判定与解析） */
function gradeQuiz(stage, answers) {
  const total = stage.quiz.length;
  let score = 0;
  const results = [];
stage.quiz.forEach((q, i) => {
      const correct = Number(answers[i]) === Number(q.answer);
      if (correct) score++;
      // 交卷后按题返回对错、正确选项与解析（练习反馈；交卷前任何接口均不下发答案）
      results.push({ index: i, correct, answerI: Number(q.answer), explain: q.explain || "" });
    });
  return { score, total, results };
}

/* 结构化交付物完整性校验（M5） */
function validateDeliverable(stage, body) {
  const type = stage.deliverable;
  const errs = [];
  if (typeof body.taskText !== "string" || !body.taskText.trim()) {
    errs.push("任务文本不能为空");
  }
  if (type === "matrix") {
    const m = body.matrix;
    if (!m || !Array.isArray(m.opportunities) || !m.opportunities.length) {
      errs.push("机会评估矩阵至少需要 1 个候选机会");
    } else {
      m.opportunities.forEach((o, i) => {
        if (!o.name || !o.name.trim()) errs.push("第 " + (i + 1) + " 个候选机会缺少名称");
        if (!Array.isArray(o.dims) || o.dims.length !== 5 || o.dims.some(d => typeof d !== "number" || d < 1 || d > 5)) {
          errs.push("第 " + (i + 1) + " 个候选机会的 5 维评分（1–5）不完整");
        }
      });
      if (m.chosenId == null || m.chosenId === "" || !m.opportunities.some(o => o.id === m.chosenId)) errs.push("请选定得分最高的机会");
      if (!m.reason || !m.reason.trim()) errs.push("请填写机会选择理由");
    }
  } else if (type === "vpc" || type === "bmc") {
    const c = body.canvas;
    if (!c || typeof c !== "object" || Object.keys(c).length === 0) {
      errs.push("画布内容不能为空");
    }
  } else if (type === "hypothesis") {
    const h = body.hypothesis;
    if (!h || !Array.isArray(h.items) || h.items.length === 0) {
      errs.push("假设清单至少需要 1 条假设");
    } else {
      h.items.forEach((it, i) => {
        if (!it.assumption || !it.assumption.trim()) errs.push("第 " + (i + 1) + " 条假设缺少内容");
        if (it.uncertainty !== "high" && it.uncertainty !== "mid" && it.uncertainty !== "low") {
          errs.push("第 " + (i + 1) + " 条假设的不确定度取值不合法");
        }
        if (it.fatality !== "high" && it.fatality !== "mid" && it.fatality !== "low") {
          errs.push("第 " + (i + 1) + " 条假设的致命度取值不合法");
        }
      });
      if (!h.experiment || !h.experiment.form || !h.experiment.form.trim()) {
        errs.push("MVP 验证实验的实验形式不能为空");
      }
    }
  } else if (type === "finance") {
    if (!body.finance || typeof body.finance !== "object" || !body.finance.params) {
      errs.push("财务测算参数不能为空");
    }
  } else if (type === "plan") {
    if (!body.plan || !body.plan.sections || !body.plan.sections.execSummary || !String(body.plan.sections.execSummary).trim()) {
      errs.push("商业计划书「执行摘要」不能为空");
    }
  }
  return errs;
}

/* ================= 输入解析 ================= */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("请求体过大")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error("JSON 解析失败")); }
    });
    req.on("error", e => reject(e));
  });
}

/* ================= 路由匹配 ================= */
function matchRoute(method, pathname, routes) {
  const parts = pathname.split("/").filter(Boolean);
  for (const r of routes) {
    if (r.method !== method) continue;
    const rparts = r.path.split("/").filter(Boolean);
    if (rparts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < rparts.length; i++) {
      if (rparts[i].startsWith(":")) params[rparts[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (rparts[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

/* ================= 响应辅助 ================= */
function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}
const ok = (res, data) => sendJson(res, 200, data);
const fail = (res, code, error, extra) => sendJson(res, code, Object.assign({ error }, extra || {}));

function requireUser(req, res) {
  const u = getUser(req);
  if (!u) { fail(res, 401, "未登录或登录已过期"); return null; }
  return u;
}
function requireRole(user, res, role) {
  if (!user || user.role !== role) { fail(res, 403, "无权访问"); return false; }
  return true;
}

/* ================= CSV 安全转义 ================= */
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* ================= 看板计算 ================= */
function buildDashboard(course) {
  const students = db.enrollments.filter(e => e.courseId === course.id).map(e => e.studentId);
  const all = course.stages.map(stage => {
    const subs = db.submissions.filter(s => s.courseId === course.id && s.stageId === stage.id);
    const graded = subs.filter(s => s.score != null);
    const distribution = { "90-100": 0, "80-89": 0, "70-79": 0, "60-69": 0, "<60": 0 };
    let sum = 0;
    graded.forEach(s => {
      sum += s.score;
      const b = s.score >= 90 ? "90-100" : s.score >= 80 ? "80-89" : s.score >= 70 ? "70-79" : s.score >= 60 ? "60-69" : "<60";
      distribution[b]++;
    });
    let quizSum = 0, quizCount = 0;
    students.forEach(sid => {
      const q = latestQuiz(course.id, sid, stage.id);
      if (q) { quizSum += (q.score / q.total) * 100; quizCount++; }
    });
    return {
      stageId: stage.id, name: stage.name,
      total: students.length,
      submitted: subs.length,
      pending: subs.filter(s => s.status === "submitted").length,
      gradedCount: graded.length,
      avgScore: graded.length ? Math.round((sum / graded.length) * 10) / 10 : null,
      distribution,
      quizAccuracy: quizCount ? Math.round((quizSum / quizCount) * 10) / 10 : null,
      quizCount,
    };
  });
  return all;
}

/* ================= 成绩导出（一次性票据） ================= */
function buildCsv(course) {
  const students = db.enrollments
    .filter(e => e.courseId === course.id)
    .map(e => e.studentId);
  const rows = [];
  const header = ["账号", "姓名", "加入时间"];
  const allStages = course.stages.slice().sort((a, b) => a.id - b.id);
  allStages.forEach(st => {
    header.push("阶段" + st.id + "成绩", "阶段" + st.id + "状态");
  });
  header.push("总分", "平均分", "自测练习正确率(平均)");

  students.forEach(sid => {
    const u = db.users.find(x => x.id === sid);
    if (!u) return;
    const en = db.enrollments.find(e => e.courseId === course.id && e.studentId === sid);
    const row = [u.account, u.name, en ? new Date(en.joinedAt).toLocaleString("zh-CN") : ""];
    let total = 0, gradedN = 0, quizSum = 0, quizN = 0;
    allStages.forEach(st => {
      const sub = findSubmission(course.id, sid, st.id);
      if (sub && sub.score != null) { row.push(sub.score, sub.status === "approved" ? "通过" : "需修改"); total += sub.score; gradedN++; }
      else if (sub) { row.push("", "待批改"); }
      else { row.push("", ""); }
      const q = latestQuiz(course.id, sid, st.id);
      if (q) { quizSum += (q.score / q.total) * 100; quizN++; }
    });
    row.push(gradedN ? total : "", gradedN ? Math.round((total / gradedN) * 10) / 10 : "", quizN ? Math.round((quizSum / quizN) * 10) / 10 + "%" : "");
    rows.push(row);
  });
  const csv = "\uFEFF" + [header.map(csvCell).join(",")].concat(rows.map(r => r.map(csvCell).join(","))).join("\r\n");
  return csv;
}

/* ================= 管理员引导 ================= */
function ensureAdmin() {
  if (db.users.some(u => u.role === "admin")) return;
  const account = (process.env.ADMIN_ACCOUNT || "admin").trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || "admin123456";
  const salt = crypto.randomBytes(8).toString("hex");
  db.users.push({
    id: nextId("user"), role: "admin", account, name: "系统管理员",
    passHash: hashPassword(pass, salt), salt, status: "active", createdAt: now(),
  });
  save();
  console.log("[初始化] 已创建默认管理员账号: " + account);
  console.log("[提示] 默认密码为环境变量 ADMIN_PASSWORD（当前为预设值），请登录后立即在「账号设置」中修改。");
}

/* ================= 案例库 ================= */
function publicCase(c) {
  return { id: c.id, title: c.title, industry: c.industry, stage: c.stage, body: c.body, insights: c.insights, createdAt: c.createdAt };
}

/* ================= 路由与处理器 ================= */
function makeHandler() {
  const routes = [];

  /* ---- 认证 ---- */
  routes.push({
    method: "POST", path: "/api/auth/register", handler: async (req, res, params) => {
      const body = await readBody(req);
      const role = body.role || "student";
      if (role !== "student") { fail(res, 403, "仅支持学生自助注册，教师账号由管理员创建（M1）"); return; }
      const account = String(body.account || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const password = String(body.password || "");
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(account)) { fail(res, 400, "账号须为 3–32 位字母/数字/._-"); return; }
      if (!name || name.length > 30) { fail(res, 400, "姓名不能为空且不超过 30 字"); return; }
      if (password.length < 6 || password.length > 64) { fail(res, 400, "密码长度须为 6–64 位"); return; }
      if (db.users.some(u => u.account === account)) { fail(res, 409, "该账号已被注册"); return; }
      const salt = crypto.randomBytes(8).toString("hex");
      const u = { id: nextId("user"), role: "student", account, name, passHash: hashPassword(password, salt), salt, status: "active", createdAt: now() };
      db.users.push(u);
      const token = genToken();
      db.sessions[token] = { userId: u.id, expires: Date.now() + TOKEN_TTL };
      save();
      ok(res, { token, user: publicUser(u) });
    },
  });

  routes.push({
    method: "POST", path: "/api/auth/login", handler: async (req, res) => {
      const body = await readBody(req);
      const account = String(body.account || "").trim().toLowerCase();
      const password = String(body.password || "");
      const ip = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
      if (!account || !password) { fail(res, 400, "请输入账号和密码"); return; }
      const limit = checkLoginLimit(account, ip);
      if (limit.locked) { fail(res, 429, "尝试过于频繁，请在 " + Math.ceil(limit.remainSec / 60) + " 分钟后重试（M6 登录限速）"); return; }
      const u = db.users.find(x => x.account === account);
      if (!u || !verifyPassword(password, u.salt, u.passHash)) {
        noteLoginFailure(account, ip);
        fail(res, 401, "账号或密码错误");
        return;
      }
      if (u.status !== "active") { fail(res, 403, "该账号已被停用，请联系管理员"); return; }
      resetLoginSuccess(account);
      const token = genToken();
      db.sessions[token] = { userId: u.id, expires: Date.now() + TOKEN_TTL };
      save();
      ok(res, { token, user: publicUser(u) });
    },
  });

  routes.push({
    method: "POST", path: "/api/auth/logout", handler: async (req, res) => {
      const auth = req.headers["authorization"] || "";
      if (auth.startsWith("Bearer ")) {
        const token = auth.slice(7);
        if (db.sessions[token]) { delete db.sessions[token]; save(); }
      }
      ok(res, { ok: true });
    },
  });

  routes.push({
    method: "GET", path: "/api/auth/me", handler: async (req, res) => {
      const u = requireUser(req, res);
      if (!u) return;
      ok(res, { user: publicUser(u) });
    },
  });

  routes.push({
    method: "POST", path: "/api/auth/password", handler: async (req, res) => {
      const u = requireUser(req, res);
      if (!u) return;
      const body = await readBody(req);
      const oldP = String(body.oldPassword || "");
      const newP = String(body.newPassword || "");
      if (!verifyPassword(oldP, u.salt, u.passHash)) { fail(res, 400, "原密码不正确"); return; }
      if (newP.length < 6 || newP.length > 64) { fail(res, 400, "新密码长度须为 6–64 位"); return; }
      u.salt = crypto.randomBytes(8).toString("hex");
      u.passHash = hashPassword(newP, u.salt);
      save();
      ok(res, { ok: true });
    },
  });

  /* ---- 学生：课程与提交 ---- */
  routes.push({
    method: "POST", path: "/api/courses/join", handler: async (req, res) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "student")) return;
      const body = await readBody(req);
      const code = String(body.code || "").trim().toUpperCase();
      const course = db.courses.find(c => c.inviteCode === code);
      if (!course) { fail(res, 404, "邀请码无效，请核对后重试"); return; }
      if (isStudentOf(course.id, u.id)) { ok(res, { ok: true, courseId: course.id, title: course.title }); return; }
      db.enrollments.push({ courseId: course.id, studentId: u.id, joinedAt: now() });
      save();
      ok(res, { ok: true, courseId: course.id, title: course.title });
    },
  });

  routes.push({
    method: "GET", path: "/api/courses", handler: async (req, res) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "student")) return;
      const list = db.enrollments
        .filter(e => e.studentId === u.id)
        .map(e => {
          const c = getCourse(e.courseId);
          if (!c) return null;
          const subs = db.submissions.filter(s => s.courseId === c.id && s.studentId === u.id);
          return {
            id: c.id, title: c.title, desc: c.desc || "", joinedAt: e.joinedAt,
            teacher: (db.users.find(x => x.id === c.teacherId) || {}).name || "",
            stages: c.stages.length,
            submitted: subs.length,
            approved: subs.filter(s => s.status === "approved").length,
          };
        })
        .filter(Boolean);
      ok(res, { courses: list });
    },
  });

  routes.push({
    method: "GET", path: "/api/courses/:id", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "student")) return;
      const course = getCourse(params.id);
      if (!course) { fail(res, 404, "课程不存在"); return; }
      if (!isStudentOf(course.id, u.id)) { fail(res, 403, "你尚未加入该课程"); return; }
      const mysubs = db.submissions.filter(s => s.courseId === course.id && s.studentId === u.id);
      const stages = course.stages.map(st => {
        const sub = mysubs.find(s => s.stageId === st.id);
        const prev = st.id > 1 ? mysubs.some(s => s.stageId === st.id - 1) : true;
        const s = sanitizeStage(st, false); // 学生端不下发标准答案（M2）
        s.taskCount = (st.tasks || []).length;
        s.submitted = !!sub;
        s.status = sub ? sub.status : null;
        s.score = sub && sub.score != null ? sub.score : null;
        s.gateWarning = st.id > 1 && !prev;
        return s;
      });
      ok(res, {
        course: { id: course.id, title: course.title, desc: course.desc || "", teacher: (db.users.find(x => x.id === course.teacherId) || {}).name || "" },
        stages,
        quizOnly: mysubs.reduce((o, s) => { const q = latestQuiz(course.id, u.id, s.stageId); if (q) o[s.stageId] = q; return o; }, {}),
      });
    },
  });

  routes.push({
    method: "GET", path: "/api/courses/:id/mysubmissions", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "student")) return;
      const course = getCourse(params.id);
      if (!course || !isStudentOf(course.id, u.id)) { fail(res, 403, "无权访问"); return; }
      const submissions = db.submissions
        .filter(s => s.courseId === course.id && s.studentId === u.id)
        .map(s => Object.assign({}, s, { versions: getVersions(s.id) }));
      const quizOnly = {};
      course.stages.forEach(st => { const q = latestQuiz(course.id, u.id, st.id); if (q) quizOnly[st.id] = q; });
      ok(res, { submissions, quizOnly });
    },
  });

  routes.push({
    method: "POST", path: "/api/courses/:id/stages/:sid/quiz", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "student")) return;
      const course = getCourse(params.id);
      if (!course || !isStudentOf(course.id, u.id)) { fail(res, 403, "无权访问"); return; }
      const stage = course.stages.find(s => String(s.id) === String(params.sid));
      if (!stage || !stage.quiz || !stage.quiz.length) { fail(res, 404, "该阶段没有自测"); return; }
      const body = await readBody(req);
      const answers = body.answers;
      if (!Array.isArray(answers) || answers.length !== stage.quiz.length ||
          answers.some(a => !Number.isInteger(a) || a < 0 || a > 2)) {
        fail(res, 400, "答案格式不正确"); return;
      }
      // 判分（服务端保存，学生端详情接口不下发标准答案：M2）
      const quizKey = "quiz_" + course.id + "_" + u.id + "_" + stage.id;
      db.quizLog[quizKey] = { score: 0, total: stage.quiz.length, answers, at: now() };
      const graded = gradeQuiz(stage, answers);
      db.quizLog[quizKey].score = graded.score;
      save();
      ok(res, { score: graded.score, total: graded.total, results: graded.results });
    },
  });

  routes.push({
    method: "POST", path: "/api/courses/:id/stages/:sid/submit", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "student")) return;
      const course = getCourse(params.id);
      if (!course || !isStudentOf(course.id, u.id)) { fail(res, 403, "无权访问"); return; }
      const stage = course.stages.find(s => String(s.id) === String(params.sid));
      if (!stage) { fail(res, 404, "阶段不存在"); return; }
      const body = await readBody(req);
      const errs = validateDeliverable(stage, body);
      if (errs.length) { fail(res, 400, "提交内容不完整：" + errs.join("；")); return; }
      const existing = findSubmission(course.id, u.id, stage.id);
      // M3：覆盖已批成绩必须二次确认（服务端强制）
      if (existing && existing.score != null) {
        if (body.confirm !== true) {
          fail(res, 400, "本次提交将覆盖教师已给出的成绩与评语，需教师重新批改；请确认后重试", { code: "NEEDS_CONFIRM" });
          return;
        }
      }
      const at = now();
      let submission;
      if (existing) {
        submission = existing;
        submission.versionCount = (submission.versionCount || 0) + 1;
        submission.currentVersion = submission.versionCount;
        submission.status = "submitted";
        submission.score = null;
        submission.feedback = null;
        submission.gradedAt = null;
        submission.gradedBy = null;
        submission.reviewedVersion = null;
        submission.submittedAt = at;
      } else {
        submission = {
          id: nextId("submission"), courseId: course.id, studentId: u.id, stageId: stage.id,
          versionCount: 1, currentVersion: 1, status: "submitted",
          score: null, feedback: null, reviewedVersion: null, gradedAt: null, gradedBy: null, submittedAt: at,
        };
        db.submissions.push(submission);
      }
      const q = latestQuiz(course.id, u.id, stage.id);
      db.submissionVersions.push({
        id: nextId("version"), submissionId: submission.id, version: submission.currentVersion,
        taskText: String(body.taskText || ""),
        canvas: body.canvas || null,
        matrix: body.matrix || null,
        hypothesis: body.hypothesis || null,
        finance: body.finance || null,
        plan: body.plan || null,
        quiz: q ? { score: q.score, total: q.total } : null,
        at,
      });
      // M4：软门控信息（不阻断提交）
      const prevStage = stage.id > 1 ? course.stages.find(s => s.id === stage.id - 1) : null;
      const gate = prevStage
        ? { warning: !findSubmission(course.id, u.id, prevStage.id), prevStageId: prevStage.id, prevStageName: prevStage.name }
        : null;
      save();
      ok(res, { ok: true, submission: { id: submission.id, status: submission.status, versionCount: submission.versionCount }, gate });
    },
  });

  /* ---- 案例库（学生/教师浏览） ---- */
  routes.push({
    method: "GET", path: "/api/cases", handler: async (req, res) => {
      const u = requireUser(req, res);
      if (!u) return;
      const stage = req.url.includes("stage=") ? new URL(req.url, "http://x").searchParams.get("stage") : null;
      let list = db.cases.filter(c => c.status === "active");
      if (stage) list = list.filter(c => String(c.stage) === stage);
      ok(res, { cases: list.map(publicCase) });
    },
  });

  /* ---- 教师：课程 ---- */
  routes.push({
    method: "GET", path: "/api/teacher/courses", handler: async (req, res) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const list = db.courses.filter(c => c.teacherId === u.id).map(c => {
        const subs = db.submissions.filter(s => s.courseId === c.id);
        return {
          id: c.id, title: c.title, desc: c.desc || "", inviteCode: c.inviteCode, createdAt: c.createdAt,
          students: db.enrollments.filter(e => e.courseId === c.id).length,
          submissions: subs.length,
          pending: subs.filter(s => s.status === "submitted").length,
        };
      });
      ok(res, { courses: list });
    },
  });

  routes.push({
    method: "POST", path: "/api/teacher/courses", handler: async (req, res) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const body = await readBody(req);
      const title = String(body.title || "").trim();
      if (!title || title.length > 50) { fail(res, 400, "课程标题不能为空且不超过 50 字"); return; }
      let course;
      let code = genCode();
      while (db.courses.some(c => c.inviteCode === code)) code = genCode();
      course = {
        id: nextId("course"), teacherId: u.id, title,
        desc: String(body.desc || "").trim().slice(0, 100),
        inviteCode: code, createdAt: now(), stages: defaultCourse().stages,
      };
      db.courses.push(course);
      save();
      ok(res, { ok: true, course: { id: course.id, inviteCode: course.inviteCode, title: course.title } });
    },
  });

  routes.push({
    method: "GET", path: "/api/teacher/courses/:id", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      const students = db.enrollments.filter(e => e.courseId === course.id).map(e => {
        const stu = db.users.find(x => x.id === e.studentId);
        return { id: e.studentId, account: stu ? stu.account : "?", name: stu ? stu.name : "?", joinedAt: e.joinedAt };
      });
      const stages = course.stages.map(st => sanitizeStage(st, true));
      ok(res, {
        course: { id: course.id, title: course.title, desc: course.desc || "", inviteCode: course.inviteCode, createdAt: course.createdAt },
        stages, students,
      });
    },
  });

  routes.push({
    method: "PUT", path: "/api/teacher/courses/:id", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      const body = await readBody(req);
      if (typeof body.title === "string") {
        const t = body.title.trim();
        if (!t || t.length > 50) { fail(res, 400, "课程标题不能为空且不超过 50 字"); return; }
        course.title = t;
      }
      if (typeof body.desc === "string") course.desc = body.desc.trim().slice(0, 100);
      save();
      ok(res, { ok: true });
    },
  });

  routes.push({
    method: "POST", path: "/api/teacher/courses/:id/reset-invite", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      let code = genCode();
      while (db.courses.some(c => c.inviteCode === code)) code = genCode();
      course.inviteCode = code;
      save();
      ok(res, { ok: true, inviteCode: code });
    },
  });

  routes.push({
    method: "PUT", path: "/api/teacher/courses/:id/stages/:sid", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      const stage = course.stages.find(s => String(s.id) === String(params.sid));
      if (!stage) { fail(res, 404, "阶段不存在"); return; }
      const body = await readBody(req);
      if (typeof body.brief === "string") stage.brief = body.brief.trim().slice(0, 200);
      if (Array.isArray(body.knowledge)) stage.knowledge = body.knowledge.map(s => String(s).slice(0, 1000)).filter(s => s.trim());
      if (typeof body.tools === "string") stage.tools = body.tools.trim().slice(0, 2000);
      if (Array.isArray(body.tasks)) stage.tasks = body.tasks.map(s => String(s).slice(0, 1000)).filter(s => s.trim());
      if (Array.isArray(body.quiz)) {
        const quiz = [];
        for (const q of body.quiz) {
          if (!q || typeof q.q !== "string" || !Array.isArray(q.opts) || q.opts.length !== 3 ||
              !Number.isInteger(q.answer) || q.answer < 0 || q.answer > 2) {
            fail(res, 400, "自测题格式不正确（每题须 3 个选项且答案序号 0–2）"); return;
          }
          quiz.push({ q: String(q.q).slice(0, 500), opts: q.opts.map(o => String(o).slice(0, 300)), answer: q.answer, explain: String(q.explain || "").slice(0, 500) });
        }
        stage.quiz = quiz;
      }
      save();
      ok(res, { ok: true });
    },
  });

  routes.push({
    method: "GET", path: "/api/teacher/courses/:id/students", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      const detail = db.enrollments.filter(e => e.courseId === course.id).map(e => {
        const stu = db.users.find(x => x.id === e.studentId);
        const subs = db.submissions.filter(s => s.courseId === course.id && s.studentId === e.studentId);
        const graded = subs.filter(s => s.score != null);
        const sumG = graded.reduce((a, s) => a + s.score, 0);
        let quizSum = 0, quizN = 0;
        course.stages.forEach(st => { const q = latestQuiz(course.id, e.studentId, st.id); if (q) { quizSum += (q.score / q.total) * 100; quizN++; } });
        return {
          id: e.studentId, account: stu ? stu.account : "?", name: stu ? stu.name : "?", joinedAt: e.joinedAt,
          submitted: subs.length, approved: subs.filter(s => s.status === "approved").length,
          avgScore: graded.length ? Math.round((sumG / graded.length) * 10) / 10 : null,
          progress: course.stages.length ? Math.round((subs.length / course.stages.length) * 100) : 0,
          quizAccuracy: quizN ? Math.round((quizSum / quizN) * 10) / 10 : null,
        };
      });
      ok(res, { students: detail });
    },
  });

  routes.push({
    method: "DELETE", path: "/api/teacher/courses/:id/students/:studentId", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      const idx = db.enrollments.findIndex(e => e.courseId === course.id && e.studentId === params.studentId);
      if (idx < 0) { fail(res, 404, "该学生不在本课程中"); return; }
      db.enrollments.splice(idx, 1);
      save();
      ok(res, { ok: true });
    },
  });

  routes.push({
    method: "GET", path: "/api/teacher/courses/:id/submissions", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      const url = new URL(req.url, "http://x");
      const stageId = url.searchParams.get("stage");
      const status = url.searchParams.get("status");
      let list = db.submissions.filter(s => s.courseId === course.id);
      if (stageId) list = list.filter(s => String(s.stageId) === stageId);
      if (status) list = list.filter(s => s.status === status);
      const out = list.map(s => {
        const stu = db.users.find(x => x.id === s.studentId);
        const stage = course.stages.find(st => st.id === s.stageId);
        return {
          id: s.id, stageId: s.stageId, stageName: stage ? stage.name : "", deliverable: stage ? stage.deliverable : "",
          studentId: s.studentId, student: stu ? (stu.name + " (" + stu.account + ")") : "?", 
          status: s.status, score: s.score, versionCount: s.versionCount,
          submittedAt: s.submittedAt, gradedAt: s.gradedAt,
        };
      });
      out.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
      ok(res, { submissions: out });
    },
  });

  routes.push({
    method: "GET", path: "/api/teacher/courses/:id/submissions/:sid", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      const sub = db.submissions.find(s => s.id === params.sid && s.courseId === course.id);
      if (!sub) { fail(res, 404, "提交记录不存在"); return; }
      const stu = db.users.find(x => x.id === sub.studentId);
      const stage = course.stages.find(st => st.id === sub.stageId);
      ok(res, {
        submission: Object.assign({}, sub, {
          student: stu ? (stu.name + " (" + stu.account + ")") : "?", stageName: stage ? stage.name : "",
          versions: getVersions(sub.id),
        }),
      });
    },
  });

  routes.push({
    method: "PUT", path: "/api/teacher/courses/:id/submissions/:sid/review", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      const sub = db.submissions.find(s => s.id === params.sid && s.courseId === course.id);
      if (!sub) { fail(res, 404, "提交记录不存在"); return; }
      const body = await readBody(req);
      const score = body.score;
      const decision = body.decision;
      if (!Number.isInteger(score) || score < 0 || score > 100) { fail(res, 400, "分数须为 0–100 的整数"); return; }
      if (decision !== "approved" && decision !== "revise") { fail(res, 400, "评阅结论须为通过或退回修改"); return; }
      sub.status = decision;
      sub.score = score;
      sub.feedback = String(body.feedback || "").trim().slice(0, 2000);
      sub.gradedAt = now();
      sub.gradedBy = u.id;
      sub.reviewedVersion = sub.currentVersion;
      save();
      ok(res, { ok: true, status: sub.status, score: sub.score });
    },
  });

  routes.push({
    method: "GET", path: "/api/teacher/courses/:id/dashboard", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      ok(res, { stages: buildDashboard(course) });
    },
  });

  routes.push({
    method: "POST", path: "/api/teacher/courses/:id/export", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const course = getCourse(params.id);
      if (!course || course.teacherId !== u.id) { fail(res, 404, "课程不存在"); return; }
      cleanTickets();
      const token = genToken();
      db.exportTickets[token] = { courseId: course.id, userId: u.id, expires: Date.now() + TICKET_TTL };
      save();
      ok(res, { token });
    },
  });

  /* 成绩导出下载：一次性票据（M6：Token 不进 URL） */
  routes.push({
    method: "GET", path: "/files/grades.csv", handler: async (req, res) => {
      try {
        const url = new URL(req.url, "http://x");
        const ticket = url.searchParams.get("ticket");
        if (!ticket || !db.exportTickets[ticket]) { fail(res, 403, "导出票据无效或已过期"); return; }
        const rec = db.exportTickets[ticket];
        if (rec.expires < Date.now()) { delete db.exportTickets[ticket]; save(); fail(res, 403, "导出票据已过期，请重新发起导出"); return; }
        delete db.exportTickets[ticket];
        save();
        const course = getCourse(rec.courseId);
        if (!course) { fail(res, 404, "课程不存在"); return; }
        const csv = buildCsv(course);
        const fname = encodeURIComponent(course.title + "-成绩表.csv");
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename*=UTF-8''" + fname,
          "Content-Length": Buffer.byteLength(csv),
          "Cache-Control": "no-store",
        });
        res.end(csv);
      } catch (e) { fail(res, 400, "导出失败"); }
    },
  });

  /* ---- 教师：案例库维护 ---- */
  routes.push({
    method: "POST", path: "/api/teacher/cases", handler: async (req, res) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const body = await readBody(req);
      const title = String(body.title || "").trim();
      if (!title || title.length > 100) { fail(res, 400, "案例标题不能为空且不超过 100 字"); return; }
      const c = {
        id: nextId("case"), title, authorId: u.id,
        industry: String(body.industry || "").trim().slice(0, 50),
        stage: Number.isInteger(body.stage) && body.stage >= 1 && body.stage <= 6 ? body.stage : 0,
        body: String(body.body || "").trim().slice(0, 20000),
        insights: String(body.insights || "").trim().slice(0, 2000),
        status: "active", createdAt: now(),
      };
      db.cases.push(c);
      save();
      ok(res, { ok: true, id: c.id });
    },
  });

  routes.push({
    method: "PUT", path: "/api/teacher/cases/:id", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const c = db.cases.find(x => x.id === params.id);
      if (!c) { fail(res, 404, "案例不存在"); return; }
      const body = await readBody(req);
      if (typeof body.title === "string" && body.title.trim()) c.title = body.title.trim().slice(0, 100);
      if (typeof body.industry === "string") c.industry = body.industry.trim().slice(0, 50);
      if (Number.isInteger(body.stage) && body.stage >= 0 && body.stage <= 6) c.stage = body.stage;
      if (typeof body.body === "string") c.body = body.body.trim().slice(0, 20000);
      if (typeof body.insights === "string") c.insights = body.insights.trim().slice(0, 2000);
      if (body.status === "active" || body.status === "archived") c.status = body.status;
      save();
      ok(res, { ok: true });
    },
  });

  routes.push({
    method: "DELETE", path: "/api/teacher/cases/:id", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "teacher")) return;
      const idx = db.cases.findIndex(x => x.id === params.id);
      if (idx < 0) { fail(res, 404, "案例不存在"); return; }
      db.cases.splice(idx, 1);
      save();
      ok(res, { ok: true });
    },
  });

  /* ---- 管理员：教师账号管理（M1） ---- */
  routes.push({
    method: "GET", path: "/api/admin/teachers", handler: async (req, res) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "admin")) return;
      const list = db.users.filter(x => x.role === "teacher").map(x => ({
        id: x.id, account: x.account, name: x.name, status: x.status, createdAt: x.createdAt,
        courses: db.courses.filter(c => c.teacherId === x.id).length,
      }));
      ok(res, { teachers: list });
    },
  });

  routes.push({
    method: "POST", path: "/api/admin/teachers", handler: async (req, res) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "admin")) return;
      const body = await readBody(req);
      const account = String(body.account || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const password = String(body.password || "");
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(account)) { fail(res, 400, "账号须为 3–32 位字母/数字/._-"); return; }
      if (!name || name.length > 30) { fail(res, 400, "姓名不能为空且不超过 30 字"); return; }
      if (password.length < 6 || password.length > 64) { fail(res, 400, "初始密码长度须为 6–64 位"); return; }
      if (db.users.some(x => x.account === account)) { fail(res, 409, "该账号已存在"); return; }
      const salt = crypto.randomBytes(8).toString("hex");
      const t = { id: nextId("user"), role: "teacher", account, name, passHash: hashPassword(password, salt), salt, status: "active", createdAt: now() };
      db.users.push(t);
      save();
      ok(res, { ok: true, teacher: { id: t.id, account: t.account, name: t.name } });
    },
  });

  routes.push({
    method: "PUT", path: "/api/admin/teachers/:id/reset-password", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "admin")) return;
      const t = db.users.find(x => x.id === params.id && x.role === "teacher");
      if (!t) { fail(res, 404, "教师账号不存在"); return; }
      const body = await readBody(req);
      const password = String(body.password || "");
      if (password.length < 6 || password.length > 64) { fail(res, 400, "新密码长度须为 6–64 位"); return; }
      t.salt = crypto.randomBytes(8).toString("hex");
      t.passHash = hashPassword(password, t.salt);
      save();
      ok(res, { ok: true });
    },
  });

  routes.push({
    method: "PUT", path: "/api/admin/teachers/:id/status", handler: async (req, res, params) => {
      const u = requireUser(req, res);
      if (!u) return;
      if (!requireRole(u, res, "admin")) return;
      const t = db.users.find(x => x.id === params.id && x.role === "teacher");
      if (!t) { fail(res, 404, "教师账号不存在"); return; }
      const body = await readBody(req);
      if (body.status !== "active" && body.status !== "disabled") { fail(res, 400, "状态取值不合法"); return; }
      if (t.status === "disabled" && body.status === "active") {
        // 解除锁定时清除该账号的登录失败计数
        delete db.loginAttempts["acc:" + t.account];
      }
      t.status = body.status;
      save();
      ok(res, { ok: true });
    },
  });

  return routes;
}

/* ================= 静态文件服务 ================= */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveStatic(req, res, pathname) {
  let rel;
  if (pathname === "/" || pathname === "") rel = "index.html";
  else rel = pathname.replace(/^\/+/, "");
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!full.startsWith(path.normalize(PUBLIC_DIR))) { fail(res, 403, "禁止访问"); return; }
  fs.readFile(full, (err, data) => {
    if (err) { fail(res, 404, "Not Found"); return; }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}

/* ================= 主服务 ================= */
const routes = makeHandler();

function routeRequest(req, res) {
  let pathname, url;
  try {
    url = new URL(req.url, "http://x");
    pathname = url.pathname;
  } catch (e) {
    fail(res, 400, "非法请求地址");
    return;
  }
  // 动态路由优先
  const hit = matchRoute(req.method, pathname, routes);
  if (hit) {
    Promise.resolve(hit.handler(req, res, hit.params)).catch(err => {
      if (!res.headersSent) fail(res, 400, "请求处理失败：" + (err && err.message ? err.message : "未知错误"));
    });
    return;
  }
  // 其余按静态文件处理（/files/grades.csv 已由动态路由接管）
  serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  try { routeRequest(req, res); }
  catch (e) {
    if (!res.headersSent) fail(res, 500, "服务器内部错误");
    else res.end();
  }
});

/* ================= 启 动 ================= */
initDb()
  .then(() => {
    ensureAdmin();
    server.listen(PORT, () => {
      console.log("创见 BizLab V3 已启动: http://localhost:" + PORT);
      console.log("数据后端: " + (require("./db").pgActive() ? "外部 Postgres (DATABASE_URL)" : "本地文件 " + require("./db").DB_FILE));
      console.log("学生可注册；教师账号由管理员在「教师账号管理」中创建。");
    });
  })
  .catch(e => {
    console.error("[启动失败] " + (e && e.stack ? e.stack : e));
    process.exit(1);
  });

// Render 停机/重启信号：冲刷未写队列后退出
process.on("SIGTERM", () => { require("./db").flush().then(() => process.exit(0)); });
process.on("SIGINT", () => { require("./db").flush().then(() => process.exit(0)); });