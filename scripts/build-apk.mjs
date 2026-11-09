import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { execSync, execFileSync } from 'child_process';
import esbuild from 'esbuild';

/**
 * Loads the authoritative 59-day Ufa prayer schedule (12 Oct — 9 Dec 2026,
 * 1–29 Jumada al-Ula 1448 & 1–30 Jumada al-Thani 1448) directly from src/data/prayerTimesData.ts
 * so the Android Home Screen widgets and the React application share the exact same schedule.
 */
function loadAuthoritativeSchedule() {
  const res = esbuild.buildSync({
    entryPoints: [path.resolve(process.cwd(), 'src/data/prayerTimesData.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
  });
  const code = Buffer.from(res.outputFiles[0].contents).toString('utf8');
  const mod = { exports: {} };
  const fn = new Function('exports', 'module', code);
  fn(mod.exports, mod);
  const { PRAYER_SCHEDULE_DAYS, PRAYER_PERIODS, parseTimeToMinutes } = mod.exports;

  const formatMiladiFull = (shortDate) =>
    shortDate
      .replace(/окт/i, 'октября')
      .replace(/ноя/i, 'ноября')
      .replace(/дек/i, 'декабря')
      .replace(/янв/i, 'января');

  const padTime = (t) => {
    const [h, m] = t.trim().split(':');
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const days = PRAYER_SCHEDULE_DAYS.map((d) => {
    const period = PRAYER_PERIODS.find((p) => p.id === d.periodId) || PRAYER_PERIODS[0];
    const yearNum = d.monthNum === 1 ? 2027 : 2026;
    const headerStr = `Миләди: ${formatMiladiFull(d.miladiDate)} ${yearNum} г. • ${d.dayOfWeekTatar} • Һиҗри: ${d.hijriDay} ${period.hijriMonthTatar} ${period.hijriYear} г.х.`;
    const times = [
      padTime(d.fajr),
      padTime(d.sunrise),
      padTime(d.dhuhr),
      padTime(d.asr),
      padTime(d.maghrib),
      padTime(d.isha),
    ];
    const secs = [
      parseTimeToMinutes(d.fajr) * 60,
      parseTimeToMinutes(d.sunrise) * 60,
      parseTimeToMinutes(d.dhuhr) * 60,
      parseTimeToMinutes(d.asr) * 60,
      parseTimeToMinutes(d.maghrib) * 60,
      parseTimeToMinutes(d.isha) * 60,
    ];
    return {
      ...d,
      period,
      headerStr,
      times,
      secs,
    };
  });

  return days;
}

/**
 * Compiles the full React application (Prayer Times widget with Gregorian & Hijri calendars,
 * Dua, Tasbih, Library with book covers, continuous single-page reader, footnote bottom-sheet,
 * and end-of-chapter actions) into a standalone offline HTML bundle for assets/index.html inside the APK.
 */
function buildStandaloneReaderHtml() {
  // 1. Run Vite build so dist/assets/*.css has the latest compiled Tailwind v4 styles
  execSync('npx vite build', { stdio: 'inherit' });

  const distAssetsDir = path.resolve(process.cwd(), 'dist/assets');
  const cssFiles = fs.existsSync(distAssetsDir)
    ? fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.css'))
    : [];
  const compiledCss = cssFiles
    .map((f) => fs.readFileSync(path.join(distAssetsDir, f), 'utf8'))
    .join('\n');

  // 2. Bundle src/main.tsx into a single self-contained IIFE script via esbuild
  const bundleResult = esbuild.buildSync({
    entryPoints: [path.resolve(process.cwd(), 'src/main.tsx')],
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    write: false,
    loader: {
      '.css': 'empty',
      '.png': 'dataurl',
      '.svg': 'dataurl',
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  let appJs = Buffer.from(bundleResult.outputFiles[0].contents).toString('utf8');

  // 3. Inline local image assets as Base64 Data URLs for 100% offline Android WebView rendering
  const iconSvgPath = path.resolve(process.cwd(), 'public/icon.svg');
  if (fs.existsSync(iconSvgPath)) {
    const iconB64 = fs.readFileSync(iconSvgPath).toString('base64');
    appJs = appJs.split('/icon.svg').join(`data:image/svg+xml;base64,${iconB64}`);
  }

  const inlinePngAssets = [
    '____________60fd26fa.png',
    '____________a2d7d324.png',
    '____________590ceef3.png',
    '____________cd47dada.png',
  ];
  for (const fileName of inlinePngAssets) {
    const pngPath = path.resolve(process.cwd(), 'public/assets/aistudio', fileName);
    if (fs.existsSync(pngPath)) {
      const pngB64 = fs.readFileSync(pngPath).toString('base64');
      appJs = appJs
        .split(`/assets/aistudio/${fileName}`)
        .join(`data:image/png;base64,${pngB64}`);
    }
  }

  // Prevent any accidental </script> sequence inside string literals from closing the script tag
  const safeAppJs = appJs.replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<title>Простые благодеяния — Намаз, Кибла, Дуа, Тасбих и Книги</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preconnect" href="https://core-renderer-tiles.maps.yandex.net" crossorigin />
<link rel="preconnect" href="https://core-sat.maps.yandex.net" crossorigin />
<link rel="preconnect" href="https://nominatim.openstreetmap.org" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600;700;800&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;1,7..72,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
${compiledCss}
</style>
</head>
<body class="bg-[#F8F6F1] text-[#1C1B1F] antialiased selection:bg-amber-500/20">
<div id="root"></div>
<script>
${safeAppJs}
</script>
</body>
</html>`;
}

/**
 * Generates all PNG drawables required for:
 * 1) Widget Picker & Config Activity previews (widget_emerald.png, widget_frosted.png)
 *    using the current Ufa schedule day (e.g. 9 ноября 2026 г. • Дүшәмбе • 29 Җөмадиәл-әввәл 1448 г.х.)
 * 2) Native Android LinearLayout widget backgrounds for Variant 1 (Emerald) and Variant 2 (Frosted Glass):
 *    - bg_shell_emerald.png / bg_shell_frosted.png
 *    - bg_pill_emerald.png  / bg_pill_frosted.png
 *    - bg_tray_emerald.png  / bg_tray_frosted.png
 *    - card_emerald_normal.png, card_emerald_active.png, card_emerald_next.png
 *    - card_frosted_normal.png, card_frosted_active.png, card_frosted_next.png
 */
function buildWidgetDrawables(scheduleDays) {
  const fontBold = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf';
  const fontReg = '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf';

  // Use Nov 9 (index 28) for preview images
  const previewDay = scheduleDays[28] || scheduleDays[0];
  const prayers = [
    { tt: 'ИРТӘНГЕ', ru: 'Фаджр', time: previewDay.times[0], state: 'normal', ttOff: 47, ruOff: 27 },
    { tt: 'КОЯШ', ru: 'Шурук', time: previewDay.times[1], state: 'normal', ttOff: 31, ruOff: 26 },
    { tt: 'ӨЙЛӘ', ru: 'Зухр', time: previewDay.times[2], state: 'active', ttOff: 29, ruOff: 19 },
    { tt: 'ИКЕНДЕ', ru: 'Аср', time: previewDay.times[3], state: 'next', ttOff: 43, ruOff: 15 },
    { tt: 'АХШАМ', ru: 'Магриб', time: previewDay.times[4], state: 'normal', ttOff: 41, ruOff: 30 },
    { tt: 'ЯСТҮ', ru: 'Иша', time: previewDay.times[5], state: 'normal', ttOff: 27, ruOff: 18 },
  ];

  const emeraldPath = path.resolve(process.cwd(), 'public/widget_emerald.png');
  const frostedPath = path.resolve(process.cwd(), 'public/widget_frosted.png');

  // 1. Preview PNG for Variant 1: Classic Emerald
  const args1 = [
    '-size', '1200x366', 'xc:none',
    '-fill', '#05261b', '-stroke', 'rgba(16,185,129,0.45)', '-strokewidth', '3',
    '-draw', 'roundrectangle 4,4 1195,361 40,40',
    '-fill', 'rgba(16,185,129,0.10)', '-stroke', 'none',
    '-draw', 'roundrectangle 8,8 1191,122 36,36',
    '-font', fontBold, '-pointsize', '34', '-fill', '#fcd34d',
    '-annotate', '+44+56', 'Время намаза',
    '-font', fontReg, '-pointsize', '32', '-fill', '#d1fae5',
    '-annotate', '+305+55', '(Уфа)',
    '-font', fontBold, '-pointsize', '18', '-fill', '#6ee7b7',
    '-annotate', '+44+94', 'Миләди:',
    '-font', fontReg, '-pointsize', '18', '-fill', '#ecfdf5',
    '-annotate', '+132+94', `9 ноября 2026 г.  •  ${previewDay.dayOfWeekTatar}  •`,
    '-font', fontBold, '-pointsize', '18', '-fill', '#fcd34d',
    '-annotate', '+432+94', 'Һиҗри:',
    '-font', fontReg, '-pointsize', '18', '-fill', '#ecfdf5',
    '-annotate', '+508+94', `${previewDay.hijriDay} ${previewDay.period.hijriMonthTatar} ${previewDay.period.hijriYear} г.х.`,
    // Compact top-right pill frame in preview
    '-fill', 'rgba(1,17,11,0.55)', '-stroke', 'rgba(16,185,129,0.40)', '-strokewidth', '2',
    '-draw', 'roundrectangle 865,18 1172,106 18,18',
    '-stroke', 'none',
    '-font', fontBold, '-pointsize', '16', '-fill', '#fcd34d',
    '-annotate', '+895+47', 'КИЛӘСЕ: ИКЕНДЕ (АСР)',
    '-font', fontBold, '-pointsize', '32', '-fill', '#ffffff',
    '-annotate', '+995+91', '01:48:00',
    '-fill', '#ffffff', '-stroke', 'none',
    '-draw', 'roundrectangle 28,124 1172,342 30,30',
  ];

  prayers.forEach((p, idx) => {
    const x1 = 44 + idx * 186;
    const x2 = x1 + 174;
    const y1 = 144;
    const y2 = 324;
    const cx = Math.round((x1 + x2) / 2);

    if (p.state === 'active') {
      args1.push(
        '-fill', '#063324', '-stroke', '#fbbf24', '-strokewidth', '4',
        '-draw', `roundrectangle ${x1},${y1 - 4} ${x2},${y2 + 4} 24,24`,
        '-fill', '#fbbf24', '-stroke', 'none',
        '-draw', `roundrectangle ${cx - 46},${y1 - 15} ${cx + 46},${y1 + 9} 12,12`,
        '-font', fontBold, '-pointsize', '13', '-fill', '#022c22',
        '-annotate', `+${cx - 23}+${y1 + 2}`, 'ХӘЗЕР',
        '-font', fontBold, '-pointsize', '20', '-fill', '#fcd34d',
        '-annotate', `+${cx - p.ttOff}+${y1 + 44}`, p.tt,
        '-font', fontReg, '-pointsize', '16', '-fill', '#d1fae5',
        '-annotate', `+${cx - p.ruOff}+${y1 + 70}`, p.ru,
        '-font', fontBold, '-pointsize', '32', '-fill', '#ffffff',
        '-annotate', `+${cx - 42}+${y1 + 136}`, p.time
      );
    } else if (p.state === 'next') {
      args1.push(
        '-fill', '#fffbeb', '-stroke', '#fbbf24', '-strokewidth', '3',
        '-draw', `roundrectangle ${x1},${y1} ${x2},${y2} 22,22`,
        '-stroke', 'none',
        '-font', fontBold, '-pointsize', '20', '-fill', '#b45309',
        '-annotate', `+${cx - p.ttOff}+${y1 + 44}`, p.tt,
        '-font', fontReg, '-pointsize', '16', '-fill', '#92400e',
        '-annotate', `+${cx - p.ruOff}+${y1 + 70}`, p.ru,
        '-font', fontBold, '-pointsize', '32', '-fill', '#0f172a',
        '-annotate', `+${cx - 42}+${y1 + 136}`, p.time
      );
    } else {
      args1.push(
        '-fill', '#f8fafc', '-stroke', '#cbd5e1', '-strokewidth', '2',
        '-draw', `roundrectangle ${x1},${y1} ${x2},${y2} 22,22`,
        '-stroke', 'none',
        '-font', fontBold, '-pointsize', '20', '-fill', '#022c22',
        '-annotate', `+${cx - p.ttOff}+${y1 + 44}`, p.tt,
        '-font', fontReg, '-pointsize', '16', '-fill', '#64748b',
        '-annotate', `+${cx - p.ruOff}+${y1 + 70}`, p.ru,
        '-font', fontBold, '-pointsize', '32', '-fill', '#0f172a',
        '-annotate', `+${cx - 42}+${y1 + 136}`, p.time
      );
    }
  });

  args1.push(emeraldPath);
  execFileSync('convert', args1);

  // 2. Preview PNG for Variant 2: Frosted Glass
  const args2 = [
    '-size', '1200x366', 'xc:none',
    '-fill', 'rgba(7,38,28,0.62)', '-stroke', 'rgba(255,255,255,0.34)', '-strokewidth', '3',
    '-draw', 'roundrectangle 4,4 1195,361 40,40',
    '-fill', 'rgba(255,255,255,0.11)', '-stroke', 'none',
    '-draw', 'roundrectangle 10,8 1189,118 36,36',
    '-font', fontBold, '-pointsize', '34', '-fill', '#fcd34d',
    '-annotate', '+44+56', 'Время намаза',
    '-font', fontReg, '-pointsize', '32', '-fill', '#e2e8f0',
    '-annotate', '+305+55', '(Уфа)',
    '-font', fontBold, '-pointsize', '18', '-fill', '#6ee7b7',
    '-annotate', '+44+94', 'Миләди:',
    '-font', fontReg, '-pointsize', '18', '-fill', '#f8fafc',
    '-annotate', '+132+94', `9 ноября 2026 г.  •  ${previewDay.dayOfWeekTatar}  •`,
    '-font', fontBold, '-pointsize', '18', '-fill', '#fcd34d',
    '-annotate', '+432+94', 'Һиҗри:',
    '-font', fontReg, '-pointsize', '18', '-fill', '#f8fafc',
    '-annotate', '+508+94', `${previewDay.hijriDay} ${previewDay.period.hijriMonthTatar} ${previewDay.period.hijriYear} г.х.`,
    '-fill', 'rgba(255,255,255,0.14)', '-stroke', 'rgba(255,255,255,0.34)', '-strokewidth', '2',
    '-draw', 'roundrectangle 865,18 1172,106 18,18',
    '-stroke', 'none',
    '-font', fontBold, '-pointsize', '16', '-fill', '#fcd34d',
    '-annotate', '+895+47', 'КИЛӘСЕ: ИКЕНДЕ (АСР)',
    '-font', fontBold, '-pointsize', '32', '-fill', '#ffffff',
    '-annotate', '+995+91', '01:48:00',
    '-fill', 'rgba(255,255,255,0.11)', '-stroke', 'rgba(255,255,255,0.22)', '-strokewidth', '2',
    '-draw', 'roundrectangle 28,124 1172,342 30,30',
  ];

  prayers.forEach((p, idx) => {
    const x1 = 44 + idx * 186;
    const x2 = x1 + 174;
    const y1 = 144;
    const y2 = 324;
    const cx = Math.round((x1 + x2) / 2);

    if (p.state === 'active') {
      args2.push(
        '-fill', 'rgba(6,55,39,0.82)', '-stroke', '#fbbf24', '-strokewidth', '4',
        '-draw', `roundrectangle ${x1},${y1 - 4} ${x2},${y2 + 4} 24,24`,
        '-fill', '#fbbf24', '-stroke', 'none',
        '-draw', `roundrectangle ${cx - 46},${y1 - 15} ${cx + 46},${y1 + 9} 12,12`,
        '-font', fontBold, '-pointsize', '13', '-fill', '#022c22',
        '-annotate', `+${cx - 23}+${y1 + 2}`, 'ХӘЗЕР',
        '-font', fontBold, '-pointsize', '20', '-fill', '#fcd34d',
        '-annotate', `+${cx - p.ttOff}+${y1 + 44}`, p.tt,
        '-font', fontReg, '-pointsize', '16', '-fill', '#a7f3d0',
        '-annotate', `+${cx - p.ruOff}+${y1 + 70}`, p.ru,
        '-font', fontBold, '-pointsize', '32', '-fill', '#ffffff',
        '-annotate', `+${cx - 42}+${y1 + 136}`, p.time
      );
    } else if (p.state === 'next') {
      args2.push(
        '-fill', 'rgba(251,191,36,0.16)', '-stroke', 'rgba(251,191,36,0.80)', '-strokewidth', '3',
        '-draw', `roundrectangle ${x1},${y1} ${x2},${y2} 22,22`,
        '-stroke', 'none',
        '-font', fontBold, '-pointsize', '20', '-fill', '#fcd34d',
        '-annotate', `+${cx - p.ttOff}+${y1 + 44}`, p.tt,
        '-font', fontReg, '-pointsize', '16', '-fill', '#fde68a',
        '-annotate', `+${cx - p.ruOff}+${y1 + 70}`, p.ru,
        '-font', fontBold, '-pointsize', '32', '-fill', '#ffffff',
        '-annotate', `+${cx - 42}+${y1 + 136}`, p.time
      );
    } else {
      args2.push(
        '-fill', 'rgba(255,255,255,0.13)', '-stroke', 'rgba(255,255,255,0.22)', '-strokewidth', '2',
        '-draw', `roundrectangle ${x1},${y1} ${x2},${y2} 22,22`,
        '-stroke', 'none',
        '-font', fontBold, '-pointsize', '20', '-fill', '#ffffff',
        '-annotate', `+${cx - p.ttOff}+${y1 + 44}`, p.tt,
        '-font', fontReg, '-pointsize', '16', '-fill', '#cbd5e1',
        '-annotate', `+${cx - p.ruOff}+${y1 + 70}`, p.ru,
        '-font', fontBold, '-pointsize', '32', '-fill', '#ffffff',
        '-annotate', `+${cx - 42}+${y1 + 136}`, p.time
      );
    }
  });

  args2.push(frostedPath);
  execFileSync('convert', args2);

  return {
    widgetEmeraldPng: fs.readFileSync(emeraldPath),
    widgetFrostedPng: fs.readFileSync(frostedPath),
  };
}

/**
 * Generic Android Binary XML (AXML) compiler
 */
const TYPE_REFERENCE = 0x01;
const TYPE_STRING = 0x03;
const TYPE_DIMENSION = 0x05;
const TYPE_FLOAT = 0x04;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_INT_BOOLEAN = 0x12;
const TYPE_INT_COLOR_ARGB8 = 0x1c;

const dp = (val) => ((val << 8) | 1) >>> 0;
const sp = (val) => ((val << 8) | 2) >>> 0;
const floatBits = (val) => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(val, 0);
  return b.readUInt32LE(0);
};

function compileBinaryXml(attrDefs, extraStrings, buildTreeFn) {
  // Ensure attrDefs are strictly sorted by resId ascending
  const sortedAttrs = [...attrDefs].sort((a, b) => a.resId - b.resId);
  const resIds = sortedAttrs.map((a) => a.resId);

  const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
  const strings = [...sortedAttrs.map((a) => a.name), 'android', ANDROID_NS];

  const ensureStr = (s) => {
    if (s === undefined || s === null) return -1;
    let idx = strings.indexOf(s);
    if (idx === -1) {
      idx = strings.length;
      strings.push(s);
    }
    return idx;
  };

  for (const s of extraStrings) ensureStr(s);

  const nsPrefixIdx = ensureStr('android');
  const nsUriIdx = ensureStr(ANDROID_NS);
  const attrIdxMap = new Map();
  sortedAttrs.forEach((a, i) => attrIdxMap.set(a.name, i));

  const startEl = (tagName, lineNo, attrs) => {
    const tagIdx = ensureStr(tagName);
    // Sort attributes by their index in sortedAttrs (or un-namespaced after)
    const prepared = attrs
      .map((a) => {
        const nameIdx = a.noNs ? ensureStr(a.name) : attrIdxMap.get(a.name);
        if (nameIdx === undefined) throw new Error(`Unknown XML attribute: ${a.name}`);
        const nsIdx = a.noNs ? -1 : nsUriIdx;
        let rawValIdx = -1;
        let dataVal = a.data >>> 0;
        if (a.type === TYPE_STRING) {
          rawValIdx = ensureStr(a.val);
          dataVal = rawValIdx;
        }
        return { nsIdx, nameIdx, rawValIdx, type: a.type, data: dataVal };
      })
      .sort((x, y) => x.nameIdx - y.nameIdx);

    const chunkSize = 36 + prepared.length * 20;
    const buf = Buffer.alloc(chunkSize);
    buf.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(chunkSize, 4);
    buf.writeUInt32LE(lineNo, 8);
    buf.writeInt32LE(-1, 12);
    buf.writeInt32LE(-1, 16);
    buf.writeInt32LE(tagIdx, 20);
    buf.writeUInt16LE(20, 24);
    buf.writeUInt16LE(20, 26);
    buf.writeUInt16LE(prepared.length, 28);
    buf.writeUInt16LE(0, 30);
    buf.writeUInt16LE(0, 32);
    buf.writeUInt16LE(0, 34);

    prepared.forEach((p, idx) => {
      const off = 36 + idx * 20;
      buf.writeInt32LE(p.nsIdx, off);
      buf.writeInt32LE(p.nameIdx, off + 4);
      buf.writeInt32LE(p.rawValIdx, off + 8);
      buf.writeUInt16LE(8, off + 12);
      buf.writeUInt8(0, off + 14);
      buf.writeUInt8(p.type, off + 15);
      buf.writeUInt32LE(p.data >>> 0, off + 16);
    });
    return buf;
  };

  const endEl = (tagName, lineNo) => {
    const tagIdx = ensureStr(tagName);
    const buf = Buffer.alloc(24);
    buf.writeUInt16LE(0x0103, 0); // RES_XML_END_ELEMENT_TYPE
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(24, 4);
    buf.writeUInt32LE(lineNo, 8);
    buf.writeInt32LE(-1, 12);
    buf.writeInt32LE(-1, 16);
    buf.writeInt32LE(tagIdx, 20);
    return buf;
  };

  const treeChunks = buildTreeFn({ startEl, endEl, ensureStr });

  // Build UTF-16LE String Pool
  const encodedStrings = strings.map((str) => {
    const strBuf = Buffer.from(str, 'utf16le');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16LE(str.length, 0);
    const nullBuf = Buffer.alloc(2, 0);
    return Buffer.concat([lenBuf, strBuf, nullBuf]);
  });

  const strOffsets = [];
  let curOffset = 0;
  for (const sBuf of encodedStrings) {
    strOffsets.push(curOffset);
    curOffset += sBuf.length;
  }
  const strDataPad = (4 - (curOffset % 4)) % 4;
  const paddedStrDataSize = curOffset + strDataPad;

  const strPoolHeaderSize = 28;
  const strOffsetsSize = strings.length * 4;
  const stringsStart = strPoolHeaderSize + strOffsetsSize;
  const strPoolChunkSize = stringsStart + paddedStrDataSize;

  const strPoolBuf = Buffer.alloc(strPoolChunkSize, 0);
  strPoolBuf.writeUInt16LE(0x0001, 0);
  strPoolBuf.writeUInt16LE(strPoolHeaderSize, 2);
  strPoolBuf.writeUInt32LE(strPoolChunkSize, 4);
  strPoolBuf.writeUInt32LE(strings.length, 8);
  strPoolBuf.writeUInt32LE(0, 12);
  strPoolBuf.writeUInt32LE(0, 16);
  strPoolBuf.writeUInt32LE(stringsStart, 20);
  strPoolBuf.writeUInt32LE(0, 24);

  for (let i = 0; i < strOffsets.length; i++) {
    strPoolBuf.writeUInt32LE(strOffsets[i], strPoolHeaderSize + i * 4);
  }
  let writePos = stringsStart;
  for (const sBuf of encodedStrings) {
    sBuf.copy(strPoolBuf, writePos);
    writePos += sBuf.length;
  }

  // Resource Map Chunk
  const resMapChunkSize = 8 + resIds.length * 4;
  const resMapBuf = Buffer.alloc(resMapChunkSize);
  resMapBuf.writeUInt16LE(0x0180, 0);
  resMapBuf.writeUInt16LE(8, 2);
  resMapBuf.writeUInt32LE(resMapChunkSize, 4);
  for (let i = 0; i < resIds.length; i++) {
    resMapBuf.writeUInt32LE(resIds[i], 8 + i * 4);
  }

  // Namespace Start & End
  const startNsBuf = Buffer.alloc(24);
  startNsBuf.writeUInt16LE(0x0100, 0);
  startNsBuf.writeUInt16LE(16, 2);
  startNsBuf.writeUInt32LE(24, 4);
  startNsBuf.writeUInt32LE(1, 8);
  startNsBuf.writeInt32LE(-1, 12);
  startNsBuf.writeInt32LE(nsPrefixIdx, 16);
  startNsBuf.writeInt32LE(nsUriIdx, 20);

  const endNsBuf = Buffer.alloc(24);
  endNsBuf.writeUInt16LE(0x0101, 0);
  endNsBuf.writeUInt16LE(16, 2);
  endNsBuf.writeUInt32LE(24, 4);
  endNsBuf.writeUInt32LE(100, 8);
  endNsBuf.writeInt32LE(-1, 12);
  endNsBuf.writeInt32LE(nsPrefixIdx, 16);
  endNsBuf.writeInt32LE(nsUriIdx, 20);

  const bodyBuf = Buffer.concat([
    strPoolBuf,
    resMapBuf,
    startNsBuf,
    ...treeChunks,
    endNsBuf,
  ]);

  const xmlHeader = Buffer.alloc(8);
  xmlHeader.writeUInt16LE(0x0003, 0);
  xmlHeader.writeUInt16LE(8, 2);
  xmlHeader.writeUInt32LE(8 + bodyBuf.length, 4);

  return Buffer.concat([xmlHeader, bodyBuf]);
}

/**
 * Builds AndroidManifest.xml with:
 * - MainActivity
 * - WidgetConfigActivity (android.appwidget.action.APPWIDGET_CONFIGURE)
 * - PrayerWidgetProvider ("1. Время намаза · Изумруд (Уфа)")
 * - PrayerWidgetFrostedProvider ("2. Время намаза · Матовое стекло (Уфа)")
 */
function buildManifestXml() {
  const attrDefs = [
    { name: 'theme', resId: 0x01010000 },
    { name: 'label', resId: 0x01010001 },
    { name: 'icon', resId: 0x01010002 },
    { name: 'name', resId: 0x01010003 },
    { name: 'exported', resId: 0x01010010 },
    { name: ' resource', resId: 0x01010025 },
    { name: 'minSdkVersion', resId: 0x0101020c },
    { name: 'versionCode', resId: 0x0101021b },
    { name: 'versionName', resId: 0x0101021c },
    { name: ' targetSdkVersion', resId: 0x01010270 },
    { name: 'hardwareAccelerated', resId: 0x010102d3 },
  ].map((a) => ({ name: a.name.trim(), resId: a.resId }));

  const extraStrings = [
    'package',
    'manifest',
    'uses-permission',
    'uses-sdk',
    'application',
    'activity',
    'receiver',
    'intent-filter',
    'action',
    'category',
    'meta-data',
    'com.example.interactivereader',
    '1.6.0',
    'android.permission.INTERNET',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'Простые благодеяния',
    'Выбор вида виджета (Уфа)',
    '1. Время намаза · Изумруд (Уфа)',
    '2. Время намаза · Матовое стекло (Уфа)',
    'com.example.interactivereader.MainActivity',
    'com.example.interactivereader.WidgetConfigActivity',
    'com.example.interactivereader.PrayerWidgetProvider',
    'com.example.interactivereader.PrayerWidgetFrostedProvider',
    'android.intent.action.MAIN',
    'android.intent.category.LAUNCHER',
    'android.appwidget.action.APPWIDGET_CONFIGURE',
    'android.appwidget.action.APPWIDGET_UPDATE',
    'android.intent.action.DATE_CHANGED',
    'android.intent.action.TIME_SET',
    'android.intent.action.TIMEZONE_CHANGED',
    'android.appwidget.provider',
  ];

  return compileBinaryXml(attrDefs, extraStrings, ({ startEl, endEl }) => [
    startEl('manifest', 2, [
      { name: 'versionCode', type: TYPE_INT_DEC, data: 6 },
      { name: 'versionName', type: TYPE_STRING, val: '1.6.0' },
      { name: 'package', noNs: true, type: TYPE_STRING, val: 'com.example.interactivereader' },
    ]),
    startEl('uses-permission', 4, [
      { name: 'name', type: TYPE_STRING, val: 'android.permission.INTERNET' },
    ]),
    endEl('uses-permission', 4),
    startEl('uses-permission', 5, [
      { name: 'name', type: TYPE_STRING, val: 'android.permission.ACCESS_FINE_LOCATION' },
    ]),
    endEl('uses-permission', 5),
    startEl('uses-permission', 6, [
      { name: 'name', type: TYPE_STRING, val: 'android.permission.ACCESS_COARSE_LOCATION' },
    ]),
    endEl('uses-permission', 6),
    startEl('uses-sdk', 7, [
      { name: 'minSdkVersion', type: TYPE_INT_DEC, data: 24 },
      { name: 'targetSdkVersion', type: TYPE_INT_DEC, data: 33 },
    ]),
    endEl('uses-sdk', 7),
    startEl('application', 8, [
      { name: 'theme', type: TYPE_REFERENCE, data: 0x01030224 },
      { name: 'label', type: TYPE_STRING, val: 'Простые благодеяния' },
      { name: 'icon', type: TYPE_REFERENCE, data: 0x7f010000 },
      { name: 'hardwareAccelerated', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    // 1. MainActivity
    startEl('activity', 12, [
      { name: 'icon', type: TYPE_REFERENCE, data: 0x7f010000 },
      { name: 'name', type: TYPE_STRING, val: 'com.example.interactivereader.MainActivity' },
      { name: 'exported', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    startEl('intent-filter', 15, []),
    startEl('action', 16, [
      { name: 'name', type: TYPE_STRING, val: 'android.intent.action.MAIN' },
    ]),
    endEl('action', 16),
    startEl('category', 17, [
      { name: 'name', type: TYPE_STRING, val: 'android.intent.category.LAUNCHER' },
    ]),
    endEl('category', 17),
    endEl('intent-filter', 18),
    endEl('activity', 19),
    // 2. WidgetConfigActivity
    startEl('activity', 20, [
      { name: 'label', type: TYPE_STRING, val: 'Выбор вида виджета (Уфа)' },
      { name: 'icon', type: TYPE_REFERENCE, data: 0x7f010000 },
      { name: 'name', type: TYPE_STRING, val: 'com.example.interactivereader.WidgetConfigActivity' },
      { name: 'exported', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    startEl('intent-filter', 23, []),
    startEl('action', 24, [
      { name: 'name', type: TYPE_STRING, val: 'android.appwidget.action.APPWIDGET_CONFIGURE' },
    ]),
    endEl('action', 24),
    endEl('intent-filter', 25),
    endEl('activity', 26),
    // 3. Receiver 1: PrayerWidgetProvider ("1. Время намаза · Изумруд (Уфа)")
    startEl('receiver', 28, [
      { name: 'label', type: TYPE_STRING, val: '1. Время намаза · Изумруд (Уфа)' },
      { name: 'icon', type: TYPE_REFERENCE, data: 0x7f010000 },
      { name: 'name', type: TYPE_STRING, val: 'com.example.interactivereader.PrayerWidgetProvider' },
      { name: 'exported', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    startEl('intent-filter', 31, []),
    startEl('action', 32, [
      { name: 'name', type: TYPE_STRING, val: 'android.appwidget.action.APPWIDGET_UPDATE' },
    ]),
    endEl('action', 32),
    startEl('action', 33, [
      { name: 'name', type: TYPE_STRING, val: 'android.intent.action.DATE_CHANGED' },
    ]),
    endEl('action', 33),
    startEl('action', 34, [
      { name: 'name', type: TYPE_STRING, val: 'android.intent.action.TIME_SET' },
    ]),
    endEl('action', 34),
    startEl('action', 35, [
      { name: 'name', type: TYPE_STRING, val: 'android.intent.action.TIMEZONE_CHANGED' },
    ]),
    endEl('action', 35),
    endEl('intent-filter', 36),
    startEl('meta-data', 37, [
      { name: 'name', type: TYPE_STRING, val: 'android.appwidget.provider' },
      { name: 'resource', type: TYPE_REFERENCE, data: 0x7f030000 }, // @xml/prayer_widget_info
    ]),
    endEl('meta-data', 37),
    endEl('receiver', 38),
    // 4. Receiver 2: PrayerWidgetFrostedProvider ("2. Время намаза · Матовое стекло (Уфа)")
    startEl('receiver', 39, [
      { name: 'label', type: TYPE_STRING, val: '2. Время намаза · Матовое стекло (Уфа)' },
      { name: 'icon', type: TYPE_REFERENCE, data: 0x7f010000 },
      {
        name: 'name',
        type: TYPE_STRING,
        val: 'com.example.interactivereader.PrayerWidgetFrostedProvider',
      },
      { name: 'exported', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    startEl('intent-filter', 42, []),
    startEl('action', 43, [
      { name: 'name', type: TYPE_STRING, val: 'android.appwidget.action.APPWIDGET_UPDATE' },
    ]),
    endEl('action', 43),
    startEl('action', 44, [
      { name: 'name', type: TYPE_STRING, val: 'android.intent.action.DATE_CHANGED' },
    ]),
    endEl('action', 44),
    startEl('action', 45, [
      { name: 'name', type: TYPE_STRING, val: 'android.intent.action.TIME_SET' },
    ]),
    endEl('action', 45),
    startEl('action', 46, [
      { name: 'name', type: TYPE_STRING, val: 'android.intent.action.TIMEZONE_CHANGED' },
    ]),
    endEl('action', 46),
    endEl('intent-filter', 47),
    startEl('meta-data', 48, [
      { name: 'name', type: TYPE_STRING, val: 'android.appwidget.provider' },
      { name: 'resource', type: TYPE_REFERENCE, data: 0x7f030001 }, // @xml/prayer_widget_frosted_info
    ]),
    endEl('meta-data', 48),
    endEl('receiver', 49),
    endEl('application', 50),
    endEl('manifest', 51),
  ]);
}

/**
 * Builds res/xml/prayer_widget_info.xml or res/xml/prayer_widget_frosted_info.xml
 */
function buildWidgetInfoXml(initialLayoutResId, previewDrawableResId, withConfigureActivity) {
  const attrDefs = [
    { name: 'minWidth', resId: 0x0101013f },
    { name: 'minHeight', resId: 0x01010140 },
    { name: 'updatePeriodMillis', resId: 0x01010250 },
    { name: 'initialLayout', resId: 0x01010251 },
    ...(withConfigureActivity ? [{ name: 'configure', resId: 0x01010252 }] : []),
    { name: 'previewImage', resId: 0x010102da },
    { name: 'resizeMode', resId: 0x01010363 },
    { name: 'widgetCategory', resId: 0x010103c4 },
  ];

  const extraStrings = [
    'appwidget-provider',
    ...(withConfigureActivity ? ['com.example.interactivereader.WidgetConfigActivity'] : []),
  ];

  return compileBinaryXml(attrDefs, extraStrings, ({ startEl, endEl }) => [
    startEl('appwidget-provider', 2, [
      { name: 'minWidth', type: TYPE_DIMENSION, data: dp(250) },
      { name: 'minHeight', type: TYPE_DIMENSION, data: dp(60) },
      { name: 'updatePeriodMillis', type: TYPE_INT_DEC, data: 1800000 },
      { name: 'initialLayout', type: TYPE_REFERENCE, data: initialLayoutResId },
      ...(withConfigureActivity
        ? [
            {
              name: 'configure',
              type: TYPE_STRING,
              val: 'com.example.interactivereader.WidgetConfigActivity',
            },
          ]
        : []),
      { name: 'previewImage', type: TYPE_REFERENCE, data: previewDrawableResId },
      { name: 'resizeMode', type: TYPE_INT_HEX, data: 0x00000003 }, // horizontal|vertical
      { name: 'widgetCategory', type: TYPE_INT_HEX, data: 0x00000001 }, // home_screen
    ]),
    endEl('appwidget-provider', 9),
  ]);
}

/**
 * Compiles an Android vector <shape> (GradientDrawable) binary XML resource.
 * Using <shape> instead of raster PNGs guarantees razor-sharp rounded corners,
 * uniform stroke width on both phones and tablets, and zero minimum-size inflation.
 */
function buildShapeDrawableXml(fillColorArgb, strokeColorArgb, strokeWidthDp, radiusDp) {
  const attrDefs = [
    { name: 'width', resId: 0x01010159 },
    { name: 'color', resId: 0x010101a5 },
    { name: 'radius', resId: 0x010101a8 },
  ];
  const extraStrings = ['shape', 'solid', 'corners', 'stroke'];

  return compileBinaryXml(attrDefs, extraStrings, ({ startEl, endEl }) => {
    const chunks = [
      startEl('shape', 2, []),
      startEl('solid', 3, [
        { name: 'color', type: TYPE_INT_COLOR_ARGB8, data: fillColorArgb },
      ]),
      endEl('solid', 3),
      startEl('corners', 4, [
        { name: 'radius', type: TYPE_DIMENSION, data: dp(radiusDp) },
      ]),
      endEl('corners', 4),
    ];
    if (strokeWidthDp > 0 && strokeColorArgb !== 0) {
      chunks.push(
        startEl('stroke', 5, [
          { name: 'width', type: TYPE_DIMENSION, data: dp(strokeWidthDp) },
          { name: 'color', type: TYPE_INT_COLOR_ARGB8, data: strokeColorArgb },
        ]),
        endEl('stroke', 5)
      );
    }
    chunks.push(endEl('shape', 6));
    return chunks;
  });
}

function buildWidgetShapeDrawables() {
  return {
    bgShellEmerald: buildShapeDrawableXml(0xf7042f2e, 0xff10b981, 1.5, 16),
    bgPillEmerald: buildShapeDrawableXml(0xff021f1e, 0xff0f5248, 1.2, 8),
    bgTrayEmerald: buildShapeDrawableXml(0xffffffff, 0xffcbd5e1, 1, 11),
    cardEmeraldNormal: buildShapeDrawableXml(0xfff8fafc, 0xffcbd5e1, 1, 8),
    cardEmeraldActive: buildShapeDrawableXml(0xff042f2e, 0xfff59e0b, 1.8, 8),
    cardEmeraldNext: buildShapeDrawableXml(0xfffffbeb, 0xfff59e0b, 1.6, 8),

    bgShellFrosted: buildShapeDrawableXml(0x96063028, 0x66ffffff, 1.5, 16),
    bgPillFrosted: buildShapeDrawableXml(0x7a04221c, 0x52ffffff, 1.2, 8),
    bgTrayFrosted: buildShapeDrawableXml(0x24ffffff, 0x47ffffff, 1, 11),
    cardFrostedNormal: buildShapeDrawableXml(0x24ffffff, 0x47ffffff, 1, 8),
    cardFrostedActive: buildShapeDrawableXml(0xd6042f2e, 0xfffbbf24, 1.8, 8),
    cardFrostedNext: buildShapeDrawableXml(0x42f59e0b, 0xfffbbf24, 1.6, 8),
  };
}

/**
 * Builds a 100% Native Android LinearLayout Widget Layout:
 * - Variant 1 (isFrosted = false): Emerald theme
 * - Variant 2 (isFrosted = true): Frosted Glass theme
 *
 * Uses a centering root container with a WRAP_CONTENT shell and WRAP_CONTENT cards
 * so on tablets (even in tall 2-row slots) the cards never stretch into tall empty towers.
 */
function buildNativeWidgetLayoutXml(isFrosted) {
  const attrDefs = [
    { name: 'textSize', resId: 0x01010095 },
    { name: 'textStyle', resId: 0x01010097 },
    { name: 'textColor', resId: 0x01010098 },
    { name: 'ellipsize', resId: 0x010100ab },
    { name: 'gravity', resId: 0x010100af },
    { name: 'orientation', resId: 0x010100c4 },
    { name: 'id', resId: 0x010100d0 },
    { name: 'background', resId: 0x010100d4 },
    { name: 'paddingLeft', resId: 0x010100d6 },
    { name: 'paddingTop', resId: 0x010100d7 },
    { name: 'paddingRight', resId: 0x010100d8 },
    { name: 'paddingBottom', resId: 0x010100d9 },
    { name: 'layout_width', resId: 0x010100f4 },
    { name: 'layout_height', resId: 0x010100f5 },
    { name: 'layout_marginLeft', resId: 0x010100f7 },
    { name: 'layout_marginRight', resId: 0x010100f9 },
    { name: 'layout_weight', resId: 0x01010181 },
    { name: 'text', resId: 0x0101014f },
    { name: 'maxLines', resId: 0x01010153 },
    { name: 'singleLine', resId: 0x0101015d },
    { name: 'countDown', resId: 0x0101051b },
  ];

  const cardMeta = [
    { tt: 'ИРТӘНГЕ', ru: 'Фаджр', time: '06:55' },
    { tt: 'КОЯШ', ru: 'Шурук', time: '08:35' },
    { tt: 'ӨЙЛӘ', ru: 'Зухр', time: '13:30' },
    { tt: 'ИКЕНДЕ', ru: 'Аср', time: '15:18' },
    { tt: 'АХШАМ', ru: 'Магриб', time: '17:28' },
    { tt: 'ЯСТҮ', ru: 'Иша', time: '18:58' },
  ];

  const extraStrings = [
    'LinearLayout',
    'TextView',
    'Chronometer',
    'Время намаза (Уфа)',
    'Миләди: 9 ноября 2026 г. • Дүшәмбе • Һиҗри: 29 Җөмадиәл-әввәл 1448 г.х.',
    'КИЛӘСЕ: ИКЕНДЕ (АСР)',
    ...cardMeta.flatMap((c) => [c.tt, c.ru, c.time]),
  ];

  const MATCH_PARENT = 0xffffffff;
  const WRAP_CONTENT = 0xfffffffe;
  const WEIGHT_1 = floatBits(1.0);

  const shellDrawable = isFrosted ? 0x7f010009 : 0x7f010003;
  const pillDrawable = isFrosted ? 0x7f01000a : 0x7f010004;
  const trayDrawable = isFrosted ? 0x7f01000b : 0x7f010005;
  const normalCardDrawable = isFrosted ? 0x7f01000c : 0x7f010006;

  return compileBinaryXml(attrDefs, extraStrings, ({ startEl, endEl }) => {
    const chunks = [
      // Outer Root Centering Container (@android:id/background = 0x01020000)
      startEl('LinearLayout', 2, [
        { name: 'gravity', type: TYPE_INT_HEX, data: 0x10 }, // center_vertical
        { name: 'orientation', type: TYPE_INT_DEC, data: 1 }, // vertical
        { name: 'id', type: TYPE_REFERENCE, data: 0x01020000 },
        { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
        { name: 'layout_height', type: TYPE_INT_DEC, data: MATCH_PARENT },
      ]),

      // Inner Styled Widget Shell (WRAP_CONTENT height so it never stretches vertically on tablets)
      startEl('LinearLayout', 6, [
        { name: 'orientation', type: TYPE_INT_DEC, data: 1 }, // vertical
        { name: 'background', type: TYPE_REFERENCE, data: shellDrawable },
        { name: 'paddingLeft', type: TYPE_DIMENSION, data: dp(10) },
        { name: 'paddingTop', type: TYPE_DIMENSION, data: dp(8) },
        { name: 'paddingRight', type: TYPE_DIMENSION, data: dp(10) },
        { name: 'paddingBottom', type: TYPE_DIMENSION, data: dp(8) },
        { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
        { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
      ]),

      // 1. Top Header Row (horizontal, compact)
      startEl('LinearLayout', 10, [
        { name: 'gravity', type: TYPE_INT_HEX, data: 0x10 }, // center_vertical
        { name: 'orientation', type: TYPE_INT_DEC, data: 0 }, // horizontal
        { name: 'paddingBottom', type: TYPE_DIMENSION, data: dp(6) },
        { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
        { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
      ]),

      // 1a. Left Column (Title + Dynamic Gregorian/Hijri Dates) with layout_weight=1
      startEl('LinearLayout', 16, [
        { name: 'orientation', type: TYPE_INT_DEC, data: 1 }, // vertical
        { name: 'paddingRight', type: TYPE_DIMENSION, data: dp(8) },
        { name: 'layout_width', type: TYPE_DIMENSION, data: dp(0) },
        { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
        { name: 'layout_weight', type: TYPE_FLOAT, data: WEIGHT_1 },
      ]),
      startEl('TextView', 22, [
        { name: 'textSize', type: TYPE_DIMENSION, data: dp(13) },
        { name: 'textStyle', type: TYPE_INT_HEX, data: 1 }, // bold
        { name: 'textColor', type: TYPE_INT_COLOR_ARGB8, data: 0xfffcd34d },
        { name: 'ellipsize', type: TYPE_INT_DEC, data: 3 }, // end
        { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
        { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
        { name: 'text', type: TYPE_STRING, val: 'Время намаза (Уфа)' },
        { name: 'singleLine', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
      ]),
      endEl('TextView', 30),
      startEl('TextView', 31, [
        { name: 'textSize', type: TYPE_DIMENSION, data: dp(8) },
        {
          name: 'textColor',
          type: TYPE_INT_COLOR_ARGB8,
          data: isFrosted ? 0xfff8fafc : 0xffecfdf5,
        },
        { name: 'ellipsize', type: TYPE_INT_DEC, data: 3 }, // end
        { name: 'id', type: TYPE_REFERENCE, data: 0x7f040001 }, // dynamic date/Hijri TextView
        { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
        { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
        {
          name: 'text',
          type: TYPE_STRING,
          val: 'Миләди: 9 ноября 2026 г. • Дүшәмбе • Һиҗри: 29 Җөмадиәл-әввәл 1448 г.х.',
        },
        { name: 'maxLines', type: TYPE_INT_DEC, data: 2 },
      ]),
      endEl('TextView', 39),
      endEl('LinearLayout', 40),

      // 1b. Compact Right Countdown Pill Box (wraps "КИЛӘСЕ: ..." + Chronometer tightly)
      startEl('LinearLayout', 41, [
        { name: 'gravity', type: TYPE_INT_HEX, data: 0x15 }, // right|center_vertical
        { name: 'orientation', type: TYPE_INT_DEC, data: 1 }, // vertical
        { name: 'background', type: TYPE_REFERENCE, data: pillDrawable },
        { name: 'paddingLeft', type: TYPE_DIMENSION, data: dp(8) },
        { name: 'paddingTop', type: TYPE_DIMENSION, data: dp(3) },
        { name: 'paddingRight', type: TYPE_DIMENSION, data: dp(8) },
        { name: 'paddingBottom', type: TYPE_DIMENSION, data: dp(3) },
        { name: 'layout_width', type: TYPE_INT_DEC, data: WRAP_CONTENT },
        { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
      ]),
      startEl('TextView', 50, [
        { name: 'textSize', type: TYPE_DIMENSION, data: dp(8) },
        { name: 'textStyle', type: TYPE_INT_HEX, data: 1 }, // bold
        { name: 'textColor', type: TYPE_INT_COLOR_ARGB8, data: 0xfffcd34d },
        { name: 'gravity', type: TYPE_INT_HEX, data: 0x05 }, // right
        { name: 'id', type: TYPE_REFERENCE, data: 0x01020014 }, // @android:id/text1
        { name: 'layout_width', type: TYPE_INT_DEC, data: WRAP_CONTENT },
        { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
        { name: 'text', type: TYPE_STRING, val: 'КИЛӘСЕ: ИКЕНДЕ (АСР)' },
        { name: 'singleLine', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
      ]),
      endEl('TextView', 59),
      startEl('Chronometer', 60, [
        { name: 'textSize', type: TYPE_DIMENSION, data: dp(13) },
        { name: 'textStyle', type: TYPE_INT_HEX, data: 1 }, // bold
        { name: 'textColor', type: TYPE_INT_COLOR_ARGB8, data: 0xffffffff },
        { name: 'gravity', type: TYPE_INT_HEX, data: 0x05 }, // right
        { name: 'id', type: TYPE_REFERENCE, data: 0x01020015 }, // @android:id/text2
        { name: 'layout_width', type: TYPE_INT_DEC, data: WRAP_CONTENT },
        { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
        { name: 'singleLine', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
        { name: 'countDown', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
      ]),
      endEl('Chronometer', 68),
      endEl('LinearLayout', 69),
      endEl('LinearLayout', 70),

      // 2. Bottom 6-Card Capsule Tray (WRAP_CONTENT height so cards stay well-proportioned)
      startEl('LinearLayout', 71, [
        { name: 'gravity', type: TYPE_INT_HEX, data: 0x10 }, // center_vertical
        { name: 'orientation', type: TYPE_INT_DEC, data: 0 }, // horizontal
        { name: 'background', type: TYPE_REFERENCE, data: trayDrawable },
        { name: 'paddingLeft', type: TYPE_DIMENSION, data: dp(4) },
        { name: 'paddingTop', type: TYPE_DIMENSION, data: dp(4) },
        { name: 'paddingRight', type: TYPE_DIMENSION, data: dp(4) },
        { name: 'paddingBottom', type: TYPE_DIMENSION, data: dp(4) },
        { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
        { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
      ]),
    ];

    // 6 Prayer Cards (i = 0..5)
    cardMeta.forEach((c, i) => {
      const lineBase = 80 + i * 25;
      chunks.push(
        startEl('LinearLayout', lineBase, [
          { name: 'gravity', type: TYPE_INT_HEX, data: 0x11 }, // center
          { name: 'orientation', type: TYPE_INT_DEC, data: 1 }, // vertical
          { name: 'id', type: TYPE_REFERENCE, data: 0x7f040010 + i },
          { name: 'background', type: TYPE_REFERENCE, data: normalCardDrawable },
          { name: 'paddingLeft', type: TYPE_DIMENSION, data: dp(2) },
          { name: 'paddingTop', type: TYPE_DIMENSION, data: dp(7) },
          { name: 'paddingRight', type: TYPE_DIMENSION, data: dp(2) },
          { name: 'paddingBottom', type: TYPE_DIMENSION, data: dp(7) },
          { name: 'layout_width', type: TYPE_DIMENSION, data: dp(0) },
          { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
          { name: 'layout_marginLeft', type: TYPE_DIMENSION, data: dp(1) },
          { name: 'layout_marginRight', type: TYPE_DIMENSION, data: dp(1) },
          { name: 'layout_weight', type: TYPE_FLOAT, data: WEIGHT_1 },
        ]),
        startEl('TextView', lineBase + 8, [
          { name: 'textSize', type: TYPE_DIMENSION, data: dp(9) },
          { name: 'textStyle', type: TYPE_INT_HEX, data: 1 }, // bold
          {
            name: 'textColor',
            type: TYPE_INT_COLOR_ARGB8,
            data: isFrosted ? 0xffffffff : 0xff022c22,
          },
          { name: 'gravity', type: TYPE_INT_HEX, data: 0x11 }, // center
          { name: 'id', type: TYPE_REFERENCE, data: 0x7f040030 + i },
          { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
          { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
          { name: 'text', type: TYPE_STRING, val: c.tt },
          { name: 'singleLine', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
        ]),
        endEl('TextView', lineBase + 14),
        startEl('TextView', lineBase + 15, [
          { name: 'textSize', type: TYPE_DIMENSION, data: dp(8) },
          {
            name: 'textColor',
            type: TYPE_INT_COLOR_ARGB8,
            data: isFrosted ? 0xffcbd5e1 : 0xff64748b,
          },
          { name: 'gravity', type: TYPE_INT_HEX, data: 0x11 }, // center
          { name: 'id', type: TYPE_REFERENCE, data: 0x7f040040 + i },
          { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
          { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
          { name: 'text', type: TYPE_STRING, val: c.ru },
          { name: 'singleLine', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
        ]),
        endEl('TextView', lineBase + 20),
        startEl('TextView', lineBase + 21, [
          { name: 'textSize', type: TYPE_DIMENSION, data: dp(12) },
          { name: 'textStyle', type: TYPE_INT_HEX, data: 1 }, // bold
          {
            name: 'textColor',
            type: TYPE_INT_COLOR_ARGB8,
            data: isFrosted ? 0xffffffff : 0xff0f172a,
          },
          { name: 'gravity', type: TYPE_INT_HEX, data: 0x11 }, // center
          { name: 'id', type: TYPE_REFERENCE, data: 0x7f040050 + i },
          { name: 'paddingTop', type: TYPE_DIMENSION, data: dp(2) },
          { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
          { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
          { name: 'text', type: TYPE_STRING, val: c.time },
          { name: 'singleLine', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
        ]),
        endEl('TextView', lineBase + 26),
        endEl('LinearLayout', lineBase + 27)
      );
    });

    chunks.push(
      endEl('LinearLayout', 240),
      endEl('LinearLayout', 245),
      endEl('LinearLayout', 250)
    );

    return chunks;
  });
}

/**
 * Builds res/layout/widget_config.xml (Interactive Theme Picker shown when adding widget)
 * - Card 1 (@android:id/button1 = 0x01020019): Вариант 1 · Классический изумруд
 * - Card 2 (@android:id/button2 = 0x0102001a): Вариант 2 · Матовое стекло
 */
function buildWidgetConfigLayoutXml() {
  const attrDefs = [
    { name: 'textSize', resId: 0x01010095 },
    { name: 'textStyle', resId: 0x01010097 },
    { name: 'textColor', resId: 0x01010098 },
    { name: 'orientation', resId: 0x010100c4 },
    { name: 'id', resId: 0x010100d0 },
    { name: 'background', resId: 0x010100d4 },
    { name: 'padding', resId: 0x010100d5 },
    { name: 'paddingTop', resId: 0x010100d7 },
    { name: 'paddingBottom', resId: 0x010100d9 },
    { name: 'layout_width', resId: 0x010100f4 },
    { name: 'layout_height', resId: 0x010100f5 },
    { name: 'src', resId: 0x01010119 },
    { name: 'scaleType', resId: 0x0101011d },
    { name: 'adjustViewBounds', resId: 0x0101011e },
    { name: 'text', resId: 0x0101014f },
  ];

  const extraStrings = [
    'LinearLayout',
    'TextView',
    'ImageView',
    'Выберите вид виджета (Уфа)',
    'Нажмите на карточку, чтобы установить выбранный стиль виджета на главный экран:',
    'Вариант 1 · Классический изумруд (Ак капсула) — Нажмите для выбора',
    'Вариант 2 · Матовое стекло (Frosted Glass) — Нажмите для выбора',
    '',
  ];

  const MATCH_PARENT = 0xffffffff;
  const WRAP_CONTENT = 0xfffffffe;

  return compileBinaryXml(attrDefs, extraStrings, ({ startEl, endEl }) => [
    startEl('LinearLayout', 2, [
      { name: 'orientation', type: TYPE_INT_DEC, data: 1 },
      { name: 'background', type: TYPE_INT_COLOR_ARGB8, data: 0xff041f17 },
      { name: 'padding', type: TYPE_DIMENSION, data: dp(16) },
      { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
      { name: 'layout_height', type: TYPE_INT_DEC, data: MATCH_PARENT },
    ]),
    startEl('TextView', 8, [
      { name: 'textSize', type: TYPE_DIMENSION, data: sp(20) },
      { name: 'textStyle', type: TYPE_INT_HEX, data: 1 },
      { name: 'textColor', type: TYPE_INT_COLOR_ARGB8, data: 0xfffcd34d },
      { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
      { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
      { name: 'text', type: TYPE_STRING, val: 'Выберите вид виджета (Уфа)' },
    ]),
    endEl('TextView', 14),
    startEl('TextView', 15, [
      { name: 'textSize', type: TYPE_DIMENSION, data: sp(13) },
      { name: 'textColor', type: TYPE_INT_COLOR_ARGB8, data: 0xffd1fae5 },
      { name: 'paddingTop', type: TYPE_DIMENSION, data: dp(4) },
      { name: 'paddingBottom', type: TYPE_DIMENSION, data: dp(14) },
      { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
      { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
      {
        name: 'text',
        type: TYPE_STRING,
        val: 'Нажмите на карточку, чтобы установить выбранный стиль виджета на главный экран:',
      },
    ]),
    endEl('TextView', 22),
    startEl('LinearLayout', 24, [
      { name: 'orientation', type: TYPE_INT_DEC, data: 1 },
      { name: 'id', type: TYPE_REFERENCE, data: 0x01020019 },
      { name: 'background', type: TYPE_INT_COLOR_ARGB8, data: 0xff083829 },
      { name: 'padding', type: TYPE_DIMENSION, data: dp(12) },
      { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
      { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
    ]),
    startEl('TextView', 30, [
      { name: 'textSize', type: TYPE_DIMENSION, data: sp(14) },
      { name: 'textStyle', type: TYPE_INT_HEX, data: 1 },
      { name: 'textColor', type: TYPE_INT_COLOR_ARGB8, data: 0xff6ee7b7 },
      { name: 'paddingBottom', type: TYPE_DIMENSION, data: dp(8) },
      { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
      { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
      {
        name: 'text',
        type: TYPE_STRING,
        val: 'Вариант 1 · Классический изумруд (Ак капсула) — Нажмите для выбора',
      },
    ]),
    endEl('TextView', 36),
    startEl('ImageView', 37, [
      { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
      { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
      { name: 'src', type: TYPE_REFERENCE, data: 0x7f010001 },
      { name: 'scaleType', type: TYPE_INT_DEC, data: 3 },
      { name: 'adjustViewBounds', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    endEl('ImageView', 42),
    endEl('LinearLayout', 43),
    startEl('TextView', 44, [
      { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
      { name: 'layout_height', type: TYPE_DIMENSION, data: dp(14) },
      { name: 'text', type: TYPE_STRING, val: '' },
    ]),
    endEl('TextView', 47),
    startEl('LinearLayout', 48, [
      { name: 'orientation', type: TYPE_INT_DEC, data: 1 },
      { name: 'id', type: TYPE_REFERENCE, data: 0x0102001a },
      { name: 'background', type: TYPE_INT_COLOR_ARGB8, data: 0xff0f2937 },
      { name: 'padding', type: TYPE_DIMENSION, data: dp(12) },
      { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
      { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
    ]),
    startEl('TextView', 54, [
      { name: 'textSize', type: TYPE_DIMENSION, data: sp(14) },
      { name: 'textStyle', type: TYPE_INT_HEX, data: 1 },
      { name: 'textColor', type: TYPE_INT_COLOR_ARGB8, data: 0xff67e8f9 },
      { name: 'paddingBottom', type: TYPE_DIMENSION, data: dp(8) },
      { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
      { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
      {
        name: 'text',
        type: TYPE_STRING,
        val: 'Вариант 2 · Матовое стекло (Frosted Glass) — Нажмите для выбора',
      },
    ]),
    endEl('TextView', 60),
    startEl('ImageView', 61, [
      { name: 'layout_width', type: TYPE_INT_DEC, data: MATCH_PARENT },
      { name: 'layout_height', type: TYPE_INT_DEC, data: WRAP_CONTENT },
      { name: 'src', type: TYPE_REFERENCE, data: 0x7f010002 },
      { name: 'scaleType', type: TYPE_INT_DEC, data: 3 },
      { name: 'adjustViewBounds', type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    endEl('ImageView', 66),
    endEl('LinearLayout', 67),
    endEl('LinearLayout', 68),
  ]);
}

/**
 * Builds resources.arsc mapping all drawables, layouts, and xml resources.
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
    buf.writeUInt16LE(0x0001, 0);
    buf.writeUInt16LE(headerSize, 2);
    buf.writeUInt32LE(totalSize, 4);
    buf.writeUInt32LE(strList.length, 8);
    buf.writeUInt32LE(0, 12);
    buf.writeUInt32LE(0, 16);
    buf.writeUInt32LE(stringsStart, 20);
    buf.writeUInt32LE(0, 24);
    for (let i = 0; i < offsets.length; i++) {
      buf.writeUInt32LE(offsets[i], headerSize + i * 4);
    }
    Buffer.concat(encoded).copy(buf, stringsStart);
    return buf;
  }

  const globalPool = makeUtf16StringPool([
    'res/drawable/ic_launcher.png',              // 0 -> 0x7f010000
    'res/drawable/widget_emerald.png',           // 1 -> 0x7f010001
    'res/drawable/widget_frosted.png',           // 2 -> 0x7f010002
    'res/drawable/bg_shell_emerald.xml',         // 3 -> 0x7f010003
    'res/drawable/bg_pill_emerald.xml',          // 4 -> 0x7f010004
    'res/drawable/bg_tray_emerald.xml',          // 5 -> 0x7f010005
    'res/drawable/card_emerald_normal.xml',      // 6 -> 0x7f010006
    'res/drawable/card_emerald_active.xml',      // 7 -> 0x7f010007
    'res/drawable/card_emerald_next.xml',        // 8 -> 0x7f010008
    'res/drawable/bg_shell_frosted.xml',         // 9 -> 0x7f010009
    'res/drawable/bg_pill_frosted.xml',          // 10 -> 0x7f01000a
    'res/drawable/bg_tray_frosted.xml',          // 11 -> 0x7f01000b
    'res/drawable/card_frosted_normal.xml',      // 12 -> 0x7f01000c
    'res/drawable/card_frosted_active.xml',      // 13 -> 0x7f01000d
    'res/drawable/card_frosted_next.xml',        // 14 -> 0x7f01000e
    'res/layout/prayer_widget_emerald.xml',      // 15 -> 0x7f020000
    'res/layout/prayer_widget_frosted.xml',      // 16 -> 0x7f020001
    'res/layout/widget_config.xml',              // 17 -> 0x7f020002
    'res/xml/prayer_widget_info.xml',            // 18 -> 0x7f030000
    'res/xml/prayer_widget_frosted_info.xml',    // 19 -> 0x7f030001
  ]);
  const typePool = makeUtf16StringPool(['drawable', 'layout', 'xml']);
  const keyPool = makeUtf16StringPool([
    'ic_launcher',                // 0
    'widget_emerald',             // 1
    'widget_frosted',             // 2
    'bg_shell_emerald',           // 3
    'bg_pill_emerald',            // 4
    'bg_tray_emerald',            // 5
    'card_emerald_normal',        // 6
    'card_emerald_active',        // 7
    'card_emerald_next',          // 8
    'bg_shell_frosted',           // 9
    'bg_pill_frosted',            // 10
    'bg_tray_frosted',            // 11
    'card_frosted_normal',        // 12
    'card_frosted_active',        // 13
    'card_frosted_next',          // 14
    'prayer_widget_emerald',      // 15
    'prayer_widget_frosted',      // 16
    'widget_config',              // 17
    'prayer_widget_info',         // 18
    'prayer_widget_frosted_info', // 19
  ]);

  function makeTypeChunks(typeId, entries) {
    const entryCount = entries.length;
    const specSize = 16 + entryCount * 4;
    const typeSpecBuf = Buffer.alloc(specSize);
    typeSpecBuf.writeUInt16LE(0x0202, 0);
    typeSpecBuf.writeUInt16LE(16, 2);
    typeSpecBuf.writeUInt32LE(specSize, 4);
    typeSpecBuf.writeUInt8(typeId, 8);
    typeSpecBuf.writeUInt32LE(entryCount, 12);

    const typeHeaderSize = 56;
    const entriesStart = typeHeaderSize + entryCount * 4;
    const entryDataSize = 16;
    const typeChunkSize = entriesStart + entryCount * entryDataSize;
    const typeBuf = Buffer.alloc(typeChunkSize);
    typeBuf.writeUInt16LE(0x0201, 0);
    typeBuf.writeUInt16LE(typeHeaderSize, 2);
    typeBuf.writeUInt32LE(typeChunkSize, 4);
    typeBuf.writeUInt8(typeId, 8);
    typeBuf.writeUInt32LE(entryCount, 12);
    typeBuf.writeUInt32LE(entriesStart, 16);
    typeBuf.writeUInt32LE(36, 20);

    entries.forEach((e, idx) => {
      typeBuf.writeUInt32LE(idx * entryDataSize, typeHeaderSize + idx * 4);
      const base = entriesStart + idx * entryDataSize;
      typeBuf.writeUInt16LE(8, base);
      typeBuf.writeUInt16LE(0, base + 2);
      typeBuf.writeUInt32LE(e.keyIdx, base + 4);
      typeBuf.writeUInt16LE(8, base + 8);
      typeBuf.writeUInt8(0, base + 10);
      typeBuf.writeUInt8(0x03, base + 11);
      typeBuf.writeUInt32LE(e.globalIdx, base + 12);
    });

    return Buffer.concat([typeSpecBuf, typeBuf]);
  }

  const drawableChunks = makeTypeChunks(
    1,
    Array.from({ length: 15 }, (_, i) => ({ keyIdx: i, globalIdx: i }))
  );
  const layoutChunks = makeTypeChunks(2, [
    { keyIdx: 15, globalIdx: 15 },
    { keyIdx: 16, globalIdx: 16 },
    { keyIdx: 17, globalIdx: 17 },
  ]);
  const xmlChunks = makeTypeChunks(3, [
    { keyIdx: 18, globalIdx: 18 },
    { keyIdx: 19, globalIdx: 19 },
  ]);

  const pkgHeaderSize = 288;
  const pkgBody = Buffer.concat([typePool, keyPool, drawableChunks, layoutChunks, xmlChunks]);
  const pkgTotalSize = pkgHeaderSize + pkgBody.length;
  const pkgHeader = Buffer.alloc(pkgHeaderSize);
  pkgHeader.writeUInt16LE(0x0200, 0);
  pkgHeader.writeUInt16LE(pkgHeaderSize, 2);
  pkgHeader.writeUInt32LE(pkgTotalSize, 4);
  pkgHeader.writeUInt32LE(0x7f, 8);
  const pkgNameBuf = Buffer.from('com.example.interactivereader', 'utf16le');
  pkgNameBuf.copy(pkgHeader, 12);
  pkgHeader.writeUInt32LE(pkgHeaderSize, 268);
  pkgHeader.writeUInt32LE(3, 272);
  pkgHeader.writeUInt32LE(pkgHeaderSize + typePool.length, 276);
  pkgHeader.writeUInt32LE(20, 280);
  pkgHeader.writeUInt32LE(0, 284);

  const pkgChunk = Buffer.concat([pkgHeader, pkgBody]);

  const tableHeader = Buffer.alloc(12);
  const tableTotalSize = 12 + globalPool.length + pkgChunk.length;
  tableHeader.writeUInt16LE(0x0002, 0);
  tableHeader.writeUInt16LE(12, 2);
  tableHeader.writeUInt32LE(tableTotalSize, 4);
  tableHeader.writeUInt32LE(1, 8);

  return Buffer.concat([tableHeader, globalPool, pkgChunk]);
}

/**
 * Builds classes.dex containing:
 * 1) com.example.interactivereader.MainActivity
 * 2) com.example.interactivereader.PrayerWidgetProvider (Emerald + dynamic 59-day schedule)
 * 3) com.example.interactivereader.PrayerWidgetFrostedProvider (Frosted Glass + dynamic 59-day schedule)
 * 4) com.example.interactivereader.WidgetConfigActivity
 */
function buildClassesDex(scheduleDays) {
  const nextLabels = [
    'КИЛӘСЕ: ИРТӘНГЕ (ФАДЖР)',
    'КИЛӘСЕ: КОЯШ (ШУРУК)',
    'КИЛӘСЕ: ӨЙЛӘ (ЗУХР)',
    'КИЛӘСЕ: ИКЕНДЕ (АСР)',
    'КИЛӘСЕ: АХШАМ (МАГРИБ)',
    'КИЛӘСЕ: ЯСТҮ (ИША)',
  ];

  // Ordered lookup table for PrayerWidgetProvider.getStr(int idx):
  // - 0..58: Date & Hijri header string for dayIdx (0..58)
  // - 59..412: Prayer time string ("HH:MM") for dayIdx * 6 + prayerIdx
  // - 413..418: Next prayer label ("КИЛӘСЕ: ...") for prayerIdx (0..5)
  const strTable = [
    ...scheduleDays.map((d) => d.headerStr),
    ...scheduleDays.flatMap((d) => d.times),
    ...nextLabels,
  ];

  // Ordered lookup table for PrayerWidgetProvider.getSec(int idx):
  // - 0..353: Prayer time in seconds from midnight for dayIdx * 6 + prayerIdx
  const secTable = scheduleDays.flatMap((d) => d.secs);

  const rawStringsSet = new Set([
    '<init>',
    'GMT+05:00',
    'I',
    'II',
    'ILI',
    'J',
    'L',
    'LI',
    'LL',
    'LLI',
    'LLILI',
    'Landroid/app/Activity;',
    'Landroid/app/PendingIntent;',
    'Landroid/appwidget/AppWidgetManager;',
    'Landroid/appwidget/AppWidgetProvider;',
    'Landroid/content/ComponentName;',
    'Landroid/content/Context;',
    'Landroid/content/Intent;',
    'Landroid/content/SharedPreferences$Editor;',
    'Landroid/content/SharedPreferences;',
    'Landroid/os/Bundle;',
    'Landroid/os/SystemClock;',
    'Landroid/view/View$OnClickListener;',
    'Landroid/view/View;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    'Landroid/widget/RemoteViews;',
    'Lcom/example/interactivereader/MainActivity;',
    'Lcom/example/interactivereader/PrayerWidgetFrostedProvider;',
    'Lcom/example/interactivereader/PrayerWidgetProvider;',
    'Lcom/example/interactivereader/WidgetConfigActivity;',
    'Ljava/lang/CharSequence;',
    'Ljava/lang/Class;',
    'Ljava/lang/String;',
    'Ljava/util/Calendar;',
    'Ljava/util/TimeZone;',
    'V',
    'VI',
    'VII',
    'VIJLZ',
    'VIL',
    'VILI',
    'VIZ',
    'VL',
    'VLI',
    'VLL',
    'VLLL',
    'VLIII',
    'VZ',
    'Z',
    '[I',
    'appWidgetId',
    'buildViews',
    'canGoBack',
    'commit',
    'edit',
    'elapsedRealtime',
    'file:///android_asset/index.html',
    'findViewById',
    'finish',
    'get',
    'getActivity',
    'getAppWidgetIds',
    'getId',
    'getInstance',
    'getInt',
    'getIntExtra',
    'getIntent',
    'getPackageName',
    'getSec',
    'getSettings',
    'getSharedPreferences',
    'getStr',
    'getTimeZone',
    'goBack',
    'loadUrl',
    'onBackPressed',
    'onClick',
    'onCreate',
    'onReceive',
    'onUpdate',
    'putExtra',
    'putInt',
    'setBackgroundResource',
    'setChronometer',
    'setChronometerCountDown',
    'setContentView',
    'setDomStorageEnabled',
    'setInt',
    'setJavaScriptEnabled',
    'setOnClickListener',
    'setOnClickPendingIntent',
    'setResult',
    'setTextColor',
    'setTextViewText',
    'styleCard',
    'theme',
    'updateAppWidget',
    'webView',
    'widget_prefs',
    ...strTable,
  ]);

  const strings = [...rawStringsSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const strIdx = (s) => {
    const idx = strings.indexOf(s);
    if (idx === -1) throw new Error(`Missing DEX string: ${s}`);
    return idx;
  };

  const typeNames = [
    'I',
    'J',
    'Landroid/app/Activity;',
    'Landroid/app/PendingIntent;',
    'Landroid/appwidget/AppWidgetManager;',
    'Landroid/appwidget/AppWidgetProvider;',
    'Landroid/content/ComponentName;',
    'Landroid/content/Context;',
    'Landroid/content/Intent;',
    'Landroid/content/SharedPreferences$Editor;',
    'Landroid/content/SharedPreferences;',
    'Landroid/os/Bundle;',
    'Landroid/os/SystemClock;',
    'Landroid/view/View$OnClickListener;',
    'Landroid/view/View;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    'Landroid/widget/RemoteViews;',
    'Lcom/example/interactivereader/MainActivity;',
    'Lcom/example/interactivereader/PrayerWidgetFrostedProvider;',
    'Lcom/example/interactivereader/PrayerWidgetProvider;',
    'Lcom/example/interactivereader/WidgetConfigActivity;',
    'Ljava/lang/CharSequence;',
    'Ljava/lang/Class;',
    'Ljava/lang/String;',
    'Ljava/util/Calendar;',
    'Ljava/util/TimeZone;',
    'V',
    'Z',
    '[I',
  ].sort((a, b) => strIdx(a) - strIdx(b));

  const typeIds = typeNames.map((t) => strIdx(t));
  const typeIdx = (t) => {
    const idx = typeNames.indexOf(t);
    if (idx === -1) throw new Error(`Missing DEX type: ${t}`);
    return idx;
  };

  const rawProtos = [
    { shorty: 'I', ret: 'I', params: [] },
    { shorty: 'II', ret: 'I', params: ['I'] },
    { shorty: 'ILI', ret: 'I', params: ['Ljava/lang/String;', 'I'] },
    { shorty: 'J', ret: 'J', params: [] },
    {
      shorty: 'LLILI',
      ret: 'Landroid/app/PendingIntent;',
      params: ['Landroid/content/Context;', 'I', 'Landroid/content/Intent;', 'I'],
    },
    {
      shorty: 'LL',
      ret: 'Landroid/appwidget/AppWidgetManager;',
      params: ['Landroid/content/Context;'],
    },
    { shorty: 'L', ret: 'Landroid/content/Intent;', params: [] },
    {
      shorty: 'LLI',
      ret: 'Landroid/content/Intent;',
      params: ['Ljava/lang/String;', 'I'],
    },
    { shorty: 'L', ret: 'Landroid/content/SharedPreferences$Editor;', params: [] },
    {
      shorty: 'LLI',
      ret: 'Landroid/content/SharedPreferences$Editor;',
      params: ['Ljava/lang/String;', 'I'],
    },
    {
      shorty: 'LLI',
      ret: 'Landroid/content/SharedPreferences;',
      params: ['Ljava/lang/String;', 'I'],
    },
    { shorty: 'LI', ret: 'Landroid/view/View;', params: ['I'] },
    { shorty: 'L', ret: 'Landroid/webkit/WebSettings;', params: [] },
    {
      shorty: 'LLI',
      ret: 'Landroid/widget/RemoteViews;',
      params: ['Landroid/content/Context;', 'I'],
    },
    { shorty: 'L', ret: 'Ljava/lang/String;', params: [] },
    { shorty: 'LI', ret: 'Ljava/lang/String;', params: ['I'] },
    { shorty: 'LL', ret: 'Ljava/util/Calendar;', params: ['Ljava/util/TimeZone;'] },
    { shorty: 'LL', ret: 'Ljava/util/TimeZone;', params: ['Ljava/lang/String;'] },
    { shorty: 'V', ret: 'V', params: [] },
    { shorty: 'VI', ret: 'V', params: ['I'] },
    { shorty: 'VII', ret: 'V', params: ['I', 'I'] },
    {
      shorty: 'VIJLZ',
      ret: 'V',
      params: ['I', 'J', 'Ljava/lang/String;', 'Z'],
    },
    { shorty: 'VIL', ret: 'V', params: ['I', 'Landroid/app/PendingIntent;'] },
    { shorty: 'VIL', ret: 'V', params: ['I', 'Landroid/content/Intent;'] },
    { shorty: 'VIL', ret: 'V', params: ['I', 'Landroid/widget/RemoteViews;'] },
    { shorty: 'VIL', ret: 'V', params: ['I', 'Ljava/lang/CharSequence;'] },
    { shorty: 'VILI', ret: 'V', params: ['I', 'Ljava/lang/String;', 'I'] },
    { shorty: 'VIZ', ret: 'V', params: ['I', 'Z'] },
    { shorty: 'VL', ret: 'V', params: ['Landroid/content/Context;'] },
    {
      shorty: 'VLL',
      ret: 'V',
      params: ['Landroid/content/Context;', 'Landroid/content/Intent;'],
    },
    {
      shorty: 'VLL',
      ret: 'V',
      params: ['Landroid/content/Context;', 'Ljava/lang/Class;'],
    },
    {
      shorty: 'VLLL',
      ret: 'V',
      params: [
        'Landroid/content/Context;',
        'Landroid/appwidget/AppWidgetManager;',
        '[I',
      ],
    },
    { shorty: 'VL', ret: 'V', params: ['Landroid/os/Bundle;'] },
    { shorty: 'VL', ret: 'V', params: ['Landroid/view/View$OnClickListener;'] },
    { shorty: 'VL', ret: 'V', params: ['Landroid/view/View;'] },
    {
      shorty: 'VLIII',
      ret: 'V',
      params: ['Landroid/widget/RemoteViews;', 'I', 'I', 'I'],
    },
    { shorty: 'VL', ret: 'V', params: ['Ljava/lang/String;'] },
    { shorty: 'VLI', ret: 'V', params: ['Ljava/lang/String;', 'I'] },
    { shorty: 'VZ', ret: 'V', params: ['Z'] },
    { shorty: 'VLL', ret: 'V', params: ['[I', 'Landroid/widget/RemoteViews;'] },
    { shorty: 'Z', ret: 'Z', params: [] },
    { shorty: 'LL', ret: '[I', params: ['Landroid/content/ComponentName;'] },
  ];

  for (const p of rawProtos) {
    const expectedShorty = [p.ret, ...p.params]
      .map((t) => (t.startsWith('L') || t.startsWith('[') ? 'L' : t))
      .join('');
    if (p.shorty !== expectedShorty) {
      throw new Error(
        `Invalid shorty for ${p.ret}(${p.params.join('')}): got ${p.shorty}, expected ${expectedShorty}`
      );
    }
  }

  const protos = [...rawProtos]
    .map((p) => ({
      shortyIdx: strIdx(p.shorty),
      returnTypeIdx: typeIdx(p.ret),
      paramTypes: p.params.map((pt) => typeIdx(pt)),
      key: `${p.ret}(${p.params.join('')})`,
    }))
    .sort((a, b) => {
      if (a.returnTypeIdx !== b.returnTypeIdx) return a.returnTypeIdx - b.returnTypeIdx;
      const len = Math.min(a.paramTypes.length, b.paramTypes.length);
      for (let i = 0; i < len; i++) {
        if (a.paramTypes[i] !== b.paramTypes[i]) return a.paramTypes[i] - b.paramTypes[i];
      }
      return a.paramTypes.length - b.paramTypes.length;
    });

  const protoIdx = (ret, params) => {
    const key = `${ret}(${params.join('')})`;
    const idx = protos.findIndex((p) => p.key === key);
    if (idx === -1) throw new Error(`Missing DEX proto: ${key}`);
    return idx;
  };

  const rawFields = [
    {
      cls: 'Lcom/example/interactivereader/MainActivity;',
      type: 'Landroid/webkit/WebView;',
      name: 'webView',
    },
    {
      cls: 'Lcom/example/interactivereader/WidgetConfigActivity;',
      type: 'I',
      name: 'appWidgetId',
    },
  ];

  const fields = rawFields
    .map((f) => ({
      classIdx: typeIdx(f.cls),
      typeIdx: typeIdx(f.type),
      nameIdx: strIdx(f.name),
      key: `${f.cls}.${f.name}:${f.type}`,
    }))
    .sort((a, b) => {
      if (a.classIdx !== b.classIdx) return a.classIdx - b.classIdx;
      if (a.nameIdx !== b.nameIdx) return a.nameIdx - b.nameIdx;
      return a.typeIdx - b.typeIdx;
    });

  const fieldIdx = (cls, name, type) => {
    const key = `${cls}.${name}:${type}`;
    const idx = fields.findIndex((f) => f.key === key);
    if (idx === -1) throw new Error(`Missing DEX field: ${key}`);
    return idx;
  };

  const rawMethods = [
    // Activity
    { cls: 'Landroid/app/Activity;', name: '<init>', ret: 'V', params: [] },
    {
      cls: 'Landroid/app/Activity;',
      name: 'findViewById',
      ret: 'Landroid/view/View;',
      params: ['I'],
    },
    { cls: 'Landroid/app/Activity;', name: 'finish', ret: 'V', params: [] },
    {
      cls: 'Landroid/app/Activity;',
      name: 'getIntent',
      ret: 'Landroid/content/Intent;',
      params: [],
    },
    { cls: 'Landroid/app/Activity;', name: 'onBackPressed', ret: 'V', params: [] },
    { cls: 'Landroid/app/Activity;', name: 'onCreate', ret: 'V', params: ['Landroid/os/Bundle;'] },
    { cls: 'Landroid/app/Activity;', name: 'setContentView', ret: 'V', params: ['I'] },
    {
      cls: 'Landroid/app/Activity;',
      name: 'setContentView',
      ret: 'V',
      params: ['Landroid/view/View;'],
    },
    { cls: 'Landroid/app/Activity;', name: 'setResult', ret: 'V', params: ['I'] },
    {
      cls: 'Landroid/app/Activity;',
      name: 'setResult',
      ret: 'V',
      params: ['I', 'Landroid/content/Intent;'],
    },
    // PendingIntent
    {
      cls: 'Landroid/app/PendingIntent;',
      name: 'getActivity',
      ret: 'Landroid/app/PendingIntent;',
      params: ['Landroid/content/Context;', 'I', 'Landroid/content/Intent;', 'I'],
    },
    // AppWidgetManager
    {
      cls: 'Landroid/appwidget/AppWidgetManager;',
      name: 'getAppWidgetIds',
      ret: '[I',
      params: ['Landroid/content/ComponentName;'],
    },
    {
      cls: 'Landroid/appwidget/AppWidgetManager;',
      name: 'getInstance',
      ret: 'Landroid/appwidget/AppWidgetManager;',
      params: ['Landroid/content/Context;'],
    },
    {
      cls: 'Landroid/appwidget/AppWidgetManager;',
      name: 'updateAppWidget',
      ret: 'V',
      params: ['I', 'Landroid/widget/RemoteViews;'],
    },
    {
      cls: 'Landroid/appwidget/AppWidgetManager;',
      name: 'updateAppWidget',
      ret: 'V',
      params: ['[I', 'Landroid/widget/RemoteViews;'],
    },
    // AppWidgetProvider
    { cls: 'Landroid/appwidget/AppWidgetProvider;', name: '<init>', ret: 'V', params: [] },
    {
      cls: 'Landroid/appwidget/AppWidgetProvider;',
      name: 'onReceive',
      ret: 'V',
      params: ['Landroid/content/Context;', 'Landroid/content/Intent;'],
    },
    // ComponentName
    {
      cls: 'Landroid/content/ComponentName;',
      name: '<init>',
      ret: 'V',
      params: ['Landroid/content/Context;', 'Ljava/lang/Class;'],
    },
    // Context
    {
      cls: 'Landroid/content/Context;',
      name: 'getPackageName',
      ret: 'Ljava/lang/String;',
      params: [],
    },
    {
      cls: 'Landroid/content/Context;',
      name: 'getSharedPreferences',
      ret: 'Landroid/content/SharedPreferences;',
      params: ['Ljava/lang/String;', 'I'],
    },
    // Intent
    { cls: 'Landroid/content/Intent;', name: '<init>', ret: 'V', params: [] },
    {
      cls: 'Landroid/content/Intent;',
      name: '<init>',
      ret: 'V',
      params: ['Landroid/content/Context;', 'Ljava/lang/Class;'],
    },
    {
      cls: 'Landroid/content/Intent;',
      name: 'getIntExtra',
      ret: 'I',
      params: ['Ljava/lang/String;', 'I'],
    },
    {
      cls: 'Landroid/content/Intent;',
      name: 'putExtra',
      ret: 'Landroid/content/Intent;',
      params: ['Ljava/lang/String;', 'I'],
    },
    // SharedPreferences$Editor
    { cls: 'Landroid/content/SharedPreferences$Editor;', name: 'commit', ret: 'Z', params: [] },
    {
      cls: 'Landroid/content/SharedPreferences$Editor;',
      name: 'putInt',
      ret: 'Landroid/content/SharedPreferences$Editor;',
      params: ['Ljava/lang/String;', 'I'],
    },
    // SharedPreferences
    {
      cls: 'Landroid/content/SharedPreferences;',
      name: 'edit',
      ret: 'Landroid/content/SharedPreferences$Editor;',
      params: [],
    },
    {
      cls: 'Landroid/content/SharedPreferences;',
      name: 'getInt',
      ret: 'I',
      params: ['Ljava/lang/String;', 'I'],
    },
    // SystemClock
    { cls: 'Landroid/os/SystemClock;', name: 'elapsedRealtime', ret: 'J', params: [] },
    // View
    { cls: 'Landroid/view/View;', name: 'getId', ret: 'I', params: [] },
    {
      cls: 'Landroid/view/View;',
      name: 'setOnClickListener',
      ret: 'V',
      params: ['Landroid/view/View$OnClickListener;'],
    },
    // WebSettings
    { cls: 'Landroid/webkit/WebSettings;', name: 'setDomStorageEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setJavaScriptEnabled', ret: 'V', params: ['Z'] },
    // WebView
    {
      cls: 'Landroid/webkit/WebView;',
      name: '<init>',
      ret: 'V',
      params: ['Landroid/content/Context;'],
    },
    { cls: 'Landroid/webkit/WebView;', name: 'canGoBack', ret: 'Z', params: [] },
    {
      cls: 'Landroid/webkit/WebView;',
      name: 'getSettings',
      ret: 'Landroid/webkit/WebSettings;',
      params: [],
    },
    { cls: 'Landroid/webkit/WebView;', name: 'goBack', ret: 'V', params: [] },
    { cls: 'Landroid/webkit/WebView;', name: 'loadUrl', ret: 'V', params: ['Ljava/lang/String;'] },
    // RemoteViews
    {
      cls: 'Landroid/widget/RemoteViews;',
      name: '<init>',
      ret: 'V',
      params: ['Ljava/lang/String;', 'I'],
    },
    {
      cls: 'Landroid/widget/RemoteViews;',
      name: 'setChronometer',
      ret: 'V',
      params: ['I', 'J', 'Ljava/lang/String;', 'Z'],
    },
    {
      cls: 'Landroid/widget/RemoteViews;',
      name: 'setChronometerCountDown',
      ret: 'V',
      params: ['I', 'Z'],
    },
    {
      cls: 'Landroid/widget/RemoteViews;',
      name: 'setInt',
      ret: 'V',
      params: ['I', 'Ljava/lang/String;', 'I'],
    },
    {
      cls: 'Landroid/widget/RemoteViews;',
      name: 'setOnClickPendingIntent',
      ret: 'V',
      params: ['I', 'Landroid/app/PendingIntent;'],
    },
    {
      cls: 'Landroid/widget/RemoteViews;',
      name: 'setTextColor',
      ret: 'V',
      params: ['I', 'I'],
    },
    {
      cls: 'Landroid/widget/RemoteViews;',
      name: 'setTextViewText',
      ret: 'V',
      params: ['I', 'Ljava/lang/CharSequence;'],
    },
    // MainActivity
    { cls: 'Lcom/example/interactivereader/MainActivity;', name: '<init>', ret: 'V', params: [] },
    {
      cls: 'Lcom/example/interactivereader/MainActivity;',
      name: 'onBackPressed',
      ret: 'V',
      params: [],
    },
    {
      cls: 'Lcom/example/interactivereader/MainActivity;',
      name: 'onCreate',
      ret: 'V',
      params: ['Landroid/os/Bundle;'],
    },
    // PrayerWidgetFrostedProvider
    {
      cls: 'Lcom/example/interactivereader/PrayerWidgetFrostedProvider;',
      name: '<init>',
      ret: 'V',
      params: [],
    },
    {
      cls: 'Lcom/example/interactivereader/PrayerWidgetFrostedProvider;',
      name: 'onReceive',
      ret: 'V',
      params: ['Landroid/content/Context;', 'Landroid/content/Intent;'],
    },
    {
      cls: 'Lcom/example/interactivereader/PrayerWidgetFrostedProvider;',
      name: 'onUpdate',
      ret: 'V',
      params: ['Landroid/content/Context;', 'Landroid/appwidget/AppWidgetManager;', '[I'],
    },
    // PrayerWidgetProvider
    {
      cls: 'Lcom/example/interactivereader/PrayerWidgetProvider;',
      name: '<init>',
      ret: 'V',
      params: [],
    },
    {
      cls: 'Lcom/example/interactivereader/PrayerWidgetProvider;',
      name: 'buildViews',
      ret: 'Landroid/widget/RemoteViews;',
      params: ['Landroid/content/Context;', 'I'],
    },
    {
      cls: 'Lcom/example/interactivereader/PrayerWidgetProvider;',
      name: 'getSec',
      ret: 'I',
      params: ['I'],
    },
    {
      cls: 'Lcom/example/interactivereader/PrayerWidgetProvider;',
      name: 'getStr',
      ret: 'Ljava/lang/String;',
      params: ['I'],
    },
    {
      cls: 'Lcom/example/interactivereader/PrayerWidgetProvider;',
      name: 'onReceive',
      ret: 'V',
      params: ['Landroid/content/Context;', 'Landroid/content/Intent;'],
    },
    {
      cls: 'Lcom/example/interactivereader/PrayerWidgetProvider;',
      name: 'onUpdate',
      ret: 'V',
      params: ['Landroid/content/Context;', 'Landroid/appwidget/AppWidgetManager;', '[I'],
    },
    {
      cls: 'Lcom/example/interactivereader/PrayerWidgetProvider;',
      name: 'styleCard',
      ret: 'V',
      params: ['Landroid/widget/RemoteViews;', 'I', 'I', 'I'],
    },
    // WidgetConfigActivity
    {
      cls: 'Lcom/example/interactivereader/WidgetConfigActivity;',
      name: '<init>',
      ret: 'V',
      params: [],
    },
    {
      cls: 'Lcom/example/interactivereader/WidgetConfigActivity;',
      name: 'onClick',
      ret: 'V',
      params: ['Landroid/view/View;'],
    },
    {
      cls: 'Lcom/example/interactivereader/WidgetConfigActivity;',
      name: 'onCreate',
      ret: 'V',
      params: ['Landroid/os/Bundle;'],
    },
    // Calendar & TimeZone
    { cls: 'Ljava/util/Calendar;', name: 'get', ret: 'I', params: ['I'] },
    {
      cls: 'Ljava/util/Calendar;',
      name: 'getInstance',
      ret: 'Ljava/util/Calendar;',
      params: ['Ljava/util/TimeZone;'],
    },
    {
      cls: 'Ljava/util/TimeZone;',
      name: 'getTimeZone',
      ret: 'Ljava/util/TimeZone;',
      params: ['Ljava/lang/String;'],
    },
  ];

  const methods = rawMethods
    .map((m) => ({
      classIdx: typeIdx(m.cls),
      protoIdx: protoIdx(m.ret, m.params),
      nameIdx: strIdx(m.name),
      key: `${m.cls}.${m.name}:${m.ret}(${m.params.join('')})`,
    }))
    .sort((a, b) => {
      if (a.classIdx !== b.classIdx) return a.classIdx - b.classIdx;
      if (a.nameIdx !== b.nameIdx) return a.nameIdx - b.nameIdx;
      return a.protoIdx - b.protoIdx;
    });

  const methodIdx = (cls, name, ret, params = []) => {
    const key = `${cls}.${name}:${ret}(${params.join('')})`;
    const idx = methods.findIndex((m) => m.key === key);
    if (idx === -1) throw new Error(`Missing DEX method: ${key}`);
    return idx;
  };

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

  function makeCodeItem(registersSize, insSize, outsSize, insnsBuf) {
    const pad = insnsBuf.length % 4 === 2 ? 2 : 0;
    const item = Buffer.alloc(16 + insnsBuf.length + pad, 0);
    item.writeUInt16LE(registersSize, 0);
    item.writeUInt16LE(insSize, 2);
    item.writeUInt16LE(outsSize, 4);
    item.writeUInt16LE(0, 6);
    item.writeUInt32LE(0, 8);
    item.writeUInt32LE(insnsBuf.length / 2, 12);
    insnsBuf.copy(item, 16);
    return item;
  }

  const u16 = (val) => [val & 0xff, (val >>> 8) & 0xff];
  const u32 = (val) => [
    val & 0xff,
    (val >>> 8) & 0xff,
    (val >>> 16) & 0xff,
    (val >>> 24) & 0xff,
  ];

  const fWebView = fieldIdx(
    'Lcom/example/interactivereader/MainActivity;',
    'webView',
    'Landroid/webkit/WebView;'
  );
  const fAppWidgetId = fieldIdx(
    'Lcom/example/interactivereader/WidgetConfigActivity;',
    'appWidgetId',
    'I'
  );

  // 1. MainActivity.<init>()V
  const mActivityInit = methodIdx('Landroid/app/Activity;', '<init>', 'V');
  const initCodeItem = makeCodeItem(
    1,
    1,
    1,
    Buffer.from([0x70, 0x10, ...u16(mActivityInit), 0x00, 0x00, 0x0e, 0x00])
  );

  // 2. MainActivity.onBackPressed()V
  const mWebViewCanGoBack = methodIdx('Landroid/webkit/WebView;', 'canGoBack', 'Z');
  const mWebViewGoBack = methodIdx('Landroid/webkit/WebView;', 'goBack', 'V');
  const mActivityOnBack = methodIdx('Landroid/app/Activity;', 'onBackPressed', 'V');
  const onBackPressedCodeItem = makeCodeItem(
    3,
    1,
    1,
    Buffer.from([
      0x54, 0x20, ...u16(fWebView),
      0x38, 0x00, 0x0c, 0x00,
      0x6e, 0x10, ...u16(mWebViewCanGoBack), 0x00, 0x00,
      0x0a, 0x01,
      0x38, 0x01, 0x06, 0x00,
      0x6e, 0x10, ...u16(mWebViewGoBack), 0x00, 0x00,
      0x0e, 0x00,
      0x6f, 0x10, ...u16(mActivityOnBack), 0x02, 0x00,
      0x0e, 0x00,
    ])
  );

  // 3. MainActivity.onCreate(Bundle)V
  const mActivityOnCreate = methodIdx('Landroid/app/Activity;', 'onCreate', 'V', [
    'Landroid/os/Bundle;',
  ]);
  const tWebView = typeIdx('Landroid/webkit/WebView;');
  const mWebViewInit = methodIdx('Landroid/webkit/WebView;', '<init>', 'V', [
    'Landroid/content/Context;',
  ]);
  const mWebViewGetSettings = methodIdx(
    'Landroid/webkit/WebView;',
    'getSettings',
    'Landroid/webkit/WebSettings;'
  );
  const mSetJs = methodIdx('Landroid/webkit/WebSettings;', 'setJavaScriptEnabled', 'V', ['Z']);
  const mSetDom = methodIdx('Landroid/webkit/WebSettings;', 'setDomStorageEnabled', 'V', ['Z']);
  const sUrl = strIdx('file:///android_asset/index.html');
  const mLoadUrl = methodIdx('Landroid/webkit/WebView;', 'loadUrl', 'V', ['Ljava/lang/String;']);
  const mSetContentViewView = methodIdx('Landroid/app/Activity;', 'setContentView', 'V', [
    'Landroid/view/View;',
  ]);

  const onCreateCodeItem = makeCodeItem(
    5,
    2,
    2,
    Buffer.from([
      0x6f, 0x20, ...u16(mActivityOnCreate), 0x43, 0x00,
      0x22, 0x00, ...u16(tWebView),
      0x70, 0x20, ...u16(mWebViewInit), 0x30, 0x00,
      0x5b, 0x30, ...u16(fWebView),
      0x6e, 0x10, ...u16(mWebViewGetSettings), 0x00, 0x00,
      0x0c, 0x01,
      0x12, 0x12,
      0x6e, 0x20, ...u16(mSetJs), 0x21, 0x00,
      0x6e, 0x20, ...u16(mSetDom), 0x21, 0x00,
      0x1a, 0x02, ...u16(sUrl),
      0x6e, 0x20, ...u16(mLoadUrl), 0x20, 0x00,
      0x6e, 0x20, ...u16(mSetContentViewView), 0x03, 0x00,
      0x0e, 0x00,
    ])
  );

  // 4. PrayerWidgetProvider.<init>()V
  const mWidgetSuperInit = methodIdx('Landroid/appwidget/AppWidgetProvider;', '<init>', 'V');
  const widgetInitCodeItem = makeCodeItem(
    1,
    1,
    1,
    Buffer.from([0x70, 0x10, ...u16(mWidgetSuperInit), 0x00, 0x00, 0x0e, 0x00])
  );

  // 5. PrayerWidgetProvider.getStr(int v1) -> String
  // Uses packed-switch (0x2b) over strTable (length = N) with 4-byte aligned packed-switch-payload
  const getStrBody = [
    0x1a, 0x00, ...u16(strIdx(strTable[28])),
    0x11, 0x00,
  ];
  const getStrTargets = [];
  for (let i = 0; i < strTable.length; i++) {
    getStrTargets.push(3 + getStrBody.length / 2);
    getStrBody.push(0x1a, 0x00, ...u16(strIdx(strTable[i])), 0x11, 0x00);
  }
  if ((3 + getStrBody.length / 2) % 2 !== 0) {
    getStrBody.push(0x00, 0x00); // nop for 4-byte alignment
  }
  const getStrPayloadOff = 3 + getStrBody.length / 2;
  const getStrInsns = [
    0x2b, 0x01, ...u32(getStrPayloadOff),
    ...getStrBody,
    0x00, 0x01, ...u16(strTable.length), ...u32(0),
    ...getStrTargets.flatMap((t) => u32(t)),
  ];
  const getStrCodeItem = makeCodeItem(2, 1, 0, Buffer.from(getStrInsns));

  // 6. PrayerWidgetProvider.getSec(int v1) -> int
  // Uses packed-switch (0x2b) over secTable (length = M) with 4-byte aligned packed-switch-payload
  const getSecBody = [
    0x14, 0x00, ...u32(secTable[28 * 6]),
    0x0f, 0x00,
  ];
  const getSecTargets = [];
  for (let i = 0; i < secTable.length; i++) {
    getSecTargets.push(3 + getSecBody.length / 2);
    getSecBody.push(0x14, 0x00, ...u32(secTable[i]), 0x0f, 0x00);
  }
  if ((3 + getSecBody.length / 2) % 2 !== 0) {
    getSecBody.push(0x00, 0x00); // nop for 4-byte alignment
  }
  const getSecPayloadOff = 3 + getSecBody.length / 2;
  const getSecInsns = [
    0x2b, 0x01, ...u32(getSecPayloadOff),
    ...getSecBody,
    0x00, 0x01, ...u16(secTable.length), ...u32(0),
    ...getSecTargets.flatMap((t) => u32(t)),
  ];
  const getSecCodeItem = makeCodeItem(2, 1, 0, Buffer.from(getSecInsns));

  // 7. PrayerWidgetProvider.styleCard(RemoteViews v6, int v7 (cardIdx), int v8 (state: 0=normal,1=active,2=next), int v9 (layoutId))V
  const sSetBackgroundResource = strIdx('setBackgroundResource');
  const mSetInt = methodIdx('Landroid/widget/RemoteViews;', 'setInt', 'V', [
    'I',
    'Ljava/lang/String;',
    'I',
  ]);
  const mSetTextColor = methodIdx('Landroid/widget/RemoteViews;', 'setTextColor', 'V', ['I', 'I']);

  // Registers in styleCard: locals v0..v5, params v6=RemoteViews, v7=cardIdx, v8=state, v9=layoutId
  const frostedActiveBody = [
    0x14, 0x01, 0x0d, 0x00, 0x01, 0x7f, // v1 = 0x7f01000d (card_frosted_active)
    0x14, 0x02, 0x4d, 0xd3, 0xfc, 0xff, // v2 = #fcd34d
    0x14, 0x03, 0xd0, 0xf3, 0xa7, 0xff, // v3 = #a7f3d0
  ];
  const frostedNextBody = [
    0x14, 0x01, 0x0e, 0x00, 0x01, 0x7f, // v1 = 0x7f01000e (card_frosted_next)
    0x14, 0x02, 0x4d, 0xd3, 0xfc, 0xff, // v2 = #fcd34d
    0x14, 0x03, 0x8a, 0xe6, 0xfd, 0xff, // v3 = #fde68a
  ];
  const frostedBranch = [
    0x14, 0x01, 0x0c, 0x00, 0x01, 0x7f, // v1 = bg = 0x7f01000c (card_frosted_normal)
    0x14, 0x02, 0xff, 0xff, 0xff, 0xff, // v2 = ttColor = #ffffff
    0x14, 0x03, 0xe1, 0xd5, 0xcb, 0xff, // v3 = ruColor = #cbd5e1
    0x14, 0x04, 0xff, 0xff, 0xff, 0xff, // v4 = timeColor = #ffffff
    0x12, 0x10, // const/4 v0, 1
    0x33, 0x08, ...u16(2 + frostedActiveBody.length / 2), // if-ne v8, v0, skip active
    ...frostedActiveBody,
    0x12, 0x20, // const/4 v0, 2
    0x33, 0x08, ...u16(2 + frostedNextBody.length / 2), // if-ne v8, v0, skip next
    ...frostedNextBody,
  ];
  const emeraldActiveBody = [
    0x14, 0x01, 0x07, 0x00, 0x01, 0x7f, // v1 = 0x7f010007 (card_emerald_active)
    0x14, 0x02, 0x4d, 0xd3, 0xfc, 0xff, // v2 = #fcd34d
    0x14, 0x03, 0xe5, 0xfa, 0xd1, 0xff, // v3 = #d1fae5
    0x14, 0x04, 0xff, 0xff, 0xff, 0xff, // v4 = #ffffff
  ];
  const emeraldNextBody = [
    0x14, 0x01, 0x08, 0x00, 0x01, 0x7f, // v1 = 0x7f010008 (card_emerald_next)
    0x14, 0x02, 0x09, 0x53, 0xb4, 0xff, // v2 = #b45309
    0x14, 0x03, 0x0e, 0x40, 0x92, 0xff, // v3 = #92400e
  ];
  const emeraldBranch = [
    0x14, 0x01, 0x06, 0x00, 0x01, 0x7f, // v1 = bg = 0x7f010006 (card_emerald_normal)
    0x14, 0x02, 0x22, 0x2c, 0x02, 0xff, // v2 = ttColor = #022c22
    0x14, 0x03, 0x8b, 0x74, 0x64, 0xff, // v3 = ruColor = #64748b
    0x14, 0x04, 0x2a, 0x17, 0x0f, 0xff, // v4 = timeColor = #0f172a
    0x12, 0x10, // const/4 v0, 1
    0x33, 0x08, ...u16(2 + emeraldActiveBody.length / 2), // if-ne v8, v0, skip active
    ...emeraldActiveBody,
    0x12, 0x20, // const/4 v0, 2
    0x33, 0x08, ...u16(2 + emeraldNextBody.length / 2), // if-ne v8, v0, skip next
    ...emeraldNextBody,
  ];
  const jumpToEmeraldUnits = 2 + frostedBranch.length / 2 + 1; // +1 for the 1-unit goto
  const jumpToApplyUnits = 1 + emeraldBranch.length / 2;

  const styleCardCodeItem = makeCodeItem(
    10,
    4,
    4,
    Buffer.from([
      // Check if Frosted (v9 == 0x7f020001)
      0x14, 0x00, 0x01, 0x00, 0x02, 0x7f, // const v0, 0x7f020001
      0x33, 0x09, ...u16(jumpToEmeraldUnits), // if-ne v9, v0, to Emerald branch

      // === FROSTED BRANCH ===
      ...frostedBranch,
      0x28, jumpToApplyUnits & 0xff, // goto applyCalls

      // === EMERALD BRANCH ===
      ...emeraldBranch,

      // === applyCalls ===
      // 1. views.setInt(0x7f040010 + cardIdx, "setBackgroundResource", v1)
      0x14, 0x00, 0x10, 0x00, 0x04, 0x7f, // const v0, 0x7f040010
      0xb0, 0x70, // add-int/2addr v0, v7
      0x1a, 0x05, ...u16(sSetBackgroundResource), // const-string v5, "setBackgroundResource"
      0x6e, 0x40, ...u16(mSetInt), 0x06, 0x15, // invoke-virtual {v6, v0, v5, v1}, setInt
      // 2. views.setTextColor(0x7f040030 + cardIdx, v2)
      0x14, 0x00, 0x30, 0x00, 0x04, 0x7f, // const v0, 0x7f040030
      0xb0, 0x70,
      0x6e, 0x30, ...u16(mSetTextColor), 0x06, 0x02, // invoke-virtual {v6, v0, v2}, setTextColor
      // 3. views.setTextColor(0x7f040040 + cardIdx, v3)
      0x14, 0x00, 0x40, 0x00, 0x04, 0x7f, // const v0, 0x7f040040
      0xb0, 0x70,
      0x6e, 0x30, ...u16(mSetTextColor), 0x06, 0x03, // invoke-virtual {v6, v0, v3}, setTextColor
      // 4. views.setTextColor(0x7f040050 + cardIdx, v4)
      0x14, 0x00, 0x50, 0x00, 0x04, 0x7f, // const v0, 0x7f040050
      0xb0, 0x70,
      0x6e, 0x30, ...u16(mSetTextColor), 0x06, 0x04, // invoke-virtual {v6, v0, v4}, setTextColor
      0x0e, 0x00, // return-void
    ])
  );

  // 8. PrayerWidgetProvider.buildViews(Context v10, int v11) -> RemoteViews
  const tIntent = typeIdx('Landroid/content/Intent;');
  const tMainActivity = typeIdx('Lcom/example/interactivereader/MainActivity;');
  const mIntentInitCtxCls = methodIdx('Landroid/content/Intent;', '<init>', 'V', [
    'Landroid/content/Context;',
    'Ljava/lang/Class;',
  ]);
  const mPendingIntentGetActivity = methodIdx(
    'Landroid/app/PendingIntent;',
    'getActivity',
    'Landroid/app/PendingIntent;',
    ['Landroid/content/Context;', 'I', 'Landroid/content/Intent;', 'I']
  );
  const tRemoteViews = typeIdx('Landroid/widget/RemoteViews;');
  const mGetPackageName = methodIdx(
    'Landroid/content/Context;',
    'getPackageName',
    'Ljava/lang/String;'
  );
  const mRemoteViewsInit = methodIdx('Landroid/widget/RemoteViews;', '<init>', 'V', [
    'Ljava/lang/String;',
    'I',
  ]);
  const mSetOnClickPendingIntent = methodIdx(
    'Landroid/widget/RemoteViews;',
    'setOnClickPendingIntent',
    'V',
    ['I', 'Landroid/app/PendingIntent;']
  );
  const sGmtPlus5 = strIdx('GMT+05:00');
  const mGetTimeZone = methodIdx(
    'Ljava/util/TimeZone;',
    'getTimeZone',
    'Ljava/util/TimeZone;',
    ['Ljava/lang/String;']
  );
  const mCalendarGetInstanceTz = methodIdx(
    'Ljava/util/Calendar;',
    'getInstance',
    'Ljava/util/Calendar;',
    ['Ljava/util/TimeZone;']
  );
  const mCalendarGet = methodIdx('Ljava/util/Calendar;', 'get', 'I', ['I']);
  const mGetStr = methodIdx(
    'Lcom/example/interactivereader/PrayerWidgetProvider;',
    'getStr',
    'Ljava/lang/String;',
    ['I']
  );
  const mGetSec = methodIdx(
    'Lcom/example/interactivereader/PrayerWidgetProvider;',
    'getSec',
    'I',
    ['I']
  );
  const mStyleCard = methodIdx(
    'Lcom/example/interactivereader/PrayerWidgetProvider;',
    'styleCard',
    'V',
    ['Landroid/widget/RemoteViews;', 'I', 'I', 'I']
  );
  const mSetTextViewText = methodIdx(
    'Landroid/widget/RemoteViews;',
    'setTextViewText',
    'V',
    ['I', 'Ljava/lang/CharSequence;']
  );
  const mElapsedRealtime = methodIdx('Landroid/os/SystemClock;', 'elapsedRealtime', 'J');
  const mSetChronometerCountDown = methodIdx(
    'Landroid/widget/RemoteViews;',
    'setChronometerCountDown',
    'V',
    ['I', 'Z']
  );
  const mSetChronometer = methodIdx(
    'Landroid/widget/RemoteViews;',
    'setChronometer',
    'V',
    ['I', 'J', 'Ljava/lang/String;', 'Z']
  );

  // Helper for checking each prayer p (5 down to 0) against nowSec (v1)
  // v8 = dayIdx * 6, v1 = nowSec, updates v2 = targetSec, v5 = activeIdx, v6 = nextIdx
  function prayerStepCheckBytes(p) {
    const activeForP = p === 0 ? 5 : p - 1;
    return [
      0xd8, 0x03, 0x08, p & 0xff, // add-int/lit8 v3, v8, p
      0x71, 0x10, ...u16(mGetSec), 0x03, 0x00, // invoke-static {v3}, getSec(I)I
      0x0a, 0x04, // move-result v4
      0x35, 0x41, 0x05, 0x00, // if-ge v1, v4, +5 code units
      0x01, 0x42, // move v2, v4 (targetSec = v4)
      0x12, ((activeForP & 0x0f) << 4) | 0x05, // const/4 v5, activeForP
      0x12, ((p & 0x0f) << 4) | 0x06, // const/4 v6, p
    ];
  }

  const numDays = scheduleDays.length; // 89 days (12 Oct 2026 — 8 Jan 2027)
  const nextLabelBase = numDays * 7; // 89 headers + 89*6 times = 623

  // Helper for updating each card p (0..5):
  // Sets prayer time text on (0x7f040050 + p) and calls styleCard(v0, p, state, v11)
  function cardUpdateBytes(p) {
    const strOffset = numDays + p;
    return [
      0xd8, 0x03, 0x08, strOffset & 0xff, // add-int/lit8 v3, v8, (numDays + p)
      0x71, 0x10, ...u16(mGetStr), 0x03, 0x00, // invoke-static {v3}, getStr(I)String
      0x0c, 0x03, // move-result-object v3
      0x14, 0x04, (0x50 + p) & 0xff, 0x00, 0x04, 0x7f, // const v4, (0x7f040050 + p)
      0x6e, 0x30, ...u16(mSetTextViewText), 0x40, 0x03, // invoke-virtual {v0, v4, v3}, setTextViewText
      // Compute state in v4: 0=normal, 1=active (p == v5), 2=next (p == v6)
      0x12, ((p & 0x0f) << 4) | 0x03, // const/4 v3, p
      0x12, 0x04, // const/4 v4, 0
      0x33, 0x53, 0x03, 0x00, // if-ne v3, v5, +3
      0x12, 0x14, // const/4 v4, 1 (active)
      0x33, 0x63, 0x03, 0x00, // if-ne v3, v6, +3
      0x12, 0x24, // const/4 v4, 2 (next)
      0x71, 0x40, ...u16(mStyleCard), 0x30, 0xb4, // invoke-static {v0, v3, v4, v11}, styleCard
    ];
  }

  const widgetBuildViewsCodeItem = makeCodeItem(
    12,
    2,
    6,
    Buffer.from([
      // 1. Create PendingIntent to MainActivity (stored in v9)
      0x22, 0x00, ...u16(tIntent),
      0x1c, 0x01, ...u16(tMainActivity),
      0x70, 0x30, ...u16(mIntentInitCtxCls), 0xa0, 0x01,
      0x12, 0x01,
      0x15, 0x02, 0x00, 0x0c,
      0x71, 0x40, ...u16(mPendingIntentGetActivity), 0x1a, 0x20,
      0x0c, 0x09,

      // 2. Create RemoteViews (stored in v0) and setOnClickPendingIntent on @android:id/background
      0x6e, 0x10, ...u16(mGetPackageName), 0x0a, 0x00,
      0x0c, 0x01,
      0x22, 0x00, ...u16(tRemoteViews),
      0x70, 0x30, ...u16(mRemoteViewsInit), 0x10, 0x0b,
      0x14, 0x01, 0x00, 0x00, 0x02, 0x01,
      0x6e, 0x30, ...u16(mSetOnClickPendingIntent), 0x10, 0x09,

      // 3. Get Ufa Calendar (GMT+05:00) in v9
      0x1a, 0x01, ...u16(sGmtPlus5),
      0x71, 0x10, ...u16(mGetTimeZone), 0x01, 0x00,
      0x0c, 0x01,
      0x71, 0x10, ...u16(mCalendarGetInstanceTz), 0x01, 0x00,
      0x0c, 0x09,

      // 4. Read month (1..12) in v1 and day (1..31) in v2, compute dayIdx (0..88) in v7
      0x12, 0x21, // const/4 v1, 2 (Calendar.MONTH)
      0x6e, 0x20, ...u16(mCalendarGet), 0x19, 0x00,
      0x0a, 0x01,
      0xd8, 0x01, 0x01, 0x01, // add-int/lit8 v1, v1, 1
      0x12, 0x52, // const/4 v2, 5 (Calendar.DAY_OF_MONTH)
      0x6e, 0x20, ...u16(mCalendarGet), 0x29, 0x00,
      0x0a, 0x02,
      // Default dayIdx = day + 19 (November or any same-day fallback)
      0xd8, 0x07, 0x02, 0x13, // add-int/lit8 v7, v2, 19
      // If month == 10 (October): dayIdx = day - 12
      0x13, 0x03, 0x0a, 0x00, // const/16 v3, 10
      0x33, 0x31, 0x04, 0x00, // if-ne v1, v3, +4
      0xd8, 0x07, 0x02, 0xf4, // add-int/lit8 v7, v2, -12
      // If month == 12 (December): dayIdx = day + 49
      0x13, 0x03, 0x0c, 0x00, // const/16 v3, 12
      0x33, 0x31, 0x04, 0x00, // if-ne v1, v3, +4
      0xd8, 0x07, 0x02, 0x31, // add-int/lit8 v7, v2, 49
      // If month == 1 (January): dayIdx = day + 80
      0x12, 0x13, // const/4 v3, 1
      0x33, 0x31, 0x04, 0x00, // if-ne v1, v3, +4
      0xd8, 0x07, 0x02, 0x50, // add-int/lit8 v7, v2, 80
      // Clamp dayIdx (v7) to 0..(numDays - 1)
      0x3b, 0x07, 0x03, 0x00, // if-gez v7, +3
      0x12, 0x07, // const/4 v7, 0
      0x13, 0x03, (numDays - 1) & 0xff, 0x00, // const/16 v3, 88
      0x37, 0x37, 0x04, 0x00, // if-le v7, v3, +4
      0x13, 0x07, 0x1c, 0x00, // const/16 v7, 28 (9 ноя)

      // 5. Update Header Date & Hijri TextView (0x7f040001)
      0x71, 0x10, ...u16(mGetStr), 0x07, 0x00,
      0x0c, 0x02,
      0x14, 0x03, 0x01, 0x00, 0x04, 0x7f, // const v3, 0x7f040001
      0x6e, 0x30, ...u16(mSetTextViewText), 0x30, 0x02,

      // 6. Compute nowSec (v1) in Ufa time
      0x13, 0x01, 0x0b, 0x00, // HOUR_OF_DAY
      0x6e, 0x20, ...u16(mCalendarGet), 0x19, 0x00,
      0x0a, 0x01,
      0xd2, 0x11, 0x10, 0x0e, // * 3600
      0x13, 0x02, 0x0c, 0x00, // MINUTE
      0x6e, 0x20, ...u16(mCalendarGet), 0x29, 0x00,
      0x0a, 0x02,
      0xda, 0x02, 0x02, 0x3c, // * 60
      0xb0, 0x21,
      0x13, 0x02, 0x0d, 0x00, // SECOND
      0x6e, 0x20, ...u16(mCalendarGet), 0x29, 0x00,
      0x0a, 0x02,
      0xb0, 0x21, // v1 = nowSec

      // 7. Determine activeIdx (v5), nextIdx (v6), targetSec (v2)
      0xda, 0x08, 0x07, 0x06, // mul-int/lit8 v8, v7, 6 (base index for today)
      // Default (after Isha): activeIdx=5, nextIdx=0, targetSec = 86400 + tomorrow Fajr
      0x12, 0x55, // const/4 v5, 5
      0x12, 0x06, // const/4 v6, 0
      0xd8, 0x03, 0x07, 0x01, // add-int/lit8 v3, v7, 1
      0xdc, 0x03, 0x03, numDays & 0xff, // rem-int/lit8 v3, v3, 89
      0xda, 0x03, 0x03, 0x06, // mul-int/lit8 v3, v3, 6
      0x71, 0x10, ...u16(mGetSec), 0x03, 0x00,
      0x0a, 0x02,
      0x14, 0x03, ...u32(86400),
      0xb0, 0x32, // add-int/2addr v2, v3 (v2 = 86400 + tomorrowFajrSec)
      ...prayerStepCheckBytes(5),
      ...prayerStepCheckBytes(4),
      ...prayerStepCheckBytes(3),
      ...prayerStepCheckBytes(2),
      ...prayerStepCheckBytes(1),
      ...prayerStepCheckBytes(0),

      // 8. Update all 6 Prayer Cards (times + active/next/normal styling)
      ...cardUpdateBytes(0),
      ...cardUpdateBytes(1),
      ...cardUpdateBytes(2),
      ...cardUpdateBytes(3),
      ...cardUpdateBytes(4),
      ...cardUpdateBytes(5),

      // 9. Update next prayer label (@android:id/text1 = 0x01020014) -> getStr(nextLabelBase + nextIdx)
      0xd0, 0x63, ...u16(nextLabelBase), // add-int/lit16 v3, v6, 623
      0x71, 0x10, ...u16(mGetStr), 0x03, 0x00,
      0x0c, 0x03,
      0x14, 0x04, 0x14, 0x00, 0x02, 0x01, // const v4, 0x01020014
      0x6e, 0x30, ...u16(mSetTextViewText), 0x40, 0x03,

      // 10. Compute baseMillis = SystemClock.elapsedRealtime() + (targetSec - nowSec) * 1000L in (v2, v3)
      0xb1, 0x12, // sub-int/2addr v2, v1
      0xd2, 0x22, 0xe8, 0x03, // mul-int/lit16 v2, v2, 1000
      0x81, 0x22, // int-to-long v2, v2 (v2, v3)
      0x71, 0x00, ...u16(mElapsedRealtime), 0x00, 0x00,
      0x0b, 0x06, // move-result-wide v6 (v6, v7)
      0xbb, 0x62, // add-long/2addr v2, v6

      // 11. Start live countdown on Chronometer (@android:id/text2 = 0x01020015)
      0x14, 0x01, 0x15, 0x00, 0x02, 0x01, // const v1, 0x01020015
      0x12, 0x04, // const/4 v4, 0 (null format)
      0x12, 0x15, // const/4 v5, 1 (true)
      0x6e, 0x30, ...u16(mSetChronometerCountDown), 0x10, 0x05,
      0x74, 0x06, ...u16(mSetChronometer), 0x00, 0x00,
      0x11, 0x00, // return-object v0
    ])
  );

  // 9. PrayerWidgetProvider.onReceive(Context v4, Intent v5)V
  // Calls super.onReceive(v4, v5) and then refreshes all instances of PrayerWidgetProvider
  const mSuperOnReceive = methodIdx(
    'Landroid/appwidget/AppWidgetProvider;',
    'onReceive',
    'V',
    ['Landroid/content/Context;', 'Landroid/content/Intent;']
  );
  const mAppWidgetGetInstance = methodIdx(
    'Landroid/appwidget/AppWidgetManager;',
    'getInstance',
    'Landroid/appwidget/AppWidgetManager;',
    ['Landroid/content/Context;']
  );
  const tComponentName = typeIdx('Landroid/content/ComponentName;');
  const tPrayerWidgetProvider = typeIdx('Lcom/example/interactivereader/PrayerWidgetProvider;');
  const tPrayerWidgetFrostedProvider = typeIdx(
    'Lcom/example/interactivereader/PrayerWidgetFrostedProvider;'
  );
  const mComponentNameInit = methodIdx(
    'Landroid/content/ComponentName;',
    '<init>',
    'V',
    ['Landroid/content/Context;', 'Ljava/lang/Class;']
  );
  const mGetAppWidgetIds = methodIdx(
    'Landroid/appwidget/AppWidgetManager;',
    'getAppWidgetIds',
    '[I',
    ['Landroid/content/ComponentName;']
  );
  const mProviderOnUpdate = methodIdx(
    'Lcom/example/interactivereader/PrayerWidgetProvider;',
    'onUpdate',
    'V',
    ['Landroid/content/Context;', 'Landroid/appwidget/AppWidgetManager;', '[I']
  );
  const mFrostedOnUpdate = methodIdx(
    'Lcom/example/interactivereader/PrayerWidgetFrostedProvider;',
    'onUpdate',
    'V',
    ['Landroid/content/Context;', 'Landroid/appwidget/AppWidgetManager;', '[I']
  );

  const widgetOnReceiveCodeItem = makeCodeItem(
    6,
    3,
    4,
    Buffer.from([
      0x6f, 0x30, ...u16(mSuperOnReceive), 0x43, 0x05,
      0x71, 0x10, ...u16(mAppWidgetGetInstance), 0x04, 0x00,
      0x0c, 0x00, // v0 = AppWidgetManager
      0x22, 0x01, ...u16(tComponentName),
      0x1c, 0x02, ...u16(tPrayerWidgetProvider),
      0x70, 0x30, ...u16(mComponentNameInit), 0x41, 0x02,
      0x6e, 0x20, ...u16(mGetAppWidgetIds), 0x10, 0x00,
      0x0c, 0x01, // v1 = int[] appWidgetIds
      0x6e, 0x40, ...u16(mProviderOnUpdate), 0x43, 0x10,
      0x0e, 0x00,
    ])
  );

  // 10. PrayerWidgetProvider.onUpdate(Context v4, AppWidgetManager v5, int[] v6)V
  const mGetSharedPreferences = methodIdx(
    'Landroid/content/Context;',
    'getSharedPreferences',
    'Landroid/content/SharedPreferences;',
    ['Ljava/lang/String;', 'I']
  );
  const mPrefsGetInt = methodIdx(
    'Landroid/content/SharedPreferences;',
    'getInt',
    'I',
    ['Ljava/lang/String;', 'I']
  );
  const sWidgetPrefs = strIdx('widget_prefs');
  const sTheme = strIdx('theme');
  const mBuildViews = methodIdx(
    'Lcom/example/interactivereader/PrayerWidgetProvider;',
    'buildViews',
    'Landroid/widget/RemoteViews;',
    ['Landroid/content/Context;', 'I']
  );
  const mUpdateAppWidgetArr = methodIdx(
    'Landroid/appwidget/AppWidgetManager;',
    'updateAppWidget',
    'V',
    ['[I', 'Landroid/widget/RemoteViews;']
  );

  const widgetOnUpdateCodeItem = makeCodeItem(
    7,
    4,
    3,
    Buffer.from([
      0x1a, 0x00, ...u16(sWidgetPrefs),
      0x12, 0x01,
      0x6e, 0x30, ...u16(mGetSharedPreferences), 0x04, 0x01,
      0x0c, 0x00,
      0x1a, 0x01, ...u16(sTheme),
      0x14, 0x02, 0x00, 0x00, 0x02, 0x7f,
      0x72, 0x30, ...u16(mPrefsGetInt), 0x10, 0x02,
      0x0a, 0x02,
      0x71, 0x20, ...u16(mBuildViews), 0x24, 0x00,
      0x0c, 0x00,
      0x6e, 0x30, ...u16(mUpdateAppWidgetArr), 0x65, 0x00,
      0x0e, 0x00,
    ])
  );

  // 11. PrayerWidgetFrostedProvider.<init>()V
  const frostedInitCodeItem = makeCodeItem(
    1,
    1,
    1,
    Buffer.from([0x70, 0x10, ...u16(mWidgetSuperInit), 0x00, 0x00, 0x0e, 0x00])
  );

  // 12. PrayerWidgetFrostedProvider.onReceive(Context v4, Intent v5)V
  const frostedOnReceiveCodeItem = makeCodeItem(
    6,
    3,
    4,
    Buffer.from([
      0x6f, 0x30, ...u16(mSuperOnReceive), 0x43, 0x05,
      0x71, 0x10, ...u16(mAppWidgetGetInstance), 0x04, 0x00,
      0x0c, 0x00,
      0x22, 0x01, ...u16(tComponentName),
      0x1c, 0x02, ...u16(tPrayerWidgetFrostedProvider),
      0x70, 0x30, ...u16(mComponentNameInit), 0x41, 0x02,
      0x6e, 0x20, ...u16(mGetAppWidgetIds), 0x10, 0x00,
      0x0c, 0x01,
      0x6e, 0x40, ...u16(mFrostedOnUpdate), 0x43, 0x10,
      0x0e, 0x00,
    ])
  );

  // 13. PrayerWidgetFrostedProvider.onUpdate(Context v4, AppWidgetManager v5, int[] v6)V
  const frostedOnUpdateCodeItem = makeCodeItem(
    7,
    4,
    3,
    Buffer.from([
      0x14, 0x02, 0x01, 0x00, 0x02, 0x7f, // const v2, 0x7f020001 (@layout/prayer_widget_frosted)
      0x71, 0x20, ...u16(mBuildViews), 0x24, 0x00,
      0x0c, 0x00,
      0x6e, 0x30, ...u16(mUpdateAppWidgetArr), 0x65, 0x00,
      0x0e, 0x00,
    ])
  );

  // 14. WidgetConfigActivity.<init>()V
  const configInitCodeItem = makeCodeItem(
    1,
    1,
    1,
    Buffer.from([0x70, 0x10, ...u16(mActivityInit), 0x00, 0x00, 0x0e, 0x00])
  );

  // 15. WidgetConfigActivity.onClick(View)V
  const mViewGetId = methodIdx('Landroid/view/View;', 'getId', 'I');
  const mPrefsEdit = methodIdx(
    'Landroid/content/SharedPreferences;',
    'edit',
    'Landroid/content/SharedPreferences$Editor;'
  );
  const mEditorPutInt = methodIdx(
    'Landroid/content/SharedPreferences$Editor;',
    'putInt',
    'Landroid/content/SharedPreferences$Editor;',
    ['Ljava/lang/String;', 'I']
  );
  const mEditorCommit = methodIdx('Landroid/content/SharedPreferences$Editor;', 'commit', 'Z');
  const mUpdateAppWidgetSingle = methodIdx(
    'Landroid/appwidget/AppWidgetManager;',
    'updateAppWidget',
    'V',
    ['I', 'Landroid/widget/RemoteViews;']
  );
  const mIntentInitEmpty = methodIdx('Landroid/content/Intent;', '<init>', 'V');
  const sAppWidgetId = strIdx('appWidgetId');
  const mIntentPutExtra = methodIdx(
    'Landroid/content/Intent;',
    'putExtra',
    'Landroid/content/Intent;',
    ['Ljava/lang/String;', 'I']
  );
  const mSetResultIntent = methodIdx('Landroid/app/Activity;', 'setResult', 'V', [
    'I',
    'Landroid/content/Intent;',
  ]);
  const mActivityFinish = methodIdx('Landroid/app/Activity;', 'finish', 'V');

  const configOnClickCodeItem = makeCodeItem(
    7,
    2,
    3,
    Buffer.from([
      0x6e, 0x10, ...u16(mViewGetId), 0x06, 0x00,
      0x0a, 0x00,
      0x14, 0x01, 0x1a, 0x00, 0x02, 0x01,
      0x14, 0x04, 0x00, 0x00, 0x02, 0x7f,
      0x33, 0x10, 0x05, 0x00,
      0x14, 0x04, 0x01, 0x00, 0x02, 0x7f,
      0x1a, 0x00, ...u16(sWidgetPrefs),
      0x12, 0x01,
      0x6e, 0x30, ...u16(mGetSharedPreferences), 0x05, 0x01,
      0x0c, 0x00,
      0x72, 0x10, ...u16(mPrefsEdit), 0x00, 0x00,
      0x0c, 0x00,
      0x1a, 0x01, ...u16(sTheme),
      0x72, 0x30, ...u16(mEditorPutInt), 0x10, 0x04,
      0x0c, 0x00,
      0x72, 0x10, ...u16(mEditorCommit), 0x00, 0x00,
      0x71, 0x20, ...u16(mBuildViews), 0x45, 0x00,
      0x0c, 0x00,
      0x71, 0x10, ...u16(mAppWidgetGetInstance), 0x05, 0x00,
      0x0c, 0x01,
      0x52, 0x52, ...u16(fAppWidgetId),
      0x6e, 0x30, ...u16(mUpdateAppWidgetSingle), 0x21, 0x00,
      0x22, 0x00, ...u16(tIntent),
      0x70, 0x10, ...u16(mIntentInitEmpty), 0x00, 0x00,
      0x1a, 0x01, ...u16(sAppWidgetId),
      0x6e, 0x30, ...u16(mIntentPutExtra), 0x10, 0x02,
      0x12, 0xf1,
      0x6e, 0x30, ...u16(mSetResultIntent), 0x15, 0x00,
      0x6e, 0x10, ...u16(mActivityFinish), 0x05, 0x00,
      0x0e, 0x00,
    ])
  );

  // 16. WidgetConfigActivity.onCreate(Bundle)V
  const mSetResultInt = methodIdx('Landroid/app/Activity;', 'setResult', 'V', ['I']);
  const mGetIntent = methodIdx(
    'Landroid/app/Activity;',
    'getIntent',
    'Landroid/content/Intent;'
  );
  const mGetIntExtra = methodIdx('Landroid/content/Intent;', 'getIntExtra', 'I', [
    'Ljava/lang/String;',
    'I',
  ]);
  const mSetContentViewInt = methodIdx('Landroid/app/Activity;', 'setContentView', 'V', ['I']);
  const mFindViewById = methodIdx(
    'Landroid/app/Activity;',
    'findViewById',
    'Landroid/view/View;',
    ['I']
  );
  const mSetOnClickListener = methodIdx(
    'Landroid/view/View;',
    'setOnClickListener',
    'V',
    ['Landroid/view/View$OnClickListener;']
  );

  const configOnCreateCodeItem = makeCodeItem(
    5,
    2,
    3,
    Buffer.from([
      0x6f, 0x20, ...u16(mActivityOnCreate), 0x43, 0x00,
      0x12, 0x00,
      0x6e, 0x20, ...u16(mSetResultInt), 0x03, 0x00,
      0x6e, 0x10, ...u16(mGetIntent), 0x03, 0x00,
      0x0c, 0x00,
      0x1a, 0x01, ...u16(sAppWidgetId),
      0x12, 0x02,
      0x6e, 0x30, ...u16(mGetIntExtra), 0x10, 0x02,
      0x0a, 0x00,
      0x59, 0x30, ...u16(fAppWidgetId),
      0x14, 0x00, 0x02, 0x00, 0x02, 0x7f,
      0x6e, 0x20, ...u16(mSetContentViewInt), 0x03, 0x00,
      0x14, 0x00, 0x19, 0x00, 0x02, 0x01,
      0x6e, 0x20, ...u16(mFindViewById), 0x03, 0x00,
      0x0c, 0x00,
      0x6e, 0x20, ...u16(mSetOnClickListener), 0x30, 0x00,
      0x14, 0x00, 0x1a, 0x00, 0x02, 0x01,
      0x6e, 0x20, ...u16(mFindViewById), 0x03, 0x00,
      0x0c, 0x00,
      0x6e, 0x20, ...u16(mSetOnClickListener), 0x30, 0x00,
      0x0e, 0x00,
    ])
  );

  const headerSize = 0x70;
  const stringIdsOff = headerSize;
  const typeIdsOff = stringIdsOff + strings.length * 4;
  const protoIdsOff = typeIdsOff + typeIds.length * 4;
  const fieldIdsOff = protoIdsOff + protos.length * 12;
  const methodIdsOff = fieldIdsOff + fields.length * 8;
  const classDefsOff = methodIdsOff + methods.length * 8;
  const dataOff = classDefsOff + 4 * 32;

  const typeListsOff = dataOff;
  const uniqueTypeLists = [];
  const typeListOffsetMap = new Map();
  let curTypeListOff = typeListsOff;

  function registerTypeList(typeIdxArray) {
    if (typeIdxArray.length === 0) return 0;
    const key = typeIdxArray.join(',');
    if (!typeListOffsetMap.has(key)) {
      typeListOffsetMap.set(key, curTypeListOff);
      const pad = typeIdxArray.length % 2 === 1 ? 2 : 0;
      const buf = Buffer.alloc(4 + typeIdxArray.length * 2 + pad, 0);
      buf.writeUInt32LE(typeIdxArray.length, 0);
      typeIdxArray.forEach((t, i) => buf.writeUInt16LE(t, 4 + i * 2));
      uniqueTypeLists.push(buf);
      curTypeListOff += buf.length;
    }
    return typeListOffsetMap.get(key);
  }

  for (const p of protos) {
    p.parametersOff = registerTypeList(p.paramTypes);
  }
  const configInterfacesOff = registerTypeList([typeIdx('Landroid/view/View$OnClickListener;')]);

  const typeListsBuf = Buffer.concat(uniqueTypeLists);

  // Code items
  const codeItem1Off = curTypeListOff;
  const codeItem2Off = codeItem1Off + initCodeItem.length;
  const codeItem3Off = codeItem2Off + onBackPressedCodeItem.length;
  const codeItem4Off = codeItem3Off + onCreateCodeItem.length;
  const codeItem5Off = codeItem4Off + widgetInitCodeItem.length;
  const codeItem6Off = codeItem5Off + widgetBuildViewsCodeItem.length;
  const codeItem7Off = codeItem6Off + getSecCodeItem.length;
  const codeItem8Off = codeItem7Off + getStrCodeItem.length;
  const codeItem9Off = codeItem8Off + styleCardCodeItem.length;
  const codeItem10Off = codeItem9Off + widgetOnReceiveCodeItem.length;
  const codeItem11Off = codeItem10Off + widgetOnUpdateCodeItem.length;
  const codeItem12Off = codeItem11Off + frostedInitCodeItem.length;
  const codeItem13Off = codeItem12Off + frostedOnReceiveCodeItem.length;
  const codeItem14Off = codeItem13Off + frostedOnUpdateCodeItem.length;
  const codeItem15Off = codeItem14Off + configInitCodeItem.length;
  const codeItem16Off = codeItem15Off + configOnClickCodeItem.length;
  const afterCodeOff = codeItem16Off + configOnCreateCodeItem.length;

  const codeItemsBuf = Buffer.concat([
    initCodeItem,
    onBackPressedCodeItem,
    onCreateCodeItem,
    widgetInitCodeItem,
    widgetBuildViewsCodeItem,
    getSecCodeItem,
    getStrCodeItem,
    styleCardCodeItem,
    widgetOnReceiveCodeItem,
    widgetOnUpdateCodeItem,
    frostedInitCodeItem,
    frostedOnReceiveCodeItem,
    frostedOnUpdateCodeItem,
    configInitCodeItem,
    configOnClickCodeItem,
    configOnCreateCodeItem,
  ]);

  // String Data Items
  const stringDataItems = [];
  const stringDataOffsets = [];
  let curStrOff = afterCodeOff;
  for (const s of strings) {
    stringDataOffsets.push(curStrOff);
    const utf8Buf = Buffer.from(s, 'utf8');
    const lenLeb = uleb128(s.length);
    const item = Buffer.concat([lenLeb, utf8Buf, Buffer.from([0x00])]);
    stringDataItems.push(item);
    curStrOff += item.length;
  }
  const stringDataBuf = Buffer.concat(stringDataItems);

  // Class Data Items
  // 1) MainActivity
  const mMainInit = methodIdx('Lcom/example/interactivereader/MainActivity;', '<init>', 'V');
  const mMainOnBack = methodIdx(
    'Lcom/example/interactivereader/MainActivity;',
    'onBackPressed',
    'V'
  );
  const mMainOnCreate = methodIdx(
    'Lcom/example/interactivereader/MainActivity;',
    'onCreate',
    'V',
    ['Landroid/os/Bundle;']
  );

  const classData1Off = curStrOff;
  const classData1Buf = Buffer.concat([
    uleb128(0),
    uleb128(1),
    uleb128(1),
    uleb128(2),
    uleb128(fWebView),
    uleb128(0x0002),
    uleb128(mMainInit),
    uleb128(0x10001),
    uleb128(codeItem1Off),
    uleb128(mMainOnBack),
    uleb128(0x0001),
    uleb128(codeItem2Off),
    uleb128(mMainOnCreate - mMainOnBack),
    uleb128(0x0004),
    uleb128(codeItem3Off),
  ]);

  // 2) PrayerWidgetFrostedProvider
  const mFrostedInit = methodIdx(
    'Lcom/example/interactivereader/PrayerWidgetFrostedProvider;',
    '<init>',
    'V'
  );
  const mFrostedOnReceive = methodIdx(
    'Lcom/example/interactivereader/PrayerWidgetFrostedProvider;',
    'onReceive',
    'V',
    ['Landroid/content/Context;', 'Landroid/content/Intent;']
  );

  const classData2Off = classData1Off + classData1Buf.length;
  const classData2Buf = Buffer.concat([
    uleb128(0),
    uleb128(0),
    uleb128(1),
    uleb128(2),
    uleb128(mFrostedInit),
    uleb128(0x10001),
    uleb128(codeItem11Off),
    uleb128(mFrostedOnReceive),
    uleb128(0x0001),
    uleb128(codeItem12Off),
    uleb128(mFrostedOnUpdate - mFrostedOnReceive),
    uleb128(0x0001),
    uleb128(codeItem13Off),
  ]);

  // 3) PrayerWidgetProvider
  // Direct methods (sorted by methodIdx): <init>, buildViews, getSec, getStr, styleCard
  // Virtual methods (sorted by methodIdx): onReceive, onUpdate
  const mWidgetInit = methodIdx(
    'Lcom/example/interactivereader/PrayerWidgetProvider;',
    '<init>',
    'V'
  );
  const directMethodsWidget = [
    { idx: mWidgetInit, flags: 0x10001, off: codeItem4Off },
    { idx: mBuildViews, flags: 0x0009, off: codeItem5Off },
    { idx: mGetSec, flags: 0x0009, off: codeItem6Off },
    { idx: mGetStr, flags: 0x0009, off: codeItem7Off },
    { idx: mStyleCard, flags: 0x0009, off: codeItem8Off },
  ].sort((a, b) => a.idx - b.idx);

  const virtualMethodsWidget = [
    { idx: methodIdx('Lcom/example/interactivereader/PrayerWidgetProvider;', 'onReceive', 'V', ['Landroid/content/Context;', 'Landroid/content/Intent;']), flags: 0x0001, off: codeItem9Off },
    { idx: mProviderOnUpdate, flags: 0x0001, off: codeItem10Off },
  ].sort((a, b) => a.idx - b.idx);

  const classData3Parts = [
    uleb128(0),
    uleb128(0),
    uleb128(directMethodsWidget.length),
    uleb128(virtualMethodsWidget.length),
  ];
  directMethodsWidget.forEach((m, i) => {
    const diff = i === 0 ? m.idx : m.idx - directMethodsWidget[i - 1].idx;
    classData3Parts.push(uleb128(diff), uleb128(m.flags), uleb128(m.off));
  });
  virtualMethodsWidget.forEach((m, i) => {
    const diff = i === 0 ? m.idx : m.idx - virtualMethodsWidget[i - 1].idx;
    classData3Parts.push(uleb128(diff), uleb128(m.flags), uleb128(m.off));
  });

  const classData3Off = classData2Off + classData2Buf.length;
  const classData3Buf = Buffer.concat(classData3Parts);

  // 4) WidgetConfigActivity
  const mConfigInit = methodIdx(
    'Lcom/example/interactivereader/WidgetConfigActivity;',
    '<init>',
    'V'
  );
  const mConfigOnClick = methodIdx(
    'Lcom/example/interactivereader/WidgetConfigActivity;',
    'onClick',
    'V',
    ['Landroid/view/View;']
  );
  const mConfigOnCreate = methodIdx(
    'Lcom/example/interactivereader/WidgetConfigActivity;',
    'onCreate',
    'V',
    ['Landroid/os/Bundle;']
  );

  const classData4Off = classData3Off + classData3Buf.length;
  const classData4Buf = Buffer.concat([
    uleb128(0),
    uleb128(1),
    uleb128(1),
    uleb128(2),
    uleb128(fAppWidgetId),
    uleb128(0x0002),
    uleb128(mConfigInit),
    uleb128(0x10001),
    uleb128(codeItem14Off),
    uleb128(mConfigOnClick),
    uleb128(0x0001),
    uleb128(codeItem15Off),
    uleb128(mConfigOnCreate - mConfigOnClick),
    uleb128(0x0004),
    uleb128(codeItem16Off),
  ]);

  let curOff = classData4Off + classData4Buf.length;
  const mapAlignPad = (4 - (curOff % 4)) % 4;
  const mapAlignBuf = Buffer.alloc(mapAlignPad, 0);
  const mapListOff = curOff + mapAlignPad;

  const mapEntries = [
    { type: 0x0000, size: 1, offset: 0 },
    { type: 0x0001, size: strings.length, offset: stringIdsOff },
    { type: 0x0002, size: typeIds.length, offset: typeIdsOff },
    { type: 0x0003, size: protos.length, offset: protoIdsOff },
    { type: 0x0004, size: fields.length, offset: fieldIdsOff },
    { type: 0x0005, size: methods.length, offset: methodIdsOff },
    { type: 0x0006, size: 4, offset: classDefsOff },
    { type: 0x1001, size: uniqueTypeLists.length, offset: typeListsOff },
    { type: 0x2001, size: 16, offset: codeItem1Off },
    { type: 0x2002, size: strings.length, offset: afterCodeOff },
    { type: 0x2000, size: 4, offset: classData1Off },
    { type: 0x1000, size: 1, offset: mapListOff },
  ];

  const mapListBuf = Buffer.alloc(4 + mapEntries.length * 12, 0);
  mapListBuf.writeUInt32LE(mapEntries.length, 0);
  mapEntries.forEach((m, i) => {
    const base = 4 + i * 12;
    mapListBuf.writeUInt16LE(m.type, base);
    mapListBuf.writeUInt16LE(0, base + 2);
    mapListBuf.writeUInt32LE(m.size, base + 4);
    mapListBuf.writeUInt32LE(m.offset, base + 8);
  });

  const fileSize = mapListOff + mapListBuf.length;
  const dexBuf = Buffer.alloc(fileSize, 0);

  stringDataOffsets.forEach((off, i) => dexBuf.writeUInt32LE(off, stringIdsOff + i * 4));
  typeIds.forEach((sIdx, i) => dexBuf.writeUInt32LE(sIdx, typeIdsOff + i * 4));
  protos.forEach((p, i) => {
    const base = protoIdsOff + i * 12;
    dexBuf.writeUInt32LE(p.shortyIdx, base);
    dexBuf.writeUInt32LE(p.returnTypeIdx, base + 4);
    dexBuf.writeUInt32LE(p.parametersOff, base + 8);
  });
  fields.forEach((f, i) => {
    const base = fieldIdsOff + i * 8;
    dexBuf.writeUInt16LE(f.classIdx, base);
    dexBuf.writeUInt16LE(f.typeIdx, base + 2);
    dexBuf.writeUInt32LE(f.nameIdx, base + 4);
  });
  methods.forEach((m, i) => {
    const base = methodIdsOff + i * 8;
    dexBuf.writeUInt16LE(m.classIdx, base);
    dexBuf.writeUInt16LE(m.protoIdx, base + 2);
    dexBuf.writeUInt32LE(m.nameIdx, base + 4);
  });

  // Class Defs
  dexBuf.writeUInt32LE(typeIdx('Lcom/example/interactivereader/MainActivity;'), classDefsOff);
  dexBuf.writeUInt32LE(0x0001, classDefsOff + 4);
  dexBuf.writeUInt32LE(typeIdx('Landroid/app/Activity;'), classDefsOff + 8);
  dexBuf.writeUInt32LE(0, classDefsOff + 12);
  dexBuf.writeUInt32LE(0xffffffff, classDefsOff + 16);
  dexBuf.writeUInt32LE(0, classDefsOff + 20);
  dexBuf.writeUInt32LE(classData1Off, classDefsOff + 24);
  dexBuf.writeUInt32LE(0, classDefsOff + 28);

  const classDef2Off = classDefsOff + 32;
  dexBuf.writeUInt32LE(
    typeIdx('Lcom/example/interactivereader/PrayerWidgetFrostedProvider;'),
    classDef2Off
  );
  dexBuf.writeUInt32LE(0x0001, classDef2Off + 4);
  dexBuf.writeUInt32LE(typeIdx('Landroid/appwidget/AppWidgetProvider;'), classDef2Off + 8);
  dexBuf.writeUInt32LE(0, classDef2Off + 12);
  dexBuf.writeUInt32LE(0xffffffff, classDef2Off + 16);
  dexBuf.writeUInt32LE(0, classDef2Off + 20);
  dexBuf.writeUInt32LE(classData2Off, classDef2Off + 24);
  dexBuf.writeUInt32LE(0, classDef2Off + 28);

  const classDef3Off = classDefsOff + 64;
  dexBuf.writeUInt32LE(
    typeIdx('Lcom/example/interactivereader/PrayerWidgetProvider;'),
    classDef3Off
  );
  dexBuf.writeUInt32LE(0x0001, classDef3Off + 4);
  dexBuf.writeUInt32LE(typeIdx('Landroid/appwidget/AppWidgetProvider;'), classDef3Off + 8);
  dexBuf.writeUInt32LE(0, classDef3Off + 12);
  dexBuf.writeUInt32LE(0xffffffff, classDef3Off + 16);
  dexBuf.writeUInt32LE(0, classDef3Off + 20);
  dexBuf.writeUInt32LE(classData3Off, classDef3Off + 24);
  dexBuf.writeUInt32LE(0, classDef3Off + 28);

  const classDef4Off = classDefsOff + 96;
  dexBuf.writeUInt32LE(
    typeIdx('Lcom/example/interactivereader/WidgetConfigActivity;'),
    classDef4Off
  );
  dexBuf.writeUInt32LE(0x0001, classDef4Off + 4);
  dexBuf.writeUInt32LE(typeIdx('Landroid/app/Activity;'), classDef4Off + 8);
  dexBuf.writeUInt32LE(configInterfacesOff, classDef4Off + 12);
  dexBuf.writeUInt32LE(0xffffffff, classDef4Off + 16);
  dexBuf.writeUInt32LE(0, classDef4Off + 20);
  dexBuf.writeUInt32LE(classData4Off, classDef4Off + 24);
  dexBuf.writeUInt32LE(0, classDef4Off + 28);

  const dataSectionBuf = Buffer.concat([
    typeListsBuf,
    codeItemsBuf,
    stringDataBuf,
    classData1Buf,
    classData2Buf,
    classData3Buf,
    classData4Buf,
    mapAlignBuf,
    mapListBuf,
  ]);
  dataSectionBuf.copy(dexBuf, dataOff);

  Buffer.from([0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00]).copy(dexBuf, 0);
  dexBuf.writeUInt32LE(fileSize, 32);
  dexBuf.writeUInt32LE(0x70, 36);
  dexBuf.writeUInt32LE(0x12345678, 40);
  dexBuf.writeUInt32LE(0, 44);
  dexBuf.writeUInt32LE(0, 48);
  dexBuf.writeUInt32LE(mapListOff, 52);
  dexBuf.writeUInt32LE(strings.length, 56);
  dexBuf.writeUInt32LE(stringIdsOff, 60);
  dexBuf.writeUInt32LE(typeIds.length, 64);
  dexBuf.writeUInt32LE(typeIdsOff, 68);
  dexBuf.writeUInt32LE(protos.length, 72);
  dexBuf.writeUInt32LE(protoIdsOff, 76);
  dexBuf.writeUInt32LE(fields.length, 80);
  dexBuf.writeUInt32LE(fieldIdsOff, 84);
  dexBuf.writeUInt32LE(methods.length, 88);
  dexBuf.writeUInt32LE(methodIdsOff, 92);
  dexBuf.writeUInt32LE(4, 96);
  dexBuf.writeUInt32LE(classDefsOff, 100);
  dexBuf.writeUInt32LE(fileSize - dataOff, 104);
  dexBuf.writeUInt32LE(dataOff, 108);

  const sha1 = crypto.createHash('sha1').update(dexBuf.subarray(32)).digest();
  sha1.copy(dexBuf, 12);

  function adler32(buf) {
    let a = 1;
    let b = 0;
    const MOD = 65521;
    for (let i = 0; i < buf.length; i++) {
      a = (a + buf[i]) % MOD;
      b = (b + a) % MOD;
    }
    return ((b << 16) | a) >>> 0;
  }
  dexBuf.writeUInt32LE(adler32(dexBuf.subarray(12)), 8);

  return dexBuf;
}

/**
 * Generates JAR signature files (MANIFEST.MF, CERT.SF, CERT.RSA)
 */
function buildApkSignatureFiles(entries) {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const tmpDir = '/tmp/apk_sign_' + process.pid;
  fs.mkdirSync(tmpDir, { recursive: true });
  const keyPath = path.join(tmpDir, 'key.pem');
  const certPath = path.join(tmpDir, 'cert.pem');
  const sfPath = path.join(tmpDir, 'CERT.SF');
  const rsaPath = path.join(tmpDir, 'CERT.RSA');

  fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  execSync(
    `openssl req -new -x509 -key "${keyPath}" -subj "/CN=Android Debug/O=Android/C=US" -days 10000 -sha256 -out "${certPath}"`
  );

  let manifestMf = 'Manifest-Version: 1.0\r\nCreated-By: 1.0 (Android)\r\n\r\n';
  const sfEntryBlocks = [];

  for (const entry of entries) {
    const sha256B64 = crypto.createHash('sha256').update(entry.data).digest('base64');
    const mfBlock = `Name: ${entry.name}\r\nSHA-256-Digest: ${sha256B64}\r\n\r\n`;
    manifestMf += mfBlock;

    const mfBlockSha256 = crypto
      .createHash('sha256')
      .update(Buffer.from(mfBlock, 'utf8'))
      .digest('base64');
    sfEntryBlocks.push(`Name: ${entry.name}\r\nSHA-256-Digest: ${mfBlockSha256}\r\n\r\n`);
  }

  const manifestMfBuf = Buffer.from(manifestMf, 'utf8');
  const fullManifestSha256 = crypto.createHash('sha256').update(manifestMfBuf).digest('base64');

  const certSf =
    `Signature-Version: 1.0\r\n` +
    `Created-By: 1.0 (Android)\r\n` +
    `SHA-256-Digest-Manifest: ${fullManifestSha256}\r\n\r\n` +
    sfEntryBlocks.join('');
  const certSfBuf = Buffer.from(certSf, 'utf8');

  fs.writeFileSync(sfPath, certSfBuf);

  execSync(
    `openssl cms -sign -binary -noattr -in "${sfPath}" -signer "${certPath}" -inkey "${keyPath}" -outform DER -out "${rsaPath}" -md sha256`
  );
  const certRsaBuf = fs.readFileSync(rsaPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return {
    manifestMfBuf,
    certSfBuf,
    certRsaBuf,
  };
}

/**
 * APK v2 Signing Block Builder
 */
function buildApkSigningBlockV2(beforeCentralDirBuf, centralDirBuf, eocdBuf) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const tmpDir = '/tmp/apk_v2_' + process.pid;
  fs.mkdirSync(tmpDir, { recursive: true });
  const keyPath = path.join(tmpDir, 'key.pem');
  const certDerPath = path.join(tmpDir, 'cert.der');
  fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  execSync(
    `openssl req -new -x509 -key "${keyPath}" -subj "/CN=Android Debug/O=Android/C=US" -days 10000 -sha256 -outform DER -out "${certDerPath}"`
  );
  const certDer = fs.readFileSync(certDerPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });

  const CHUNK_SIZE = 1024 * 1024;
  const level1Digests = [];

  for (const section of [beforeCentralDirBuf, centralDirBuf, eocdBuf]) {
    let offset = 0;
    while (offset < section.length) {
      const end = Math.min(offset + CHUNK_SIZE, section.length);
      const chunk = section.subarray(offset, end);
      const prefix = Buffer.alloc(5);
      prefix.writeUInt8(0xa5, 0);
      prefix.writeUInt32LE(chunk.length, 1);
      const digest = crypto.createHash('sha256').update(prefix).update(chunk).digest();
      level1Digests.push(digest);
      offset = end;
    }
  }

  const topPrefix = Buffer.alloc(5);
  topPrefix.writeUInt8(0x5a, 0);
  topPrefix.writeUInt32LE(level1Digests.length, 1);
  const topHash = crypto.createHash('sha256').update(topPrefix);
  for (const d of level1Digests) topHash.update(d);
  const contentDigest = topHash.digest();

  const lenPrefixed = (buf) => {
    const l = Buffer.alloc(4);
    l.writeUInt32LE(buf.length, 0);
    return Buffer.concat([l, buf]);
  };

  const SIG_ALGO_RSA_PKCS1_V1_5_SHA256 = 0x0103;
  const algoBuf = Buffer.alloc(4);
  algoBuf.writeUInt32LE(SIG_ALGO_RSA_PKCS1_V1_5_SHA256, 0);
  const digestEntry = lenPrefixed(Buffer.concat([algoBuf, lenPrefixed(contentDigest)]));
  const digestsSeq = lenPrefixed(digestEntry);
  const certsSeq = lenPrefixed(lenPrefixed(certDer));
  const attrsSeq = lenPrefixed(Buffer.alloc(0));

  const signedData = Buffer.concat([digestsSeq, certsSeq, attrsSeq]);

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signedData);
  const signatureBytes = signer.sign(privateKey);

  const sigEntry = lenPrefixed(Buffer.concat([algoBuf, lenPrefixed(signatureBytes)]));
  const signaturesSeq = lenPrefixed(sigEntry);

  const v2Signer = lenPrefixed(
    Buffer.concat([lenPrefixed(signedData), signaturesSeq, lenPrefixed(spkiDer)])
  );
  const v2SignersSeq = lenPrefixed(v2Signer);

  const pairValue = v2SignersSeq;
  const pairLen = 4 + pairValue.length;
  const pairBuf = Buffer.alloc(8 + 4 + pairValue.length);
  pairBuf.writeBigUInt64LE(BigInt(pairLen), 0);
  pairBuf.writeUInt32LE(0x7109871a, 8);
  pairValue.copy(pairBuf, 12);

  const paddingNeeded = (4096 - ((pairBuf.length + 32) % 4096)) % 4096;
  let paddingPairBuf = Buffer.alloc(0);
  if (paddingNeeded >= 12) {
    const padValLen = paddingNeeded - 12;
    paddingPairBuf = Buffer.alloc(paddingNeeded, 0);
    paddingPairBuf.writeBigUInt64LE(BigInt(4 + padValLen), 0);
    paddingPairBuf.writeUInt32LE(0x42726577, 8);
  }

  const pairsAll = Buffer.concat([pairBuf, paddingPairBuf]);
  const sizeOfBlock = pairsAll.length + 24;

  const headSizeBuf = Buffer.alloc(8);
  headSizeBuf.writeBigUInt64LE(BigInt(sizeOfBlock), 0);

  const tailBuf = Buffer.alloc(24);
  tailBuf.writeBigUInt64LE(BigInt(sizeOfBlock), 0);
  tailBuf.write('APK Sig Block 42', 8, 16, 'ascii');

  return Buffer.concat([headSizeBuf, pairsAll, tailBuf]);
}

/**
 * Packages all files into a valid, zipaligned, v1+v2 signed APK archive
 */
function buildZipArchive(rawEntries) {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const localParts = [];
  const centralEntries = [];
  let offset = 0;

  for (const entry of rawEntries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressed = entry.data;
    const crc = crc32(uncompressed);
    const uncompressedSize = uncompressed.length;

    const method = entry.store ? 0 : 8;
    const payload = entry.store ? uncompressed : zlib.deflateRawSync(uncompressed, { level: 9 });
    const compressedSize = payload.length;

    let extraLen = 0;
    if (entry.store) {
      const dataStart = offset + 30 + nameBuf.length;
      const align = entry.name === 'resources.arsc' ? 4 : 4;
      extraLen = (align - (dataStart % align)) % align;
    }
    const extraBuf = Buffer.alloc(extraLen, 0);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(extraLen, 28);

    const localRecord = Buffer.concat([localHeader, nameBuf, extraBuf, payload]);
    localParts.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x0021, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralEntries.push(Buffer.concat([centralHeader, nameBuf]));
    offset += localRecord.length;
  }

  const beforeCentralDirBuf = Buffer.concat(localParts);
  const centralDirBuf = Buffer.concat(centralEntries);

  const eocdForDigest = Buffer.alloc(22);
  eocdForDigest.writeUInt32LE(0x06054b50, 0);
  eocdForDigest.writeUInt16LE(0, 4);
  eocdForDigest.writeUInt16LE(0, 6);
  eocdForDigest.writeUInt16LE(rawEntries.length, 8);
  eocdForDigest.writeUInt16LE(rawEntries.length, 10);
  eocdForDigest.writeUInt32LE(centralDirBuf.length, 12);
  eocdForDigest.writeUInt32LE(beforeCentralDirBuf.length, 16);
  eocdForDigest.writeUInt16LE(0, 20);

  const v2SigningBlock = buildApkSigningBlockV2(
    beforeCentralDirBuf,
    centralDirBuf,
    eocdForDigest
  );

  const finalEocd = Buffer.from(eocdForDigest);
  finalEocd.writeUInt32LE(beforeCentralDirBuf.length + v2SigningBlock.length, 16);

  return Buffer.concat([beforeCentralDirBuf, v2SigningBlock, centralDirBuf, finalEocd]);
}

function main() {
  const scheduleDays = loadAuthoritativeSchedule();
  const manifestXml = buildManifestXml();
  const resourcesArsc = buildResourcesArsc();
  const classesDex = buildClassesDex(scheduleDays);
  const iconPng = fs.readFileSync(path.resolve(process.cwd(), 'public/pwa-192x192.png'));

  const drawables = buildWidgetDrawables(scheduleDays);
  const shapes = buildWidgetShapeDrawables();
  const widgetEmeraldLayoutXml = buildNativeWidgetLayoutXml(false);
  const widgetFrostedLayoutXml = buildNativeWidgetLayoutXml(true);
  const widgetConfigLayoutXml = buildWidgetConfigLayoutXml();
  const widgetInfoXml = buildWidgetInfoXml(0x7f020000, 0x7f010001, true);
  const widgetFrostedInfoXml = buildWidgetInfoXml(0x7f020001, 0x7f010002, false);
  const htmlAsset = Buffer.from(buildStandaloneReaderHtml(), 'utf8');

  const payloadEntries = [
    { name: 'AndroidManifest.xml', data: manifestXml, store: false },
    { name: 'resources.arsc', data: resourcesArsc, store: true },
    { name: 'res/drawable/ic_launcher.png', data: iconPng, store: true },
    { name: 'res/drawable/widget_emerald.png', data: drawables.widgetEmeraldPng, store: true },
    { name: 'res/drawable/widget_frosted.png', data: drawables.widgetFrostedPng, store: true },
    { name: 'res/drawable/bg_shell_emerald.xml', data: shapes.bgShellEmerald, store: false },
    { name: 'res/drawable/bg_pill_emerald.xml', data: shapes.bgPillEmerald, store: false },
    { name: 'res/drawable/bg_tray_emerald.xml', data: shapes.bgTrayEmerald, store: false },
    { name: 'res/drawable/card_emerald_normal.xml', data: shapes.cardEmeraldNormal, store: false },
    { name: 'res/drawable/card_emerald_active.xml', data: shapes.cardEmeraldActive, store: false },
    { name: 'res/drawable/card_emerald_next.xml', data: shapes.cardEmeraldNext, store: false },
    { name: 'res/drawable/bg_shell_frosted.xml', data: shapes.bgShellFrosted, store: false },
    { name: 'res/drawable/bg_pill_frosted.xml', data: shapes.bgPillFrosted, store: false },
    { name: 'res/drawable/bg_tray_frosted.xml', data: shapes.bgTrayFrosted, store: false },
    { name: 'res/drawable/card_frosted_normal.xml', data: shapes.cardFrostedNormal, store: false },
    { name: 'res/drawable/card_frosted_active.xml', data: shapes.cardFrostedActive, store: false },
    { name: 'res/drawable/card_frosted_next.xml', data: shapes.cardFrostedNext, store: false },
    { name: 'res/layout/prayer_widget_emerald.xml', data: widgetEmeraldLayoutXml, store: false },
    { name: 'res/layout/prayer_widget_frosted.xml', data: widgetFrostedLayoutXml, store: false },
    { name: 'res/layout/widget_config.xml', data: widgetConfigLayoutXml, store: false },
    { name: 'res/xml/prayer_widget_info.xml', data: widgetInfoXml, store: false },
    { name: 'res/xml/prayer_widget_frosted_info.xml', data: widgetFrostedInfoXml, store: false },
    { name: 'classes.dex', data: classesDex, store: false },
    { name: 'assets/index.html', data: htmlAsset, store: false },
  ];

  const { manifestMfBuf, certSfBuf, certRsaBuf } = buildApkSignatureFiles(payloadEntries);

  const allEntries = [
    ...payloadEntries,
    { name: 'META-INF/MANIFEST.MF', data: manifestMfBuf, store: false },
    { name: 'META-INF/CERT.SF', data: certSfBuf, store: false },
    { name: 'META-INF/CERT.RSA', data: certRsaBuf, store: false },
  ];

  const apkBuffer = buildZipArchive(allEntries);
  const outPublic = path.resolve(process.cwd(), 'public/InteractiveReader.apk');
  fs.writeFileSync(outPublic, apkBuffer);
  console.log(`Successfully built signed APK at ${outPublic} (${apkBuffer.length} bytes)`);

  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    const outDist = path.join(distDir, 'InteractiveReader.apk');
    fs.writeFileSync(outDist, apkBuffer);
    console.log(`Successfully mirrored APK to ${outDist}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  loadAuthoritativeSchedule,
  buildManifestXml,
  buildResourcesArsc,
  buildClassesDex,
  buildNativeWidgetLayoutXml,
};
