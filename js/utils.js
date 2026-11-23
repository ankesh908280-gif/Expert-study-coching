// Expert Study — Production Utilities (v4 — 100% Real Firebase, Zero Mock Data)

/**
 * Safe localStorage wrapper (never throws in restricted or private contexts).
 */
export const safeStorage = {
  get(key, fallback = null) {
    try {
      const val = window.localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage errors
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
};

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Extract 11-character YouTube Video ID from any common YouTube URL format.
 */
export function extractYouTubeId(url) {
  if (!url) return "";
  const raw = String(url).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  ];

  for (const regex of patterns) {
    const match = raw.match(regex);
    if (match && match[1]) return match[1];
  }
  return "";
}

/**
 * Convert ANY YouTube link into a clean, Error-153-safe embeddable URL.
 * Always use with referrerpolicy="strict-origin-when-cross-origin" on the iframe.
 */
export function parseYouTubeEmbedUrl(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return "";
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`;
}

/**
 * Get direct YouTube watch URL for the "Open Video Externally" fallback pill.
 */
export function getYouTubeWatchUrl(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return String(url || "").trim();
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Get real HD YouTube thumbnail URL from any YouTube link.
 */
export function getYouTubeThumbnail(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return "";
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Convert ANY Google Drive share link into an in-app /preview iframe URL
 * plus a direct external fallback open URL.
 */
export function parseDrivePreviewUrl(url) {
  if (!url) return { previewUrl: "", openUrl: "", fileId: "" };
  const raw = String(url).trim();

  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/,
    /docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/
  ];

  for (const regex of patterns) {
    const match = raw.match(regex);
    if (match && match[1]) {
      const fileId = match[1];
      return {
        fileId,
        previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
        openUrl: `https://drive.google.com/file/d/${fileId}/view`
      };
    }
  }

  return { fileId: "", previewUrl: raw, openUrl: raw };
}

/**
 * Return Font Awesome icon class & glass color class for each subject.
 * Note: Checks Social Science BEFORE Science so "Social Science" never gets the flask icon.
 */
export function getSubjectMeta(subject) {
  const key = String(subject || "").toLowerCase();
  if (key === "all") return { icon: "fa-layer-group", color: "icon-blue" };
  if (key.includes("social") || key.includes("sst") || key.includes("hist") || key.includes("geo") || key.includes("civics")) {
    return { icon: "fa-earth-asia", color: "icon-cyan" };
  }
  if (key.includes("math")) return { icon: "fa-square-root-variable", color: "icon-blue" };
  if (key.includes("sci") || key.includes("phys") || key.includes("chem") || key.includes("bio")) {
    return { icon: "fa-flask", color: "icon-emerald" };
  }
  if (key.includes("hindi") || key.includes("sanskrit")) return { icon: "fa-book-open", color: "icon-gold" };
  if (key.includes("eng")) return { icon: "fa-feather-pointed", color: "icon-violet" };
  if (key.includes("comp") || key.includes("it")) return { icon: "fa-laptop-code", color: "icon-blue" };
  return { icon: "fa-graduation-cap", color: "icon-rose" };
}

/**
 * 8 Stylish Built-In Preset Student Avatars (Zero Storage Cost).
 */
export const PRESET_AVATARS = [
  { id: "preset:royal", label: "Royal Scholar", bg: "linear-gradient(135deg, #1D4ED8 0%, #0B1B3B 100%)", icon: "fa-graduation-cap" },
  { id: "preset:gold", label: "Gold Topper", bg: "linear-gradient(135deg, #F59E0B 0%, #B45309 100%)", icon: "fa-crown" },
  { id: "preset:emerald", label: "Science Pro", bg: "linear-gradient(135deg, #10B981 0%, #047857 100%)", icon: "fa-atom" },
  { id: "preset:violet", label: "Creative Mind", bg: "linear-gradient(135deg, #8B5CF6 0%, #5B21B6 100%)", icon: "fa-rocket" },
  { id: "preset:cyan", label: "Tech Explorer", bg: "linear-gradient(135deg, #06B6D4 0%, #0369A1 100%)", icon: "fa-bolt" },
  { id: "preset:rose", label: "Rising Star", bg: "linear-gradient(135deg, #F43F5E 0%, #BE123C 100%)", icon: "fa-star" },
  { id: "preset:indigo", label: "Board Warrior", bg: "linear-gradient(135deg, #4F46E5 0%, #1E1B4B 100%)", icon: "fa-trophy" },
  { id: "preset:amber", label: "Book Lover", bg: "linear-gradient(135deg, #EA580C 0%, #9A3412 100%)", icon: "fa-book-open-reader" }
];

/**
 * Render an avatar HTML inner snippet for a student (supports data:image/... upload, preset:*, or initial fallback).
 */
export function renderAvatarInner(avatarUrl, name = "S") {
  const initial = (name || "S").trim().charAt(0).toUpperCase() || "S";
  if (avatarUrl && String(avatarUrl).startsWith("data:image/")) {
    return `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;" />`;
  }
  if (avatarUrl && String(avatarUrl).startsWith("preset:")) {
    const preset = PRESET_AVATARS.find((p) => p.id === avatarUrl);
    if (preset) {
      return `<div style="width:100%;height:100%;border-radius:inherit;background:${preset.bg};display:flex;align-items:center;justify-content:center;color:#fff;"><i class="fa-solid ${preset.icon}"></i></div>`;
    }
  }
  return `<span>${escapeHtml(initial)}</span>`;
}

/**
 * Resize & compress an uploaded image File client-side using HTML5 Canvas
 * into a 160x160 JPEG Data URL (< 25KB) for zero-cost Firestore storage.
 */
export function compressImageToDataUrl(file, size = 160, quality = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Please select a valid image file."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image format."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Format Firestore Timestamp, Date, or epoch into a clean readable string.
 */
export function formatDate(timestamp) {
  if (!timestamp) return "Just now";
  let dateObj;
  if (typeof timestamp.toDate === "function") {
    dateObj = timestamp.toDate();
  } else if (typeof timestamp === "object" && typeof timestamp.seconds === "number") {
    dateObj = new Date(timestamp.seconds * 1000);
  } else {
    dateObj = new Date(timestamp);
  }

  if (Number.isNaN(dateObj.getTime())) return "Recently";

  return dateObj.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/**
 * Show a smooth liquid-glass toast notification.
 */
export function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `glass-toast toast-${type}`;
  toast.setAttribute("role", "status");
  toast.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-out");
    window.setTimeout(() => toast.remove(), 240);
  }, 3200);
}
