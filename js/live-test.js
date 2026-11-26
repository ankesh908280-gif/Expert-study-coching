// Expert Study — Full-Screen Live Class + Real-Time Doubt Chat + MCQ Test Arena + Leaderboard (v4 Production)
import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  limitToLast,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  parseYouTubeEmbedUrl,
  getYouTubeWatchUrl,
  getSubjectMeta,
  renderAvatarInner,
  showToast,
  escapeHtml
} from "./utils.js";

const ltState = {
  tests: [],
  results: [],
  testsSubTab: "available",
  activeExam: null,
  unsubTests: null,
  unsubResults: null,
  unsubChat: null
};

function getStudent() {
  return window.ExpertStudyApp?.getState()?.student || null;
}

// ==================== 1. FULL-SCREEN LIVE CLASS + REAL-TIME DOUBT CHAT ====================
function openLiveClassWithChat(liveClass) {
  const embedUrl = parseYouTubeEmbedUrl(liveClass?.youtubeUrl || "");
  if (!embedUrl) {
    showToast("Live stream link is not configured yet.", "error");
    return;
  }

  document.getElementById("live-modal-title").textContent = liveClass.title || "Live Classroom";
  document.getElementById("live-player-iframe").src = embedUrl;
  const extLink = document.getElementById("live-open-external");
  if (extLink) extLink.href = getYouTubeWatchUrl(liveClass.youtubeUrl);

  mountLiveChatUI();
  window.ExpertStudyApp?.pushOverlayHistory?.();
  document.getElementById("live-class-modal").classList.add("open");
}

function closeLiveChat() {
  if (ltState.unsubChat) {
    ltState.unsubChat();
    ltState.unsubChat = null;
  }
}

function mountLiveChatUI() {
  const container = document.getElementById("live-chat-container");
  if (!container) return;

  container.innerHTML = `
    <div class="chat-header" style="background:var(--glass-bg); border-bottom:1px solid var(--glass-border-outer);">
      <span><i class="fa-solid fa-comments" style="color:var(--brand-blue);"></i> Live Doubt Chat</span>
      <span class="pill-badge pill-success" style="padding:2px 8px; font-size:0.68rem;"><i class="fa-solid fa-circle" style="font-size:0.45rem;"></i> Real-Time</span>
    </div>
    <div class="watch-live-chat-messages" id="live-chat-messages">
      <p class="empty-state-sub" style="text-align:center; margin:auto;">Connecting to classroom chat...</p>
    </div>
    <form class="watch-live-chat-input" id="live-chat-form">
      <input type="text" class="glass-input" id="live-chat-input" placeholder="Ask your doubt here..." maxlength="240" style="padding:10px 14px;" required />
      <button type="submit" class="btn btn-primary btn-sm" aria-label="Send Message"><i class="fa-solid fa-paper-plane"></i></button>
    </form>`;

  document.getElementById("live-chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("live-chat-input");
    const message = input.value.trim();
    const student = getStudent();
    if (!message || !student) return;

    input.value = "";
    try {
      await addDoc(collection(db, "liveChat"), {
        senderName: student.name,
        senderPhone: student.phone,
        senderAvatar: student.avatarUrl || "",
        senderRole: "student",
        message,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Chat send failed:", err);
      showToast("Could not send message. Check connection.", "error");
    }
  });

  if (ltState.unsubChat) ltState.unsubChat();
  const chatQuery = query(collection(db, "liveChat"), orderBy("createdAt", "asc"), limitToLast(60));
  ltState.unsubChat = onSnapshot(chatQuery, (snap) => {
    const listEl = document.getElementById("live-chat-messages");
    if (!listEl) return;
    const student = getStudent();

    if (snap.empty) {
      listEl.innerHTML = `<p class="empty-state-sub" style="text-align:center; margin:auto;">No doubts yet. Be the first to ask a question!</p>`;
      return;
    }

    listEl.innerHTML = snap.docs
      .map((d) => {
        const m = d.data();
        const isTeacher = m.senderRole === "teacher";
        const isMine = !isTeacher && student && m.senderPhone === student.phone;
        return `
          <div class="chat-bubble ${isTeacher ? "is-teacher" : isMine ? "is-mine" : ""}">
            <div class="chat-sender">
              <span style="width:20px;height:20px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;background:var(--brand-blue-soft);font-size:0.65rem;flex-shrink:0;">
                ${isTeacher ? `<i class="fa-solid fa-chalkboard-user" style="color:var(--brand-gold-deep);"></i>` : renderAvatarInner(m.senderAvatar, m.senderName)}
              </span>
              <span>${escapeHtml(m.senderName || "Student")}</span>
              ${isTeacher ? `<span class="teacher-badge"><i class="fa-solid fa-crown"></i> Teacher</span>` : ""}
            </div>
            <div>${escapeHtml(m.message)}</div>
          </div>`;
      })
      .join("");
    listEl.scrollTop = listEl.scrollHeight;
  });
}

// ==================== 2. TESTS LIST & TOP-10 LEADERBOARD ====================
function computeLeaderboard(batchId) {
  const byStudent = new Map();
  ltState.results
    .filter((r) => !batchId || r.batchId === batchId)
    .forEach((r) => {
      const key = r.studentPhone || r.studentName;
      const existing = byStudent.get(key) || {
        studentPhone: r.studentPhone,
        studentName: r.studentName || "Student",
        studentAvatar: r.studentAvatar || "",
        totalPct: 0,
        bestPct: 0,
        attempts: 0
      };
      const pct = Number(r.percentage || 0);
      existing.totalPct += pct;
      existing.bestPct = Math.max(existing.bestPct, pct);
      if (r.studentAvatar) existing.studentAvatar = r.studentAvatar;
      if (r.studentName) existing.studentName = r.studentName;
      existing.attempts += 1;
      byStudent.set(key, existing);
    });

  return [...byStudent.values()]
    .map((s) => ({ ...s, avgPct: Math.round(s.totalPct / s.attempts) }))
    .sort((a, b) => b.avgPct - a.avgPct || b.attempts - a.attempts);
}

function syncStudentProfileStats() {
  const student = getStudent();
  if (!student || !window.ExpertStudyApp?.updateProfileStats) return;

  const myResults = ltState.results.filter((r) => r.studentPhone === student.phone);
  const testsTaken = myResults.length;
  const avgScore = testsTaken
    ? Math.round(myResults.reduce((acc, r) => acc + Number(r.percentage || 0), 0) / testsTaken)
    : 0;

  const board = computeLeaderboard(student.batchId);
  const rankIdx = board.findIndex((entry) => entry.studentPhone === student.phone);
  const bestRank = rankIdx >= 0 ? rankIdx + 1 : "—";

  window.ExpertStudyApp.updateProfileStats({ testsTaken, avgScore, bestRank });
}

function renderTestsView() {
  const container = document.getElementById("tests-view-container");
  const student = getStudent();
  if (!container || !student) return;

  const myTests = ltState.tests.filter(
    (t) => t.isActive !== false && (t.batchId === "all" || t.batchId === student.batchId)
  );
  const board = computeLeaderboard(student.batchId).slice(0, 10);

  let bodyHtml = "";
  if (ltState.testsSubTab === "available") {
    if (!myTests.length) {
      bodyHtml = `
        <div class="glass-card empty-state" style="margin-top:14px;">
          <i class="fa-solid fa-clipboard-question" style="font-size:1.7rem;"></i>
          <p class="empty-state-title">No tests available yet</p>
          <p class="empty-state-sub">When your teacher publishes an MCQ test for your batch, it will appear right here.</p>
        </div>`;
    } else {
      bodyHtml = `<div class="content-list">${myTests
        .map((t) => {
          const meta = getSubjectMeta(t.subject);
          const qCount = Array.isArray(t.questions) ? t.questions.length : 0;
          const prevAttempt = ltState.results.find((r) => r.testId === t.id && r.studentPhone === student.phone);
          return `
            <article class="glass-card test-card">
              <span class="icon-badge ${meta.color}"><i class="fa-solid ${meta.icon}"></i></span>
              <div class="test-card-body">
                <h4 class="lecture-title">${escapeHtml(t.title)}</h4>
                <div class="lecture-meta">
                  <span class="pill-badge pill-blue" style="padding:2px 8px; font-size:0.68rem;">${escapeHtml(t.subject || "General")}</span>
                  <span><i class="fa-regular fa-circle-question"></i> ${qCount} Qs</span>
                  <span><i class="fa-regular fa-clock"></i> ${Number(t.durationMinutes || 10)} mins</span>
                  ${prevAttempt ? `<span class="pill-badge pill-success" style="padding:2px 7px; font-size:0.66rem;">Last: ${prevAttempt.percentage}%</span>` : ""}
                </div>
              </div>
              <button type="button" class="btn ${prevAttempt ? "btn-glass" : "btn-primary"} btn-sm" data-start-test="${escapeHtml(t.id)}">
                ${prevAttempt ? "Retake" : "Start"}
              </button>
            </article>`;
        })
        .join("")}</div>`;
    }
  } else {
    if (!board.length) {
      bodyHtml = `
        <div class="glass-card empty-state" style="margin-top:14px;">
          <i class="fa-solid fa-ranking-star" style="font-size:1.7rem; color:var(--brand-gold);"></i>
          <p class="empty-state-title">No rankings yet</p>
          <p class="empty-state-sub">Complete any MCQ test to appear on your batch leaderboard.</p>
        </div>`;
    } else {
      const top3 = [board[1] || null, board[0] || null, board[2] || null];
      const podiumHtml = `
        <div class="podium-grid">
          ${top3
            .map((entry, idx) => {
              const rank = idx === 1 ? 1 : idx === 0 ? 2 : 3;
              const badgeCls = rank === 1 ? "rank-gold" : rank === 2 ? "rank-silver" : "rank-bronze";
              if (!entry) {
                return `<div class="glass-card podium-card" style="opacity:0.45;"><div class="podium-rank-badge ${badgeCls}">${rank}</div><div class="notice-date">—</div></div>`;
              }
              return `
                <div class="glass-card podium-card ${rank === 1 ? "podium-1" : ""}">
                  <div class="podium-rank-badge ${badgeCls}">
                    ${rank === 1 ? `<i class="fa-solid fa-crown"></i>` : rank}
                  </div>
                  <div style="width:36px;height:36px;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--brand-blue-soft);font-weight:800;font-size:0.85rem;">
                    ${renderAvatarInner(entry.studentAvatar, entry.studentName)}
                  </div>
                  <div class="lecture-title" style="margin:0; font-size:0.82rem; text-align:center;">${escapeHtml(entry.studentName)}</div>
                  <span class="pill-badge ${rank === 1 ? "pill-gold" : "pill-blue"}" style="padding:2px 8px; font-size:0.7rem;">${entry.avgPct}%</span>
                </div>`;
            })
            .join("")}
        </div>`;

      const restHtml = board
        .slice(3)
        .map(
          (entry, i) => `
          <div class="glass-card leaderboard-row">
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="pill-badge pill-blue">#${i + 4}</span>
              <div style="width:32px;height:32px;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--brand-blue-soft);font-weight:800;font-size:0.8rem;">
                ${renderAvatarInner(entry.studentAvatar, entry.studentName)}
              </div>
              <div>
                <div class="lecture-title" style="margin:0;">${escapeHtml(entry.studentName)}</div>
                <div class="notice-date">${entry.attempts} test${entry.attempts > 1 ? "s" : ""} attempted</div>
              </div>
            </div>
            <span class="pill-badge pill-success">${entry.avgPct}%</span>
          </div>`
        )
        .join("");

      bodyHtml = podiumHtml + restHtml;
    }
  }

  container.innerHTML = `
    <div class="segmented-control" role="tablist">
      <button type="button" class="segmented-btn ${ltState.testsSubTab === "available" ? "active" : ""}" data-tests-subtab="available">
        <i class="fa-solid fa-pen-to-square"></i> MCQ Tests (${myTests.length})
      </button>
      <button type="button" class="segmented-btn ${ltState.testsSubTab === "leaderboard" ? "active" : ""}" data-tests-subtab="leaderboard">
        <i class="fa-solid fa-trophy"></i> Top-10 Rank
      </button>
    </div>
    ${bodyHtml}`;

  container.querySelectorAll("[data-tests-subtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ltState.testsSubTab = btn.getAttribute("data-tests-subtab");
      renderTestsView();
    });
  });

  container.querySelectorAll("[data-start-test]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const test = ltState.tests.find((t) => t.id === btn.getAttribute("data-start-test"));
      if (test) startExamArena(test);
    });
  });
}

// ==================== 3. FULL-SCREEN INTERACTIVE MCQ EXAM ARENA ====================
function formatTimer(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function startExamArena(test) {
  const questions = Array.isArray(test.questions) ? test.questions : [];
  if (!questions.length) {
    showToast("This test has no questions yet.", "error");
    return;
  }

  if (ltState.activeExam?.timerId) clearInterval(ltState.activeExam.timerId);

  ltState.activeExam = {
    test,
    answers: new Array(questions.length).fill(null),
    currentIndex: 0,
    secondsLeft: Math.max(1, Number(test.durationMinutes || 10)) * 60,
    paletteOpen: false,
    submitted: false,
    timerId: null
  };

  const overlay = document.getElementById("exam-arena-overlay");
  window.ExpertStudyApp?.pushOverlayHistory?.();
  overlay.classList.remove("hidden");
  renderExamQuestion();

  ltState.activeExam.timerId = setInterval(() => {
    if (!ltState.activeExam || ltState.activeExam.submitted) return;
    ltState.activeExam.secondsLeft -= 1;
    const timerEl = document.getElementById("exam-timer-pill");
    if (timerEl) {
      timerEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${formatTimer(Math.max(0, ltState.activeExam.secondsLeft))}`;
      timerEl.classList.toggle("is-urgent", ltState.activeExam.secondsLeft <= 60);
    }
    if (ltState.activeExam.secondsLeft <= 0) {
      showToast("Time is up! Submitting your test automatically.", "info");
      submitExam();
    }
  }, 1000);
}

function renderExamQuestion() {
  const exam = ltState.activeExam;
  const overlay = document.getElementById("exam-arena-overlay");
  if (!exam || !overlay) return;

  const qs = exam.test.questions;
  const idx = exam.currentIndex;
  const q = qs[idx];
  const letters = ["A", "B", "C", "D"];
  const answeredCount = exam.answers.filter((a) => a !== null).length;

  overlay.innerHTML = `
    <div class="exam-container">
      <div class="glass-card exam-top-bar">
        <div style="min-width:0;">
          <div class="notice-date">${escapeHtml(exam.test.subject || "Test")} • Q ${idx + 1}/${qs.length}</div>
          <h3 class="modal-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(exam.test.title)}</h3>
        </div>
        <span id="exam-timer-pill" class="timer-pill ${exam.secondsLeft <= 60 ? "is-urgent" : ""}">
          <i class="fa-regular fa-clock"></i> ${formatTimer(exam.secondsLeft)}
        </span>
      </div>

      <div class="glass-card" style="padding:12px 14px; margin-bottom:14px;">
        <button type="button" id="toggle-palette-btn" class="action-row-btn" style="padding:2px 0; border:none;">
          <span class="action-row-title" style="font-size:0.84rem;">
            <i class="fa-solid fa-table-cells"></i> Question Palette (${answeredCount}/${qs.length} Answered)
          </span>
          <i class="fa-solid ${exam.paletteOpen ? "fa-chevron-up" : "fa-chevron-down"}"></i>
        </button>
        <div class="palette-grid ${exam.paletteOpen ? "" : "hidden"}">
          ${qs
            .map((_, i) => {
              const cls = i === idx ? "is-current" : exam.answers[i] !== null ? "is-answered" : "";
              return `<button type="button" class="palette-bubble ${cls}" data-jump-q="${i}">${i + 1}</button>`;
            })
            .join("")}
        </div>
      </div>

      <div class="glass-card-strong question-card">
        <span class="pill-badge pill-blue">Question ${idx + 1}</span>
        <p class="question-text">${escapeHtml(q.q)}</p>
        <div class="option-list">
          ${(q.options || [])
            .map(
              (opt, optIdx) => `
            <button type="button" class="option-btn ${exam.answers[idx] === optIdx ? "selected" : ""}" data-select-opt="${optIdx}">
              <span class="option-letter">${letters[optIdx] || optIdx + 1}</span>
              <span>${escapeHtml(opt)}</span>
            </button>`
            )
            .join("")}
        </div>
      </div>

      <div class="exam-nav-bar">
        <button type="button" class="btn btn-glass btn-sm" id="exam-prev-btn" ${idx === 0 ? "disabled" : ""}>
          <i class="fa-solid fa-arrow-left"></i> Prev
        </button>
        <button type="button" class="btn btn-danger-soft btn-sm" id="exam-exit-btn">Exit</button>
        ${
          idx < qs.length - 1
            ? `<button type="button" class="btn btn-primary btn-sm" id="exam-next-btn">Next <i class="fa-solid fa-arrow-right"></i></button>`
            : `<button type="button" class="btn btn-gold btn-sm" id="exam-submit-btn"><i class="fa-solid fa-check-double"></i> Submit Test</button>`
        }
      </div>
    </div>`;

  document.getElementById("toggle-palette-btn").addEventListener("click", () => {
    exam.paletteOpen = !exam.paletteOpen;
    renderExamQuestion();
  });

  overlay.querySelectorAll("[data-jump-q]").forEach((b) => {
    b.addEventListener("click", () => {
      exam.currentIndex = Number(b.getAttribute("data-jump-q"));
      renderExamQuestion();
    });
  });

  overlay.querySelectorAll("[data-select-opt]").forEach((b) => {
    b.addEventListener("click", () => {
      exam.answers[idx] = Number(b.getAttribute("data-select-opt"));
      renderExamQuestion();
    });
  });

  const prevBtn = document.getElementById("exam-prev-btn");
  if (prevBtn) prevBtn.addEventListener("click", () => { if (exam.currentIndex > 0) { exam.currentIndex -= 1; renderExamQuestion(); } });

  const nextBtn = document.getElementById("exam-next-btn");
  if (nextBtn) nextBtn.addEventListener("click", () => { exam.currentIndex += 1; renderExamQuestion(); });

  const submitBtn = document.getElementById("exam-submit-btn");
  if (submitBtn) submitBtn.addEventListener("click", submitExam);

  document.getElementById("exam-exit-btn").addEventListener("click", promptExamExit);
}

async function submitExam() {
  const exam = ltState.activeExam;
  if (!exam || exam.submitted) return;
  exam.submitted = true;
  if (exam.timerId) clearInterval(exam.timerId);

  const qs = exam.test.questions;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  qs.forEach((q, i) => {
    const chosen = exam.answers[i];
    if (chosen === null) skipped += 1;
    else if (chosen === Number(q.correctIndex)) correct += 1;
    else wrong += 1;
  });

  const percentage = Math.round((correct / qs.length) * 100);
  const student = getStudent();

  if (student) {
    try {
      await addDoc(collection(db, "testResults"), {
        testId: exam.test.id,
        testTitle: exam.test.title,
        batchId: student.batchId || exam.test.batchId || "all",
        studentPhone: student.phone,
        studentName: student.name,
        studentAvatar: student.avatarUrl || "",
        score: correct,
        totalQuestions: qs.length,
        percentage,
        submittedAt: serverTimestamp()
      });
      showToast("Test submitted! Result saved to leaderboard.", "success");
    } catch (err) {
      console.error("Error saving test result:", err);
      showToast("Could not save score to Firebase.", "error");
    }
  }

  renderExamResult({ test: exam.test, answers: exam.answers, correct, wrong, skipped, percentage });
}

function renderExamResult({ test, answers, correct, wrong, skipped, percentage }) {
  const overlay = document.getElementById("exam-arena-overlay");
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const letters = ["A", "B", "C", "D"];

  overlay.innerHTML = `
    <div class="exam-container">
      <div class="glass-card-strong result-hero">
        <span class="pill-badge pill-gold" style="margin-bottom:10px;"><i class="fa-solid fa-award"></i> Test Completed</span>
        <h2 class="batch-title-lg" style="margin-bottom:14px;">${escapeHtml(test.title)}</h2>
        <div class="score-ring-wrap">
          <svg class="score-ring-svg" viewBox="0 0 136 136">
            <circle class="score-ring-track" cx="68" cy="68" r="${radius}"></circle>
            <circle class="score-ring-fill" cx="68" cy="68" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
          </svg>
          <div class="score-ring-center">
            <span class="score-ring-pct">${percentage}%</span>
            <span class="notice-date">${correct}/${test.questions.length}</span>
          </div>
        </div>
        <div class="stat-3-grid">
          <div class="mini-stat-tile">
            <div class="mini-stat-val" style="color:var(--color-success);">${correct}</div>
            <div class="mini-stat-label">Correct</div>
          </div>
          <div class="mini-stat-tile">
            <div class="mini-stat-val" style="color:var(--color-danger);">${wrong}</div>
            <div class="mini-stat-label">Wrong</div>
          </div>
          <div class="mini-stat-tile">
            <div class="mini-stat-val" style="color:var(--text-muted);">${skipped}</div>
            <div class="mini-stat-label">Skipped</div>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-block" id="close-result-btn" style="margin-top:16px;">
          <i class="fa-solid fa-trophy"></i> Back to Tests & Leaderboard
        </button>
      </div>

      <h3 class="section-title" style="margin:16px 4px 10px;"><i class="fa-solid fa-list-check"></i> Answer Review</h3>
      ${test.questions
        .map((q, i) => {
          const chosen = answers[i];
          const right = Number(q.correctIndex);
          return `
            <div class="glass-card review-card">
              <div class="notice-date">Question ${i + 1} • ${chosen === right ? "Correct" : chosen === null ? "Skipped" : "Incorrect"}</div>
              <p class="lecture-title" style="margin:4px 0 8px;">${escapeHtml(q.q)}</p>
              ${(q.options || [])
                .map((opt, optIdx) => {
                  const cls = optIdx === right ? "is-correct" : optIdx === chosen ? "is-wrong" : "";
                  return `<div class="review-opt ${cls}"><strong>${letters[optIdx]}.</strong> ${escapeHtml(opt)} ${optIdx === right ? " ✓" : optIdx === chosen ? " ✗" : ""}</div>`;
                })
                .join("")}
            </div>`;
        })
        .join("")}
    </div>`;

  document.getElementById("close-result-btn").addEventListener("click", () => {
    closeExamArena();
    ltState.testsSubTab = "leaderboard";
    renderTestsView();
  });
}

function closeExamArena() {
  if (ltState.activeExam?.timerId) clearInterval(ltState.activeExam.timerId);
  ltState.activeExam = null;
  document.getElementById("exam-arena-overlay").classList.add("hidden");
  document.getElementById("exam-arena-overlay").innerHTML = "";
}

// ==================== BOOTSTRAP ====================
function subscribeTestsAndResults() {
  if (ltState.unsubTests) ltState.unsubTests();
  if (ltState.unsubResults) ltState.unsubResults();

  ltState.unsubTests = onSnapshot(collection(db, "tests"), (snap) => {
    ltState.tests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTestsView();
  });

  ltState.unsubResults = onSnapshot(collection(db, "testResults"), (snap) => {
    ltState.results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    syncStudentProfileStats();
    renderTestsView();
  });
}

function promptExamExit() {
  const modal = document.getElementById("exam-exit-confirm-modal");
  if (modal) modal.classList.add("open");
  else closeExamArena();
}

function hideExamExitModal() {
  const modal = document.getElementById("exam-exit-confirm-modal");
  if (modal) modal.classList.remove("open");
}

["cancel-exam-exit-btn", "cancel-exam-exit-x"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", hideExamExitModal);
});
const confirmExitBtn = document.getElementById("confirm-exam-exit-btn");
if (confirmExitBtn) {
  confirmExitBtn.addEventListener("click", () => {
    hideExamExitModal();
    closeExamArena();
  });
}

window.ExpertStudyHooks = {
  openLiveClass: openLiveClassWithChat,
  closeLiveChat,
  handleBackButton: () => {
    if (ltState.activeExam && !ltState.activeExam.submitted) {
      promptExamExit();
    } else if (!document.getElementById("exam-arena-overlay").classList.contains("hidden")) {
      closeExamArena();
    }
  }
};

window.addEventListener("expert-study:student-ready", () => {
  subscribeTestsAndResults();
});

if (getStudent()) {
  subscribeTestsAndResults();
}
