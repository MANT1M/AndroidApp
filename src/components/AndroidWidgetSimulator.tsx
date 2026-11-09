import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Eye,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Smartphone,
  Sliders,
} from 'lucide-react';
import {
  PRAYER_PERIODS,
  PRAYER_SCHEDULE_DAYS,
  PrayerColumnMeta,
  PrayerDaySchedule,
} from '../data/prayerTimesData';

type PrayerScheduleDay = PrayerDaySchedule;
type PrayerTimeKey = PrayerColumnMeta['key'];

interface AndroidWidgetSimulatorProps {
  isStandaloneFullScreen?: boolean;
  onToggleStandaloneFullScreen?: () => void;
  onBackToApp?: () => void;
}

type WallpaperPresetId = 'mountain_mist' | 'pine_twilight' | 'night_sky' | 'daylight_clean';
type WidgetWidthPreset = 320 | 360 | 412 | 460;

const WIDGET_CARDS_META: Array<{
  key: PrayerTimeKey;
  tatarUpper: string;
  ruSub: string;
  nextLabel: string;
}> = [
  {
    key: 'fajr',
    tatarUpper: 'ИРТӘНГЕ',
    ruSub: 'Фаджр',
    nextLabel: 'КИЛӘСЕ: ИРТӘНГЕ (ФАДЖР)',
  },
  {
    key: 'sunrise',
    tatarUpper: 'КОЯШ',
    ruSub: 'Шурук',
    nextLabel: 'КИЛӘСЕ: КОЯШ (ШУРУК)',
  },
  {
    key: 'dhuhr',
    tatarUpper: 'ӨЙЛӘ',
    ruSub: 'Зухр',
    nextLabel: 'КИЛӘСЕ: ӨЙЛӘ (ЗУХР)',
  },
  {
    key: 'asr',
    tatarUpper: 'ИКЕНДЕ',
    ruSub: 'Аср',
    nextLabel: 'КИЛӘСЕ: ИКЕНДЕ (АСР)',
  },
  {
    key: 'maghrib',
    tatarUpper: 'АХШАМ',
    ruSub: 'Магриб',
    nextLabel: 'КИЛӘСЕ: АХШАМ (МАГРИБ)',
  },
  {
    key: 'isha',
    tatarUpper: 'ЯСТҮ',
    ruSub: 'Иша',
    nextLabel: 'КИЛӘСЕ: ЯСТҮ (ИША)',
  },
];

function parseTimeToSeconds(timeStr: string): number {
  const [hStr, mStr] = timeStr.trim().split(':');
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  return h * 3600 + m * 60;
}

function formatChronometerCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function getUfaNowParts(now: Date): {
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  // Ufa is UTC+5 year-round
  const ufaMs = now.getTime() + 5 * 3600 * 1000;
  const ufaDate = new Date(ufaMs);
  return {
    month: ufaDate.getUTCMonth() + 1,
    day: ufaDate.getUTCDate(),
    hours: ufaDate.getUTCHours(),
    minutes: ufaDate.getUTCMinutes(),
    seconds: ufaDate.getUTCSeconds(),
  };
}

function buildNativeDateSubtitle(day: PrayerScheduleDay): string {
  const period =
    PRAYER_PERIODS.find((p) => p.id === day.periodId) || PRAYER_PERIODS[0];
  const fullMonthMiladi = day.miladiDate
    .replace(/окт/i, 'октября')
    .replace(/ноя/i, 'ноября')
    .replace(/дек/i, 'декабря')
    .replace(/янв/i, 'января');
  const yearNum = day.monthNum === 1 ? 2027 : 2026;
  return `Миләди: ${fullMonthMiladi} ${yearNum} г. • ${day.dayOfWeekTatar} • Һиҗри: ${day.hijriDay} ${period.hijriMonthTatar} ${period.hijriYear} г.х.`;
}

/**
 * Computes exact widget state matching PrayerWidgetProvider.buildViews() in scripts/build-apk.mjs
 */
function computeNativeWidgetState(
  dayIdx: number,
  secOfDay: number
): {
  day: PrayerScheduleDay;
  dateSubtitle: string;
  activeIdx: number;
  nextIdx: number;
  nextLabel: string;
  remainSec: number;
  countdownText: string;
} {
  const safeIdx = Math.max(0, Math.min(PRAYER_SCHEDULE_DAYS.length - 1, dayIdx));
  const day = PRAYER_SCHEDULE_DAYS[safeIdx];
  const timesSec = WIDGET_CARDS_META.map((c) => parseTimeToSeconds(day[c.key]));

  let activeIdx = 5; // default Isha (before Fajr or after Isha)
  let nextIdx = 0; // default Fajr
  let remainSec = 0;

  if (secOfDay < timesSec[0]) {
    activeIdx = 5;
    nextIdx = 0;
    remainSec = timesSec[0] - secOfDay;
  } else if (secOfDay < timesSec[1]) {
    activeIdx = 0;
    nextIdx = 1;
    remainSec = timesSec[1] - secOfDay;
  } else if (secOfDay < timesSec[2]) {
    activeIdx = 1;
    nextIdx = 2;
    remainSec = timesSec[2] - secOfDay;
  } else if (secOfDay < timesSec[3]) {
    activeIdx = 2;
    nextIdx = 3;
    remainSec = timesSec[3] - secOfDay;
  } else if (secOfDay < timesSec[4]) {
    activeIdx = 3;
    nextIdx = 4;
    remainSec = timesSec[4] - secOfDay;
  } else if (secOfDay < timesSec[5]) {
    activeIdx = 4;
    nextIdx = 5;
    remainSec = timesSec[5] - secOfDay;
  } else {
    // After Isha -> next is tomorrow's Fajr
    activeIdx = 5;
    nextIdx = 0;
    const tomorrowIdx = safeIdx + 1 < PRAYER_SCHEDULE_DAYS.length ? safeIdx + 1 : safeIdx;
    const tomorrowFajrSec = parseTimeToSeconds(PRAYER_SCHEDULE_DAYS[tomorrowIdx].fajr);
    remainSec = 86400 - secOfDay + tomorrowFajrSec;
  }

  return {
    day,
    dateSubtitle: buildNativeDateSubtitle(day),
    activeIdx,
    nextIdx,
    nextLabel: WIDGET_CARDS_META[nextIdx].nextLabel,
    remainSec,
    countdownText: formatChronometerCountdown(remainSec),
  };
}

/**
 * Exact 1:1 visual replica of the Android RemoteViews widget (`widget_emerald.xml` / `widget_frosted.xml`)
 */
function VirtualAndroidWidget({
  variant,
  state,
  widthDp,
  onSelectCard,
}: {
  variant: 'emerald' | 'frosted';
  state: ReturnType<typeof computeNativeWidgetState>;
  widthDp: number;
  onSelectCard?: (key: PrayerTimeKey) => void;
}) {
  const isFrosted = variant === 'frosted';
  // Scale factor relative to 360dp baseline Android home screen width
  const scale = widthDp / 360;
  const dp = (val: number) => `${Math.round(val * scale * 10) / 10}px`;

  return (
    <div
      style={{
        width: `${widthDp}px`,
        maxWidth: '100%',
        borderRadius: dp(16),
        paddingLeft: dp(9),
        paddingRight: dp(9),
        paddingTop: dp(8),
        paddingBottom: dp(8),
        backgroundColor: isFrosted ? 'rgba(6, 48, 40, 0.56)' : 'rgba(4, 47, 46, 0.97)',
        border: isFrosted
          ? `${dp(1.5)} solid rgba(255, 255, 255, 0.38)`
          : `${dp(1.5)} solid #10b981`,
        backdropFilter: isFrosted ? 'blur(14px)' : undefined,
        WebkitBackdropFilter: isFrosted ? 'blur(14px)' : undefined,
        boxShadow: '0 14px 32px rgba(0, 0, 0, 0.32)',
      }}
      className="select-none transition-all duration-200 mx-auto"
    >
      {/* Top Header Row (LinearLayout horizontal, gravity CENTER_VERTICAL, marginBottom 5dp) */}
      <div
        style={{
          marginBottom: dp(5),
          gap: dp(6),
        }}
        className="flex items-center justify-between"
      >
        {/* Left Column: Title + Dual Calendar Subtitle (layout_weight=1, paddingRight=6dp) */}
        <div
          style={{
            paddingRight: dp(6),
          }}
          className="flex-1 min-w-0 flex flex-col justify-center"
        >
          <div
            style={{
              fontSize: dp(12),
              lineHeight: 1.15,
              color: isFrosted ? '#fde047' : '#facc15',
            }}
            className="font-bold truncate font-sans"
          >
            Время намаза (Уфа)
          </div>
          <div
            style={{
              fontSize: dp(7),
              lineHeight: 1.25,
              marginTop: dp(1.5),
              color: isFrosted ? '#ecfdf5' : '#a7f3d0',
            }}
            className="font-sans line-clamp-2"
          >
            {state.dateSubtitle}
          </div>
        </div>

        {/* Right Compact Countdown Pill (bg_pill_emerald / bg_pill_frosted: 96x24 min, 8dpx3dp padding) */}
        <div
          style={{
            minWidth: dp(96),
            minHeight: dp(24),
            paddingLeft: dp(8),
            paddingRight: dp(8),
            paddingTop: dp(3),
            paddingBottom: dp(3),
            borderRadius: dp(8),
            backgroundColor: isFrosted ? 'rgba(4, 34, 28, 0.48)' : '#021f1e',
            border: isFrosted
              ? `${dp(1.2)} solid rgba(255, 255, 255, 0.30)`
              : `${dp(1.2)} solid #0f5248`,
          }}
          className="shrink-0 flex flex-col items-end justify-center text-right"
        >
          <div
            style={{
              fontSize: dp(7),
              lineHeight: 1.15,
              color: isFrosted ? '#fde047' : '#fcd34d',
            }}
            className="font-bold whitespace-nowrap font-sans"
          >
            {state.nextLabel}
          </div>
          <div
            style={{
              fontSize: dp(12),
              lineHeight: 1.1,
              marginTop: dp(1),
              color: '#ffffff',
            }}
            className="font-bold font-mono-tabular whitespace-nowrap"
          >
            {state.countdownText}
          </div>
        </div>
      </div>

      {/* Inner Tray with 6 Equal Prayer Cards (bg_tray_emerald / bg_tray_frosted) */}
      <div
        style={{
          borderRadius: dp(10),
          paddingLeft: dp(4),
          paddingRight: dp(4),
          paddingTop: dp(4),
          paddingBottom: dp(4),
          backgroundColor: isFrosted ? 'rgba(255, 255, 255, 0.14)' : '#ffffff',
          border: isFrosted
            ? `${dp(1.2)} solid rgba(255, 255, 255, 0.28)`
            : `${dp(1.2)} solid #cbd5e1`,
        }}
        className="grid grid-cols-6"
      >
        {WIDGET_CARDS_META.map((card, idx) => {
          const isActive = idx === state.activeIdx;
          const isNext = idx === state.nextIdx;
          const timeStr = state.day[card.key];

          // Colors matching styleCardCodeItem in scripts/build-apk.mjs
          let cardBg = isFrosted ? 'rgba(255, 255, 255, 0.14)' : '#f8fafc';
          let cardBorder = isFrosted
            ? `${dp(1.2)} solid rgba(255, 255, 255, 0.28)`
            : `${dp(1.2)} solid #cbd5e1`;
          let ttColor = isFrosted ? '#ffffff' : '#022c22';
          let ruColor = isFrosted ? '#cbd5e1' : '#64748b';
          let timeColor = isFrosted ? '#ffffff' : '#0f172a';

          if (isActive) {
            cardBg = isFrosted ? 'rgba(4, 47, 46, 0.84)' : '#042f2e';
            cardBorder = `${dp(1.8)} solid ${isFrosted ? '#fbbf24' : '#f59e0b'}`;
            ttColor = '#fcd34d';
            ruColor = isFrosted ? '#a7f3d0' : '#d1fae5';
            timeColor = '#ffffff';
          } else if (isNext) {
            cardBg = isFrosted ? 'rgba(245, 158, 11, 0.26)' : '#fffbeb';
            cardBorder = `${dp(1.6)} solid ${isFrosted ? '#fbbf24' : '#f59e0b'}`;
            ttColor = isFrosted ? '#fcd34d' : '#b45309';
            ruColor = isFrosted ? '#fde68a' : '#92400e';
            timeColor = isFrosted ? '#ffffff' : '#0f172a';
          }

          return (
            <div
              key={card.key}
              onClick={() => onSelectCard?.(card.key)}
              style={{
                margin: dp(1.5),
                paddingLeft: dp(1.5),
                paddingRight: dp(1.5),
                paddingTop: dp(5),
                paddingBottom: dp(5),
                borderRadius: dp(7),
                backgroundColor: cardBg,
                border: cardBorder,
              }}
              className="flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
              title={`${card.tatarUpper} (${card.ruSub}) — ${timeStr}`}
            >
              <div
                style={{
                  fontSize: dp(8),
                  lineHeight: 1.15,
                  color: ttColor,
                }}
                className="font-bold whitespace-nowrap overflow-hidden text-ellipsis max-w-full font-sans"
              >
                {card.tatarUpper}
              </div>
              <div
                style={{
                  fontSize: dp(7),
                  lineHeight: 1.15,
                  marginTop: dp(0.5),
                  color: ruColor,
                }}
                className="whitespace-nowrap overflow-hidden text-ellipsis max-w-full font-sans"
              >
                {card.ruSub}
              </div>
              <div
                style={{
                  fontSize: dp(11),
                  lineHeight: 1.15,
                  marginTop: dp(2),
                  color: timeColor,
                }}
                className="font-bold font-mono-tabular whitespace-nowrap"
              >
                {timeStr}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AndroidWidgetSimulator({
  isStandaloneFullScreen = false,
  onToggleStandaloneFullScreen,
  onBackToApp,
}: AndroidWidgetSimulatorProps) {
  const [now, setNow] = useState<Date>(() => new Date());
  const [isLiveTime, setIsLiveTime] = useState<boolean>(true);

  // Find today's index in PRAYER_SCHEDULE_DAYS
  const todayDayIdx = useMemo(() => {
    const ufa = getUfaNowParts(now);
    const idx = PRAYER_SCHEDULE_DAYS.findIndex(
      (d) => d.monthNum === ufa.month && d.dayNum === ufa.day
    );
    return idx >= 0 ? idx : 28; // default 9 Nov if outside
  }, [now]);

  const [manualDayIdx, setManualDayIdx] = useState<number>(todayDayIdx);
  const [manualSecOfDay, setManualSecOfDay] = useState<number>(14 * 3600 + 15 * 60);
  const [wallpaper, setWallpaper] = useState<WallpaperPresetId>('mountain_mist');
  const [widthDp, setWidthDp] = useState<WidgetWidthPreset>(412);
  const [displayMode, setDisplayMode] = useState<'both' | 'emerald' | 'frosted'>('both');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeDayIdx = isLiveTime ? todayDayIdx : manualDayIdx;
  const activeSecOfDay = useMemo(() => {
    if (!isLiveTime) return manualSecOfDay;
    const ufa = getUfaNowParts(now);
    return ufa.hours * 3600 + ufa.minutes * 60 + ufa.seconds;
  }, [isLiveTime, manualSecOfDay, now]);

  const widgetState = useMemo(
    () => computeNativeWidgetState(activeDayIdx, activeSecOfDay),
    [activeDayIdx, activeSecOfDay]
  );

  const simulatedTimeFormatted = useMemo(() => {
    const h = Math.floor(activeSecOfDay / 3600);
    const m = Math.floor((activeSecOfDay % 3600) / 60);
    const s = Math.floor(activeSecOfDay % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [activeSecOfDay]);

  const handleJumpToPrayerMoment = (key: PrayerTimeKey) => {
    setIsLiveTime(false);
    const day = PRAYER_SCHEDULE_DAYS[activeDayIdx];
    // Jump to 25 minutes before the clicked prayer so it is shown as "КИЛӘСЕ" (or right after it)
    const targetSec = parseTimeToSeconds(day[key]);
    setManualSecOfDay(Math.max(0, targetSec - 25 * 60));
  };

  return (
    <section
      aria-label="Виртуальный симулятор Android-виджетов"
      className={
        isStandaloneFullScreen
          ? 'fixed inset-0 z-50 bg-slate-950 text-slate-100 overflow-y-auto p-3 sm:p-6'
          : 'space-y-4'
      }
    >
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Top Control Header */}
        <div className="bg-[#06372C] text-[#FEF3C7] rounded-2xl p-4 sm:p-5 border border-[#052e24] shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#EAB308]">
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>ВИРТУАЛЬНЫЙ ЭКРАН ANDROID · 1:1 REMOTE VIEWS</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#FEF3C7] font-display">
                Предпросмотр виджетов без пересборки APK
              </h2>
              <p className="text-xs sm:text-sm text-[#A7F3D0]/90">
                Точная копия Android-разметки (`widget_emerald.xml` и `widget_frosted.xml`), размеров в `dp`, цветов карточек и живого счётчика `Chronometer`.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onToggleStandaloneFullScreen && (
                <button
                  type="button"
                  onClick={onToggleStandaloneFullScreen}
                  className="px-3.5 py-2 rounded-xl bg-[#164A3B] hover:bg-[#1E5C4A] border border-[#3E6B58] text-[#FEF3C7] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isStandaloneFullScreen ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5 text-[#EAB308]" />
                      <span>Свернуть из полного экрана</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 text-[#EAB308]" />
                      <span>Открыть отдельно на весь экран</span>
                    </>
                  )}
                </button>
              )}

              {onBackToApp && (
                <button
                  type="button"
                  onClick={onBackToApp}
                  className="px-3.5 py-2 rounded-xl bg-[#EAB308] hover:bg-[#FACC15] text-[#06372C] text-xs font-bold transition-colors cursor-pointer"
                >
                  Вернуться на Главную
                </button>
              )}
            </div>
          </div>

          {/* Interactive Simulator Toolbar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-white/10">
            {/* 1. Time & Date Mode */}
            <div className="bg-[#042B22]/90 rounded-xl p-3 border border-[#3E6B58]/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#EAB308] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Время Уфы: {simulatedTimeFormatted}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsLiveTime((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    isLiveTime
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#164A3B] text-[#FEF3C7] border border-[#3E6B58]'
                  }`}
                >
                  {isLiveTime ? '● Живое время' : 'Ручной тест'}
                </button>
              </div>

              <div>
                <label className="block text-[11px] text-[#A7F3D0]/80 mb-1">
                  Дата расписания (12 окт 2026 — 8 янв 2027):
                </label>
                <select
                  aria-label="Дата для проверки виджета"
                  value={activeDayIdx}
                  onChange={(e) => {
                    setIsLiveTime(false);
                    setManualDayIdx(Number(e.target.value));
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#164A3B] border border-[#3E6B58] text-xs font-bold text-[#FEF3C7] [&>option]:text-slate-900"
                >
                  {PRAYER_SCHEDULE_DAYS.map((d, idx) => {
                    const p =
                      PRAYER_PERIODS.find((per) => per.id === d.periodId) ||
                      PRAYER_PERIODS[0];
                    return (
                      <option key={d.miladiDate} value={idx}>
                        {d.miladiDate} ({d.dayOfWeekTatar}) · {d.hijriDay}{' '}
                        {p.hijriMonthTatar}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-[#A7F3D0]/80 mb-1">
                  <span>Проверка времени суток:</span>
                  {!isLiveTime && (
                    <button
                      type="button"
                      onClick={() => setIsLiveTime(true)}
                      className="text-[#EAB308] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Сбросить к текущему</span>
                    </button>
                  )}
                </div>
                <input
                  type="range"
                  min={0}
                  max={86399}
                  step={60}
                  value={activeSecOfDay}
                  onChange={(e) => {
                    setIsLiveTime(false);
                    setManualSecOfDay(Number(e.target.value));
                  }}
                  className="w-full accent-[#EAB308] cursor-pointer"
                />
              </div>
            </div>

            {/* 2. Quick Prayer State Jumpers */}
            <div className="bg-[#042B22]/90 rounded-xl p-3 border border-[#3E6B58]/50 space-y-2">
              <div className="text-xs font-bold text-[#EAB308] flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5" />
                <span>Быстрый тест состояний «КИЛӘСЕ»</span>
              </div>
              <p className="text-[11px] text-[#A7F3D0]/80">
                Нажмите на намаз, чтобы перевести часы за 25 минут до его начала:
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {WIDGET_CARDS_META.map((c, idx) => {
                  const isCurrentNext = widgetState.nextIdx === idx;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => handleJumpToPrayerMoment(c.key)}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer truncate ${
                        isCurrentNext
                          ? 'bg-[#EAB308] text-slate-950'
                          : 'bg-[#164A3B] hover:bg-[#1E5C4A] text-[#FEF3C7] border border-[#3E6B58]'
                      }`}
                    >
                      → {c.ruSub}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Wallpaper & Widget Width Controls */}
            <div className="bg-[#042B22]/90 rounded-xl p-3 border border-[#3E6B58]/50 space-y-2.5">
              <div className="text-xs font-bold text-[#EAB308] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>Обои рабочего стола и ширина (dp)</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'mountain_mist', label: 'Горный туман (ваш фон)' },
                  { id: 'pine_twilight', label: 'Тёмный лес' },
                  { id: 'night_sky', label: 'Ночное небо' },
                  { id: 'daylight_clean', label: 'Светлый экран' },
                ].map((wp) => (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => setWallpaper(wp.id as WallpaperPresetId)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer truncate ${
                      wallpaper === wp.id
                        ? 'bg-[#FEF3C7] text-[#06372C] font-bold'
                        : 'bg-[#164A3B] hover:bg-[#1E5C4A] text-[#FEF3C7]'
                    }`}
                  >
                    {wp.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-1.5 pt-1">
                <span className="text-[11px] text-[#A7F3D0]/90">Ширина:</span>
                {([320, 360, 412, 460] as WidgetWidthPreset[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWidthDp(w)}
                    className={`px-2 py-1 rounded-md text-[11px] font-mono-tabular font-bold cursor-pointer ${
                      widthDp === w
                        ? 'bg-[#EAB308] text-slate-950'
                        : 'bg-[#164A3B] text-[#FEF3C7] hover:bg-[#1E5C4A]'
                    }`}
                  >
                    {w}dp
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Display Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="inline-flex items-center gap-1 bg-white border border-stone-200 rounded-xl p-1 text-xs font-semibold">
            {[
              { id: 'both', label: 'Оба виджета сразу' },
              { id: 'emerald', label: '1. Классический изумруд' },
              { id: 'frosted', label: '2. Матовое стекло' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDisplayMode(tab.id as 'both' | 'emerald' | 'frosted')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  displayMode === tab.id
                    ? 'bg-[#06372C] text-[#FEF3C7]'
                    : 'text-slate-700 hover:bg-stone-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-stone-600 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-[#06372C]" />
            <span>
              Активный намаз:{' '}
              <strong className="text-slate-900">
                {WIDGET_CARDS_META[widgetState.activeIdx].tatarUpper} (
                {WIDGET_CARDS_META[widgetState.activeIdx].ruSub})
              </strong>{' '}
              · Следующий:{' '}
              <strong className="text-amber-800">
                {WIDGET_CARDS_META[widgetState.nextIdx].tatarUpper} через{' '}
                {widgetState.countdownText}
              </strong>
            </span>
          </div>
        </div>

        {/* Virtual Android Home Screen Canvas with Realistic Mountain & Pine Wallpaper */}
        <div
          className={`relative rounded-3xl overflow-hidden border border-stone-300 shadow-lg p-4 sm:p-8 transition-colors ${
            wallpaper === 'daylight_clean'
              ? 'bg-gradient-to-b from-sky-100 via-slate-200 to-stone-200'
              : wallpaper === 'night_sky'
              ? 'bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950'
              : wallpaper === 'pine_twilight'
              ? 'bg-gradient-to-br from-[#0f2922] via-[#1e3a34] to-[#091915]'
              : 'bg-gradient-to-b from-[#cbd5e1] via-[#64748b] to-[#1e293b]'
          }`}
        >
          {/* Mountain & Pine Silhouette SVG matching the user's phone wallpaper */}
          {wallpaper === 'mountain_mist' && (
            <svg
              aria-hidden="true"
              viewBox="0 0 1200 600"
              preserveAspectRatio="xMidYMid slice"
              className="absolute inset-0 w-full h-full pointer-events-none object-cover"
            >
              <defs>
                <linearGradient id="mistSky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d1d5db" />
                  <stop offset="45%" stopColor="#9ca3af" />
                  <stop offset="100%" stopColor="#334155" />
                </linearGradient>
                <linearGradient id="fogLayer" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f1f5f9" stopOpacity="0.15" />
                  <stop offset="65%" stopColor="#e2e8f0" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0.85" />
                </linearGradient>
              </defs>
              <rect width="1200" height="600" fill="url(#mistSky)" />
              {/* Distant mountain ridge */}
              <polygon
                points="0,420 180,230 340,320 520,140 710,290 920,170 1200,360 1200,600 0,600"
                fill="#334155"
                opacity="0.75"
              />
              {/* Closer rugged peak */}
              <polygon
                points="120,480 390,190 560,280 740,180 990,410 1200,450 1200,600 0,600"
                fill="#1e293b"
                opacity="0.82"
              />
              {/* Rolling mist across the valley */}
              <rect y="280" width="1200" height="320" fill="url(#fogLayer)" />
              {/* Pine trees silhouette on the right edge */}
              <g fill="#0f1f14" opacity="0.9">
                <polygon points="1080,140 1035,280 1125,280" />
                <polygon points="1080,210 1020,370 1140,370" />
                <polygon points="1080,290 1005,480 1155,480" />
                <polygon points="1150,90 1100,250 1200,250" />
                <polygon points="1150,180 1085,360 1215,360" />
                <polygon points="1150,270 1070,510 1230,510" />
              </g>
            </svg>
          )}

          {/* Simulated Android Status Bar */}
          <div className="relative z-10 max-w-4xl mx-auto mb-5 flex items-center justify-between text-xs font-semibold px-2 text-white drop-shadow-xs">
            <span className="font-mono-tabular">{simulatedTimeFormatted.slice(0, 5)}</span>
            <span className="text-[11px] opacity-90">
              Экран Android · Сетка виджетов ({widthDp}dp)
            </span>
            <span className="font-mono-tabular">LTE · 100%</span>
          </div>

          {/* Widgets Container */}
          <div className="relative z-10 space-y-6 max-w-4xl mx-auto">
            {(displayMode === 'both' || displayMode === 'emerald') && (
              <div className="space-y-2">
                <div className="text-center">
                  <span className="inline-block px-3 py-0.5 rounded-full bg-black/45 backdrop-blur-xs text-white text-[11px] font-semibold">
                    Виджет 1: Намаз вакытлары • Изумруд (`widget_emerald.xml`)
                  </span>
                </div>
                <div className="overflow-x-auto py-1">
                  <VirtualAndroidWidget
                    variant="emerald"
                    state={widgetState}
                    widthDp={widthDp}
                    onSelectCard={handleJumpToPrayerMoment}
                  />
                </div>
              </div>
            )}

            {(displayMode === 'both' || displayMode === 'frosted') && (
              <div className="space-y-2">
                <div className="text-center">
                  <span className="inline-block px-3 py-0.5 rounded-full bg-black/45 backdrop-blur-xs text-white text-[11px] font-semibold">
                    Виджет 2: Намаз вакытлары • Матовое стекло (`widget_frosted.xml`)
                  </span>
                </div>
                <div className="overflow-x-auto py-1">
                  <VirtualAndroidWidget
                    variant="frosted"
                    state={widgetState}
                    widthDp={widthDp}
                    onSelectCard={handleJumpToPrayerMoment}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
