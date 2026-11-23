// Expert Study — Production Student App Core Module (v4 — 100% Real Firebase Firestore)
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  parseYouTubeEmbedUrl,
  getYouTubeWatchUrl,
  getYouTubeThumbnail,
  parseDrivePreviewUrl,
  getSubjectMeta,
  PRESET_AVATARS,
  renderAvatarInner,
  compressImageToDataUrl,
  showToast,
  formatDate,
  escapeHtml,
  safeStorage
} from "./utils.js";

const STORAGE_PHONE_KEY = "expert_study_student_phone";
const STORAGE_THEME_KEY = "expert_study_theme";
const ADMIN_AUTH_KEY = "expert_study_admin_auth";

const state = {
  student: null,
  appConfig: {
    appName: "Expert Study",
    tagline: "Learn • Practice • Excel",
    whatsappNumber: "",
    adminPasscode: "expert2026",
    heroBanner: {
      title: "Board Topper Batch 2026",
      subtitle: "Complete NCERT + PYQs + Weekly MCQ Tests",
      imageUrl: ""
    },
    liveClass: { isLive: false, title: "", batchId: "all", youtubeUrl: "" }
  },
  batches: [],
  lectures: [],
  notes: [],
  notices: [],
  selectedBatchId: "",
  selectedSubject: "All",
  batchContentTab: "lectures",
  activeTab: "home",
  currentWatchLecture: null,
  draftAvatarUrl: "",
  theatreTargetEl: null
};

let unsubStudent = null;
let unsubConfig = null;
let unsubBatches = null;
let unsubNotices = null;
let unsubLectures = null;
let unsubNotes = null;
let carouselTimer = null;
let currentSlide = 0;
let deferredInstallPrompt = null;

// ==================== LOGO FALLBACK ====================
function initLogoFallbacks() {
  document.querySelectorAll("img[data-logo-img]").forEach((img) => {
    const fallback = img.nextElementSibling;
    const showFallback = () => {
      img.classList.add("hidden");
      if (fallback) fallback.classList.remove("hidden");
    };
    img.addEventListener("error", showFallback);
    if (img.complete && img.naturalWidth === 0) showFallback();
  });
}

// ==================== LIGHT / DARK GLASS THEME ====================
function applyTheme(theme) {
  const isDark = theme === "dark";
  if (isDark) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  safeStorage.set(STORAGE_THEME_KEY, isDark ? "dark" : "light");

  const profileSwitch = document.getElementById("profile-theme-switch");
  if (profileSwitch) profileSwitch.setAttribute("aria-checked", String(isDark));

  const iconClass = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
  const topIcon = document.getElementById("theme-icon-fa");
  if (topIcon) topIcon.className = iconClass;

  const authToggle = document.getElementById("auth-theme-toggle");
  if (authToggle) authToggle.innerHTML = `<i class="${iconClass}"></i>`;
}

function toggleTheme() {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
}

// ==================== FULL-SCREEN / ROTATE + THEATRE FALLBACK ====================
async function enterFullScreenVideo(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Always activate CSS Full-Viewport Theatre Fallback for guaranteed 100vw x 100vh expansion
  el.classList.add("watch-theatre-fullscreen");
  state.theatreTargetEl = el;
  document.getElementById("theatre-exit-btn").classList.remove("hidden");

  // Also attempt native Fullscreen API + Landscape Orientation lock safely
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch {
    // CSS theatre fallback is already active
  }

  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") {
      await screen.orientation.lock("landscape");
    }
  } catch {
    // Orientation lock not supported on all devices
  }
}

async function exitFullScreenVideo() {
  if (state.theatreTargetEl) {
    state.theatreTargetEl.classList.remove("watch-theatre-fullscreen");
    state.theatreTargetEl = null;
  }
  document.getElementById("theatre-exit-btn").classList.add("hidden");

  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
  } catch {
    // Ignore
  }

  try {
    if (screen.orientation && typeof screen.orientation.unlock === "function") {
      screen.orientation.unlock();
    }
  } catch {
    // Ignore
  }
}

// ==================== SECRET 5-TAP ADMIN UNLOCK (TOUCH-SAFE) ====================
function initSecretAdminUnlock() {
  let tapCount = 0;
  let firstTapTime = 0;

  const handleSecretTap = (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - firstTapTime > 3000) {
      tapCount = 1;
      firstTapTime = now;
    } else {
      tapCount += 1;
    }
    if (tapCount >= 5) {
      tapCount = 0;
      firstTapTime = 0;
      document.getElementById("secret-admin-passcode").value = "";
      document.getElementById("secret-admin-modal").classList.add("open");
      setTimeout(() => document.getElementById("secret-admin-passcode").focus(), 120);
    }
  };

  ["secret-logo-trigger", "auth-secret-logo"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handleSecretTap);
  });

  document.getElementById("close-secret-admin-modal").addEventListener("click", () => {
    document.getElementById("secret-admin-modal").classList.remove("open");
  });

  document.getElementById("secret-admin-modal").addEventListener("click", (e) => {
    if (e.target.id === "secret-admin-modal") {
      document.getElementById("secret-admin-modal").classList.remove("open");
    }
  });

  document.getElementById("secret-admin-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const entered = document.getElementById("secret-admin-passcode").value.trim();
    const expected = state.appConfig.adminPasscode || "expert2026";
    if (entered !== expected) {
      showToast("Incorrect admin passcode.", "error");
      return;
    }
    safeStorage.set(ADMIN_AUTH_KEY, "unlocked");
    document.getElementById("secret-admin-modal").classList.remove("open");
    window.location.href = "./admin.html";
  });
}

// ==================== PWA SERVICE WORKER & INSTALL PROMPT ====================
function initPWA() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const banner = document.getElementById("pwa-install-banner");
    if (banner) banner.classList.remove("hidden");
  });

  const installBtn = document.getElementById("pwa-install-btn");
  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      document.getElementById("pwa-install-banner").classList.add("hidden");
      if (choice.outcome === "accepted") showToast("Expert Study installed!", "success");
    });
  }
}

// ==================== STUDENT PROFILE EDITING (NAME + AVATAR) ====================
function openEditProfileModal() {
  const s = state.student;
  if (!s) return;
  state.draftAvatarUrl = s.avatarUrl || "";
  document.getElementById("edit-profile-name").value = s.name || "";
  renderEditAvatarPreview();
  renderPresetAvatars();
  document.getElementById("edit-profile-modal").classList.add("open");
}

function closeEditProfileModal() {
  document.getElementById("edit-profile-modal").classList.remove("open");
}

function renderEditAvatarPreview() {
  const name = document.getElementById("edit-profile-name").value.trim() || state.student?.name || "S";
  document.getElementById("edit-avatar-preview").innerHTML = renderAvatarInner(state.draftAvatarUrl, name);
}

function renderPresetAvatars() {
  const grid = document.getElementById("preset-avatar-grid");
  grid.innerHTML = PRESET_AVATARS.map(
    (p) => `
    <button type="button" class="preset-avatar-btn ${state.draftAvatarUrl === p.id ? "selected" : ""}" data-preset-avatar="${escapeHtml(p.id)}" style="background:${p.bg};" title="${escapeHtml(p.label)}">
      <i class="fa-solid ${p.icon}"></i>
    </button>`
  ).join("");
}

// ==================== HERO CAROUSEL ====================
function goToSlide(index) {
  const track = document.getElementById("hero-carousel-track");
  const dots = document.querySelectorAll("#hero-dots .hero-dot");
  if (!track || !dots.length) return;
  currentSlide = ((index % dots.length) + dots.length) % dots.length;
  track.scrollTo({ left: track.clientWidth * currentSlide, behavior: "smooth" });
  dots.forEach((d, i) => d.classList.toggle("active", i === currentSlide));
}

function startCarousel() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = setInterval(() => {
    if (state.activeTab === "home" && state.student) goToSlide(currentSlide + 1);
  }, 4500);
}

// ==================== NAVIGATION & WATCH PAGE ====================
function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.getAttribute("data-tab-panel") !== tabName);
  });
  document.querySelectorAll(".floating-nav .nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function switchWatchSubTab(tab) {
  document.querySelectorAll("[data-watch-tab]").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-watch-tab") === tab);
  });
  document.getElementById("watch-upnext-panel").classList.toggle("hidden", tab !== "upnext");
  document.getElementById("watch-pdf-panel").classList.toggle("hidden", tab !== "pdf");
}

function openVideoModal(lecture) {
  const embedUrl = parseYouTubeEmbedUrl(lecture.youtubeUrl);
  if (!embedUrl) {
    showToast("Invalid YouTube link for this lecture.", "error");
    return;
  }

  state.currentWatchLecture = lecture;
  document.getElementById("video-modal-title").textContent = lecture.title || "Recorded Lecture";
  document.getElementById("video-watch-heading").textContent = lecture.title || "Recorded Lecture";
  document.getElementById("video-modal-subject").textContent = lecture.subject || "Class";
  document.getElementById("video-modal-meta").textContent =
    `${lecture.teacher || "Faculty"}${lecture.duration ? " • " + lecture.duration : ""}`;
  document.getElementById("video-player-iframe").src = embedUrl;
  document.getElementById("video-open-external").href = getYouTubeWatchUrl(lecture.youtubeUrl);

  const pdfBtn = document.getElementById("watch-open-attached-pdf");
  const pdfPanel = document.getElementById("watch-pdf-panel");
  if (lecture.pdfUrl) {
    const parsed = parseDrivePreviewUrl(lecture.pdfUrl);
    pdfBtn.classList.remove("hidden");
    pdfPanel.innerHTML = `
      <div class="glass-card" style="padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px;">
          <div class="lecture-title" style="margin:0;">${escapeHtml(lecture.pdfTitle || "Class Notes PDF")}</div>
          <a href="${escapeHtml(parsed.openUrl || parsed.previewUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-xs">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open
          </a>
        </div>
        <iframe src="${escapeHtml(parsed.previewUrl)}" class="pdf-viewer-frame" style="min-height:360px;" title="Class Notes PDF"></iframe>
      </div>`;
  } else {
    pdfBtn.classList.add("hidden");
    pdfPanel.innerHTML = `
      <div class="glass-card empty-state">
        <i class="fa-solid fa-file-pdf" style="font-size:1.5rem;"></i>
        <p class="empty-state-title">No PDF attached to this lecture</p>
        <p class="empty-state-sub">Check the PDF Notes tab inside My Batch for chapter notes.</p>
      </div>`;
  }

  const related = sortByCreatedDesc(
    state.lectures.filter((l) => l.batchId === lecture.batchId && l.id !== lecture.id)
  );
  const upNextEl = document.getElementById("watch-upnext-panel");
  upNextEl.innerHTML = related.length
    ? related.map(createLectureCardHtml).join("")
    : `<div class="glass-card empty-state"><p class="empty-state-title">No more lectures in this batch yet</p></div>`;

  switchWatchSubTab("upnext");
  document.getElementById("video-watch-page").classList.add("open");
}

function closeVideoModal() {
  exitFullScreenVideo();
  document.getElementById("video-watch-page").classList.remove("open");
  document.getElementById("video-player-iframe").src = "";
  state.currentWatchLecture = null;
}

function openPdfModal(note) {
  const parsed = parseDrivePreviewUrl(note.driveUrl);
  if (!parsed.previewUrl) {
    showToast("PDF link is missing or invalid.", "error");
    return;
  }
  document.getElementById("pdf-modal-title").textContent = note.title || "PDF Notes";
  document.getElementById("pdf-modal-subject").textContent = note.subject || "PDF";
  document.getElementById("pdf-viewer-iframe").src = parsed.previewUrl;
  document.getElementById("pdf-open-external").href = parsed.openUrl || parsed.previewUrl;
  document.getElementById("pdf-modal").classList.add("open");
}

function closePdfModal() {
  document.getElementById("pdf-modal").classList.remove("open");
  document.getElementById("pdf-viewer-iframe").src = "";
}

function openLiveClassModal(liveClass) {
  if (window.ExpertStudyHooks && typeof window.ExpertStudyHooks.openLiveClass === "function") {
    window.ExpertStudyHooks.openLiveClass(liveClass);
    return;
  }
  const embedUrl = parseYouTubeEmbedUrl(liveClass.youtubeUrl);
  if (!embedUrl) {
    showToast("Live stream link is not configured yet.", "error");
    return;
  }
  document.getElementById("live-modal-title").textContent = liveClass.title || "Live Classroom";
  document.getElementById("live-player-iframe").src = embedUrl;
  document.getElementById("live-open-external").href = getYouTubeWatchUrl(liveClass.youtubeUrl);
  document.getElementById("live-class-modal").classList.add("open");
}

function closeLiveClassModal() {
  exitFullScreenVideo();
  document.getElementById("live-class-modal").classList.remove("open");
  document.getElementById("live-player-iframe").src = "";
  if (window.ExpertStudyHooks && typeof window.ExpertStudyHooks.closeLiveChat === "function") {
    window.ExpertStudyHooks.closeLiveChat();
  }
}

// ==================== BATCHES & CONFIG ====================
function getBatchById(batchId) {
  return state.batches.find((b) => b.id === batchId) || null;
}

function populateBatchSelects() {
  const activeBatches = state.batches.filter((b) => b.isActive !== false);
  const regSelect = document.getElementById("reg-batch");
  const switcherSelect = document.getElementById("batch-switcher-select");

  const optionsHtml = activeBatches.length
    ? activeBatches.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join("")
    : `<option value="">No batches created by teacher yet</option>`;

  if (regSelect) regSelect.innerHTML = optionsHtml;
  if (switcherSelect) {
    switcherSelect.innerHTML = optionsHtml;
    if (state.selectedBatchId && activeBatches.some((b) => b.id === state.selectedBatchId)) {
      switcherSelect.value = state.selectedBatchId;
    }
  }
}

function subscribeBatches() {
  if (unsubBatches) unsubBatches();
  unsubBatches = onSnapshot(
    collection(db, "batches"),
    (snap) => {
      state.batches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      populateBatchSelects();
      if (state.student) {
        renderStudentProfile();
        renderBatchView();
      }
    },
    (err) => {
      console.error("Batches listener error:", err);
      showToast("Could not load batches from Firebase.", "error");
    }
  );
}

function renderAppConfig() {
  const cfg = state.appConfig;
  const appName = cfg.appName || "Expert Study";
  const tagline = cfg.tagline || "Learn • Practice • Excel";

  document.getElementById("auth-app-name").textContent = appName;
  document.getElementById("auth-app-tagline").textContent = tagline;
  document.getElementById("header-app-name").textContent = appName;
  document.getElementById("header-app-tagline").textContent = tagline;

  if (cfg.heroBanner?.title) document.getElementById("hero-banner-title").textContent = cfg.heroBanner.title;
  if (cfg.heroBanner?.subtitle) document.getElementById("hero-banner-subtitle").textContent = cfg.heroBanner.subtitle;

  const live = cfg.liveClass || {};
  const banner = document.getElementById("live-banner-card");
  const statusPill = document.getElementById("live-status-pill");
  const batchLabel = document.getElementById("live-batch-label");
  const titleEl = document.getElementById("live-banner-title");
  const subEl = document.getElementById("live-banner-sub");
  const joinBtn = document.getElementById("join-live-btn");

  const studentBatchId = state.student?.batchId || "";
  const isForStudent = !live.batchId || live.batchId === "all" || live.batchId === studentBatchId;

  if (live.isLive && isForStudent) {
    banner.classList.add("is-live");
    statusPill.className = "pill-badge pill-live";
    statusPill.innerHTML = `<span class="live-dot"></span>LIVE NOW`;
    const targetBatch = live.batchId === "all" ? "All Batches" : (getBatchById(live.batchId)?.className || "Your Batch");
    batchLabel.textContent = targetBatch;
    titleEl.textContent = live.title || "Live Interactive Class in Progress";
    subEl.textContent = "Tap below to join the live stream and ask doubts in real time.";
    joinBtn.classList.remove("hidden");
  } else {
    banner.classList.remove("is-live");
    statusPill.className = "pill-badge pill-gold";
    statusPill.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> Live Classroom`;
    batchLabel.textContent = "Offline";
    titleEl.textContent = "No Live Class Right Now";
    subEl.textContent = "When your teacher goes live, a Join Live Class button appears here automatically.";
    joinBtn.classList.add("hidden");
  }
}

function subscribeAppConfig() {
  if (unsubConfig) unsubConfig();
  unsubConfig = onSnapshot(
    doc(db, "settings", "appConfig"),
    (snap) => {
      if (snap.exists()) state.appConfig = { ...state.appConfig, ...snap.data() };
      renderAppConfig();
    },
    (err) => console.warn("Config listener warning:", err)
  );
}

// ==================== RENDER CONTENT ====================
function sortByCreatedDesc(items) {
  return [...items].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

function renderNotices() {
  const container = document.getElementById("home-notices-list");
  const countBadge = document.getElementById("notices-count-badge");
  const notifDot = document.getElementById("notif-dot");
  const studentBatchId = state.student?.batchId || "";

  const filtered = sortByCreatedDesc(
    state.notices.filter((n) => !n.batchId || n.batchId === "all" || n.batchId === studentBatchId)
  );

  countBadge.textContent = String(filtered.length);
  notifDot.classList.toggle("hidden", filtered.length === 0);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="glass-card empty-state">
        <i class="fa-solid fa-bell-slash" style="font-size:1.5rem;"></i>
        <p class="empty-state-title">No notices posted yet</p>
        <p class="empty-state-sub">Coaching announcements will appear here once posted by your teacher.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .slice(0, 8)
    .map(
      (n) => `
      <article class="glass-card notice-card">
        <span class="icon-badge icon-badge-sm icon-gold"><i class="fa-solid fa-bullhorn"></i></span>
        <div class="notice-content">
          <div class="notice-meta">
            <h4 class="notice-title">${escapeHtml(n.title)}</h4>
            <span class="notice-date">${escapeHtml(formatDate(n.createdAt))}</span>
          </div>
          <p class="notice-body">${escapeHtml(n.message)}</p>
        </div>
      </article>`
    )
    .join("");
}

function createLectureCardHtml(lec) {
  const thumb = getYouTubeThumbnail(lec.youtubeUrl);
  return `
    <article class="glass-card glass-card-interactive lecture-card" data-lecture-id="${escapeHtml(lec.id)}">
      <div class="lecture-thumb">
        ${thumb ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" />` : ""}
        <div class="play-overlay"><i class="fa-solid fa-play"></i></div>
        ${lec.duration ? `<span class="duration-tag">${escapeHtml(lec.duration)}</span>` : ""}
      </div>
      <div class="lecture-info">
        <h4 class="lecture-title">${escapeHtml(lec.title)}</h4>
        <div class="lecture-meta">
          <span class="pill-badge pill-blue" style="padding:2px 8px; font-size:0.68rem;">${escapeHtml(lec.subject || "Class")}</span>
          <span><i class="fa-solid fa-chalkboard-user"></i> ${escapeHtml(lec.teacher || "Faculty")}</span>
          ${lec.pdfUrl ? `<span class="pill-badge pill-gold" style="padding:2px 7px; font-size:0.65rem;"><i class="fa-solid fa-file-pdf"></i> PDF</span>` : ""}
        </div>
      </div>
    </article>`;
}

function createLectureSlideHtml(lec) {
  const thumb = getYouTubeThumbnail(lec.youtubeUrl);
  return `
    <article class="glass-card glass-card-interactive lecture-slide-card" data-lecture-id="${escapeHtml(lec.id)}">
      <div class="lecture-slide-thumb">
        ${thumb ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" />` : ""}
        <div class="play-overlay" style="top:50%; left:50%; transform:translate(-50%,-50%);"><i class="fa-solid fa-play"></i></div>
        ${lec.duration ? `<span class="duration-tag">${escapeHtml(lec.duration)}</span>` : ""}
      </div>
      <div>
        <span class="pill-badge pill-blue" style="padding:2px 8px; font-size:0.68rem; margin-bottom:5px;">${escapeHtml(lec.subject || "Class")}</span>
        <h4 class="lecture-title" style="margin-bottom:2px;">${escapeHtml(lec.title)}</h4>
        <div class="lecture-meta"><span>${escapeHtml(lec.teacher || "Faculty")}</span></div>
      </div>
    </article>`;
}

function createNoteCardHtml(note) {
  return `
    <article class="glass-card glass-card-interactive note-card" data-note-id="${escapeHtml(note.id)}">
      <div class="icon-badge icon-rose"><i class="fa-solid fa-file-pdf"></i></div>
      <div class="note-info">
        <h4 class="lecture-title">${escapeHtml(note.title)}</h4>
        <div class="lecture-meta">
          <span class="pill-badge pill-gold" style="padding:2px 8px; font-size:0.68rem;">${escapeHtml(note.subject || "Notes")}</span>
          <span>${escapeHtml(formatDate(note.createdAt))}</span>
        </div>
      </div>
      <button type="button" class="btn btn-glass btn-xs"><i class="fa-solid fa-eye"></i> Open</button>
    </article>`;
}

function renderRecentLectures() {
  const container = document.getElementById("home-recent-lectures");
  const studentBatchId = state.student?.batchId || "";
  const list = sortByCreatedDesc(state.lectures.filter((l) => l.batchId === studentBatchId)).slice(0, 6);

  if (!list.length) {
    container.innerHTML = `
      <div class="glass-card empty-state" style="width:100%;">
        <i class="fa-solid fa-video-slash" style="font-size:1.4rem;"></i>
        <p class="empty-state-title">No lectures added yet</p>
        <p class="empty-state-sub">Recorded classes for your batch will appear here once uploaded.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(createLectureSlideHtml).join("");
}

function renderBatchView() {
  const batch = getBatchById(state.selectedBatchId) || state.batches[0];
  const listEl = document.getElementById("batch-content-list");
  if (!batch) {
    document.getElementById("batch-current-name").textContent = "No Batches Yet";
    document.getElementById("batch-current-tagline").textContent = "Batches created by your teacher will appear here.";
    document.getElementById("subject-chips-container").innerHTML = "";
    listEl.innerHTML = `<div class="glass-card empty-state"><p class="empty-state-title">No active batches yet</p></div>`;
    return;
  }

  state.selectedBatchId = batch.id;
  const switcher = document.getElementById("batch-switcher-select");
  if (switcher && switcher.value !== batch.id) switcher.value = batch.id;

  const cover = document.getElementById("batch-cover-card");
  cover.className = `batch-cover-card ${batch.bannerColor || ""}`;

  document.getElementById("batch-current-name").textContent = batch.name || "My Batch";
  document.getElementById("batch-current-tagline").textContent = batch.tagline || "Learn • Practice • Excel";
  document.getElementById("batch-class-pill").innerHTML = `<i class="fa-solid fa-bookmark"></i> ${escapeHtml(batch.className || "Active")}`;

  const subjects = ["All", ...(Array.isArray(batch.subjects) && batch.subjects.length ? batch.subjects : ["Maths", "Science", "Hindi", "English", "Social Science"])];
  if (!subjects.includes(state.selectedSubject)) state.selectedSubject = "All";

  const chipsEl = document.getElementById("subject-chips-container");
  chipsEl.innerHTML = subjects
    .map((subj) => {
      const meta = getSubjectMeta(subj);
      return `
      <button type="button" class="subject-tile ${subj === state.selectedSubject ? "active" : ""}" data-subject="${escapeHtml(subj)}">
        <span class="icon-badge icon-badge-sm ${meta.color}"><i class="fa-solid ${meta.icon}"></i></span>
        <span>${escapeHtml(subj)}</span>
      </button>`;
    })
    .join("");

  if (state.batchContentTab === "lectures") {
    const items = sortByCreatedDesc(
      state.lectures.filter(
        (l) => l.batchId === batch.id && (state.selectedSubject === "All" || l.subject === state.selectedSubject)
      )
    );
    listEl.innerHTML = items.length
      ? items.map(createLectureCardHtml).join("")
      : `<div class="glass-card empty-state"><i class="fa-solid fa-video-slash" style="font-size:1.5rem;"></i><p class="empty-state-title">No lectures added yet</p><p class="empty-state-sub">No lectures in ${escapeHtml(state.selectedSubject)} right now.</p></div>`;
  } else {
    const items = sortByCreatedDesc(
      state.notes.filter(
        (n) => n.batchId === batch.id && (state.selectedSubject === "All" || n.subject === state.selectedSubject)
      )
    );
    listEl.innerHTML = items.length
      ? items.map(createNoteCardHtml).join("")
      : `<div class="glass-card empty-state"><i class="fa-solid fa-file-circle-xmark" style="font-size:1.5rem;"></i><p class="empty-state-title">No PDF notes added yet</p><p class="empty-state-sub">Uploaded chapter PDFs for ${escapeHtml(state.selectedSubject)} will appear here.</p></div>`;
  }
}

function renderStudentProfile() {
  const s = state.student;
  if (!s) return;
  const avatarHtml = renderAvatarInner(s.avatarUrl, s.name);
  const batchName = getBatchById(s.batchId)?.name || s.batchId || "Enrolled Batch";

  document.getElementById("home-student-name").textContent = s.name;
  document.getElementById("home-student-avatar").innerHTML = avatarHtml;
  document.getElementById("home-batch-badge").innerHTML = `<i class="fa-solid fa-award"></i> ${escapeHtml(batchName)}`;

  document.getElementById("profile-avatar").innerHTML = avatarHtml;
  document.getElementById("profile-name").textContent = s.name;
  document.getElementById("profile-batch-name").innerHTML = `<i class="fa-solid fa-layer-group"></i> ${escapeHtml(batchName)}`;
  document.getElementById("profile-phone").textContent = `+91 ${s.phone}`;
}

function updateProfileStats({ testsTaken = 0, avgScore = 0, bestRank = "—" }) {
  document.getElementById("stat-tests-taken").textContent = String(testsTaken);
  document.getElementById("stat-avg-score").textContent = testsTaken ? `${avgScore}%` : "—";
  document.getElementById("stat-best-rank").textContent = bestRank === "—" ? "—" : `#${bestRank}`;
}

// ==================== FIRESTORE SUBSCRIPTIONS ====================
function subscribeStudentContent() {
  if (unsubNotices) unsubNotices();
  if (unsubLectures) unsubLectures();
  if (unsubNotes) unsubNotes();

  unsubNotices = onSnapshot(collection(db, "notices"), (snap) => {
    state.notices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderNotices();
  });

  unsubLectures = onSnapshot(collection(db, "lectures"), (snap) => {
    state.lectures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderRecentLectures();
    renderBatchView();
  });

  unsubNotes = onSnapshot(collection(db, "notes"), (snap) => {
    state.notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBatchView();
  });
}

function unsubscribeAllContent() {
  [unsubStudent, unsubNotices, unsubLectures, unsubNotes].forEach((fn) => {
    if (typeof fn === "function") fn();
  });
  unsubStudent = unsubNotices = unsubLectures = unsubNotes = null;
}

// ==================== AUTH & LIVE STATUS CHECK ====================
function showScreen(screenId) {
  ["auth-screen", "status-alert-screen", "student-app-shell"].forEach((id) => {
    document.getElementById(id).classList.toggle("hidden", id !== screenId);
  });
}

function showStatusAlert(status) {
  const title = document.getElementById("status-alert-title");
  const msg = document.getElementById("status-alert-message");
  if (status === "blocked") {
    title.textContent = "Account Temporarily Blocked";
    msg.textContent = "Your access to Expert Study has been paused by your teacher. Please contact the coaching office.";
  } else {
    title.textContent = "Approval Pending";
    msg.textContent = "Your registration is waiting for teacher approval. This screen updates automatically once approved.";
  }
  showScreen("status-alert-screen");
}

function enterStudentSession(phone) {
  if (unsubStudent) unsubStudent();
  unsubStudent = onSnapshot(doc(db, "students", phone), (snap) => {
    if (!snap.exists()) {
      logoutStudent("Account not found. Please log in again.");
      return;
    }
    const studentData = { phone: snap.id, ...snap.data() };
    state.student = studentData;

    if (studentData.status === "blocked" || studentData.status === "pending") {
      showStatusAlert(studentData.status);
      return;
    }

    if (!state.selectedBatchId) {
      state.selectedBatchId = studentData.batchId || state.batches[0]?.id || "";
    }

    showScreen("student-app-shell");
    renderStudentProfile();
    renderAppConfig();
    subscribeStudentContent();
    startCarousel();

    window.dispatchEvent(new CustomEvent("expert-study:student-ready", { detail: { student: studentData } }));
  });
}

function logoutStudent(toastMsg = "Logged out successfully.") {
  unsubscribeAllContent();
  closeVideoModal();
  closePdfModal();
  closeLiveClassModal();
  closeEditProfileModal();
  state.student = null;
  state.selectedBatchId = "";
  safeStorage.remove(STORAGE_PHONE_KEY);
  showScreen("auth-screen");
  if (toastMsg) showToast(toastMsg, "info");
}

// ==================== EVENT WIRING ====================
function bindEvents() {
  document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);
  document.getElementById("auth-theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("profile-theme-switch").addEventListener("click", toggleTheme);

  // Fullscreen / Theatre controls
  document.getElementById("video-fullscreen-btn").addEventListener("click", () => enterFullScreenVideo("video-player-container"));
  document.getElementById("live-fullscreen-btn").addEventListener("click", () => enterFullScreenVideo("live-player-container"));
  document.getElementById("theatre-exit-btn").addEventListener("click", exitFullScreenVideo);

  // Edit Profile Modal
  document.getElementById("open-edit-profile-btn").addEventListener("click", openEditProfileModal);
  document.getElementById("profile-avatar-trigger").addEventListener("click", openEditProfileModal);
  document.getElementById("close-edit-profile-modal").addEventListener("click", closeEditProfileModal);
  document.getElementById("edit-profile-modal").addEventListener("click", (e) => {
    if (e.target.id === "edit-profile-modal") closeEditProfileModal();
  });

  document.getElementById("edit-profile-name").addEventListener("input", renderEditAvatarPreview);

  document.getElementById("preset-avatar-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset-avatar]");
    if (!btn) return;
    state.draftAvatarUrl = btn.getAttribute("data-preset-avatar");
    renderPresetAvatars();
    renderEditAvatarPreview();
  });

  document.getElementById("avatar-file-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 160, 0.75);
      state.draftAvatarUrl = dataUrl;
      renderPresetAvatars();
      renderEditAvatarPreview();
      showToast("Photo ready! Tap Save Profile Changes.", "success");
    } catch (err) {
      showToast(err.message || "Could not process image.", "error");
    }
  });

  document.getElementById("edit-profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newName = document.getElementById("edit-profile-name").value.trim();
    if (!newName || !state.student) return showToast("Please enter your name.", "error");
    const btn = document.getElementById("save-profile-btn");
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "students", state.student.phone), {
        name: newName,
        avatarUrl: state.draftAvatarUrl || ""
      });
      closeEditProfileModal();
      showToast("Profile updated!", "success");
    } catch (err) {
      console.error(err);
      showToast("Could not update profile. Check connection.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  // Hero Carousel
  document.querySelectorAll("#hero-dots .hero-dot").forEach((dot) => {
    dot.addEventListener("click", () => goToSlide(Number(dot.getAttribute("data-slide"))));
  });

  document.querySelectorAll("[data-hero-cta]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-hero-cta");
      if (target === "batch") switchTab("batch");
      else if (target === "tests") switchTab("tests");
      else if (target === "live") {
        if (state.appConfig.liveClass?.isLive) openLiveClassModal(state.appConfig.liveClass);
        else document.getElementById("live-banner-card").scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  });

  // Auth switcher
  document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-auth-mode");
      document.querySelectorAll("[data-auth-mode]").forEach((b) => {
        const active = b.getAttribute("data-auth-mode") === mode;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", String(active));
      });
      document.getElementById("login-form").classList.toggle("hidden", mode !== "login");
      document.getElementById("register-form").classList.toggle("hidden", mode !== "register");
    });
  });

  // Real Firestore Login
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const phone = document.getElementById("login-phone").value.replace(/\D/g, "");
    const password = document.getElementById("login-password").value.trim();
    if (phone.length !== 10) return showToast("Enter a valid 10-digit mobile number.", "error");

    const btn = document.getElementById("login-submit-btn");
    btn.disabled = true;
    try {
      const snap = await getDoc(doc(db, "students", phone));
      if (!snap.exists()) return showToast("Number not registered. Use New Student tab.", "error");
      const data = snap.data();
      if (data.password !== password) return showToast("Incorrect password. Please try again.", "error");
      safeStorage.set(STORAGE_PHONE_KEY, phone);
      showToast(`Welcome back, ${data.name}!`, "success");
      enterStudentSession(phone);
    } catch (err) {
      console.error(err);
      showToast(`Login failed: ${err.message || "Check internet connection."}`, "error");
    } finally {
      btn.disabled = false;
    }
  });

  // Real Firestore Registration
  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const phone = document.getElementById("reg-phone").value.replace(/\D/g, "");
    const batchId = document.getElementById("reg-batch").value;
    const password = document.getElementById("reg-password").value.trim();
    if (!name) return showToast("Please enter your full name.", "error");
    if (phone.length !== 10) return showToast("Please enter a valid 10-digit mobile number.", "error");
    if (!batchId) return showToast("No batch selected. Ask your teacher to create a batch first.", "error");
    if (password.length < 4) return showToast("Password must be at least 4 characters.", "error");

    const btn = document.getElementById("reg-submit-btn");
    btn.disabled = true;
    try {
      const ref = doc(db, "students", phone);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        showToast("Mobile number already registered. Please Login.", "info");
        document.getElementById("auth-tab-login").click();
        document.getElementById("login-phone").value = phone;
        return;
      }
      await setDoc(ref, {
        name,
        phone,
        password,
        batchId,
        avatarUrl: "",
        status: "approved",
        createdAt: serverTimestamp()
      });
      safeStorage.set(STORAGE_PHONE_KEY, phone);
      showToast("Registration successful! Welcome to Expert Study.", "success");
      enterStudentSession(phone);
    } catch (err) {
      console.error(err);
      showToast(`Registration failed: ${err.message || "Please try again."}`, "error");
    } finally {
      btn.disabled = false;
    }
  });

  // Bottom Nav
  document.querySelectorAll(".floating-nav .nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
  });

  // Quick links
  document.getElementById("quick-go-batch").addEventListener("click", () => switchTab("batch"));
  document.getElementById("quick-go-tests").addEventListener("click", () => switchTab("tests"));
  document.getElementById("home-see-all-lectures").addEventListener("click", () => switchTab("batch"));
  document.getElementById("notif-bell-btn").addEventListener("click", () => {
    switchTab("home");
    document.getElementById("notices-section").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("join-live-btn").addEventListener("click", () => openLiveClassModal(state.appConfig.liveClass || {}));

  document.getElementById("batch-switcher-select").addEventListener("change", (e) => {
    state.selectedBatchId = e.target.value;
    state.selectedSubject = "All";
    renderBatchView();
  });

  document.getElementById("subject-chips-container").addEventListener("click", (e) => {
    const tile = e.target.closest("[data-subject]");
    if (!tile) return;
    state.selectedSubject = tile.getAttribute("data-subject");
    renderBatchView();
  });

  document.querySelectorAll("[data-batch-content]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.batchContentTab = btn.getAttribute("data-batch-content");
      document.querySelectorAll("[data-batch-content]").forEach((b) => {
        const active = b.getAttribute("data-batch-content") === state.batchContentTab;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", String(active));
      });
      renderBatchView();
    });
  });

  document.querySelectorAll("[data-watch-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchWatchSubTab(btn.getAttribute("data-watch-tab")));
  });
  document.getElementById("watch-open-attached-pdf").addEventListener("click", () => switchWatchSubTab("pdf"));

  const onContentClick = (e) => {
    const lecCard = e.target.closest("[data-lecture-id]");
    if (lecCard) {
      const lec = state.lectures.find((l) => l.id === lecCard.getAttribute("data-lecture-id"));
      if (lec) openVideoModal(lec);
      return;
    }
    const noteCard = e.target.closest("[data-note-id]");
    if (noteCard) {
      const note = state.notes.find((n) => n.id === noteCard.getAttribute("data-note-id"));
      if (note) openPdfModal(note);
    }
  };
  document.getElementById("batch-content-list").addEventListener("click", onContentClick);
  document.getElementById("home-recent-lectures").addEventListener("click", onContentClick);
  document.getElementById("watch-upnext-panel").addEventListener("click", onContentClick);

  document.getElementById("close-video-modal").addEventListener("click", closeVideoModal);
  document.getElementById("close-pdf-modal").addEventListener("click", closePdfModal);
  document.getElementById("pdf-modal").addEventListener("click", (e) => { if (e.target.id === "pdf-modal") closePdfModal(); });
  document.getElementById("close-live-modal").addEventListener("click", closeLiveClassModal);

  document.getElementById("whatsapp-support-btn").addEventListener("click", () => {
    const rawNum = String(state.appConfig.whatsappNumber || "").replace(/\D/g, "");
    if (!rawNum) return showToast("WhatsApp support number will be added by your teacher soon.", "info");
    const msg = encodeURIComponent(`Hello Expert Study! I am ${state.student?.name || "a student"} (+91 ${state.student?.phone || ""}).`);
    window.open(`https://wa.me/${rawNum}?text=${msg}`, "_blank", "noopener,noreferrer");
  });

  document.getElementById("logout-btn").addEventListener("click", () => logoutStudent());
  document.getElementById("status-logout-btn").addEventListener("click", () => logoutStudent("Returned to login screen."));
}

// ==================== GLOBAL BRIDGE ====================
window.ExpertStudyApp = {
  db,
  getState: () => state,
  switchTab,
  openVideoModal,
  openPdfModal,
  openLiveClassModal,
  closeLiveClassModal,
  updateProfileStats,
  showToast
};

function init() {
  initLogoFallbacks();
  applyTheme(safeStorage.get(STORAGE_THEME_KEY, "light"));
  bindEvents();
  initSecretAdminUnlock();
  initPWA();
  subscribeAppConfig();
  subscribeBatches();

  const savedPhone = safeStorage.get(STORAGE_PHONE_KEY);
  if (savedPhone) enterStudentSession(savedPhone);
  else showScreen("auth-screen");
}

init();
