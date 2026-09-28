/* 创见 BizLab V3 — API 封装 + 认证 + 通用工具 */
"use strict";
const TOKEN_KEY = "bizlab_token_v3";
const Api = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  async request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = "Bearer " + this.token;
    const res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* 非 JSON 响应（如 CSV） */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || ("请求失败 (" + res.status + ")"));
      err.status = res.status;
      err.code = data && data.code;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(p) { return this.request("GET", p); },
  post(p, b) { return this.request("POST", p, b); },
  put(p, b) { return this.request("PUT", p, b); },
  del(p) { return this.request("DELETE", p); },
  setToken(t) { this.token = t || ""; if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); },
};

const Tool = {
  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },
  nl2br(s) { return Tool.esc(s).replace(/\n/g, "<br>"); },
  fmtTime(iso) {
    if (!iso) return "-";
    try { return new Date(iso).toLocaleString("zh-CN", { hour12: false }); } catch (e) { return iso; }
  },
  stageColor(id) {
    const colors = { 1: "#4F46E5", 2: "#0EA5E9", 3: "#F59E0B", 4: "#10B981", 5: "#EF4444", 6: "#8B5CF6" };
    return colors[id] || "#4F46E5";
  },
  deliverName(t) {
    return ({ none: "无固定交付物", matrix: "机会评估矩阵", vpc: "价值主张画布", bmc: "商业模式画布",
      hypothesis: "假设清单 + MVP 实验", finance: "财务测算", plan: "商业计划书" })[t] || t;
  },
  statusBadge(s) {
    if (s === "approved") return '<span class="badge passed">已通过</span>';
    if (s === "submitted") return '<span class="badge pending">待批改</span>';
    if (s === "revise") return '<span class="badge revised">需修改</span>';
    return '<span class="badge draft">未提交</span>';
  },
  scoreCell(sub) {
    if (!sub) return '<span class="muted">-</span>';
    if (sub.score != null) return '<b class="num">' + sub.score + '</b> <span class="muted">/100</span>';
    return '<span class="badge pending">待批改</span>';
  },
  qa(unc) { return ({ high: "高", mid: "中", low: "低" })[unc] || unc; },
  pct(n) { return n == null ? "-" : (Math.round(n * 10) / 10) + "%"; },
};

const Auth = {
  switchTab(tab) {
    const isLogin = tab === "login";
    document.getElementById("tabLogin").className = isLogin ? "on" : "";
    document.getElementById("tabRegister").className = isLogin ? "" : "on";
    document.getElementById("loginForm").style.display = isLogin ? "" : "none";
    document.getElementById("registerForm").style.display = isLogin ? "none" : "";
    const mb = document.getElementById("msgBox");
    if (mb) { mb.className = "msg"; mb.textContent = ""; }
  },
  showMsg(mb, cls, text) {
    mb.className = "msg " + cls;
    mb.textContent = text;
  },
  async login(e) {
    e.preventDefault();
    const mb = document.getElementById("msgBox");
    try {
      const d = await Api.post("/api/auth/login", {
        account: document.getElementById("lgAccount").value.trim(),
        password: document.getElementById("lgPassword").value,
      });
      Api.setToken(d.token);
      location.href = "/app.html";
    } catch (err) {
      Auth.showMsg(mb, "err", err.message);
    }
  },
  async register(e) {
    e.preventDefault();
    const mb = document.getElementById("msgBox");
    const p1 = document.getElementById("rgPassword").value;
    const p2 = document.getElementById("rgPassword2").value;
    if (p1 !== p2) { Auth.showMsg(mb, "err", "两次输入的密码不一致"); return; }
    try {
      const d = await Api.post("/api/auth/register", {
        account: document.getElementById("rgAccount").value.trim(),
        name: document.getElementById("rgName").value.trim(),
        password: p1,
      });
      Api.setToken(d.token);
      location.href = "/app.html";
    } catch (err) {
      Auth.showMsg(mb, "err", err.message);
    }
  },
};