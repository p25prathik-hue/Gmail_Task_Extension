# MailTasks: Gmail → AI → Tasks

Turn any email into a task with one click. Your tasks are stored in **your own Supabase database** and synced live across a **web app** and an **Android app**.

| Piece | Where |
|---|---|
| 🌐 Web app | https://p25prathik-hue.github.io/Gmail_Task_Extension/ |
| 🧩 Chrome extension | `mailtasks-extension.zip` on the [latest release](https://github.com/p25prathik-hue/Gmail_Task_Extension/releases/latest) |
| 📱 Android app | `MailTasks.apk` on the [latest release](https://github.com/p25prathik-hue/Gmail_Task_Extension/releases/latest) |
| 🗄️ Backend | Supabase project `jvsftlvdocjnxxdauuny` (Postgres + Auth + Edge Function), Mumbai region |

## Getting started

1. **Create your account:** open the web app → *Create an account* → confirm the email Supabase sends you.
2. **Add an AI key (optional, free):** get a Gemini key at <https://aistudio.google.com/apikey> → web app → *Settings → AI email analysis* → paste → *Save & test*.
   Without a key, MailTasks still works with built-in rule-based extraction (dates, urgency, tags).
3. **Install the extension:** download and unzip `mailtasks-extension.zip` → `chrome://extensions` → enable *Developer mode* → *Load unpacked* → pick the folder. Click the extension icon and sign in.
4. **Install the Android app:** open the release page on your phone → download `MailTasks.apk` → install (allow "Install unknown apps" for your browser) → sign in.

## Features

**Chrome extension (Gmail)**
- Floating, draggable **Create task** button that appears whenever an email is open (shortcut **Alt+Shift+T**).
- AI reads the thread (subject, sender, all expanded messages) and proposes a title, deadline and time, priority, list, tags, steps and notes, plus a summary.
- Review and edit before saving, or turn on **Quick save** in the popup to skip the review.
- Remembers which emails already have tasks (shows a ✓ badge on the button), with undo and "Open in MailTasks".
- The popup shows your recent tasks with checkboxes.

**Web app (laptop)**
- Smart views: Today, Next 7 days, All open, Overdue, Starred, From Gmail, No date, Completed, Trash. Plus your own lists (with colours) and tags.
- Three layouts: **List** (grouped by due/list/priority/status, several sorts, drag to reorder manually), **Board** (Kanban: To do, In progress, Waiting, Done, with drag & drop) and **Calendar** (month view, drag to reschedule).
- Natural-language quick add: `Submit report fri 5pm #college !high @Work every week *`.
- Task details: status, priority, due date and time, reminder, repeat (daily, weekdays, weekly, monthly, yearly), tags, subtasks with progress, time estimate, notes, and the source email with a link back to Gmail and the AI summary.
- **Create from email text**: paste any email and the AI builds the task.
- Multi-select (Ctrl/⌘-click) for bulk complete, move, prioritise or delete. Trash with restore.
- Insights: streaks, completions per day, open tasks by list, priority and tag.
- Realtime sync, dark mode, keyboard shortcuts (`?`), JSON/CSV export, JSON import.

**Android app**
- Native app built from the same codebase with a mobile UI: bottom tabs, a floating add button, swipe right to complete and left to delete, pull to refresh, haptics, and the Android back button.
- **Local reminder notifications** for reminders and timed due dates; tapping one opens the task.
- **Share to MailTasks**: share text from any app (e.g. text selected in a Gmail email) and the AI turns it into a task.

## Repository layout

```
config/supabase.json          public Supabase URL + anon key (safe: data is protected by Row Level Security)
supabase/migrations/          database schema, RLS policies, triggers (recurring tasks, new-user setup)
supabase/functions/analyze-email/  AI edge function (Gemini / OpenAI / Anthropic / OpenAI-compatible, plus a fallback)
extension/                    Chrome extension (Manifest V3, no build step)
web/                          React + Vite + Tailwind web app; web/android = Capacitor Android project
.github/workflows/            web.yml → GitHub Pages, release.yml → APK + extension zip on GitHub Releases
```

Every push to `main` redeploys the web app and publishes a new release with a fresh APK and extension zip.

## Self-hosting the web app with Docker

```bash
docker compose up -d --build   # → http://localhost:8080
```

## Updating the backend

- **Schema:** run `supabase/migrations/*.sql` in the Supabase SQL editor. The script is safe to re-run.
- **Edge function:** paste `supabase/functions/analyze-email/index.ts` into Dashboard → Edge Functions → `analyze-email` → Code → Deploy, or run `supabase functions deploy analyze-email --project-ref jvsftlvdocjnxxdauuny`.
- **Server-wide AI key (optional):** Dashboard → Edge Functions → Secrets → add `GEMINI_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. A key saved by a user in Settings takes priority.

## Notes

- The APK is signed with a fixed, **non-secret** key committed to the repo (`web/android/app/mailtasks-debug.keystore`), so each new build installs over the previous one. That's fine for personal sideloading. Use a private keystore before publishing to the Play Store.
- AI keys entered in Settings are stored in your own `user_settings` row, readable only by you (RLS).
