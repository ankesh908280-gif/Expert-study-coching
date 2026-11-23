# Expert Study — Learn • Practice • Excel

A zero-cost, zero-bundler Progressive Web App (PWA) built with pure HTML5, CSS3, Vanilla ES6 JavaScript, and Firebase Firestore (v10.12.2 CDN) in an OriginOS 7 + Apple iOS Liquid Glass aesthetic.

Developed by **Ankesh Kushwaha**.

---

## 1. Deploy on GitHub Pages (Free Hosting)

1. Create a new public repository on GitHub (for example, `expert-study`).
2. Extract `expert-study-app.zip` and upload all files inside `expert-study/` (`index.html`, `admin.html`, `manifest.json`, `sw.js`, `assets/`, `css/`, `js/`, `README.md`) to the root of your repository.
3. Open **Repository Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then click **Save**.
5. Wait 1–2 minutes and open your live HTTPS link: `https://<your-username>.github.io/<repo-name>/`.
6. On Android Chrome, tap **Install Expert Study App** (or Chrome menu → **Add to Home screen**) to install it as a native-feel full-screen PWA.

---

## 2. Secret 5-Tap Teacher Admin Panel Access

Students never see any Admin button in the app. To open the Teacher Admin Panel:

1. Open the Student App (`index.html`).
2. **Tap the top-left Expert Study Logo 5 times rapidly** (within 3 seconds) — works on both the Login screen and the Home header.
3. Enter the Admin Passcode (default: **`expert2026`**) and tap **Unlock Admin Panel**.
4. You can change the passcode, coaching name, tagline, hero banner text, and WhatsApp support number anytime under **Settings** inside the Admin Panel.
5. Tap **Exit** in the top bar (or **Lock Admin Panel** in Settings) to log out of Admin mode.

---

## 3. How to Go Live (YouTube Unlisted + PRISM Live Studio)

1. Install **PRISM Live Studio** on your phone (Android/iOS) and connect your YouTube channel.
2. Start a **YouTube Live** stream set to **Unlisted** (so only your app students can watch it).
3. Copy the YouTube Live share link (`https://youtube.com/live/...` or `https://youtu.be/...`).
4. Open the **Teacher Admin Panel → Overview → Go Live Control**.
5. Enter the **Live Class Title**, paste the YouTube Live URL, pick the target batch (`All Batches` or a specific batch), and tap **START LIVE CLASS**.
6. Every student's Home screen immediately updates with a pulsing **LIVE NOW** banner and a full-screen Watch Page + Real-Time Doubt Chat.
7. When finished, tap **END LIVE CLASS** (and **Clear Chat** if you want a fresh doubt chat for the next session).

---

## 4. Uploading Videos & Google Drive PDFs (Zero Hosting Cost)

- **Recorded Lectures**: Upload to YouTube as **Unlisted**, paste the link in **Admin → Content → Lectures** (a live HD thumbnail preview appears automatically), and optionally attach a **Class Notes PDF** (Google Drive link) so students get both video + notes in one full-screen PW/Vidyakul-style view.
- **PDF Notes**: Upload PDFs to Google Drive, set sharing to **Anyone with the link (Viewer)**, and paste the share link in **Admin → Content → PDFs** (or inside a Lecture). The app automatically converts it to an in-app `/preview` viewer.

---

## 5. Production Firestore Security Rules

Open **Firebase Console → Firestore Database → Rules**, paste the rules below, and click **Publish**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public read for app configuration, batches, lectures, notes, notices, tests
    match /settings/{docId} {
      allow read, write: if true;
    }
    match /batches/{batchId} {
      allow read, write: if true;
    }
    match /lectures/{lectureId} {
      allow read, write: if true;
    }
    match /notes/{noteId} {
      allow read, write: if true;
    }
    match /notices/{noticeId} {
      allow read, write: if true;
    }
    match /tests/{testId} {
      allow read, write: if true;
    }
    // Student accounts (10-digit mobile number login)
    match /students/{phone} {
      allow read, write: if true;
    }
    // MCQ test results & Batch Leaderboard
    match /testResults/{resultId} {
      allow read, write: if true;
    }
    // Real-time Live Class Doubt Chat
    match /liveChat/{msgId} {
      allow read, write: if true;
    }
  }
}
```

> **Security Tip:** Since Expert Study uses friction-free Mobile Number + Password student login (no Firebase Auth / OTP required), change the default Admin Passcode (`expert2026`) immediately in **Admin → Settings** before sharing your link publicly.
