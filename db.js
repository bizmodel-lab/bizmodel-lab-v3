/**
 * 创见 BizLab V3 — JSON 文件数据库
 * 零依赖：数据持久化到磁盘，写操作同步落盘（临时文件 + 原子改名）
 * 数据目录可通过环境变量 DATA_DIR 覆盖，默认为 <项目根>/data
 *   - 本地开发：使用 ./data
 *   - Render / PaaS 部署：将 DATA_DIR 指向挂载的持久卷路径（如 /data）
 */
"use strict";
const fs = require("fs");
const path = require("path");

const DATA_DIR = (process.env.DATA_DIR && process.env.DATA_DIR.trim())
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const EMPTY = {
  users: [],            // {id, role: admin|teacher|student, account, name, passHash, salt, status, createdAt}
  sessions: {},         // token -> {userId, expires}
  courses: [],          // {id, teacherId, title, desc, inviteCode, createdAt, stages:[]}
  enrollments: [],      // {courseId, studentId, joinedAt}
  submissions: [],      // 提交主记录：{id, courseId, studentId, stageId, versionCount, currentVersion, status, score, feedback, reviewedVersion, submittedAt, gradedAt, gradedBy}
  submissionVersions: [], // 提交版本快照：{id, submissionId, version, taskText, canvas, matrix, hypothesis, finance, plan, quiz, at}
  quizLog: {},          // quiz_<courseId>_<studentId>_<stageId> -> {score,total,answers,at}（仅最近一次，练习定位）
  cases: [],            // {id, title, industry, stage, authorId, body, insights, status, createdAt}
  loginAttempts: {},    // acc:<account> -> {failCount, lockUntil}；ip:<ip> -> {windowStart, count}
  exportTickets: {},    // token -> {courseId, userId, expires}（一次性成绩导出票据）
  counters: { user: 0, course: 0, submission: 0, version: 0, case: 0 },
};

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw);
    return Object.assign(JSON.parse(JSON.stringify(EMPTY)), db);
  } catch (e) {
    return JSON.parse(JSON.stringify(EMPTY));
  }
}

let db = load();

function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

function nextId(kind) {
  db.counters[kind] = (db.counters[kind] || 0) + 1;
  const n = db.counters[kind];
  if (kind === "user") return "u" + n;
  if (kind === "course") return "c" + n;
  if (kind === "submission") return "s" + n;
  if (kind === "version") return "v" + n;
  if (kind === "case") return "cs" + n;
  return String(n);
}

module.exports = { db, save, nextId, DB_FILE, DATA_DIR };