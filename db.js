/**
 * 创见 BizLab V3 — 数据持久化层
 * 双后端：本地 JSON 文件（默认，零依赖）+ 外部 Postgres KV（设置 DATABASE_URL 时启用，用于 Render 免费档等无持久卷环境）
 * 数据目录可通过环境变量 DATA_DIR 覆盖，默认为 <项目根>/data
 *   - 本地开发：使用 ./data（无 DATABASE_URL）
 *   - 云端部署：设置 DATABASE_URL（外部免费 Postgres，如 Neon/Supabase），本地文件仅作兜底
 */
"use strict";
const fs = require("fs");
const path = require("path");

const DATA_DIR = (process.env.DATA_DIR && process.env.DATA_DIR.trim())
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const PGDATA_KEY = "db.json";
const PG_TABLE = "bizlab_kv";

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

let db = JSON.parse(JSON.stringify(EMPTY));

/* ================= 本地文件后端 ================= */
function loadFromFile() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Object.assign(JSON.parse(JSON.stringify(EMPTY)), parsed);
  } catch (e) {
    return JSON.parse(JSON.stringify(EMPTY));
  }
}

/**
 * 将数据原地灌入 db 引用（不变更对象身份）。
 * server.js 通过 require 解构拿到 db 后持续引用同一对象，save()/nextId() 也用同一对象，
 * 因此禁止用 db = xxx 重新赋值。
 */
function fillDb(data) {
  Object.keys(db).forEach(k => { delete db[k]; });
  Object.assign(db, data);
}

function saveToFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1), "utf8");
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error("[db] 本地文件写入失败（若已配置 DATABASE_URL 可忽略）: " + e.message);
  }
}

/* ================= Postgres KV 后端（可选） ================= */
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
let pgClient = null;
let pgReady = false;          // PG 可用且已加载数据
let pendingSnapshot = null;   // 待写入 PG 的最新快照（合并去重）
let pgWriteRunning = false;
let pgWriteChain = Promise.resolve();

function pgEnabled() {
  return !!DATABASE_URL;
}

function loadFromPgClient(client) {
  return new Promise((resolve, reject) => {
    client.query('CREATE TABLE IF NOT EXISTS ' + PG_TABLE + ' (k text PRIMARY KEY, v text NOT NULL)', (err) => {
      if (err) { reject(err); return; }
      client.query('SELECT v FROM ' + PG_TABLE + ' WHERE k = $1', [PGDATA_KEY], (err2, result) => {
        if (err2) { reject(err2); return; }
        try {
          if (result.rows.length) {
            const parsed = JSON.parse(result.rows[0].v);
            fillDb(Object.assign(JSON.parse(JSON.stringify(EMPTY)), parsed));
          }
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });
}

/**
 * 启动初始化：优先 PG（存在 DATABASE_URL），否则本地文件。
 * 必须在监听端口前 await。
 */
async function initDb() {
  if (pgEnabled()) {
    try {
      const { Client } = require("pg");
      pgClient = new Client({
        connectionString: DATABASE_URL,
        ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
      });
      await pgClient.connect();
      await loadFromPgClient(pgClient);
      pgReady = true;
      console.log("[db] 已连接外部 Postgres 并完成数据加载");
    } catch (e) {
      console.error("[db] 外部 Postgres 连接失败，回退本地文件模式: " + e.message);
      pgClient = null;
      fillDb(loadFromFile());
    }
  } else {
    fillDb(loadFromFile());
  }
}

/** PG 串行写队列：仅保留最新快照，避免频繁 upsert */
function enqueuePgWrite() {
  if (!pgReady || !pgClient) return;
  pendingSnapshot = JSON.stringify(db);
  if (pgWriteRunning) return;
  pgWriteRunning = true;
  pgWriteChain = pgWriteChain.then(async () => {
    while (pendingSnapshot !== null && pgReady) {
      const snap = pendingSnapshot;
      pendingSnapshot = null;
      try {
        await pgClient.query(
          'INSERT INTO ' + PG_TABLE + ' (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v',
          [PGDATA_KEY, snap]
        );
      } catch (e) {
        console.error("[db] Postgres 写入失败: " + e.message);
        pendingSnapshot = null;
        break;
      }
    }
    pgWriteRunning = false;
  });
}

/** 进程退出前冲刷未写队列（可由 server.js 调） */
async function flush() {
  if (!pgReady || !pgClient) return;
  while (pendingSnapshot !== null && pgReady) {
    const snap = pendingSnapshot;
    pendingSnapshot = null;
    try {
      await pgClient.query(
        'INSERT INTO ' + PG_TABLE + ' (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v',
        [PGDATA_KEY, snap]
      );
    } catch (e) {
      console.error("[db] Postgres 冲刷失败: " + e.message);
      pendingSnapshot = null;
      break;
    }
  }
  await pgClient.end();
}

function save() {
  saveToFile();          // 本地兜底（无持久卷环境下可能失败但不影响）
  enqueuePgWrite();      // PG 模式异步合并落库
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

function pgActive() { return pgReady; }

module.exports = { db, save, nextId, DB_FILE, DATA_DIR, initDb, flush, pgEnabled, pgActive };