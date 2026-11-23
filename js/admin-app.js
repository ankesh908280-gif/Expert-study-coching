// Expert Study — Production Teacher Admin Panel Module (v4 — 100% Real Firebase, Full CRUD)
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getYouTubeThumbnail,
  parseDrivePreviewUrl,
  showToast,
  formatDate,
  escapeHtml,
  safeStorage
} from "./utils.js";

const ADMIN_AUTH_KEY = "expert_study_admin_auth";
const THEME_KEY = "expert_study_theme";
const DEFAULT_SUBJECTS = ["Maths", "Science", "Hindi", "English", "Social Science"];

const adminState = {
  appConfig: {
    appName: "Expert Study",
    tagline: "Learn • Practice • Excel",
    whatsappNumber: "",
    adminPasscode: "expert2026",
    heroBanner: { title: "Board Topper Batch 2026", subtitle: "Complete NCERT + PYQs + Weekly MCQ Tests", imageUrl: "" },
    liveClass: { isLive: false, title: "", batchId: "all", youtubeUrl: "" }
  },
  batches: [],
  lectures: [],
  notes: [],
  notices: [],
  tests: [],
  testResults: [],
  students: [],
  draftQuestions: [],
  pendingDelete: null
};

// ==================== FIREBASE SYNC STATUS PILL ====================
function setSyncStatus(ok, detail = "") {
  const pill = document.getElementById("firebase-sync-pill");
  if (!pill) return;
  if (ok) {
    pill.className = "sync-pill is-ok";
    pill.innerHTML = `<i class="fa-solid fa-circle" style="font-size:0.45rem;"></i> Firebase Live`;
    pill.title = "Connected to expert-study-20f20 Firestore";
  } else {
    pill.className = "sync-pill is-err";
    pill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error: ${escapeHtml(detail || "Sync failed")}`;
    pill.title = detail || "Firestore sync error";
  }
}

// ==================== LOGO & THEME ====================
function initLogoFallbacks() {
  document.querySelectorAll("img[data-logo-img]").forEach((img) => {
    const fb = img.nextElementSibling;
    const hide = () => { img.classList.add("hidden"); if (fb) fb.classList.remove("hidden"); };
    img.addEventListener("error", hide);
    if (img.complete && img.naturalWidth === 0) hide();
  });
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  if (isDark) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  safeStorage.set(THEME_KEY, isDark ? "dark" : "light");

  const cls = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
  const topIcon = document.getElementById("admin-theme-icon");
  if (topIcon) topIcon.className = cls;
  const authBtn = document.getElementById("admin-auth-theme-btn");
  if (authBtn) authBtn.innerHTML = `<i class="${cls}"></i>`;
}

function toggleTheme() {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
}

function lockAdminPanel() {
  safeStorage.remove(ADMIN_AUTH_KEY);
  document.getElementById("admin-app-shell").classList.add("hidden");
  document.getElementById("admin-login-screen").classList.remove("hidden");
  document.getElementById("admin-passcode-input").value = "";
  showToast("Admin Panel locked.", "info");
}

// ==================== 7-TAB NAVIGATION ====================
function switchAdminTab(tabName) {
  document.querySelectorAll("[data-admin-panel]").forEach((p) => {
    p.classList.toggle("hidden", p.getAttribute("data-admin-panel") !== tabName);
  });
  document.querySelectorAll("[data-admin-tab]").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-admin-tab") === tabName);
  });
}

// ==================== DYNAMIC BATCH & SUBJECT DROPDOWNS ====================
function getBatchSubjects(batchId) {
  const batch = adminState.batches.find((b) => b.id === batchId);
  return Array.isArray(batch?.subjects) && batch.subjects.length ? batch.subjects : DEFAULT_SUBJECTS;
}

function populateSubjectSelect(selectId, batchId, keepValue = "") {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const subjects = getBatchSubjects(batchId);
  sel.innerHTML = subjects.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  if (keepValue && subjects.includes(keepValue)) sel.value = keepValue;
}

function syncBatchDropdowns() {
  const batchOpts = adminState.batches.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join("");
  const withAll = `<option value="all">All Batches</option>${batchOpts}`;

  ["lec-batch", "note-batch", "test-batch-select"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = batchOpts || `<option value="">Create a batch in Batches tab first</option>`;
    if (prev && adminState.batches.some((b) => b.id === prev)) el.value = prev;
  });

  ["live-batch-select", "notice-batch"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = withAll;
    if (prev) el.value = prev;
  });

  populateSubjectSelect("lec-subject", document.getElementById("lec-batch").value, document.getElementById("lec-subject").value);
  populateSubjectSelect("note-subject", document.getElementById("note-batch").value, document.getElementById("note-subject").value);
  populateSubjectSelect("test-subject-select", document.getElementById("test-batch-select").value, document.getElementById("test-subject-select").value);

  document.getElementById("default-batches-helper").classList.toggle("hidden", adminState.batches.length > 0);
}

function renderStats() {
  document.getElementById("stat-total-students").textContent = String(adminState.students.length);
  document.getElementById("stat-total-lectures").textContent = String(adminState.lectures.length);
  document.getElementById("stat-total-notes").textContent = String(adminState.notes.length);
  document.getElementById("stat-total-tests").textContent = String(adminState.tests.filter((t) => t.isActive !== false).length);
}

function renderConfigControls() {
  const cfg = adminState.appConfig;
  const live = cfg.liveClass || {};

  const badge = document.getElementById("admin-live-status-badge");
  const btn = document.getElementById("toggle-live-btn");
  if (live.isLive) {
    badge.className = "pill-badge pill-live";
    badge.innerHTML = `<span class="live-dot"></span>LIVE NOW`;
    btn.className = "btn btn-danger";
    btn.innerHTML = `<i class="fa-solid fa-stop"></i> END LIVE CLASS`;
  } else {
    badge.className = "pill-badge pill-gold";
    badge.textContent = "Offline";
    btn.className = "btn btn-primary";
    btn.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> START LIVE CLASS`;
  }

  if (document.activeElement?.id !== "live-title-input") document.getElementById("live-title-input").value = live.title || "";
  if (document.activeElement?.id !== "live-url-input") document.getElementById("live-url-input").value = live.youtubeUrl || "";
  const liveSel = document.getElementById("live-batch-select");
  if (liveSel && live.batchId) liveSel.value = live.batchId;

  document.getElementById("set-app-name").value = cfg.appName || "Expert Study";
  document.getElementById("set-tagline").value = cfg.tagline || "Learn • Practice • Excel";
  document.getElementById("set-whatsapp").value = cfg.whatsappNumber || "";
  document.getElementById("set-passcode").value = cfg.adminPasscode || "expert2026";
  document.getElementById("set-hero-title").value = cfg.heroBanner?.title || "Board Topper Batch 2026";
  document.getElementById("set-hero-subtitle").value = cfg.heroBanner?.subtitle || "Complete NCERT + PYQs + Weekly MCQ Tests";
}

// ==================== RENDER ALL LISTS WITH EDIT + DELETE ====================
function getBatchName(id) {
  if (id === "all") return "All Batches";
  return adminState.batches.find((b) => b.id === id)?.name || id || "Batch";
}

function renderLecturesList() {
  const el = document.getElementById("admin-lectures-list");
  if (!adminState.lectures.length) {
    el.innerHTML = `<div class="glass-card empty-state"><p class="empty-state-title">No lectures uploaded yet</p></div>`;
    return;
  }
  el.innerHTML = adminState.lectures
    .map((l) => `
      <div class="glass-card admin-list-item">
        <div style="min-width:0;">
          <div class="lecture-title" style="margin:0;">${escapeHtml(l.title)}</div>
          <div class="lecture-meta">
            <span class="pill-badge pill-blue" style="padding:2px 8px; font-size:0.68rem;">${escapeHtml(l.subject)}</span>
            <span>${escapeHtml(getBatchName(l.batchId))}</span>
            <span>• ${escapeHtml(l.teacher || "Uttam Sir")}</span>
            ${l.duration ? `<span>• ${escapeHtml(l.duration)}</span>` : ""}
            ${l.pdfUrl ? `<span class="pill-badge pill-gold" style="padding:2px 7px; font-size:0.65rem;"><i class="fa-solid fa-file-pdf"></i> PDF</span>` : ""}
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button type="button" class="btn btn-glass btn-xs" data-edit-lec="${escapeHtml(l.id)}" title="Edit Lecture"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="btn btn-danger-soft btn-xs" data-del-col="lectures" data-del-id="${escapeHtml(l.id)}" data-del-label="${escapeHtml(l.title)}" title="Delete Lecture"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`)
    .join("");
}

function renderNotesList() {
  const el = document.getElementById("admin-notes-list");
  if (!adminState.notes.length) {
    el.innerHTML = `<div class="glass-card empty-state"><p class="empty-state-title">No PDF notes uploaded yet</p></div>`;
    return;
  }
  el.innerHTML = adminState.notes
    .map((n) => `
      <div class="glass-card admin-list-item">
        <div style="min-width:0;">
          <div class="lecture-title" style="margin:0;">${escapeHtml(n.title)}</div>
          <div class="lecture-meta">
            <span class="pill-badge pill-gold" style="padding:2px 8px; font-size:0.68rem;">${escapeHtml(n.subject)}</span>
            <span>${escapeHtml(getBatchName(n.batchId))}</span>
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button type="button" class="btn btn-glass btn-xs" data-edit-note="${escapeHtml(n.id)}" title="Edit PDF"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="btn btn-danger-soft btn-xs" data-del-col="notes" data-del-id="${escapeHtml(n.id)}" data-del-label="${escapeHtml(n.title)}" title="Delete PDF"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`)
    .join("");
}

function renderNoticesList() {
  const el = document.getElementById("admin-notices-list");
  if (!adminState.notices.length) {
    el.innerHTML = `<div class="glass-card empty-state"><p class="empty-state-title">No notices posted yet</p></div>`;
    return;
  }
  el.innerHTML = adminState.notices
    .map((n) => `
      <div class="glass-card admin-list-item">
        <div style="min-width:0;">
          <div class="lecture-title" style="margin:0;">${escapeHtml(n.title)}</div>
          <div class="notice-date">${escapeHtml(getBatchName(n.batchId))} • ${escapeHtml(formatDate(n.createdAt))}</div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button type="button" class="btn btn-glass btn-xs" data-edit-notice="${escapeHtml(n.id)}" title="Edit Notice"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="btn btn-danger-soft btn-xs" data-del-col="notices" data-del-id="${escapeHtml(n.id)}" data-del-label="${escapeHtml(n.title)}" title="Delete Notice"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`)
    .join("");
}

function renderBatchesList() {
  const el = document.getElementById("admin-batches-list");
  if (!adminState.batches.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = adminState.batches
    .map((b) => `
      <div class="glass-card admin-list-item">
        <div style="min-width:0;">
          <div class="lecture-title" style="margin:0;">${escapeHtml(b.name)}</div>
          <div class="notice-date">${escapeHtml(b.className)} • ${(b.subjects || DEFAULT_SUBJECTS).join(", ")}</div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button type="button" class="btn btn-glass btn-xs" data-edit-batch="${escapeHtml(b.id)}" title="Edit Batch"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="btn btn-danger-soft btn-xs" data-del-col="batches" data-del-id="${escapeHtml(b.id)}" data-del-label="${escapeHtml(b.name)}" title="Delete Batch"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`)
    .join("");
}

function renderDraftQuestions() {
  const el = document.getElementById("draft-questions-list");
  document.getElementById("draft-q-count").textContent = `${adminState.draftQuestions.length} Questions`;
  if (!adminState.draftQuestions.length) {
    el.innerHTML = `<p class="empty-state-sub" style="text-align:center;">No questions added yet. Add single questions or use Fast Bulk Paste.</p>`;
    return;
  }
  const letters = ["A", "B", "C", "D"];
  el.innerHTML = adminState.draftQuestions
    .map((q, i) => `
      <div class="glass-card admin-list-item" style="padding:10px 12px;">
        <div style="min-width:0;">
          <div class="lecture-title" style="margin:0; font-size:0.84rem;">${i + 1}. ${escapeHtml(q.q)}</div>
          <div class="notice-date">Correct: Option ${letters[q.correctIndex] || "A"} (${escapeHtml(q.options?.[q.correctIndex] || "")})</div>
        </div>
        <div style="display:flex; gap:5px; flex-shrink:0;">
          <button type="button" class="btn btn-glass btn-xs" data-edit-draft-q="${i}" title="Edit Question"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="btn btn-danger-soft btn-xs" data-remove-draft-q="${i}" title="Remove Question"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`)
    .join("");
}

function renderTestsList() {
  const el = document.getElementById("admin-tests-list");
  if (!adminState.tests.length) {
    el.innerHTML = `<div class="glass-card empty-state"><p class="empty-state-title">No tests created yet</p></div>`;
    return;
  }
  el.innerHTML = adminState.tests
    .map((t) => {
      const subCount = adminState.testResults.filter((r) => r.testId === t.id).length;
      return `
      <div class="glass-card admin-list-item">
        <div style="min-width:0;">
          <div class="lecture-title" style="margin:0;">${escapeHtml(t.title)}</div>
          <div class="lecture-meta">
            <span class="pill-badge pill-gold" style="padding:2px 8px; font-size:0.68rem;">${escapeHtml(t.subject)}</span>
            <span>${(t.questions || []).length} Qs • ${t.durationMinutes || 10} mins</span>
            <span class="pill-badge ${t.isActive !== false ? "pill-success" : "pill-danger"}" style="padding:2px 7px; font-size:0.65rem;">${t.isActive !== false ? "Active" : "Hidden"}</span>
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button type="button" class="btn btn-glass btn-xs" data-view-subs="${escapeHtml(t.id)}" title="View Scores (${subCount})"><i class="fa-solid fa-chart-column"></i> ${subCount}</button>
          <button type="button" class="btn btn-glass btn-xs" data-edit-test="${escapeHtml(t.id)}" title="Edit Test"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="btn btn-danger-soft btn-xs" data-del-col="tests" data-del-id="${escapeHtml(t.id)}" data-del-label="${escapeHtml(t.title)}" title="Delete Test"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    })
    .join("");
}

function renderStudentsList() {
  const el = document.getElementById("admin-students-list");
  const term = (document.getElementById("student-search-input")?.value || "").trim().toLowerCase();
  const statusFilter = document.getElementById("student-status-filter")?.value || "all";

  const filtered = adminState.students.filter((s) => {
    const matchText = !term || (s.name || "").toLowerCase().includes(term) || (s.phone || "").includes(term);
    const matchStatus = statusFilter === "all" || (s.status || "approved") === statusFilter;
    return matchText && matchStatus;
  });

  if (!filtered.length) {
    el.innerHTML = `<div class="glass-card empty-state"><p class="empty-state-title">No registered students yet</p></div>`;
    return;
  }

  const batchOpts = (currentId) =>
    adminState.batches
      .map((b) => `<option value="${escapeHtml(b.id)}" ${b.id === currentId ? "selected" : ""}>${escapeHtml(b.className || b.name)}</option>`)
      .join("");

  el.innerHTML = filtered
    .map((s) => {
      const st = s.status || "approved";
      const badgeCls = st === "approved" ? "pill-success" : st === "blocked" ? "pill-danger" : "pill-gold";
      return `
        <div class="glass-card admin-list-item" style="flex-direction:column; align-items:stretch; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="min-width:0;">
              <div class="lecture-title" style="margin:0;">${escapeHtml(s.name)}</div>
              <div class="lecture-meta">
                <span>+91 ${escapeHtml(s.phone)}</span>
                <span class="pill-badge ${badgeCls}" style="padding:2px 8px; font-size:0.68rem;">${escapeHtml(st)}</span>
              </div>
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0;">
              ${st !== "approved" ? `<button type="button" class="btn btn-success-soft btn-xs" data-student-status="approved" data-student-phone="${escapeHtml(s.phone)}">Approve</button>` : ""}
              ${st !== "blocked" ? `<button type="button" class="btn btn-danger-soft btn-xs" data-student-status="blocked" data-student-phone="${escapeHtml(s.phone)}">Block</button>` : `<button type="button" class="btn btn-success-soft btn-xs" data-student-status="approved" data-student-phone="${escapeHtml(s.phone)}">Unblock</button>`}
              <button type="button" class="btn btn-danger-soft btn-xs" data-del-col="students" data-del-id="${escapeHtml(s.phone)}" data-del-label="${escapeHtml(s.name)}" title="Delete Student"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
          ${adminState.batches.length ? `
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="notice-date">Assigned Batch:</span>
            <select class="glass-select" style="padding:6px 32px 6px 10px; font-size:0.78rem;" data-change-stu-batch="${escapeHtml(s.phone)}">
              ${batchOpts(s.batchId)}
            </select>
          </div>` : ""}
        </div>`;
    })
    .join("");
}

// ==================== BULK PASTE PARSER ====================
function parseBulkQuestions(rawText) {
  const blocks = rawText.trim().split(/\n\s*\n+/);
  const parsed = [];
  const ansMap = { A: 0, B: 1, C: 2, D: 3 };

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 5) continue;
    const qLine = lines[0].replace(/^(?:Q\d*[:.)]\s*|\d+[.)]\s*)/i, "").trim();
    const opts = [];
    let correctIndex = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const ansMatch = line.match(/^(?:ANS|ANSWER|CORRECT)\s*[:=-]\s*([A-D1-4])/i);
      if (ansMatch) {
        const token = ansMatch[1].toUpperCase();
        correctIndex = ansMap[token] !== undefined ? ansMap[token] : Math.max(0, Math.min(3, Number(token) - 1));
      } else if (/^[A-D][).:\-\s]/i.test(line)) {
        opts.push(line.replace(/^[A-D][).:\-\s]+/i, "").trim());
      }
    }
    if (qLine && opts.length >= 2) {
      while (opts.length < 4) opts.push("None of these");
      parsed.push({ q: qLine, options: opts.slice(0, 4), correctIndex });
    }
  }
  return parsed;
}

// ==================== FORM RESET HELPERS ====================
function resetLectureForm() {
  document.getElementById("add-lecture-form").reset();
  document.getElementById("edit-lec-id").value = "";
  document.getElementById("lec-teacher").value = "Uttam Sir";
  document.getElementById("lec-thumb-preview").classList.add("hidden");
  document.getElementById("lec-form-heading").innerHTML = `<i class="fa-solid fa-circle-play" style="color:var(--brand-blue);"></i> Add Recorded Lecture`;
  document.getElementById("lec-submit-btn").innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Publish Lecture`;
  document.getElementById("cancel-lec-edit-btn").classList.add("hidden");
}

function resetNoteForm() {
  document.getElementById("add-note-form").reset();
  document.getElementById("edit-note-id").value = "";
  document.getElementById("note-form-heading").innerHTML = `<i class="fa-solid fa-file-pdf" style="color:var(--color-danger);"></i> Add PDF Notes`;
  document.getElementById("note-submit-btn").innerHTML = `<i class="fa-solid fa-file-circle-plus"></i> Publish PDF Note`;
  document.getElementById("cancel-note-edit-btn").classList.add("hidden");
}

function resetNoticeForm() {
  document.getElementById("add-notice-form").reset();
  document.getElementById("edit-notice-id").value = "";
  document.getElementById("notice-form-heading").innerHTML = `<i class="fa-solid fa-bullhorn" style="color:var(--brand-gold);"></i> Post Announcement`;
  document.getElementById("notice-submit-btn").innerHTML = `<i class="fa-solid fa-paper-plane"></i> Post Notice`;
  document.getElementById("cancel-notice-edit-btn").classList.add("hidden");
}

function resetTestForm() {
  document.getElementById("edit-test-id").value = "";
  document.getElementById("test-title-input").value = "";
  document.getElementById("test-duration-input").value = "15";
  document.getElementById("test-active-select").value = "true";
  adminState.draftQuestions = [];
  renderDraftQuestions();
  document.getElementById("test-form-heading").innerHTML = `<i class="fa-solid fa-clipboard-list" style="color:var(--brand-gold);"></i> MCQ Test Creator`;
  document.getElementById("publish-test-btn").innerHTML = `<i class="fa-solid fa-rocket"></i> Publish MCQ Test`;
  document.getElementById("cancel-test-edit-btn").classList.add("hidden");
}

// ==================== DELETE & SUBMISSIONS MODALS ====================
function openDeleteConfirm(col, id, label) {
  adminState.pendingDelete = { col, id };
  document.getElementById("confirm-delete-text").textContent =
    `Delete "${label || "this item"}" permanently from Firebase?`;
  document.getElementById("admin-confirm-modal").classList.add("open");
}

function closeDeleteConfirm() {
  adminState.pendingDelete = null;
  document.getElementById("admin-confirm-modal").classList.remove("open");
}

function openSubmissionsModal(testId) {
  const test = adminState.tests.find((t) => t.id === testId);
  const subs = adminState.testResults
    .filter((r) => r.testId === testId)
    .sort((a, b) => Number(b.percentage || 0) - Number(a.percentage || 0));

  document.getElementById("submissions-modal-title").innerHTML =
    `<i class="fa-solid fa-chart-column" style="color:var(--brand-blue);"></i> ${escapeHtml(test?.title || "Submissions")}`;

  const body = document.getElementById("submissions-modal-body");
  body.innerHTML = subs.length
    ? subs
        .map(
          (r, i) => `
        <div class="glass-card leaderboard-row">
          <div>
            <div class="lecture-title" style="margin:0;">#${i + 1} ${escapeHtml(r.studentName)}</div>
            <div class="notice-date">+91 ${escapeHtml(r.studentPhone)} • ${r.score}/${r.totalQuestions} • ${escapeHtml(formatDate(r.submittedAt))}</div>
          </div>
          <span class="pill-badge pill-gold">${r.percentage}%</span>
        </div>`
        )
        .join("")
    : `<div class="empty-state"><p class="empty-state-title">No student submissions yet</p></div>`;

  document.getElementById("test-submissions-modal").classList.add("open");
}

// ==================== REAL-TIME FIRESTORE LISTENERS ====================
function startAdminListeners() {
  const onErr = (err) => {
    console.error("Firestore error:", err);
    setSyncStatus(false, err.code || err.message || "Permission denied");
  };

  onSnapshot(
    doc(db, "settings", "appConfig"),
    (snap) => {
      setSyncStatus(true);
      if (snap.exists()) adminState.appConfig = { ...adminState.appConfig, ...snap.data() };
      renderConfigControls();
    },
    onErr
  );

  onSnapshot(
    collection(db, "batches"),
    (snap) => {
      setSyncStatus(true);
      adminState.batches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      syncBatchDropdowns();
      renderBatchesList();
      renderLecturesList();
      renderNotesList();
      renderStudentsList();
    },
    onErr
  );

  onSnapshot(collection(db, "lectures"), (snap) => {
    adminState.lectures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStats();
    renderLecturesList();
  }, onErr);

  onSnapshot(collection(db, "notes"), (snap) => {
    adminState.notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStats();
    renderNotesList();
  }, onErr);

  onSnapshot(collection(db, "notices"), (snap) => {
    adminState.notices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderNoticesList();
  }, onErr);

  onSnapshot(collection(db, "tests"), (snap) => {
    adminState.tests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStats();
    renderTestsList();
  }, onErr);

  onSnapshot(collection(db, "testResults"), (snap) => {
    adminState.testResults = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTestsList();
  }, onErr);

  onSnapshot(collection(db, "students"), (snap) => {
    adminState.students = snap.docs.map((d) => ({ phone: d.id, ...d.data() }));
    renderStats();
    renderStudentsList();
  }, onErr);

  onSnapshot(query(collection(db, "liveChat"), orderBy("createdAt", "asc")), (snap) => {
    const box = document.getElementById("admin-live-chat-messages");
    document.getElementById("admin-chat-count").textContent = `${snap.size} msgs`;
    if (snap.empty) {
      box.innerHTML = `<p class="empty-state-sub" style="text-align:center; margin:auto;">No live chat messages yet.</p>`;
      return;
    }
    box.innerHTML = snap.docs
      .map((d) => {
        const m = d.data();
        const isTeacher = m.senderRole === "teacher";
        return `
          <div class="chat-bubble ${isTeacher ? "is-teacher" : ""}">
            <div class="chat-sender">
              <span>${escapeHtml(m.senderName || "Student")}</span>
              ${isTeacher ? `<span class="teacher-badge"><i class="fa-solid fa-crown"></i> Teacher</span>` : ""}
            </div>
            <div>${escapeHtml(m.message)}</div>
          </div>`;
      })
      .join("");
    box.scrollTop = box.scrollHeight;
  }, onErr);
}

// ==================== BIND EVENTS ====================
function bindAdminEvents() {
  document.getElementById("admin-theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("admin-auth-theme-btn").addEventListener("click", toggleTheme);

  document.getElementById("admin-login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const entered = document.getElementById("admin-passcode-input").value.trim();
    const expected = adminState.appConfig.adminPasscode || "expert2026";
    if (entered !== expected) return showToast("Invalid admin passcode.", "error");
    safeStorage.set(ADMIN_AUTH_KEY, "unlocked");
    document.getElementById("admin-login-screen").classList.add("hidden");
    document.getElementById("admin-app-shell").classList.remove("hidden");
    showToast("Admin Panel unlocked!", "success");
  });

  document.getElementById("admin-logout-btn").addEventListener("click", lockAdminPanel);
  document.getElementById("admin-header-logout-btn").addEventListener("click", lockAdminPanel);

  document.querySelectorAll("[data-admin-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchAdminTab(btn.getAttribute("data-admin-tab")));
  });

  // Dynamic Subject sync when Batch changes
  document.getElementById("lec-batch").addEventListener("change", (e) => populateSubjectSelect("lec-subject", e.target.value));
  document.getElementById("note-batch").addEventListener("change", (e) => populateSubjectSelect("note-subject", e.target.value));
  document.getElementById("test-batch-select").addEventListener("change", (e) => populateSubjectSelect("test-subject-select", e.target.value));

  // Cancel Edit buttons
  document.getElementById("cancel-lec-edit-btn").addEventListener("click", resetLectureForm);
  document.getElementById("cancel-note-edit-btn").addEventListener("click", resetNoteForm);
  document.getElementById("cancel-notice-edit-btn").addEventListener("click", resetNoticeForm);
  document.getElementById("cancel-test-edit-btn").addEventListener("click", resetTestForm);
  document.getElementById("cancel-batch-edit-btn").addEventListener("click", () => {
    document.getElementById("add-batch-form").reset();
    document.getElementById("edit-batch-id").value = "";
    document.getElementById("batch-subjects").value = DEFAULT_SUBJECTS.join(", ");
    document.getElementById("cancel-batch-edit-btn").classList.add("hidden");
  });

  // Modals close
  document.getElementById("cancel-delete-modal").addEventListener("click", closeDeleteConfirm);
  document.getElementById("confirm-delete-no").addEventListener("click", closeDeleteConfirm);
  document.getElementById("close-submissions-modal").addEventListener("click", () => {
    document.getElementById("test-submissions-modal").classList.remove("open");
  });

  document.getElementById("confirm-delete-yes").addEventListener("click", async () => {
    if (!adminState.pendingDelete) return;
    const { col, id } = adminState.pendingDelete;
    closeDeleteConfirm();
    try {
      await deleteDoc(doc(db, col, id));
      showToast("Deleted from Firebase.", "info");
    } catch (err) {
      setSyncStatus(false, err.message);
      showToast(`Delete failed: ${err.message}`, "error");
    }
  });

  // 1-Click Default Class 9 & 10 Batches Helper (Admin Only, when empty)
  document.getElementById("create-default-batches-btn").addEventListener("click", async () => {
    try {
      await setDoc(doc(db, "batches", "class-9-foundation"), {
        name: "Class 9 — Foundation Batch",
        className: "Class 9",
        tagline: "Strong NCERT Concepts + Weekly Practice",
        bannerColor: "theme-emerald",
        subjects: DEFAULT_SUBJECTS,
        isActive: true,
        createdAt: serverTimestamp()
      });
      await setDoc(doc(db, "batches", "class-10-board-topper"), {
        name: "Class 10 — Board Topper Batch",
        className: "Class 10",
        tagline: "Complete Board Syllabus + PYQs & Tests",
        bannerColor: "theme-blue",
        subjects: DEFAULT_SUBJECTS,
        isActive: true,
        createdAt: serverTimestamp()
      });
      showToast("Class 9 & Class 10 batches created in Firebase!", "success");
    } catch (err) {
      setSyncStatus(false, err.message);
      showToast(`Failed: ${err.message}`, "error");
    }
  });

  // Go Live Toggle
  document.getElementById("toggle-live-btn").addEventListener("click", async () => {
    const currentlyLive = Boolean(adminState.appConfig.liveClass?.isLive);
    const title = document.getElementById("live-title-input").value.trim();
    const youtubeUrl = document.getElementById("live-url-input").value.trim();
    const batchId = document.getElementById("live-batch-select").value || "all";

    if (!currentlyLive && (!title || !youtubeUrl)) {
      return showToast("Enter Live Class Title and YouTube Live URL first.", "error");
    }

    try {
      await setDoc(
        doc(db, "settings", "appConfig"),
        {
          liveClass: {
            isLive: !currentlyLive,
            title: !currentlyLive ? title : "",
            batchId,
            youtubeUrl: !currentlyLive ? youtubeUrl : "",
            updatedAt: serverTimestamp()
          }
        },
        { merge: true }
      );
      showToast(!currentlyLive ? "LIVE CLASS STARTED!" : "Live class ended.", !currentlyLive ? "success" : "info");
    } catch (err) {
      setSyncStatus(false, err.message);
      showToast(`Failed: ${err.message}`, "error");
    }
  });

  // Teacher Chat
  document.getElementById("admin-chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("admin-chat-input");
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    try {
      await addDoc(collection(db, "liveChat"), {
        senderName: "Uttam Sir",
        senderPhone: "teacher",
        senderRole: "teacher",
        message,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      showToast(`Chat error: ${err.message}`, "error");
    }
  });

  document.getElementById("clear-live-chat-btn").addEventListener("click", async () => {
    try {
      const snap = await getDocs(collection(db, "liveChat"));
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "liveChat", d.id))));
      showToast("Live chat cleared.", "success");
    } catch (err) {
      showToast(`Could not clear chat: ${err.message}`, "error");
    }
  });

  // Live YT Thumbnail Preview
  document.getElementById("lec-url").addEventListener("input", (e) => {
    const thumb = getYouTubeThumbnail(e.target.value);
    const box = document.getElementById("lec-thumb-preview");
    const img = document.getElementById("lec-thumb-img");
    if (thumb) { img.src = thumb; box.classList.remove("hidden"); }
    else { box.classList.add("hidden"); img.src = ""; }
  });

  // Add / Update Lecture
  document.getElementById("add-lecture-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("edit-lec-id").value;
    const rawPdfUrl = document.getElementById("lec-pdf-url").value.trim();
    const parsedPdf = rawPdfUrl ? parseDrivePreviewUrl(rawPdfUrl) : { previewUrl: "" };
    const pdfTitle = document.getElementById("lec-pdf-title").value.trim();

    const payload = {
      batchId: document.getElementById("lec-batch").value,
      subject: document.getElementById("lec-subject").value,
      title: document.getElementById("lec-title").value.trim(),
      teacher: document.getElementById("lec-teacher").value.trim() || "Uttam Sir",
      duration: document.getElementById("lec-duration").value.trim(),
      youtubeUrl: document.getElementById("lec-url").value.trim(),
      pdfUrl: parsedPdf.previewUrl || "",
      pdfTitle: pdfTitle || (parsedPdf.previewUrl ? "Class Notes PDF" : "")
    };

    if (!payload.batchId) return showToast("Create and select a batch first.", "error");

    try {
      if (editId) {
        await updateDoc(doc(db, "lectures", editId), payload);
        showToast("Lecture updated!", "success");
      } else {
        await addDoc(collection(db, "lectures"), { ...payload, createdAt: serverTimestamp() });
        showToast("Lecture published!", "success");
      }
      resetLectureForm();
    } catch (err) {
      setSyncStatus(false, err.message);
      showToast(`Save failed: ${err.message}`, "error");
    }
  });

  // Add / Update Standalone PDF Note
  document.getElementById("add-note-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("edit-note-id").value;
    const rawUrl = document.getElementById("note-url").value.trim();
    const parsed = parseDrivePreviewUrl(rawUrl);

    const payload = {
      batchId: document.getElementById("note-batch").value,
      subject: document.getElementById("note-subject").value,
      title: document.getElementById("note-title").value.trim(),
      driveUrl: parsed.previewUrl || rawUrl
    };

    if (!payload.batchId) return showToast("Create and select a batch first.", "error");

    try {
      if (editId) {
        await updateDoc(doc(db, "notes", editId), payload);
        showToast("PDF Note updated!", "success");
      } else {
        await addDoc(collection(db, "notes"), { ...payload, createdAt: serverTimestamp() });
        showToast("PDF Note published!", "success");
      }
      resetNoteForm();
    } catch (err) {
      setSyncStatus(false, err.message);
      showToast(`Save failed: ${err.message}`, "error");
    }
  });

  // Add / Update Notice
  document.getElementById("add-notice-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("edit-notice-id").value;
    const payload = {
      batchId: document.getElementById("notice-batch").value || "all",
      title: document.getElementById("notice-title").value.trim(),
      message: document.getElementById("notice-message").value.trim()
    };

    try {
      if (editId) {
        await updateDoc(doc(db, "notices", editId), payload);
        showToast("Notice updated!", "success");
      } else {
        await addDoc(collection(db, "notices"), { ...payload, createdAt: serverTimestamp() });
        showToast("Notice posted!", "success");
      }
      resetNoticeForm();
    } catch (err) {
      setSyncStatus(false, err.message);
      showToast(`Save failed: ${err.message}`, "error");
    }
  });

  // Add / Update Batch
  document.getElementById("add-batch-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("edit-batch-id").value;
    const className = document.getElementById("batch-classname").value.trim();
    const name = document.getElementById("batch-name").value.trim();
    const tagline = document.getElementById("batch-tagline").value.trim();
    const bannerColor = document.getElementById("batch-color").value;
    const subjects = document
      .getElementById("batch-subjects")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const id = editId || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const payload = {
      name,
      className,
      tagline,
      bannerColor,
      subjects: subjects.length ? subjects : DEFAULT_SUBJECTS,
      isActive: true
    };

    try {
      if (editId) {
        await updateDoc(doc(db, "batches", editId), payload);
        showToast("Batch updated!", "success");
      } else {
        await setDoc(doc(db, "batches", id), { ...payload, createdAt: serverTimestamp() }, { merge: true });
        showToast("New batch created!", "success");
      }
      e.target.reset();
      document.getElementById("edit-batch-id").value = "";
      document.getElementById("batch-subjects").value = DEFAULT_SUBJECTS.join(", ");
      document.getElementById("cancel-batch-edit-btn").classList.add("hidden");
    } catch (err) {
      setSyncStatus(false, err.message);
      showToast(`Save failed: ${err.message}`, "error");
    }
  });

  // MCQ Test Builder
  document.querySelectorAll("[data-q-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-q-mode");
      document.querySelectorAll("[data-q-mode]").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("single-q-builder").classList.toggle("hidden", mode !== "single");
      document.getElementById("bulk-q-builder").classList.toggle("hidden", mode !== "bulk");
    });
  });

  document.getElementById("add-single-q-btn").addEventListener("click", () => {
    const q = document.getElementById("sq-text").value.trim();
    const options = [0, 1, 2, 3].map((i) => document.getElementById(`sq-opt-${i}`).value.trim());
    const radio = document.querySelector('input[name="sq-correct-radio"]:checked');
    const correctIndex = Number(radio ? radio.value : 0);
    if (!q || options.some((o) => !o)) return showToast("Fill the question and all 4 options.", "error");

    const editIdx = Number(document.getElementById("edit-q-index").value);
    if (editIdx >= 0 && editIdx < adminState.draftQuestions.length) {
      adminState.draftQuestions[editIdx] = { q, options, correctIndex };
      document.getElementById("edit-q-index").value = "-1";
      document.getElementById("add-single-q-btn").innerHTML = `<i class="fa-solid fa-plus"></i> Add Question to Test`;
      showToast("Question updated.", "success");
    } else {
      adminState.draftQuestions.push({ q, options, correctIndex });
      showToast("Question added to test.", "success");
    }

    document.getElementById("sq-text").value = "";
    [0, 1, 2, 3].forEach((i) => (document.getElementById(`sq-opt-${i}`).value = ""));
    renderDraftQuestions();
  });

  document.getElementById("parse-bulk-q-btn").addEventListener("click", () => {
    const raw = document.getElementById("bulk-q-textarea").value;
    const parsed = parseBulkQuestions(raw);
    if (!parsed.length) return showToast("Could not parse questions. Check format.", "error");
    adminState.draftQuestions.push(...parsed);
    document.getElementById("bulk-q-textarea").value = "";
    renderDraftQuestions();
    showToast(`Added ${parsed.length} bulk questions!`, "success");
  });

  document.getElementById("publish-test-btn").addEventListener("click", async () => {
    const editId = document.getElementById("edit-test-id").value;
    const title = document.getElementById("test-title-input").value.trim();
    const batchId = document.getElementById("test-batch-select").value;
    const subject = document.getElementById("test-subject-select").value;
    const durationMinutes = Number(document.getElementById("test-duration-input").value || 15);
    const isActive = document.getElementById("test-active-select").value === "true";

    if (!title) return showToast("Enter a Test Title first.", "error");
    if (!batchId) return showToast("Create and select a batch first.", "error");
    if (!adminState.draftQuestions.length) return showToast("Add at least 1 question first.", "error");

    const payload = { batchId, subject, title, durationMinutes, questions: adminState.draftQuestions, isActive };

    try {
      if (editId) {
        await updateDoc(doc(db, "tests", editId), payload);
        showToast("MCQ Test updated!", "success");
      } else {
        await addDoc(collection(db, "tests"), { ...payload, createdAt: serverTimestamp() });
        showToast("MCQ Test published live!", "success");
      }
      resetTestForm();
    } catch (err) {
      setSyncStatus(false, err.message);
      showToast(`Failed: ${err.message}`, "error");
    }
  });

  // Students search/filter & batch reassignment
  document.getElementById("student-search-input").addEventListener("input", renderStudentsList);
  document.getElementById("student-status-filter").addEventListener("change", renderStudentsList);
  document.getElementById("admin-students-list").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-change-stu-batch]");
    if (!sel) return;
    const phone = sel.getAttribute("data-change-stu-batch");
    try {
      await updateDoc(doc(db, "students", phone), { batchId: sel.value });
      showToast("Student batch updated!", "success");
    } catch (err) {
      showToast(`Could not update batch: ${err.message}`, "error");
    }
  });

  // Settings Save
  document.getElementById("app-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await setDoc(
        doc(db, "settings", "appConfig"),
        {
          appName: document.getElementById("set-app-name").value.trim(),
          tagline: document.getElementById("set-tagline").value.trim(),
          whatsappNumber: document.getElementById("set-whatsapp").value.trim(),
          adminPasscode: document.getElementById("set-passcode").value.trim() || "expert2026",
          heroBanner: {
            title: document.getElementById("set-hero-title").value.trim(),
            subtitle: document.getElementById("set-hero-subtitle").value.trim(),
            imageUrl: ""
          }
        },
        { merge: true }
      );
      showToast("Settings saved to Firebase!", "success");
    } catch (err) {
      setSyncStatus(false, err.message);
      showToast(`Save failed: ${err.message}`, "error");
    }
  });

  // Delegated Edit / Delete / Submissions / Student Status actions
  document.addEventListener("click", async (e) => {
    const delBtn = e.target.closest("[data-del-col]");
    if (delBtn) {
      openDeleteConfirm(delBtn.getAttribute("data-del-col"), delBtn.getAttribute("data-del-id"), delBtn.getAttribute("data-del-label"));
      return;
    }

    const editLec = e.target.closest("[data-edit-lec]");
    if (editLec) {
      const l = adminState.lectures.find((x) => x.id === editLec.getAttribute("data-edit-lec"));
      if (l) {
        document.getElementById("edit-lec-id").value = l.id;
        document.getElementById("lec-batch").value = l.batchId || "";
        populateSubjectSelect("lec-subject", l.batchId, l.subject);
        document.getElementById("lec-title").value = l.title || "";
        document.getElementById("lec-teacher").value = l.teacher || "Uttam Sir";
        document.getElementById("lec-duration").value = l.duration || "";
        document.getElementById("lec-url").value = l.youtubeUrl || "";
        document.getElementById("lec-pdf-url").value = l.pdfUrl || "";
        document.getElementById("lec-pdf-title").value = l.pdfTitle || "";
        const thumb = getYouTubeThumbnail(l.youtubeUrl);
        if (thumb) { document.getElementById("lec-thumb-img").src = thumb; document.getElementById("lec-thumb-preview").classList.remove("hidden"); }
        document.getElementById("lec-form-heading").innerHTML = `<i class="fa-solid fa-pen" style="color:var(--brand-gold);"></i> Edit Lecture`;
        document.getElementById("lec-submit-btn").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Update Lecture`;
        document.getElementById("cancel-lec-edit-btn").classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    const editNote = e.target.closest("[data-edit-note]");
    if (editNote) {
      const n = adminState.notes.find((x) => x.id === editNote.getAttribute("data-edit-note"));
      if (n) {
        document.getElementById("edit-note-id").value = n.id;
        document.getElementById("note-batch").value = n.batchId || "";
        populateSubjectSelect("note-subject", n.batchId, n.subject);
        document.getElementById("note-title").value = n.title || "";
        document.getElementById("note-url").value = n.driveUrl || "";
        document.getElementById("note-form-heading").innerHTML = `<i class="fa-solid fa-pen" style="color:var(--brand-gold);"></i> Edit PDF Note`;
        document.getElementById("note-submit-btn").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Update PDF Note`;
        document.getElementById("cancel-note-edit-btn").classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    const editNotice = e.target.closest("[data-edit-notice]");
    if (editNotice) {
      const n = adminState.notices.find((x) => x.id === editNotice.getAttribute("data-edit-notice"));
      if (n) {
        document.getElementById("edit-notice-id").value = n.id;
        document.getElementById("notice-batch").value = n.batchId || "all";
        document.getElementById("notice-title").value = n.title || "";
        document.getElementById("notice-message").value = n.message || "";
        document.getElementById("notice-form-heading").innerHTML = `<i class="fa-solid fa-pen" style="color:var(--brand-gold);"></i> Edit Notice`;
        document.getElementById("notice-submit-btn").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Update Notice`;
        document.getElementById("cancel-notice-edit-btn").classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    const editBatchBtn = e.target.closest("[data-edit-batch]");
    if (editBatchBtn) {
      const b = adminState.batches.find((x) => x.id === editBatchBtn.getAttribute("data-edit-batch"));
      if (b) {
        document.getElementById("edit-batch-id").value = b.id;
        document.getElementById("batch-classname").value = b.className || "";
        document.getElementById("batch-name").value = b.name || "";
        document.getElementById("batch-tagline").value = b.tagline || "";
        document.getElementById("batch-color").value = b.bannerColor || "theme-blue";
        document.getElementById("batch-subjects").value = (b.subjects || DEFAULT_SUBJECTS).join(", ");
        document.getElementById("cancel-batch-edit-btn").classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    const editTestBtn = e.target.closest("[data-edit-test]");
    if (editTestBtn) {
      const t = adminState.tests.find((x) => x.id === editTestBtn.getAttribute("data-edit-test"));
      if (t) {
        document.getElementById("edit-test-id").value = t.id;
        document.getElementById("test-title-input").value = t.title || "";
        document.getElementById("test-batch-select").value = t.batchId || "";
        populateSubjectSelect("test-subject-select", t.batchId, t.subject);
        document.getElementById("test-duration-input").value = String(t.durationMinutes || 15);
        document.getElementById("test-active-select").value = String(t.isActive !== false);
        adminState.draftQuestions = Array.isArray(t.questions) ? t.questions.map((q) => ({ ...q, options: [...(q.options || [])] })) : [];
        renderDraftQuestions();
        document.getElementById("test-form-heading").innerHTML = `<i class="fa-solid fa-pen" style="color:var(--brand-gold);"></i> Edit MCQ Test`;
        document.getElementById("publish-test-btn").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Update MCQ Test`;
        document.getElementById("cancel-test-edit-btn").classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    const editDraftQ = e.target.closest("[data-edit-draft-q]");
    if (editDraftQ) {
      const i = Number(editDraftQ.getAttribute("data-edit-draft-q"));
      const q = adminState.draftQuestions[i];
      if (q) {
        document.querySelector('[data-q-mode="single"]').click();
        document.getElementById("edit-q-index").value = String(i);
        document.getElementById("sq-text").value = q.q || "";
        [0, 1, 2, 3].forEach((idx) => (document.getElementById(`sq-opt-${idx}`).value = q.options?.[idx] || ""));
        const r = document.querySelector(`input[name="sq-correct-radio"][value="${q.correctIndex || 0}"]`);
        if (r) r.checked = true;
        document.getElementById("add-single-q-btn").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Question Changes`;
      }
      return;
    }

    const rmDraftBtn = e.target.closest("[data-remove-draft-q]");
    if (rmDraftBtn) {
      adminState.draftQuestions.splice(Number(rmDraftBtn.getAttribute("data-remove-draft-q")), 1);
      renderDraftQuestions();
      return;
    }

    const viewSubsBtn = e.target.closest("[data-view-subs]");
    if (viewSubsBtn) {
      openSubmissionsModal(viewSubsBtn.getAttribute("data-view-subs"));
      return;
    }

    const stuBtn = e.target.closest("[data-student-status]");
    if (stuBtn) {
      const phone = stuBtn.getAttribute("data-student-phone");
      const status = stuBtn.getAttribute("data-student-status");
      try {
        await updateDoc(doc(db, "students", phone), { status });
        showToast(`Student marked as ${status}.`, "success");
      } catch (err) {
        showToast(`Status update failed: ${err.message}`, "error");
      }
    }
  });
}

function initAdmin() {
  initLogoFallbacks();
  applyTheme(safeStorage.get(THEME_KEY, "light"));
  bindAdminEvents();
  renderDraftQuestions();
  startAdminListeners();

  if (safeStorage.get(ADMIN_AUTH_KEY) === "unlocked") {
    document.getElementById("admin-login-screen").classList.add("hidden");
    document.getElementById("admin-app-shell").classList.remove("hidden");
  }
}

initAdmin();
