import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { execSync } from 'child_process';

/**
 * Extracts EASY_GOOD_DEEDS_BOOK and ISLAMIC_PSYCHOLOGY_BOOK
 * and generates a complete, standalone offline HTML bundle for assets/index.html inside the APK
 */
function loadBookFromTsFile(relPath, exportName) {
  const tsSource = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
  const regex = new RegExp(`export\\s+const\\s+${exportName}\\s*:\\s*BookData\\s*=\\s*`);
  const jsCode = tsSource.replace(/import\s+type\s+.*?;\s*/g, '').replace(regex, 'return ');
  return new Function(jsCode)();
}

function buildStandaloneReaderHtml() {
  const rawBooks = [
    loadBookFromTsFile('src/data/easyGoodDeedsData.ts', 'EASY_GOOD_DEEDS_BOOK'),
  ];

  const booksPayload = rawBooks.map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    year: book.year,
    genre: book.genre,
    description: book.description,
    bg: book.coverPalette.bg,
    accent: book.coverPalette.accent,
    chapters: book.chapters.map((ch, idx) => ({
      id: ch.id,
      bookId: book.id,
      index: idx,
      order: ch.chapterOrder,
      title: ch.title,
      subtitle: `Часть ${ch.chapterOrder} из ${book.chapters.length} · Проверочных вопросов: ${ch.quiz.length}`,
      content: ch.content,
      footnotes: ch.footnotes || [],
      questions: ch.quiz.map((q) => ({
        q: q.question,
        opts: q.options,
        correct: q.correctAnswerIndex,
        exp: q.explanation,
      })),
    })),
  }));

  const serializedBooks = JSON.stringify(booksPayload);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<title>Простые благодеяния — Интерактивная Читалка</title>
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #F8F6F1; color: #1C1B1F;
    user-select: none; -webkit-user-select: none;
    overflow-x: hidden;
  }
  .app-shell { display: flex; flex-direction: column; min-height: 100vh; }
  .top-bar {
    position: sticky; top: 0; z-index: 30;
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; background: #06372C; color: #FEF3C7;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .top-bar h1 { margin: 0; font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .book-tabs {
    display: flex; gap: 8px; margin-bottom: 14px; overflow-x: auto; padding-bottom: 2px;
  }
  .book-tab {
    flex: 1; min-width: 145px; padding: 11px 12px; border-radius: 12px;
    border: 2px solid #CBD5E1; background: #FFFFFF; color: #1E293B;
    font-size: 13px; font-weight: 700; cursor: pointer; text-align: left;
  }
  .book-tab-active {
    border-color: #06372C; background: #06372C; color: #FEF3C7;
  }
  .btn {
    border: none; border-radius: 12px; padding: 12px 16px;
    font-size: 14px; font-weight: 600; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    transition: opacity 0.15s, transform 0.1s;
  }
  .btn:active { transform: scale(0.98); }
  .btn-primary { background: #06372C; color: #FEF3C7; }
  .btn-emerald { background: #15803D; color: #FFFFFF; }
  .btn-amber { background: #B45309; color: #FFFFFF; }
  .btn-outline { background: transparent; border: 1.5px solid #CBD5E1; color: #1E293B; }
  .btn:disabled { opacity: 0.4; pointer-events: none; }
  .container { padding: 16px; flex: 1; max-width: 720px; margin: 0 auto; width: 100%; }
  .card {
    background: #FFFFFF; border-radius: 16px; padding: 18px;
    border: 1px solid #E5E0D5; margin-bottom: 14px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .book-header {
    background: #06372C; color: #FEF3C7; border-radius: 16px; padding: 20px; margin-bottom: 16px;
    border: 1px solid #B45309;
  }
  .book-header h2 { margin: 0 0 6px 0; font-size: 22px; font-family: Georgia, serif; }
  .book-header p { margin: 0; font-size: 13px; color: #FDE68A; opacity: 0.92; line-height: 1.48; }
  .search-input {
    width: 100%; padding: 12px 14px; border-radius: 12px;
    border: 1px solid #CBD5E1; background: #FFFFFF; color: #0F172A;
    font-size: 14px; margin-bottom: 14px; outline: none;
  }
  .progress-track { width: 100%; height: 8px; background: rgba(255,255,255,0.2); border-radius: 4px; overflow: hidden; margin-top: 10px; }
  .progress-fill { height: 100%; background: #F59E0B; transition: width 0.3s; }
  .chapter-card { display: flex; flex-direction: column; gap: 10px; }
  .chapter-locked { opacity: 0.6; background: #F1EFEA; }
  .meta-line { font-size: 12px; color: #64748B; font-family: monospace; }
  .reader-screen {
    position: fixed; inset: 0; z-index: 40;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .reader-hud-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid rgba(128,128,128,0.2);
  }
  .reader-page-area {
    flex: 1; padding: 20px 22px; display: flex; flex-direction: column; justify-content: space-between;
    overflow: hidden; position: relative;
  }
  .reader-text {
    font-family: Georgia, "Times New Roman", serif;
    line-height: 1.55;
    flex: 1; overflow-y: auto; padding-right: 6px;
  }
  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-track {
    background: rgba(214, 208, 196, 0.05);
    border-right: 4px solid transparent; border-left: 4px solid transparent;
    background-clip: padding-box; border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb {
    background-color: #06372C;
    border-right: 4px solid transparent; border-left: 4px solid transparent;
    background-clip: padding-box; border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:active {
    background-color: #06372C;
  }
  input[type="range"] {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 6px; border-radius: 9999px;
    background: rgba(6, 55, 44, 0.2); outline: none;
    accent-color: #06372C;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 20px; height: 20px; border-radius: 9999px;
    background: #06372C; border: 2px solid #FEF3C7;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25); cursor: pointer;
  }
  .reader-v-scrollbar-track {
    position: absolute; top: 14px; bottom: 68px; right: 4px; width: 4px;
    background: rgba(214, 208, 196, 0.05); border-radius: 9999px; z-index: 25;
    transition: opacity 0.25s ease;
  }
  .lib-v-scrollbar-track {
    position: fixed; top: 62px; bottom: 10px; right: 4px; width: 4px;
    background: rgba(214, 208, 196, 0.05); border-radius: 9999px; z-index: 35;
    pointer-events: none; transition: opacity 0.25s ease;
  }
  .reader-v-scrollbar-thumb {
    width: 4px; border-radius: 9999px; background: #06372C;
    position: relative; opacity: 0.85;
    transition: top 0.12s ease, height 0.12s ease, opacity 0.18s ease;
  }
  .reader-v-scrollbar-track:active .reader-v-scrollbar-thumb,
  .reader-v-scrollbar-track.sb-active .reader-v-scrollbar-thumb,
  .lib-v-scrollbar-track.sb-active .reader-v-scrollbar-thumb {
    opacity: 1;
  }
  .reader-footer {
    padding-top: 12px; border-top: 1px solid rgba(128,128,128,0.2);
    display: flex; align-items: center; justify-content: space-between; min-height: 52px;
  }
  .settings-sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
    border-radius: 20px 20px 0 0; padding: 20px;
    box-shadow: 0 -8px 24px rgba(0,0,0,0.25);
    border-top: 1px solid rgba(128,128,128,0.25);
  }
  .fn-badge {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 1px 5px; margin: 0 2px; font-size: 11px; font-family: monospace; font-weight: 700;
    border-radius: 5px; background: rgba(245, 158, 11, 0.22); color: #B45309;
    border: 1px solid rgba(180, 83, 9, 0.4); vertical-align: super; cursor: pointer;
  }
  .fn-popup {
    margin-top: 10px; padding: 12px 14px; border-radius: 12px;
    border: 1px solid rgba(180, 83, 9, 0.35); font-size: 13px; line-height: 1.45;
    max-height: 36vh; overflow-y: auto;
  }
  .option-btn {
    width: 100%; text-align: left; padding: 14px 16px; border-radius: 12px;
    border: 2px solid #E2E8F0; background: #F8FAFC; color: #0F172A;
    font-size: 15px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px;
  }
  .option-selected { border-color: #06372C; background: #ECFDF5; font-weight: 600; }
  .option-correct { border-color: #15803D; background: #DCFCE7; color: #14532D; font-weight: 600; }
  .option-wrong { border-color: #B91C1C; background: #FEE2E2; color: #7F1D1D; }
  .explanation-box {
    background: #FFFBEB; border: 1px solid #FDE68A; color: #78350F;
    padding: 14px; border-radius: 12px; font-size: 14px; line-height: 1.45; margin-top: 12px;
  }
</style>
</head>
<body>
<div id="app" class="app-shell"></div>
<script>
const BOOKS = ${serializedBooks};

const THEMES = {
  LIGHT: { name: "Светлая", bg: "#FAF9F6", fg: "#1C1B1F", surface: "#EFECE6" },
  SEPIA: { name: "Сепия", bg: "#F4ECD8", fg: "#3E3023", surface: "#E6DBC2" },
  NIGHT: { name: "Ночная", bg: "#141518", fg: "#D8DAE0", surface: "#202227" }
};

function createDefaultProgress() {
  const prog = {};
  BOOKS.forEach((b) => {
    b.chapters.forEach((c) => {
      prog[c.id] = {
        status: "AVAILABLE",
        offset: 0,
        bestScore: 0
      };
    });
  });
  return prog;
}

let state = {
  screen: "library",
  bookId: BOOKS[0].id,
  searchQuery: "",
  chapterId: BOOKS[0].chapters[0].id,
  pageIndex: 0,
  charOffset: 0,
  controlsVisible: true,
  settingsOpen: false,
  activeFnId: null,
  fontSize: 18,
  arabicScale: 1.35,
  theme: "LIGHT",
  qIndex: 0,
  selectedOpt: null,
  submitted: false,
  correctCount: 0,
  quizDone: false,
  progress: createDefaultProgress()
};

const ARABIC_WORD_TASHKEEL_RE = /(?:[\\u0610-\\u061A\\u0620-\\u065F\\u066E-\\u06D3\\u06D5-\\u06ED\\u0640\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF])+/g;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isArabicParagraphLine(line) {
  const hasArabic = /[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/.test(line);
  if (!hasArabic) return false;
  const hasCyrOrLat = /[А-Яа-яЁёA-Za-z]/.test(line);
  return !hasCyrOrLat;
}

function formatArabicInChunk(chunk, baseFontSize, arabicScale) {
  if (!chunk) return "";
  const scale = Number(arabicScale) || 1.0;
  if (Math.abs(scale - 1.0) < 0.001) {
    return escapeHtml(chunk);
  }
  const scaledPx = (baseFontSize * scale).toFixed(1);
  let lastIdx = 0;
  let out = "";
  ARABIC_WORD_TASHKEEL_RE.lastIndex = 0;
  let m;
  while ((m = ARABIC_WORD_TASHKEEL_RE.exec(chunk)) !== null) {
    if (m.index > lastIdx) {
      out += escapeHtml(chunk.slice(lastIdx, m.index));
    }
    out += '<span style="font-size:' + scaledPx + 'px;">' + escapeHtml(m[0]) + '</span>';
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx === 0) return escapeHtml(chunk);
  if (lastIdx < chunk.length) {
    out += escapeHtml(chunk.slice(lastIdx));
  }
  return out;
}

function formatLineMixedArabicHtml(line, baseFontSize, arabicScale, footnotes) {
  if (!line) return "";
  const fnList = footnotes || [];
  if (!fnList.length) {
    return formatArabicInChunk(line, baseFontSize, arabicScale);
  }
  const fnRe = /\\[(\\d+)\\]/g;
  let lastIdx = 0;
  let out = "";
  let m;
  while ((m = fnRe.exec(line)) !== null) {
    if (m.index > lastIdx) {
      out += formatArabicInChunk(line.slice(lastIdx, m.index), baseFontSize, arabicScale);
    }
    const fnNum = m[1];
    const hasFn = fnList.some(f => String(f.id) === String(fnNum));
    if (hasFn) {
      out += '<button type="button" class="fn-badge" onclick="openFn(event, \\'' + fnNum + '\\')">[' + fnNum + ']</button>';
    } else {
      out += escapeHtml(m[0]);
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx === 0) return formatArabicInChunk(line, baseFontSize, arabicScale);
  if (lastIdx < line.length) {
    out += formatArabicInChunk(line.slice(lastIdx), baseFontSize, arabicScale);
  }
  return out;
}

function formatMixedArabicHtml(text, baseFontSize, arabicScale, footnotes) {
  if (!text) return "";
  return String(text)
    .split("\\n")
    .map((line) => {
      if (!line.trim()) return '<div style="height:10px"></div>';
      const isRtl = isArabicParagraphLine(line);
      const inner = formatLineMixedArabicHtml(line, baseFontSize, arabicScale, footnotes);
      return '<div dir="' + (isRtl ? 'rtl' : 'ltr') + '" style="text-align:' + (isRtl ? 'right' : 'left') + '">' + inner + '</div>';
    })
    .join("");
}

try {
  const saved = localStorage.getItem("ir_apk_two_books_v3");
  if (saved) {
    const parsed = JSON.parse(saved);
    const mergedProgress = Object.assign(createDefaultProgress(), parsed.progress || {});
    Object.keys(mergedProgress).forEach((k) => {
      if (mergedProgress[k] && mergedProgress[k].status === "LOCKED") {
        mergedProgress[k].status = "AVAILABLE";
      }
    });
    state = Object.assign(state, parsed, {
      progress: mergedProgress
    });
  }
} catch (e) {}

function saveState() {
  try { localStorage.setItem("ir_apk_two_books_v3", JSON.stringify(state)); } catch (e) {}
}

function getActiveBook() {
  return BOOKS.find(b => b.id === state.bookId) || BOOKS[0];
}

function getActiveChapter() {
  const b = getActiveBook();
  return b.chapters.find(c => c.id === state.chapterId) || b.chapters[0];
}

function paginate(text, fontSize) {
  const w = Math.max(280, window.innerWidth - 44);
  const h = Math.max(260, window.innerHeight - 190);
  const charsPerLine = Math.max(22, Math.floor(w / (fontSize * 0.55)));
  const maxLines = Math.max(5, Math.floor(h / (fontSize * 1.55)));
  const pages = [];
  let pos = 0;
  while (pos < text.length) {
    while (pos < text.length && (text[pos] === ' ' || text[pos] === '\\n')) pos++;
    if (pos >= text.length) break;
    let cur = pos, lines = 0;
    while (cur < text.length && lines < maxLines) {
      const nl = text.indexOf('\\n', cur);
      const maxEnd = Math.min(cur + charsPerLine, text.length);
      if (nl !== -1 && nl <= maxEnd) {
        cur = nl + 1; lines += 1.3;
      } else {
        let cut = maxEnd;
        if (cut < text.length && !/\\s/.test(text[cut - 1]) && !/\\s/.test(text[cut])) {
          let b = cut - 1;
          while (b > cur && !/\\s/.test(text[b])) b--;
          if (b > cur) cut = b + 1;
        }
        cur = cut; lines += 1;
      }
    }
    const end = Math.max(pos + 1, Math.min(cur, text.length));
    pages.push({ start: pos, end: end, text: text.slice(pos, end).trimEnd() });
    pos = end;
  }
  return pages.length ? pages : [{ start: 0, end: text.length, text }];
}

function render() {
  saveState();
  const root = document.getElementById("app");
  const book = getActiveBook();
  const ch = getActiveChapter();

  if (state.screen === "library") {
    const passedCount = book.chapters.filter(c => state.progress[c.id] && state.progress[c.id].status === "PASSED").length;
    const ratio = Math.round((passedCount / book.chapters.length) * 100);
    const q = (state.searchQuery || "").trim().toLowerCase();
    const visibleChapters = !q
      ? book.chapters
      : book.chapters.filter(c => c.title.toLowerCase().includes(q) || c.content.toLowerCase().includes(q));

    root.innerHTML = \`
      <div class="top-bar" style="background:\${book.bg}">
        <div style="display:flex;align-items:center;gap:10px">
          <img src="data:image/svg+xml;base64,${fs.readFileSync(path.resolve(process.cwd(), 'public/icon.svg')).toString('base64')}" style="width:30px;height:30px;border-radius:7px;flex-shrink:0" alt="Иконка" />
          <h1>\${book.title}</h1>
        </div>
        <span style="font-size:12px;opacity:0.85">\${passedCount}/\${book.chapters.length} глав</span>
      </div>
      <div class="container">
        \${BOOKS.length > 1 ? \`
        <div class="book-tabs">
          \${BOOKS.map(b => \`
            <button class="book-tab \${b.id === book.id ? 'book-tab-active' : ''}" style="\${b.id === book.id ? 'background:' + b.bg + ';border-color:' + b.bg : ''}" onclick="selectBook(\${b.id})">
              <div style="font-size:10px;opacity:0.75;margin-bottom:2px">\${b.year} · \${b.chapters.length} глав</div>
              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\${b.title}</div>
            </button>
          \`).join('')}
        </div>
        \` : ''}

        <div class="book-header" style="background:\${book.bg}">
          <div style="font-size:11px;letter-spacing:0.6px;margin-bottom:6px;opacity:0.85">\${book.author.toUpperCase()} · \${book.year}</div>
          <h2>\${book.title}</h2>
          <p>\${book.description}</p>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:14px;font-weight:600">
            <span>Прогресс чтения и тестов</span><span>\${passedCount} / \${book.chapters.length} глав (\${ratio}%)</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:\${ratio}%"></div></div>
        </div>

        <input
          id="searchBox"
          class="search-input"
          type="text"
          placeholder="Поиск по главам и темам книги «\${book.title}»..."
          value="\${state.searchQuery.replace(/"/g, '&quot;')}"
          oninput="onSearchInput(this.value)"
        />

        \${visibleChapters.map(c => {
          const p = state.progress[c.id] || { status: "AVAILABLE", offset: 0, bestScore: 0 };
          const passed = p.status === "PASSED";
          return \`
            <div class="card chapter-card">
              \${passed ? '<div class="meta-line">Пройдено · Лучший результат: ' + p.bestScore + '%</div>' : ''}
              <div style="font-size:17px;font-weight:700;font-family:Georgia,serif;line-height:1.35">\${c.title}</div>
              <div style="font-size:12px;color:#475569">\${c.subtitle}</div>
              <div style="display:flex;gap:8px;margin-top:6px">
                <button class="btn btn-primary" style="flex:1;background:\${book.bg}" onclick="openChapter(\${c.id})">
                  \${p.offset > 0 ? 'Продолжить чтение' : 'Читать главу'}
                </button>
                <button class="btn btn-outline" onclick="startQuiz(\${c.id})">Тест</button>
              </div>
            </div>
          \`;
        }).join('')}
        <div id="libSbTrack" class="lib-v-scrollbar-track">
          <div id="libSbThumb" class="reader-v-scrollbar-thumb" style="height:14%;top:0%"></div>
        </div>
      </div>
    \`;
  } else if (state.screen === "reader") {
    const pages = paginate(ch.content, state.fontSize);
    let idx = pages.findIndex(p => state.charOffset >= p.start && state.charOffset < p.end);
    if (idx === -1) idx = Math.min(state.pageIndex, pages.length - 1);
    state.pageIndex = Math.max(0, idx);
    const page = pages[state.pageIndex];
    const t = THEMES[state.theme];
    const isLast = state.pageIndex === pages.length - 1;
    const arScale = Number(state.arabicScale) || 1.35;
    const formattedPageHtml = formatMixedArabicHtml(page.text, state.fontSize, arScale, ch.footnotes);
    const activeFn = state.activeFnId && ch.footnotes ? ch.footnotes.find(f => String(f.id) === String(state.activeFnId)) : null;

    const totalP = Math.max(1, pages.length);
    const thumbHPct = Math.max(12, Math.min(100, 100 / totalP));
    const thumbTopPct = totalP > 1 ? (state.pageIndex / (totalP - 1)) * (100 - thumbHPct) : 0;

    root.innerHTML = \`
      <div class="reader-screen" style="background:\${t.bg};color:\${t.fg}">
        \${state.controlsVisible ? \`
          <div class="reader-hud-top" style="background:\${t.surface}">
            <button class="btn btn-outline" style="padding:8px 12px;color:\${t.fg}" onclick="goLibrary()">← Оглавление</button>
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%">\${ch.title}</div>
            <button class="btn btn-outline" style="padding:8px 12px;color:\${t.fg}" onclick="toggleSettings()">Аа</button>
          </div>
        \` : '<div style="height:12px"></div>'}
        <div class="reader-page-area" onclick="handleReaderTap(event, \${pages.length})">
          <div id="readerSbTrack" class="reader-v-scrollbar-track" onclick="onScrollbarTap(event, \${pages.length})" ontouchstart="onScrollbarTouch(event, \${pages.length})" ontouchmove="onScrollbarTouch(event, \${pages.length})">
            <div class="reader-v-scrollbar-thumb" style="height:\${thumbHPct}%;top:\${thumbTopPct}%"></div>
          </div>
          <div class="reader-text" style="font-size:\${state.fontSize}px;line-height:\${Math.max(1.55, arScale * 1.38).toFixed(2)}">\${formattedPageHtml}</div>
          \${activeFn ? \`
            <div class="fn-popup" style="background:\${t.surface};color:\${t.fg}" onclick="event.stopPropagation()">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px">
                <strong style="color:#B45309">Сноска [\${activeFn.id}]</strong>
                <button class="btn btn-outline" style="padding:2px 8px;font-size:11px;color:\${t.fg}" onclick="closeFn()">Закрыть</button>
              </div>
              <div>\${formatMixedArabicHtml(activeFn.text, 14, arScale, [])}</div>
            </div>
          \` : ''}
          <div class="reader-footer" onclick="event.stopPropagation()">
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" style="padding:8px 12px;color:\${t.fg}" \${state.pageIndex === 0 ? 'disabled' : ''} onclick="turnPage(-1, \${pages.length})">←</button>
              <button class="btn btn-outline" style="padding:8px 12px;color:\${t.fg}" \${isLast ? 'disabled' : ''} onclick="turnPage(1, \${pages.length})">→</button>
            </div>
            <span style="font-size:12px;opacity:0.75;font-family:monospace">Стр. \${state.pageIndex + 1} / \${pages.length}</span>
            \${isLast ? \`<button class="btn btn-amber" onclick="startQuiz(\${ch.id})">Пройти тест →</button>\` : ''}
          </div>
        </div>
        \${state.settingsOpen ? \`
          <div class="settings-sheet" style="background:\${t.surface};color:\${t.fg}" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <strong>Настройки чтения</strong>
              <button class="btn btn-outline" style="padding:6px 12px;color:\${t.fg}" onclick="toggleSettings()">Готово</button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <span>Размер шрифта: <b>\${state.fontSize} sp</b></span>
              <div style="display:flex;gap:8px">
                <button class="btn btn-outline" style="color:\${t.fg}" onclick="changeFont(-2)">А-</button>
                <button class="btn btn-outline" style="color:\${t.fg}" onclick="changeFont(2)">А+</button>
              </div>
            </div>
            <div style="margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:14px">
                <span>Масштаб арабской вязи: <b>\${arScale.toFixed(2)}x (\${(state.fontSize * arScale).toFixed(1)} sp)</b></span>
                <button class="btn btn-outline" style="padding:4px 8px;font-size:11px;color:\${t.fg}" onclick="changeArabicScale(1.0)">1.0x</button>
              </div>
              <input type="range" min="1.0" max="2.0" step="0.05" value="\${arScale}" style="width:100%" oninput="changeArabicScale(this.value)" />
            </div>
            <div style="display:flex;gap:8px">
              \${Object.keys(THEMES).map(k => \`
                <button class="btn" style="flex:1;background:\${THEMES[k].bg};color:\${THEMES[k].fg};border:2px solid \${state.theme === k ? '#B45309' : '#94A3B8'}" onclick="setTheme('\${k}')">\${THEMES[k].name}</button>
              \`).join('')}
            </div>
          </div>
        \` : ''}
      </div>
    \`;
  } else if (state.screen === "quiz") {
    if (!state.quizDone) {
      const q = ch.questions[state.qIndex];
      root.innerHTML = \`
        <div class="top-bar" style="background:\${book.bg}">
          <button class="btn" style="background:transparent;color:#FEF3C7;padding:4px 8px" onclick="openChapter(\${ch.id})">← К главе</button>
          <h1>Вопрос \${state.qIndex + 1} из \${ch.questions.length}</h1>
          <span style="font-size:12px">Верно: \${state.correctCount}</span>
        </div>
        <div class="container">
          <div class="card">
            <div style="font-size:12px;color:#64748B;margin-bottom:6px">\${book.title} · \${ch.title}</div>
            <div style="font-size:18px;font-weight:700;margin-bottom:16px;line-height:1.35">\${q.q}</div>
            \${q.opts.map((opt, i) => {
              let cls = "option-btn";
              if (state.submitted) {
                if (i === q.correct) cls += " option-correct";
                else if (i === state.selectedOpt) cls += " option-wrong";
              } else if (i === state.selectedOpt) {
                cls += " option-selected";
              }
              return \`<button class="\${cls}" onclick="selectOpt(\${i})"><span><b>\${String.fromCharCode(65+i)}.</b> \${opt}</span></button>\`;
            }).join('')}
            \${state.submitted ? \`<div class="explanation-box"><b>Пояснение:</b> \${q.exp}</div>\` : ''}
            <div style="margin-top:16px">
              \${!state.submitted
                ? \`<button class="btn btn-primary" style="width:100%;background:\${book.bg}" \${state.selectedOpt === null ? 'disabled' : ''} onclick="submitAns()">Проверить ответ</button>\`
                : \`<button class="btn btn-primary" style="width:100%;background:\${book.bg}" onclick="nextQ()">\${state.qIndex + 1 < ch.questions.length ? 'Следующий вопрос →' : 'Завершить тест'}</button>\`
              }
            </div>
          </div>
        </div>
      \`;
    } else {
      const score = Math.round((state.correctCount / ch.questions.length) * 100);
      const passed = score >= 75;
      const nextCh = book.chapters.find(c => c.index === ch.index + 1);
      root.innerHTML = \`
        <div class="top-bar" style="background:\${book.bg}"><h1>Результат теста</h1></div>
        <div class="container">
          <div class="card" style="text-align:center;padding:28px 18px">
            <div style="font-size:48px;font-weight:800;color:\${passed ? '#15803D' : '#B91C1C'}">\${score}%</div>
            <h2 style="margin:8px 0">\${passed ? 'Глава успешно пройдена!' : 'Тест не пройден'}</h2>
            <p style="color:#475569;font-size:14px;line-height:1.5">
              Правильных ответов: \${state.correctCount} из \${ch.questions.length}.
              \${passed ? (nextCh ? 'Следующая глава («' + nextCh.title + '») разблокирована!' : 'Вы прошли все главы книги «' + book.title + '»!') : 'Для открытия следующей главы необходимо набрать минимум 75%.'}
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px">
              \${passed && nextCh ? \`<button class="btn btn-emerald" onclick="openChapter(\${nextCh.id})">Следующая глава →</button>\` : ''}
              <button class="btn btn-primary" style="background:\${book.bg}" onclick="openChapter(\${ch.id})">\${passed ? 'Вернуться к главе' : 'Перечитать главу'}</button>
              <button class="btn btn-outline" onclick="startQuiz(\${ch.id})">Повторить тест</button>
              <button class="btn btn-outline" onclick="goLibrary()">В библиотеку</button>
            </div>
          </div>
        </div>
      \`;
    }
  }
}

function pushHistoryLevel(tag) {
  try {
    history.pushState({ tag: tag, ts: Date.now() }, "", "#" + tag);
  } catch (e) {}
}

window.selectBook = (bookId) => {
  state.bookId = bookId;
  const b = getActiveBook();
  state.chapterId = b.chapters[0].id;
  render();
};
window.onSearchInput = (val) => {
  const wasEmpty = !state.searchQuery;
  state.searchQuery = val;
  if (wasEmpty && val) {
    pushHistoryLevel("search");
  }
  render();
  const input = document.getElementById("searchBox");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
};
window.goLibrary = () => {
  state.settingsOpen = false;
  state.activeFnId = null;
  if (state.screen !== "library") {
    state.screen = "library";
    render();
    if (window.location.hash && window.location.hash !== "#library") {
      try { history.back(); } catch (e) {}
    }
  } else {
    render();
  }
};
window.openChapter = (id) => {
  const fromLibrary = state.screen === "library";
  state.chapterId = id;
  state.charOffset = (state.progress[id] && state.progress[id].offset) || 0;
  state.settingsOpen = false;
  state.activeFnId = null;
  state.screen = "reader";
  if (fromLibrary) {
    pushHistoryLevel("reader-" + id);
  }
  render();
};
window.openFn = (e, fnId) => {
  if (e) e.stopPropagation();
  if (String(state.activeFnId) === String(fnId)) {
    window.closeFn();
    return;
  }
  const wasNull = !state.activeFnId;
  state.activeFnId = String(fnId);
  if (wasNull) {
    pushHistoryLevel("fn-" + fnId);
  }
  render();
};
window.closeFn = () => {
  if (state.activeFnId) {
    state.activeFnId = null;
    render();
    if (window.location.hash.indexOf("#fn-") === 0) {
      try { history.back(); } catch (e) {}
    }
  }
};
window.turnPage = (delta, totalPages) => {
  const ch = getActiveChapter();
  const pages = paginate(ch.content, state.fontSize);
  const nextIdx = Math.min(Math.max(0, state.pageIndex + delta), totalPages - 1);
  state.pageIndex = nextIdx;
  state.charOffset = pages[state.pageIndex].start;
  state.progress[state.chapterId].offset = state.charOffset;
  state.activeFnId = null;
  render();
};
window.seekToY = (clientY, totalPages) => {
  const track = document.getElementById("readerSbTrack");
  if (!track || totalPages <= 1) return;
  const rect = track.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)));
  const targetIdx = Math.round(ratio * (totalPages - 1));
  if (targetIdx !== state.pageIndex) {
    const ch = getActiveChapter();
    const pages = paginate(ch.content, state.fontSize);
    state.pageIndex = targetIdx;
    state.charOffset = pages[state.pageIndex].start;
    state.progress[state.chapterId].offset = state.charOffset;
    state.activeFnId = null;
    render();
  }
  const updatedTrack = document.getElementById("readerSbTrack");
  if (updatedTrack) {
    updatedTrack.classList.add("sb-active");
    clearTimeout(window.__sbTimer);
    window.__sbTimer = setTimeout(() => {
      const t = document.getElementById("readerSbTrack");
      if (t) t.classList.remove("sb-active");
    }, 1200);
  }
};
window.onScrollbarTap = (e, totalPages) => {
  if (e) e.stopPropagation();
  window.seekToY(e.clientY, totalPages);
};
window.onScrollbarTouch = (e, totalPages) => {
  if (e) {
    e.stopPropagation();
    if (e.touches && e.touches[0]) {
      window.seekToY(e.touches[0].clientY, totalPages);
    }
  }
};
window.handleReaderTap = (e, totalPages) => {
  if (state.settingsOpen) { window.toggleSettings(); return; }
  if (state.activeFnId) { window.closeFn(); return; }
  const x = e.clientX;
  const w = window.innerWidth;
  if (x < w * 0.25) {
    if (state.pageIndex > 0) window.turnPage(-1, totalPages);
  } else if (x > w * 0.75) {
    if (state.pageIndex < totalPages - 1) window.turnPage(1, totalPages);
  } else {
    state.controlsVisible = !state.controlsVisible;
    render();
  }
};
window.toggleSettings = () => {
  if (!state.settingsOpen) {
    state.settingsOpen = true;
    pushHistoryLevel("settings");
    render();
  } else {
    state.settingsOpen = false;
    render();
    if (window.location.hash === "#settings") {
      try { history.back(); } catch (e) {}
    }
  }
};
window.changeFont = (d) => { state.fontSize = Math.min(28, Math.max(14, state.fontSize + d)); render(); };
window.changeArabicScale = (val) => { state.arabicScale = Math.min(2.0, Math.max(1.0, parseFloat(val) || 1.0)); render(); };
window.setTheme = (t) => { state.theme = t; render(); };
window.startQuiz = (id) => {
  const fromOther = state.screen !== "quiz";
  state.chapterId = id; state.qIndex = 0; state.selectedOpt = null;
  state.submitted = false; state.correctCount = 0; state.quizDone = false;
  state.settingsOpen = false; state.activeFnId = null;
  state.screen = "quiz";
  if (fromOther) {
    pushHistoryLevel("quiz-" + id);
  }
  render();
};
window.selectOpt = (i) => { if (!state.submitted) { state.selectedOpt = i; render(); } };
window.submitAns = () => {
  if (state.selectedOpt === null || state.submitted) return;
  const ch = getActiveChapter();
  if (state.selectedOpt === ch.questions[state.qIndex].correct) state.correctCount++;
  state.submitted = true; render();
};
window.nextQ = () => {
  const book = getActiveBook();
  const ch = getActiveChapter();
  if (state.qIndex + 1 < ch.questions.length) {
    state.qIndex++; state.selectedOpt = null; state.submitted = false;
  } else {
    const score = Math.round((state.correctCount / ch.questions.length) * 100);
    if (score >= 75) {
      state.progress[ch.id].status = "PASSED";
      state.progress[ch.id].bestScore = Math.max(state.progress[ch.id].bestScore, score);
      const nextCh = book.chapters.find(c => c.index === ch.index + 1);
      if (nextCh && state.progress[nextCh.id].status === "LOCKED") {
        state.progress[nextCh.id].status = "AVAILABLE";
      }
    }
    state.quizDone = true;
  }
  render();
};

// Перехват системного жеста «Назад» (WebView.goBack() -> popstate)
window.addEventListener("popstate", () => {
  if (state.activeFnId !== null) {
    state.activeFnId = null;
    render();
    return;
  }
  if (state.settingsOpen) {
    state.settingsOpen = false;
    render();
    return;
  }
  if (state.screen === "quiz") {
    state.screen = "reader";
    render();
    return;
  }
  if (state.screen === "reader") {
    state.screen = "library";
    render();
    return;
  }
  if (state.searchQuery) {
    state.searchQuery = "";
    render();
    return;
  }
});

// Инициализация базового стека при запуске
try {
  history.replaceState({ tag: "library" }, "", "#library");
  if (state.screen === "reader") {
    pushHistoryLevel("reader-" + state.chapterId);
  } else if (state.screen === "quiz") {
    pushHistoryLevel("reader-" + state.chapterId);
    pushHistoryLevel("quiz-" + state.chapterId);
  }
} catch (e) {}

window.addEventListener("scroll", () => {
  if (state.screen !== "library") return;
  const thumb = document.getElementById("libSbThumb");
  const track = document.getElementById("libSbTrack");
  if (!thumb || !track) return;
  const docEl = document.documentElement;
  const maxScroll = Math.max(1, docEl.scrollHeight - window.innerHeight);
  const ratio = Math.min(1, Math.max(0, window.scrollY / maxScroll));
  const thumbH = Math.max(8, Math.min(100, (window.innerHeight / Math.max(1, docEl.scrollHeight)) * 100));
  thumb.style.height = thumbH.toFixed(1) + "%";
  thumb.style.top = (ratio * (100 - thumbH)).toFixed(1) + "%";
  track.classList.add("sb-active");
  clearTimeout(window.__libSbTimer);
  window.__libSbTimer = setTimeout(() => {
    const t = document.getElementById("libSbTrack");
    if (t) t.classList.remove("sb-active");
  }, 1000);
}, { passive: true });

window.addEventListener("resize", () => { if (state.screen === "reader") render(); });
render();
</script>
</body>
</html>`;
}

/**
 * Builds a valid Android Binary XML (AXML) for AndroidManifest.xml
 */
function buildBinaryAndroidManifest() {
  // Attribute resource IDs in Android framework (must be sorted ascending per element)
  const ATTR_THEME = 0x01010000;
  const ATTR_LABEL = 0x01010001;
  const ATTR_ICON = 0x01010002;
  const ATTR_NAME = 0x01010003;
  const ATTR_EXPORTED = 0x01010010;
  const ATTR_MIN_SDK = 0x0101020c;
  const ATTR_VERSION_CODE = 0x0101021b;
  const ATTR_VERSION_NAME = 0x0101021c;
  const ATTR_TARGET_SDK = 0x01010270;
  const ATTR_HARDWARE_ACCEL = 0x010102d3;

  // First 10 strings correspond to the resource IDs in the exact order below:
  const resIds = [
    ATTR_THEME,
    ATTR_LABEL,
    ATTR_ICON,
    ATTR_NAME,
    ATTR_EXPORTED,
    ATTR_MIN_SDK,
    ATTR_VERSION_CODE,
    ATTR_VERSION_NAME,
    ATTR_TARGET_SDK,
    ATTR_HARDWARE_ACCEL,
  ];

  const strings = [
    'theme',                                      // 0 -> 0x01010000
    'label',                                      // 1 -> 0x01010001
    'icon',                                       // 2 -> 0x01010002
    'name',                                       // 3 -> 0x01010003
    'exported',                                   // 4 -> 0x01010010
    'minSdkVersion',                              // 5 -> 0x0101020c
    'versionCode',                                // 6 -> 0x0101021b
    'versionName',                                // 7 -> 0x0101021c
    'targetSdkVersion',                           // 8 -> 0x01010270
    'hardwareAccelerated',                        // 9 -> 0x010102d3
    'android',                                    // 10
    'http://schemas.android.com/apk/res/android', // 11
    'manifest',                                   // 12
    'package',                                    // 13
    'com.example.interactivereader',              // 14
    '2.0.0',                                      // 15
    'uses-sdk',                                   // 16
    'application',                                // 17
    'Простые благодеяния',                        // 18
    'activity',                                   // 19
    'com.example.interactivereader.MainActivity', // 20
    'intent-filter',                              // 21
    'action',                                     // 22
    'android.intent.action.MAIN',                 // 23
    'category',                                   // 24
    'android.intent.category.LAUNCHER',           // 25
  ];

  // Encode UTF-16LE string pool
  const encodedStrings = strings.map((str) => {
    const strBuf = Buffer.from(str, 'utf16le');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16LE(str.length, 0);
    const nullBuf = Buffer.alloc(2, 0);
    return Buffer.concat([lenBuf, strBuf, nullBuf]);
  });

  const offsets = [];
  let curOffset = 0;
  for (const b of encodedStrings) {
    offsets.push(curOffset);
    curOffset += b.length;
  }
  while (curOffset % 4 !== 0) {
    encodedStrings.push(Buffer.alloc(1, 0));
    curOffset += 1;
  }

  const stringPoolHeaderSize = 28;
  const offsetsSize = strings.length * 4;
  const stringsStart = stringPoolHeaderSize + offsetsSize;
  const stringPoolChunkSize = stringsStart + curOffset;

  const stringPoolBuf = Buffer.alloc(stringPoolChunkSize);
  stringPoolBuf.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  stringPoolBuf.writeUInt16LE(stringPoolHeaderSize, 2);
  stringPoolBuf.writeUInt32LE(stringPoolChunkSize, 4);
  stringPoolBuf.writeUInt32LE(strings.length, 8);
  stringPoolBuf.writeUInt32LE(0, 12); // styleCount
  stringPoolBuf.writeUInt32LE(0, 16); // flags (UTF-16)
  stringPoolBuf.writeUInt32LE(stringsStart, 20);
  stringPoolBuf.writeUInt32LE(0, 24); // stylesStart

  for (let i = 0; i < offsets.length; i++) {
    stringPoolBuf.writeUInt32LE(offsets[i], stringPoolHeaderSize + i * 4);
  }
  Buffer.concat(encodedStrings).copy(stringPoolBuf, stringsStart);

  // Resource Map Chunk
  const resMapChunkSize = 8 + resIds.length * 4;
  const resMapBuf = Buffer.alloc(resMapChunkSize);
  resMapBuf.writeUInt16LE(0x0180, 0); // RES_XML_RESOURCE_MAP_TYPE
  resMapBuf.writeUInt16LE(8, 2);
  resMapBuf.writeUInt32LE(resMapChunkSize, 4);
  for (let i = 0; i < resIds.length; i++) {
    resMapBuf.writeUInt32LE(resIds[i], 8 + i * 4);
  }

  function makeNamespaceChunk(isStart, prefixIdx, uriIdx, line) {
    const buf = Buffer.alloc(24);
    buf.writeUInt16LE(isStart ? 0x0100 : 0x0101, 0);
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(24, 4);
    buf.writeUInt32LE(line, 8);
    buf.writeInt32LE(-1, 12);
    buf.writeInt32LE(prefixIdx, 16);
    buf.writeInt32LE(uriIdx, 20);
    return buf;
  }

  function makeStartElement(nameIdx, line, attrs) {
    const chunkSize = 36 + attrs.length * 20;
    const buf = Buffer.alloc(chunkSize);
    buf.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(chunkSize, 4);
    buf.writeUInt32LE(line, 8);
    buf.writeInt32LE(-1, 12);
    buf.writeInt32LE(-1, 16); // ns
    buf.writeInt32LE(nameIdx, 20);
    buf.writeUInt16LE(20, 24); // attributeStart
    buf.writeUInt16LE(20, 26); // attributeSize
    buf.writeUInt16LE(attrs.length, 28);
    buf.writeUInt16LE(0, 30);
    buf.writeUInt16LE(0, 32);
    buf.writeUInt16LE(0, 34);

    attrs.forEach((a, idx) => {
      const base = 36 + idx * 20;
      buf.writeInt32LE(a.ns, base);
      buf.writeInt32LE(a.nameIdx, base + 4);
      buf.writeInt32LE(a.rawValIdx, base + 8);
      buf.writeUInt16LE(8, base + 12);
      buf.writeUInt8(0, base + 14);
      buf.writeUInt8(a.type, base + 16);
      buf.writeUInt32LE(a.data >>> 0, base + 16); // wait: offset 15 is type!
    });
    return buf;
  }

  // Fix attribute layout:
  // +0: ns (int32)
  // +4: name (int32)
  // +8: rawValue (int32)
  // +12: size (uint16 = 8)
  // +14: res0 (uint8 = 0)
  // +15: dataType (uint8: 0x03=string, 0x10=int, 0x12=bool, 0x01=reference)
  // +16: data (uint32)
  function makeStartElementCorrect(nameIdx, line, attrs) {
    const chunkSize = 36 + attrs.length * 20;
    const buf = Buffer.alloc(chunkSize);
    buf.writeUInt16LE(0x0102, 0);
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(chunkSize, 4);
    buf.writeUInt32LE(line, 8);
    buf.writeInt32LE(-1, 12);
    buf.writeInt32LE(-1, 16);
    buf.writeInt32LE(nameIdx, 20);
    buf.writeUInt16LE(20, 24);
    buf.writeUInt16LE(20, 26);
    buf.writeUInt16LE(attrs.length, 28);
    buf.writeUInt16LE(0, 30);
    buf.writeUInt16LE(0, 32);
    buf.writeUInt16LE(0, 34);

    attrs.forEach((a, idx) => {
      const base = 36 + idx * 20;
      buf.writeInt32LE(a.ns, base);
      buf.writeInt32LE(a.nameIdx, base + 4);
      buf.writeInt32LE(a.rawValIdx, base + 8);
      buf.writeUInt16LE(8, base + 12);
      buf.writeUInt8(0, base + 14);
      buf.writeUInt8(a.type, base + 15);
      buf.writeUInt32LE(a.data >>> 0, base + 16);
    });
    return buf;
  }

  function makeEndElement(nameIdx, line) {
    const buf = Buffer.alloc(24);
    buf.writeUInt16LE(0x0103, 0);
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(24, 4);
    buf.writeUInt32LE(line, 8);
    buf.writeInt32LE(-1, 12);
    buf.writeInt32LE(-1, 16);
    buf.writeInt32LE(nameIdx, 20);
    return buf;
  }

  const TYPE_REFERENCE = 0x01;
  const TYPE_STRING = 0x03;
  const TYPE_INT_DEC = 0x10;
  const TYPE_INT_BOOLEAN = 0x12;

  const xmlChunks = [
    makeNamespaceChunk(true, 10, 11, 2),
    // <manifest android:versionCode="2" android:versionName="2.0.0" package="com.example.interactivereader">
    makeStartElementCorrect(12, 2, [
      { ns: 11, nameIdx: 6, rawValIdx: -1, type: TYPE_INT_DEC, data: 2 },
      { ns: 11, nameIdx: 7, rawValIdx: 15, type: TYPE_STRING, data: 15 },
      { ns: -1, nameIdx: 13, rawValIdx: 14, type: TYPE_STRING, data: 14 },
    ]),
    // <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="28" />
    makeStartElementCorrect(16, 6, [
      { ns: 11, nameIdx: 5, rawValIdx: -1, type: TYPE_INT_DEC, data: 21 },
      { ns: 11, nameIdx: 8, rawValIdx: -1, type: TYPE_INT_DEC, data: 28 },
    ]),
    makeEndElement(16, 6),
    // <application android:theme="@android:style/Theme.Material.Light.NoActionBar" android:label="Простые благодеяния" android:icon="@drawable/ic_launcher" (0x7f010000) android:hardwareAccelerated="true">
    makeStartElementCorrect(17, 8, [
      { ns: 11, nameIdx: 0, rawValIdx: -1, type: TYPE_REFERENCE, data: 0x01030224 },
      { ns: 11, nameIdx: 1, rawValIdx: 18, type: TYPE_STRING, data: 18 },
      { ns: 11, nameIdx: 2, rawValIdx: -1, type: TYPE_REFERENCE, data: 0x7f010000 },
      { ns: 11, nameIdx: 9, rawValIdx: -1, type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    // <activity android:icon="@drawable/ic_launcher" android:name="com.example.interactivereader.MainActivity" android:exported="true">
    makeStartElementCorrect(19, 12, [
      { ns: 11, nameIdx: 2, rawValIdx: -1, type: TYPE_REFERENCE, data: 0x7f010000 },
      { ns: 11, nameIdx: 3, rawValIdx: 20, type: TYPE_STRING, data: 20 },
      { ns: 11, nameIdx: 4, rawValIdx: -1, type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    // <intent-filter>
    makeStartElementCorrect(21, 15, []),
    // <action android:name="android.intent.action.MAIN" />
    makeStartElementCorrect(22, 16, [
      { ns: 11, nameIdx: 3, rawValIdx: 23, type: TYPE_STRING, data: 23 },
    ]),
    makeEndElement(22, 16),
    // <category android:name="android.intent.category.LAUNCHER" />
    makeStartElementCorrect(24, 17, [
      { ns: 11, nameIdx: 3, rawValIdx: 25, type: TYPE_STRING, data: 25 },
    ]),
    makeEndElement(24, 17),
    makeEndElement(21, 18),
    makeEndElement(19, 19),
    makeEndElement(17, 20),
    makeEndElement(12, 21),
    makeNamespaceChunk(false, 10, 11, 21),
  ];

  const bodyBuf = Buffer.concat([stringPoolBuf, resMapBuf, ...xmlChunks]);
  const headerBuf = Buffer.alloc(8);
  headerBuf.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  headerBuf.writeUInt16LE(8, 2);
  headerBuf.writeUInt32LE(8 + bodyBuf.length, 4);

  return Buffer.concat([headerBuf, bodyBuf]);
}

/**
 * Builds a valid Android resources.arsc table mapping 0x7f010000 (@drawable/ic_launcher)
 * to res/drawable/ic_launcher.png
 */
function buildResourcesArsc() {
  function makeUtf16StringPool(strList) {
    const encoded = strList.map((str) => {
      const strBuf = Buffer.from(str, 'utf16le');
      const lenBuf = Buffer.alloc(2);
      lenBuf.writeUInt16LE(str.length, 0);
      const nullBuf = Buffer.alloc(2, 0);
      return Buffer.concat([lenBuf, strBuf, nullBuf]);
    });
    const offsets = [];
    let cur = 0;
    for (const b of encoded) {
      offsets.push(cur);
      cur += b.length;
    }
    while (cur % 4 !== 0) {
      encoded.push(Buffer.alloc(1, 0));
      cur += 1;
    }
    const headerSize = 28;
    const offsetsSize = strList.length * 4;
    const stringsStart = headerSize + offsetsSize;
    const totalSize = stringsStart + cur;
    const buf = Buffer.alloc(totalSize);
    buf.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
    buf.writeUInt16LE(headerSize, 2);
    buf.writeUInt32LE(totalSize, 4);
    buf.writeUInt32LE(strList.length, 8);
    buf.writeUInt32LE(0, 12);
    buf.writeUInt32LE(0, 16); // UTF-16
    buf.writeUInt32LE(stringsStart, 20);
    buf.writeUInt32LE(0, 24);
    for (let i = 0; i < offsets.length; i++) {
      buf.writeUInt32LE(offsets[i], headerSize + i * 4);
    }
    Buffer.concat(encoded).copy(buf, stringsStart);
    return buf;
  }

  const globalPool = makeUtf16StringPool(['res/drawable/ic_launcher.png']);
  const typePool = makeUtf16StringPool(['drawable']);
  const keyPool = makeUtf16StringPool(['ic_launcher']);

  // ResTable_typeSpec (type 0x0202)
  const typeSpecBuf = Buffer.alloc(20);
  typeSpecBuf.writeUInt16LE(0x0202, 0);
  typeSpecBuf.writeUInt16LE(16, 2);
  typeSpecBuf.writeUInt32LE(20, 4);
  typeSpecBuf.writeUInt8(1, 8); // id = 1 (drawable)
  typeSpecBuf.writeUInt32LE(1, 12); // entryCount = 1
  typeSpecBuf.writeUInt32LE(0, 16); // flags[0] = 0

  // ResTable_type (type 0x0201)
  // Header: 8 (ResChunk_header) + 4 (id/res0/res1) + 4 (entryCount) + 4 (entriesStart) + 36 (ResTable_config) = 56 bytes
  const typeHeaderSize = 56;
  const entriesStart = typeHeaderSize + 4; // 1 offset (4 bytes)
  const entryDataSize = 16; // ResTable_entry (8) + Res_value (8)
  const typeChunkSize = entriesStart + entryDataSize;
  const typeBuf = Buffer.alloc(typeChunkSize);
  typeBuf.writeUInt16LE(0x0201, 0);
  typeBuf.writeUInt16LE(typeHeaderSize, 2);
  typeBuf.writeUInt32LE(typeChunkSize, 4);
  typeBuf.writeUInt8(1, 8); // id = 1
  typeBuf.writeUInt32LE(1, 12); // entryCount = 1
  typeBuf.writeUInt32LE(entriesStart, 16); // entriesStart = 60
  typeBuf.writeUInt32LE(36, 20); // ResTable_config.size = 36
  // entryOffsets[0] at offset 56 = 0
  typeBuf.writeUInt32LE(0, 56);
  // ResTable_entry at offset 60:
  typeBuf.writeUInt16LE(8, 60); // size = 8
  typeBuf.writeUInt16LE(0, 62); // flags = 0
  typeBuf.writeUInt32LE(0, 64); // key = 0 ('ic_launcher' in keyPool)
  // Res_value at offset 68:
  typeBuf.writeUInt16LE(8, 68); // size = 8
  typeBuf.writeUInt8(0, 70); // res0 = 0
  typeBuf.writeUInt8(0x03, 71); // dataType = TYPE_STRING (0x03)
  typeBuf.writeUInt32LE(0, 72); // data = 0 ('res/drawable/ic_launcher.png' in globalPool)

  // ResTable_package (type 0x0200, headerSize = 288)
  const pkgHeaderSize = 288;
  const pkgBody = Buffer.concat([typePool, keyPool, typeSpecBuf, typeBuf]);
  const pkgTotalSize = pkgHeaderSize + pkgBody.length;
  const pkgHeader = Buffer.alloc(pkgHeaderSize);
  pkgHeader.writeUInt16LE(0x0200, 0);
  pkgHeader.writeUInt16LE(pkgHeaderSize, 2);
  pkgHeader.writeUInt32LE(pkgTotalSize, 4);
  pkgHeader.writeUInt32LE(0x7f, 8); // package id = 0x7f
  const pkgNameBuf = Buffer.from('com.example.interactivereader', 'utf16le');
  pkgNameBuf.copy(pkgHeader, 12);
  pkgHeader.writeUInt32LE(pkgHeaderSize, 268); // typeStrings offset
  pkgHeader.writeUInt32LE(1, 272); // lastPublicType
  pkgHeader.writeUInt32LE(pkgHeaderSize + typePool.length, 276); // keyStrings offset
  pkgHeader.writeUInt32LE(1, 280); // lastPublicKey
  pkgHeader.writeUInt32LE(0, 284); // typeIdOffset

  const pkgChunk = Buffer.concat([pkgHeader, pkgBody]);

  // ResTable_header (type 0x0002, headerSize = 12)
  const tableHeader = Buffer.alloc(12);
  const tableTotalSize = 12 + globalPool.length + pkgChunk.length;
  tableHeader.writeUInt16LE(0x0002, 0);
  tableHeader.writeUInt16LE(12, 2);
  tableHeader.writeUInt32LE(tableTotalSize, 4);
  tableHeader.writeUInt32LE(1, 8); // packageCount = 1

  return Buffer.concat([tableHeader, globalPool, pkgChunk]);
}

/**
 * Builds a valid Dalvik Executable (classes.dex) for com.example.interactivereader.MainActivity
 * that opens an Android WebView and loads file:///android_asset/index.html
 */
function buildClassesDex() {
  // Strings in strict lexicographical order!
  const strings = [
    '<init>',                                           // 0
    'Landroid/app/Activity;',                           // 1
    'Landroid/content/Context;',                        // 2
    'Landroid/os/Bundle;',                              // 3
    'Landroid/view/View;',                              // 4
    'Landroid/webkit/WebSettings;',                     // 5
    'Landroid/webkit/WebView;',                         // 6
    'Lcom/example/interactivereader/MainActivity;',     // 7
    'Ljava/lang/Object;',                               // 8
    'Ljava/lang/String;',                               // 9
    'V',                                                // 10
    'VL',                                               // 11
    'VZ',                                               // 12
    'Z',                                                // 13
    'file:///android_asset/index.html',                 // 14
    'getSettings',                                      // 15
    'loadUrl',                                          // 16
    'onCreate',                                         // 17
    'setContentView',                                   // 18
    'setDomStorageEnabled',                             // 19
    'setJavaScriptEnabled',                             // 20
  ];

  // Type IDs (indices into strings, sorted)
  // 0: Landroid/app/Activity; (1)
  // 1: Landroid/content/Context; (2)
  // 2: Landroid/os/Bundle; (3)
  // 3: Landroid/view/View; (4)
  // 4: Landroid/webkit/WebSettings; (5)
  // 5: Landroid/webkit/WebView; (6)
  // 6: Lcom/example/interactivereader/MainActivity; (7)
  // 7: Ljava/lang/String; (9)
  // 8: V (10)
  // 9: Z (13)
  const typeIds = [1, 2, 3, 4, 5, 6, 7, 9, 10, 13];

  // Type Lists for Proto parameters:
  // List A: (Landroid/content/Context;) -> [1]
  // List B: (Landroid/os/Bundle;) -> [2]
  // List C: (Landroid/view/View;) -> [3]
  // List D: (Ljava/lang/String;) -> [7]
  // List E: (Z) -> [9]

  // Proto IDs (sorted by return_type_idx, then parameters_list):
  // 0: ()Landroid/webkit/WebSettings; -> shorty=8('L'? Wait: let's add 'L' to strings!)
  return buildClassesDexWithShorties();
}

function buildClassesDexWithShorties() {
  // Strictly sorted UTF-8 strings:
  const strings = [
    '<init>',                                           // 0
    'L',                                                // 1
    'Landroid/app/Activity;',                           // 2
    'Landroid/content/Context;',                        // 3
    'Landroid/os/Bundle;',                              // 4
    'Landroid/view/View;',                              // 5
    'Landroid/webkit/WebSettings;',                     // 6
    'Landroid/webkit/WebView;',                         // 7
    'Lcom/example/interactivereader/MainActivity;',     // 8
    'Ljava/lang/String;',                               // 9
    'V',                                                // 10
    'VL',                                               // 11
    'VZ',                                               // 12
    'Z',                                                // 13
    'canGoBack',                                        // 14
    'file:///android_asset/index.html',                 // 15
    'getSettings',                                      // 16
    'goBack',                                           // 17
    'loadUrl',                                          // 18
    'onBackPressed',                                    // 19
    'onCreate',                                         // 20
    'setContentView',                                   // 21
    'setDomStorageEnabled',                             // 22
    'setJavaScriptEnabled',                             // 23
    'webView',                                          // 24
  ];

  // Verify strict lexicographical sort
  for (let i = 1; i < strings.length; i++) {
    if (strings[i - 1] >= strings[i]) {
      throw new Error(`Strings not sorted: ${strings[i - 1]} vs ${strings[i]}`);
    }
  }

  // Type IDs (index into strings):
  // 0: Landroid/app/Activity; (2)
  // 1: Landroid/content/Context; (3)
  // 2: Landroid/os/Bundle; (4)
  // 3: Landroid/view/View; (5)
  // 4: Landroid/webkit/WebSettings; (6)
  // 5: Landroid/webkit/WebView; (7)
  // 6: Lcom/example/interactivereader/MainActivity; (8)
  // 7: Ljava/lang/String; (9)
  // 8: V (10)
  // 9: Z (13)
  const typeIds = [2, 3, 4, 5, 6, 7, 8, 9, 10, 13];

  // Protos (sorted by return_type_idx, then parameter type_idx):
  // 0: ()Landroid/webkit/WebSettings;  | shorty=1 ('L'), return=4, params=0
  // 1: ()V                             | shorty=10 ('V'), return=8, params=0
  // 2: (Landroid/content/Context;)V    | shorty=11 ('VL'), return=8, params=[1]
  // 3: (Landroid/os/Bundle;)V          | shorty=11 ('VL'), return=8, params=[2]
  // 4: (Landroid/view/View;)V          | shorty=11 ('VL'), return=8, params=[3]
  // 5: (Ljava/lang/String;)V           | shorty=11 ('VL'), return=8, params=[7]
  // 6: (Z)V                            | shorty=12 ('VZ'), return=8, params=[9]
  // 7: ()Z                             | shorty=13 ('Z'), return=9, params=0
  const protos = [
    { shortyIdx: 1, returnTypeIdx: 4, paramTypeIdx: null },
    { shortyIdx: 10, returnTypeIdx: 8, paramTypeIdx: null },
    { shortyIdx: 11, returnTypeIdx: 8, paramTypeIdx: 1 },
    { shortyIdx: 11, returnTypeIdx: 8, paramTypeIdx: 2 },
    { shortyIdx: 11, returnTypeIdx: 8, paramTypeIdx: 3 },
    { shortyIdx: 11, returnTypeIdx: 8, paramTypeIdx: 7 },
    { shortyIdx: 12, returnTypeIdx: 8, paramTypeIdx: 9 },
    { shortyIdx: 13, returnTypeIdx: 9, paramTypeIdx: null },
  ];

  // Field IDs:
  // 0: Lcom/example/interactivereader/MainActivity;.webView:Landroid/webkit/WebView; (class=6, type=5, name=24)
  const fields = [
    { classIdx: 6, typeIdx: 5, nameIdx: 24 },
  ];

  // Method IDs (sorted by class_idx, then name_idx, then proto_idx):
  // 0: Landroid/app/Activity;.<init>:()V                                     (class=0, name=0, proto=1)
  // 1: Landroid/app/Activity;.onBackPressed:()V                              (class=0, name=19, proto=1)
  // 2: Landroid/app/Activity;.onCreate:(Landroid/os/Bundle;)V                (class=0, name=20, proto=3)
  // 3: Landroid/app/Activity;.setContentView:(Landroid/view/View;)V          (class=0, name=21, proto=4)
  // 4: Landroid/webkit/WebSettings;.setDomStorageEnabled:(Z)V                (class=4, name=22, proto=6)
  // 5: Landroid/webkit/WebSettings;.setJavaScriptEnabled:(Z)V                (class=4, name=23, proto=6)
  // 6: Landroid/webkit/WebView;.<init>:(Landroid/content/Context;)V          (class=5, name=0, proto=2)
  // 7: Landroid/webkit/WebView;.canGoBack:()Z                                (class=5, name=14, proto=7)
  // 8: Landroid/webkit/WebView;.getSettings:()Landroid/webkit/WebSettings;   (class=5, name=16, proto=0)
  // 9: Landroid/webkit/WebView;.goBack:()V                                   (class=5, name=17, proto=1)
  // 10: Landroid/webkit/WebView;.loadUrl:(Ljava/lang/String;)V               (class=5, name=18, proto=5)
  // 11: Lcom/example/interactivereader/MainActivity;.<init>:()V              (class=6, name=0, proto=1)
  // 12: Lcom/example/interactivereader/MainActivity;.onBackPressed:()V       (class=6, name=19, proto=1)
  // 13: Lcom/example/interactivereader/MainActivity;.onCreate:(Landroid/os/Bundle;)V (class=6, name=20, proto=3)
  const methods = [
    { classIdx: 0, protoIdx: 1, nameIdx: 0 },
    { classIdx: 0, protoIdx: 1, nameIdx: 19 },
    { classIdx: 0, protoIdx: 3, nameIdx: 20 },
    { classIdx: 0, protoIdx: 4, nameIdx: 21 },
    { classIdx: 4, protoIdx: 6, nameIdx: 22 },
    { classIdx: 4, protoIdx: 6, nameIdx: 23 },
    { classIdx: 5, protoIdx: 2, nameIdx: 0 },
    { classIdx: 5, protoIdx: 7, nameIdx: 14 },
    { classIdx: 5, protoIdx: 0, nameIdx: 16 },
    { classIdx: 5, protoIdx: 1, nameIdx: 17 },
    { classIdx: 5, protoIdx: 5, nameIdx: 18 },
    { classIdx: 6, protoIdx: 1, nameIdx: 0 },
    { classIdx: 6, protoIdx: 1, nameIdx: 19 },
    { classIdx: 6, protoIdx: 3, nameIdx: 20 },
  ];

  // ULEB128 helper
  function uleb128(val) {
    const bytes = [];
    do {
      let b = val & 0x7f;
      val >>>= 7;
      if (val !== 0) b |= 0x80;
      bytes.push(b);
    } while (val !== 0);
    return Buffer.from(bytes);
  }

  // Code item 1: MainActivity.<init>()V
  const initCodeItem = Buffer.alloc(16 + 8);
  initCodeItem.writeUInt16LE(1, 0); // registers_size
  initCodeItem.writeUInt16LE(1, 2); // ins_size
  initCodeItem.writeUInt16LE(1, 4); // outs_size
  initCodeItem.writeUInt16LE(0, 6); // tries_size
  initCodeItem.writeUInt32LE(0, 8); // debug_info_off
  initCodeItem.writeUInt32LE(4, 12); // insns_size (4 units)
  Buffer.from([0x70, 0x10, 0x00, 0x00, 0x00, 0x00, 0x0e, 0x00]).copy(initCodeItem, 16);

  // Code item 2: MainActivity.onBackPressed()V
  // registers_size = 3 (v0=webView, v1=canGoBack, v2=this), ins_size = 1 (v2), outs_size = 1
  const onBackPressedInsns = Buffer.from([
    0x54, 0x20, 0x00, 0x00,             // iget-object v0, v2, MainActivity.webView (field 0)
    0x38, 0x00, 0x0c, 0x00,             // if-eqz v0, :call_super (+12 units -> 0x000e)
    0x6e, 0x10, 0x07, 0x00, 0x00, 0x00, // invoke-virtual {v0}, WebView.canGoBack:()Z (method 7)
    0x0a, 0x01,                         // move-result v1
    0x38, 0x01, 0x06, 0x00,             // if-eqz v1, :call_super (+6 units -> 0x000e)
    0x6e, 0x10, 0x09, 0x00, 0x00, 0x00, // invoke-virtual {v0}, WebView.goBack:()V (method 9)
    0x0e, 0x00,                         // return-void
    0x6f, 0x10, 0x01, 0x00, 0x02, 0x00, // invoke-super {v2}, Activity.onBackPressed:()V (method 1)
    0x0e, 0x00,                         // return-void
  ]);
  const onBackPressedCodeItem = Buffer.alloc(16 + onBackPressedInsns.length); // 16 + 36 = 52 bytes (4-byte aligned)
  onBackPressedCodeItem.writeUInt16LE(3, 0); // registers_size
  onBackPressedCodeItem.writeUInt16LE(1, 2); // ins_size
  onBackPressedCodeItem.writeUInt16LE(1, 4); // outs_size
  onBackPressedCodeItem.writeUInt16LE(0, 6); // tries_size
  onBackPressedCodeItem.writeUInt32LE(0, 8); // debug_info_off
  onBackPressedCodeItem.writeUInt32LE(onBackPressedInsns.length / 2, 12); // insns_size (18 units)
  onBackPressedInsns.copy(onBackPressedCodeItem, 16);

  // Code item 3: MainActivity.onCreate(Landroid/os/Bundle;)V
  // registers_size = 5 (v0=webView, v1=settings, v2=const1/url, v3=this, v4=bundle)
  // ins_size = 2 (v3, v4), outs_size = 2
  const onCreateInsns = Buffer.from([
    0x6f, 0x20, 0x02, 0x00, 0x43, 0x00, // invoke-super {v3, v4}, Activity.onCreate (method 2)
    0x22, 0x00, 0x05, 0x00,             // new-instance v0, Landroid/webkit/WebView; (type 5)
    0x70, 0x20, 0x06, 0x00, 0x30, 0x00, // invoke-direct {v0, v3}, WebView.<init>(Context) (method 6)
    0x5b, 0x30, 0x00, 0x00,             // iput-object v0, v3, MainActivity.webView (field 0)
    0x6e, 0x10, 0x08, 0x00, 0x00, 0x00, // invoke-virtual {v0}, WebView.getSettings() (method 8)
    0x0c, 0x01,                         // move-result-object v1
    0x12, 0x12,                         // const/4 v2, #1
    0x6e, 0x20, 0x05, 0x00, 0x21, 0x00, // invoke-virtual {v1, v2}, WebSettings.setJavaScriptEnabled(Z) (method 5)
    0x6e, 0x20, 0x04, 0x00, 0x21, 0x00, // invoke-virtual {v1, v2}, WebSettings.setDomStorageEnabled(Z) (method 4)
    0x1a, 0x02, 0x0f, 0x00,             // const-string v2, "file:///android_asset/index.html" (str 15)
    0x6e, 0x20, 0x0a, 0x00, 0x20, 0x00, // invoke-virtual {v0, v2}, WebView.loadUrl(String) (method 10)
    0x6e, 0x20, 0x03, 0x00, 0x03, 0x00, // invoke-virtual {v3, v0}, Activity.setContentView(View) (method 3)
    0x0e, 0x00,                         // return-void
  ]);
  const onCreateCodeItem = Buffer.alloc(16 + onCreateInsns.length + 2); // +2 for 4-byte alignment
  onCreateCodeItem.writeUInt16LE(5, 0); // registers_size
  onCreateCodeItem.writeUInt16LE(2, 2); // ins_size
  onCreateCodeItem.writeUInt16LE(2, 4); // outs_size
  onCreateCodeItem.writeUInt16LE(0, 6); // tries_size
  onCreateCodeItem.writeUInt32LE(0, 8); // debug_info_off
  onCreateCodeItem.writeUInt32LE(onCreateInsns.length / 2, 12); // insns_size (27 units)
  onCreateInsns.copy(onCreateCodeItem, 16);

  const headerSize = 0x70;
  const stringIdsOff = headerSize;
  const typeIdsOff = stringIdsOff + strings.length * 4;
  const protoIdsOff = typeIdsOff + typeIds.length * 4;
  const fieldIdsOff = protoIdsOff + protos.length * 12;
  const methodIdsOff = fieldIdsOff + fields.length * 8;
  const classDefsOff = methodIdsOff + methods.length * 8;
  const dataOff = classDefsOff + 32;

  // Data Section items:
  // 1) Type Lists (5 lists of 1 item each, 4-byte aligned -> 8 bytes each = 40 bytes)
  const typeListsOff = dataOff;
  const paramTypes = [1, 2, 3, 7, 9];
  const typeListsBuf = Buffer.alloc(paramTypes.length * 8);
  paramTypes.forEach((tIdx, i) => {
    typeListsBuf.writeUInt32LE(1, i * 8);
    typeListsBuf.writeUInt16LE(tIdx, i * 8 + 4);
    typeListsBuf.writeUInt16LE(0, i * 8 + 6); // padding
  });

  // 2) Code items (4-byte aligned)
  const initCodeOff = typeListsOff + typeListsBuf.length;
  const onBackPressedCodeOff = initCodeOff + initCodeItem.length;
  const onCreateCodeOff = onBackPressedCodeOff + onBackPressedCodeItem.length;

  // 3) String Data items
  const stringDataStartOff = onCreateCodeOff + onCreateCodeItem.length;
  const stringDataOffsets = [];
  const stringDataChunks = [];
  let curStrOff = stringDataStartOff;
  for (const s of strings) {
    stringDataOffsets.push(curStrOff);
    const utf8Buf = Buffer.from(s, 'utf8');
    const lenPrefix = uleb128(s.length);
    const chunk = Buffer.concat([lenPrefix, utf8Buf, Buffer.from([0])]);
    stringDataChunks.push(chunk);
    curStrOff += chunk.length;
  }

  // 4) Class Data item for MainActivity
  const classDataOff = curStrOff;
  // static_fields=0, instance_fields=1, direct_methods=1, virtual_methods=2
  const classDataBuf = Buffer.concat([
    uleb128(0), // static_fields_size
    uleb128(1), // instance_fields_size
    uleb128(1), // direct_methods_size
    uleb128(2), // virtual_methods_size
    // instance_field[0]: field_idx_diff=0, access_flags=0x0002 (PRIVATE)
    uleb128(0),
    uleb128(0x0002),
    // direct_method[0]: method_idx_diff=11, access_flags=0x10001 (PUBLIC | CONSTRUCTOR), code_off=initCodeOff
    uleb128(11),
    uleb128(0x10001),
    uleb128(initCodeOff),
    // virtual_method[0]: method_idx_diff=12, access_flags=0x0001 (PUBLIC), code_off=onBackPressedCodeOff
    uleb128(12),
    uleb128(0x0001),
    uleb128(onBackPressedCodeOff),
    // virtual_method[1]: method_idx_diff=1 (13 - 12), access_flags=0x0004 (PROTECTED), code_off=onCreateCodeOff
    uleb128(1),
    uleb128(0x0004),
    uleb128(onCreateCodeOff),
  ]);

  let afterClassDataOff = classDataOff + classDataBuf.length;
  const alignPadLen = (4 - (afterClassDataOff % 4)) % 4;
  const alignPadBuf = Buffer.alloc(alignPadLen, 0);
  const mapListOff = afterClassDataOff + alignPadLen;

  // 5) Map List (12 items)
  const mapItems = [
    { type: 0x0000, size: 1, offset: 0 },
    { type: 0x0001, size: strings.length, offset: stringIdsOff },
    { type: 0x0002, size: typeIds.length, offset: typeIdsOff },
    { type: 0x0003, size: protos.length, offset: protoIdsOff },
    { type: 0x0004, size: fields.length, offset: fieldIdsOff },
    { type: 0x0005, size: methods.length, offset: methodIdsOff },
    { type: 0x0006, size: 1, offset: classDefsOff },
    { type: 0x1001, size: paramTypes.length, offset: typeListsOff },
    { type: 0x2001, size: 3, offset: initCodeOff },
    { type: 0x2002, size: strings.length, offset: stringDataStartOff },
    { type: 0x2000, size: 1, offset: classDataOff },
    { type: 0x1000, size: 1, offset: mapListOff },
  ];

  const mapListBuf = Buffer.alloc(4 + mapItems.length * 12);
  mapListBuf.writeUInt32LE(mapItems.length, 0);
  mapItems.forEach((m, i) => {
    const base = 4 + i * 12;
    mapListBuf.writeUInt16LE(m.type, base);
    mapListBuf.writeUInt16LE(0, base + 2);
    mapListBuf.writeUInt32LE(m.size, base + 4);
    mapListBuf.writeUInt32LE(m.offset, base + 8);
  });

  const fileSize = mapListOff + mapListBuf.length;
  const dataSize = fileSize - dataOff;

  const dex = Buffer.alloc(fileSize, 0);

  // Write magic "dex\n035\0"
  Buffer.from('dex\n035\0', 'ascii').copy(dex, 0);
  dex.writeUInt32LE(fileSize, 32);
  dex.writeUInt32LE(0x70, 36);
  dex.writeUInt32LE(0x12345678, 40); // ENDIAN_CONSTANT
  dex.writeUInt32LE(0, 44); // link_size
  dex.writeUInt32LE(0, 48); // link_off
  dex.writeUInt32LE(mapListOff, 52);
  dex.writeUInt32LE(strings.length, 56);
  dex.writeUInt32LE(stringIdsOff, 60);
  dex.writeUInt32LE(typeIds.length, 64);
  dex.writeUInt32LE(typeIdsOff, 68);
  dex.writeUInt32LE(protos.length, 72);
  dex.writeUInt32LE(protoIdsOff, 76);
  dex.writeUInt32LE(fields.length, 80); // field_ids_size
  dex.writeUInt32LE(fieldIdsOff, 84); // field_ids_off
  dex.writeUInt32LE(methods.length, 88);
  dex.writeUInt32LE(methodIdsOff, 92);
  dex.writeUInt32LE(1, 96); // class_defs_size
  dex.writeUInt32LE(classDefsOff, 100);
  dex.writeUInt32LE(dataSize, 104);
  dex.writeUInt32LE(dataOff, 108);

  // String IDs
  stringDataOffsets.forEach((off, i) => {
    dex.writeUInt32LE(off, stringIdsOff + i * 4);
  });

  // Type IDs
  typeIds.forEach((sIdx, i) => {
    dex.writeUInt32LE(sIdx, typeIdsOff + i * 4);
  });

  // Proto IDs
  let paramListIdx = 0;
  protos.forEach((p, i) => {
    const base = protoIdsOff + i * 12;
    dex.writeUInt32LE(p.shortyIdx, base);
    dex.writeUInt32LE(p.returnTypeIdx, base + 4);
    if (p.paramTypeIdx !== null) {
      dex.writeUInt32LE(typeListsOff + paramListIdx * 8, base + 8);
      paramListIdx++;
    } else {
      dex.writeUInt32LE(0, base + 8);
    }
  });

  // Field IDs
  fields.forEach((f, i) => {
    const base = fieldIdsOff + i * 8;
    dex.writeUInt16LE(f.classIdx, base);
    dex.writeUInt16LE(f.typeIdx, base + 2);
    dex.writeUInt32LE(f.nameIdx, base + 4);
  });

  // Method IDs
  methods.forEach((m, i) => {
    const base = methodIdsOff + i * 8;
    dex.writeUInt16LE(m.classIdx, base);
    dex.writeUInt16LE(m.protoIdx, base + 2);
    dex.writeUInt32LE(m.nameIdx, base + 4);
  });

  // Class Def (MainActivity = type 6, PUBLIC=0x0001, superclass=Activity=type 0)
  dex.writeUInt32LE(6, classDefsOff); // class_idx
  dex.writeUInt32LE(0x0001, classDefsOff + 4); // access_flags
  dex.writeUInt32LE(0, classDefsOff + 8); // superclass_idx
  dex.writeUInt32LE(0, classDefsOff + 12); // interfaces_off
  dex.writeUInt32LE(0xffffffff, classDefsOff + 16); // source_file_idx (NO_INDEX)
  dex.writeUInt32LE(0, classDefsOff + 20); // annotations_off
  dex.writeUInt32LE(classDataOff, classDefsOff + 24); // class_data_off
  dex.writeUInt32LE(0, classDefsOff + 28); // static_values_off

  // Copy Data Section
  typeListsBuf.copy(dex, typeListsOff);
  initCodeItem.copy(dex, initCodeOff);
  onBackPressedCodeItem.copy(dex, onBackPressedCodeOff);
  onCreateCodeItem.copy(dex, onCreateCodeOff);
  Buffer.concat(stringDataChunks).copy(dex, stringDataStartOff);
  classDataBuf.copy(dex, classDataOff);
  alignPadBuf.copy(dex, afterClassDataOff);
  mapListBuf.copy(dex, mapListOff);

  // Compute SHA-1 signature (bytes 32..end) and store at offset 12..31
  const sha1 = crypto.createHash('sha1').update(dex.subarray(32)).digest();
  sha1.copy(dex, 12);

  // Compute Adler32 checksum (bytes 12..end) and store at offset 8..11
  let a = 1;
  let b = 0;
  for (let i = 12; i < dex.length; i++) {
    a = (a + dex[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  dex.writeUInt32LE(adler, 8);

  return dex;
}

/**
 * Creates a signed APK (JAR Signature v1 + 4-byte aligned ZIP entries)
 */
function buildSignedApk(outputPath) {
  const tmpDir = '/tmp/apk_build_' + Date.now();
  fs.mkdirSync(tmpDir, { recursive: true });

  const manifestBin = buildBinaryAndroidManifest();
  const resourcesArsc = buildResourcesArsc();
  const icLauncherPng = fs.readFileSync(path.resolve(process.cwd(), 'public/pwa-192x192.png'));
  const classesDex = buildClassesDex();
  const indexHtml = Buffer.from(buildStandaloneReaderHtml(), 'utf8');

  // Generate v1 JAR signing files (META-INF/MANIFEST.MF, CERT.SF, CERT.RSA)
  const sha256B64 = (buf) => crypto.createHash('sha256').update(buf).digest('base64');

  const manifestMf = [
    'Manifest-Version: 1.0',
    'Created-By: 1.0 (Android)',
    '',
    'Name: AndroidManifest.xml',
    `SHA-256-Digest: ${sha256B64(manifestBin)}`,
    '',
    'Name: resources.arsc',
    `SHA-256-Digest: ${sha256B64(resourcesArsc)}`,
    '',
    'Name: res/drawable/ic_launcher.png',
    `SHA-256-Digest: ${sha256B64(icLauncherPng)}`,
    '',
    'Name: classes.dex',
    `SHA-256-Digest: ${sha256B64(classesDex)}`,
    '',
    'Name: assets/index.html',
    `SHA-256-Digest: ${sha256B64(indexHtml)}`,
    '',
  ].join('\r\n');

  const mfBuf = Buffer.from(manifestMf, 'utf8');

  const sectionHash = (name, digest) => {
    const chunk = `Name: ${name}\r\nSHA-256-Digest: ${digest}\r\n\r\n`;
    return sha256B64(Buffer.from(chunk, 'utf8'));
  };

  const certSf = [
    'Signature-Version: 1.0',
    'Created-By: 1.0 (Android)',
    `SHA-256-Digest-Manifest: ${sha256B64(mfBuf)}`,
    '',
    'Name: AndroidManifest.xml',
    `SHA-256-Digest: ${sectionHash('AndroidManifest.xml', sha256B64(manifestBin))}`,
    '',
    'Name: resources.arsc',
    `SHA-256-Digest: ${sectionHash('resources.arsc', sha256B64(resourcesArsc))}`,
    '',
    'Name: res/drawable/ic_launcher.png',
    `SHA-256-Digest: ${sectionHash('res/drawable/ic_launcher.png', sha256B64(icLauncherPng))}`,
    '',
    'Name: classes.dex',
    `SHA-256-Digest: ${sectionHash('classes.dex', sha256B64(classesDex))}`,
    '',
    'Name: assets/index.html',
    `SHA-256-Digest: ${sectionHash('assets/index.html', sha256B64(indexHtml))}`,
    '',
  ].join('\r\n');

  const sfPath = path.join(tmpDir, 'CERT.SF');
  const keyPath = path.join(tmpDir, 'key.pem');
  const certPath = path.join(tmpDir, 'cert.pem');
  const rsaPath = path.join(tmpDir, 'CERT.RSA');

  fs.writeFileSync(sfPath, certSf);

  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 10000 -nodes -subj "/CN=InteractiveReader/O=Android/C=US"`,
    { stdio: 'ignore' }
  );
  execSync(
    `openssl cms -sign -binary -in "${sfPath}" -signer "${certPath}" -inkey "${keyPath}" -outform DER -out "${rsaPath}" -nodetach -md sha256`,
    { stdio: 'ignore' }
  );

  const certRsaBuf = fs.readFileSync(rsaPath);
  const certDerBuf = execSync(`openssl x509 -in "${certPath}" -outform DER`);

  // Assemble uncompressed, 4-byte aligned ZIP archive with APK Signature Scheme v2 block!
  const entries = [
    { name: 'AndroidManifest.xml', data: manifestBin },
    { name: 'resources.arsc', data: resourcesArsc },
    { name: 'res/drawable/ic_launcher.png', data: icLauncherPng },
    { name: 'classes.dex', data: classesDex },
    { name: 'assets/index.html', data: indexHtml },
    { name: 'META-INF/MANIFEST.MF', data: mfBuf },
    { name: 'META-INF/CERT.SF', data: Buffer.from(certSf, 'utf8') },
    { name: 'META-INF/CERT.RSA', data: certRsaBuf },
  ];

  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = zlib.crc32(entry.data) >>> 0;
    const dataOffsetUnaligned = offset + 30 + nameBuf.length;
    const padLen = (4 - (dataOffsetUnaligned % 4)) % 4;
    const extraBuf = Buffer.alloc(padLen, 0);

    const localHeader = Buffer.alloc(30 + nameBuf.length + extraBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression = STORED
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x21, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(extraBuf.length, 28);
    nameBuf.copy(localHeader, 30);
    extraBuf.copy(localHeader, 30 + nameBuf.length);

    localHeaders.push(localHeader, entry.data);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x21, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const contentsSection = Buffer.concat(localHeaders);
  const centralDirSection = Buffer.concat(centralHeaders);

  const eocdForV2 = Buffer.alloc(22);
  eocdForV2.writeUInt32LE(0x06054b50, 0);
  eocdForV2.writeUInt16LE(0, 4);
  eocdForV2.writeUInt16LE(0, 6);
  eocdForV2.writeUInt16LE(entries.length, 8);
  eocdForV2.writeUInt16LE(entries.length, 10);
  eocdForV2.writeUInt32LE(centralDirSection.length, 12);
  eocdForV2.writeUInt32LE(contentsSection.length, 16);
  eocdForV2.writeUInt16LE(0, 20);

  // Build APK Signature Scheme v2 Block (ID 0x7109871a)
  const apkV2Block = buildApkSigBlockV2(
    contentsSection,
    centralDirSection,
    eocdForV2,
    fs.readFileSync(keyPath, 'utf8'),
    certDerBuf
  );

  // Update EOCD with the new Central Directory offset (after APK Sig Block)
  const finalEocd = Buffer.from(eocdForV2);
  finalEocd.writeUInt32LE(contentsSection.length + apkV2Block.length, 16);

  const finalApk = Buffer.concat([contentsSection, apkV2Block, centralDirSection, finalEocd]);
  fs.writeFileSync(outputPath, finalApk);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return finalApk.length;
}

/**
 * Builds APK Signature Scheme v2 ("APK Sig Block 42") for Android 7.0 – Android 15 compatibility
 */
function buildApkSigBlockV2(contentsBuf, cdBuf, eocdBuf, privateKeyPem, certDerBuf) {
  const CHUNK_SIZE = 1024 * 1024;

  function digestChunks(buffers) {
    const chunkDigests = [];
    for (const buf of buffers) {
      let pos = 0;
      while (pos < buf.length) {
        const slice = buf.subarray(pos, Math.min(pos + CHUNK_SIZE, buf.length));
        const header = Buffer.alloc(5);
        header.writeUInt8(0xa5, 0);
        header.writeUInt32LE(slice.length, 1);
        const d = crypto.createHash('sha256').update(header).update(slice).digest();
        chunkDigests.push(d);
        pos += slice.length;
      }
    }
    const topHeader = Buffer.alloc(5);
    topHeader.writeUInt8(0x5a, 0);
    topHeader.writeUInt32LE(chunkDigests.length, 1);
    return crypto
      .createHash('sha256')
      .update(topHeader)
      .update(Buffer.concat(chunkDigests))
      .digest();
  }

  const topDigest = digestChunks([contentsBuf, cdBuf, eocdBuf]);

  const lenPrefixed = (buf) => {
    const l = Buffer.alloc(4);
    l.writeUInt32LE(buf.length, 0);
    return Buffer.concat([l, buf]);
  };

  // Signature algorithm 0x0103 = RSASSA-PKCS1-v1_5 with SHA2-256
  const SIG_ALGO_RSA_PKCS1_SHA256 = 0x0103;

  // digest entry: uint32 algoId + lenPrefixed(digest)
  const algoBuf = Buffer.alloc(4);
  algoBuf.writeUInt32LE(SIG_ALGO_RSA_PKCS1_SHA256, 0);
  const digestEntry = lenPrefixed(Buffer.concat([algoBuf, lenPrefixed(topDigest)]));
  const digestsSeq = lenPrefixed(digestEntry);

  const certsSeq = lenPrefixed(lenPrefixed(certDerBuf));
  const additionalAttrsSeq = lenPrefixed(Buffer.alloc(0));

  const signedData = Buffer.concat([
    digestsSeq,
    certsSeq,
    additionalAttrsSeq,
    Buffer.alloc(4, 0), // v2 padding
  ]);
  // Note: v2 signed data format is: digests (len-prefixed), certificates (len-prefixed), additional_attributes (len-prefixed)
  const signedDataPure = Buffer.concat([digestsSeq, certsSeq, additionalAttrsSeq]);

  const signatureBytes = crypto.sign('sha256', signedDataPure, privateKeyPem);
  const signatureEntry = lenPrefixed(Buffer.concat([algoBuf, lenPrefixed(signatureBytes)]));
  const signaturesSeq = lenPrefixed(signatureEntry);

  const pubKeySpki = crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'der' });

  const signerBlock = lenPrefixed(
    Buffer.concat([
      lenPrefixed(signedDataPure),
      signaturesSeq,
      lenPrefixed(pubKeySpki),
    ])
  );
  const signersSeq = lenPrefixed(signerBlock);

  // Pair: uint64 length, uint32 ID (0x7109871a), value (signersSeq)
  const pairBody = Buffer.alloc(4 + signersSeq.length);
  pairBody.writeUInt32LE(0x7109871a, 0);
  signersSeq.copy(pairBody, 4);

  const pairLenBuf = Buffer.alloc(8);
  pairLenBuf.writeBigUInt64LE(BigInt(pairBody.length), 0);
  const pairsBuf = Buffer.concat([pairLenBuf, pairBody]);

  // Block size excluding first 8 bytes = pairsBuf.length + 8 (second size) + 16 (magic)
  const blockSizeField = BigInt(pairsBuf.length + 24);
  const sizeBuf1 = Buffer.alloc(8);
  sizeBuf1.writeBigUInt64LE(blockSizeField, 0);
  const sizeBuf2 = Buffer.from(sizeBuf1);
  const magicBuf = Buffer.from('APK Sig Block 42', 'ascii');

  return Buffer.concat([sizeBuf1, pairsBuf, sizeBuf2, magicBuf]);
}

const outPath = path.resolve(process.cwd(), 'public/InteractiveReader.apk');
const sizeBytes = buildSignedApk(outPath);
console.log(`Successfully built signed APK at ${outPath} (${sizeBytes} bytes)`);

const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  const distApk = path.resolve(distDir, 'InteractiveReader.apk');
  fs.copyFileSync(outPath, distApk);
  console.log(`Successfully mirrored APK to ${distApk}`);
}

