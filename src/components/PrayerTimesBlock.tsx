import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Image as ImageIcon,
  Moon,
  Sparkles,
} from 'lucide-react';
import {
  findDefaultDayIndex,
  getUfaTimeParts,
  parseTimeToMinutes,
  PRAYER_COLUMNS_META,
  PRAYER_PERIODS,
  PRAYER_SCHEDULE_DAYS,
  PrayerColumnMeta,
  PrayerPeriodId,
} from '../data/prayerTimesData';

interface PrayerTimesBlockProps {
  onStartPostSalahTasbih?: () => void;
  onOpenQibla?: () => void;
  defaultShowFullTable?: boolean;
}

const COMPACT_CARD_LABELS: Record<
  PrayerColumnMeta['key'],
  {
    shortTatar: string;
    shortRu: string;
    statusTitle: string;
    rakaatsSummary: string;
    arabicName: string;
  }
> = {
  fajr: {
    shortTatar: 'ИРТӘНГЕ',
    shortRu: 'Фаджр',
    statusTitle: 'ИРТӘНГЕ НАМАЗ (УТРЕННИЙ (ФАДЖР))',
    rakaatsSummary: '4 ракаата: 2 ракаата сунны + 2 ракаата фарда',
    arabicName: 'صلاة الفجر',
  },
  sunrise: {
    shortTatar: 'КОЯШ',
    shortRu: 'Шурук',
    statusTitle: 'КОЯШ ЧЫГА (ВОСХОД (ШУРУК))',
    rakaatsSummary:
      'Восход солнца (окончание времени Фаджра; через 20 мин — время намаза Ишрак/Духа)',
    arabicName: 'الشروق',
  },
  dhuhr: {
    shortTatar: 'ӨЙЛӘ',
    shortRu: 'Зухр',
    statusTitle: 'ӨЙЛӘ НАМАЗ (ПОЛУДЕННЫЙ (ЗУХР))',
    rakaatsSummary: '10 ракаатов: 4 сунны + 4 фарда + 2 сунны',
    arabicName: 'صلاة الظهر',
  },
  asr: {
    shortTatar: 'ИКЕНДЕ',
    shortRu: 'Аср',
    statusTitle: 'ИКЕНДЕ НАМАЗ (ПРЕДВЕЧЕРНИЙ (АСР))',
    rakaatsSummary: '4 ракаата фарда',
    arabicName: 'صلاة العصر',
  },
  maghrib: {
    shortTatar: 'АХШАМ',
    shortRu: 'Магриб',
    statusTitle: 'АХШАМ НАМАЗ (ВЕЧЕРНИЙ (МАГРИБ))',
    rakaatsSummary: '5 ракаатов: 3 ракаата фарда + 2 ракаата сунны',
    arabicName: 'صلاة المغرب',
  },
  isha: {
    shortTatar: 'ЯСТҮ',
    shortRu: 'Иша',
    statusTitle: 'ЯСТҮ НАМАЗ (НОЧНОЙ (ИША))',
    rakaatsSummary: '9 ракаатов: 4 фарда + 2 сунны + 3 ракаата Витр-ваджиб',
    arabicName: 'صلاة العشاء',
  },
};

function pluralizeDaysRu(days: number): string {
  const abs = Math.abs(days) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'дней';
  if (last > 1 && last < 5) return 'дня';
  if (last === 1) return 'день';
  return 'дней';
}

export default function PrayerTimesBlock({
  onStartPostSalahTasbih,
  onOpenQibla,
  defaultShowFullTable = false,
}: PrayerTimesBlockProps) {
  const [now, setNow] = useState<Date>(() => new Date());
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(() =>
    findDefaultDayIndex(new Date())
  );
  const [showFullTable, setShowFullTable] = useState<boolean>(defaultShowFullTable);
  const [showOriginalImage, setShowOriginalImage] = useState<boolean>(false);
  const [tableFilterPeriod, setTableFilterPeriod] = useState<'all' | PrayerPeriodId>('all');
  const [selectedCardKey, setSelectedCardKey] = useState<PrayerColumnMeta['key'] | null>(null);

  // Update clock every 1 second for live HH:MM:SS countdown
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const todayDayIdx = useMemo(() => findDefaultDayIndex(now), [now]);

  // Automatically advance to the new day when midnight passes in Ufa (UTC+5)
  useEffect(() => {
    setSelectedDayIdx(todayDayIdx);
  }, [todayDayIdx]);

  const isSelectedToday = selectedDayIdx === todayDayIdx;
  const selectedDay = PRAYER_SCHEDULE_DAYS[selectedDayIdx] || PRAYER_SCHEDULE_DAYS[0];
  const selectedPeriod = useMemo(
    () => PRAYER_PERIODS.find((p) => p.id === selectedDay.periodId) || PRAYER_PERIODS[0],
    [selectedDay.periodId]
  );

  // Calculate active prayer, next prayer, progress bar ratio, and live HH:MM:SS countdown in Ufa time (UTC+5)
  const prayerStatus = useMemo(() => {
    const ufa = getUfaTimeParts(now);
    const nowTotalSeconds =
      ufa.hours * 3600 + ufa.minutes * 60 + ufa.seconds;
    const nowMinutes = nowTotalSeconds / 60;

    const timesList: { meta: PrayerColumnMeta; timeStr: string; minutes: number }[] =
      PRAYER_COLUMNS_META.map((meta) => {
        const timeStr = selectedDay[meta.key];
        return {
          meta,
          timeStr,
          minutes: parseTimeToMinutes(timeStr),
        };
      });

    let currentKey: PrayerColumnMeta['key'] = 'isha';
    let currentStartMinutes = 0;
    let nextPrayer: { meta: PrayerColumnMeta; timeStr: string; targetMinutes: number } | null =
      null;

    for (let i = 0; i < timesList.length; i++) {
      const item = timesList[i];
      if (nowMinutes < item.minutes) {
        nextPrayer = {
          meta: item.meta,
          timeStr: item.timeStr,
          targetMinutes: item.minutes,
        };
        if (i > 0) {
          currentKey = timesList[i - 1].meta.key;
          currentStartMinutes = timesList[i - 1].minutes;
        } else {
          currentKey = 'isha';
          const prevDay =
            PRAYER_SCHEDULE_DAYS[
              (selectedDayIdx - 1 + PRAYER_SCHEDULE_DAYS.length) %
                PRAYER_SCHEDULE_DAYS.length
            ];
          currentStartMinutes = parseTimeToMinutes(prevDay.isha) - 24 * 60;
        }
        break;
      }
    }

    // If past Isha today, next prayer is tomorrow's Fajr
    if (!nextPrayer) {
      currentKey = 'isha';
      currentStartMinutes = timesList[timesList.length - 1].minutes;
      const nextDay =
        PRAYER_SCHEDULE_DAYS[(selectedDayIdx + 1) % PRAYER_SCHEDULE_DAYS.length];
      const nextFajrMin = parseTimeToMinutes(nextDay.fajr);
      nextPrayer = {
        meta: PRAYER_COLUMNS_META[0],
        timeStr: nextDay.fajr,
        targetMinutes: 24 * 60 + nextFajrMin,
      };
    }

    const remainingSeconds = Math.max(
      0,
      Math.floor(nextPrayer.targetMinutes * 60 - nowTotalSeconds)
    );
    const hh = String(Math.floor(remainingSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(remainingSeconds % 60).padStart(2, '0');
    const countdownHhMmSs = `${hh}:${mm}:${ss}`;

    const totalIntervalMinutes = Math.max(1, nextPrayer.targetMinutes - currentStartMinutes);
    const elapsedMinutes = Math.max(0, nowMinutes - currentStartMinutes);
    const progressPercent = Math.min(
      100,
      Math.max(6, Math.round((elapsedMinutes / totalIntervalMinutes) * 100))
    );

    return {
      currentKey,
      currentStatusTitle: COMPACT_CARD_LABELS[currentKey].statusTitle,
      nextKey: nextPrayer.meta.key,
      nextPrayer,
      countdownHhMmSs,
      progressPercent,
    };
  }, [now, selectedDay, selectedDayIdx]);

  // Calculate days remaining until Ramadan (Feb 8) relative to the selected schedule day
  const ramadanInfo = useMemo(() => {
    const parts = selectedDay.miladiDate.trim().split(/\s+/);
    const dayNum = parseInt(parts[0], 10) || 8;
    const monthStr = (parts[1] || '').toLowerCase();
    const monthIndex = monthStr.startsWith('окт')
      ? 9
      : monthStr.startsWith('ноя')
      ? 10
      : monthStr.startsWith('дек')
      ? 11
      : 0;
    const year = monthIndex === 0 ? 2027 : 2026;
    const currentDateUTC = Date.UTC(year, monthIndex, dayNum);
    const ramadanStartUTC = Date.UTC(2027, 1, 8); // Feb 8
    const daysLeft = Math.max(
      1,
      Math.round((ramadanStartUTC - currentDateUTC) / (1000 * 60 * 60 * 24))
    );
    const progressPercent = Math.min(
      95,
      Math.max(15, Math.round(((365 - daysLeft) / 365) * 100))
    );
    return {
      daysLeft,
      progressPercent,
    };
  }, [selectedDay.miladiDate]);

  const filteredTableRows = useMemo(() => {
    return PRAYER_SCHEDULE_DAYS.map((day, globalIdx) => ({ day, globalIdx })).filter(
      ({ day }) => tableFilterPeriod === 'all' || day.periodId === tableFilterPeriod
    );
  }, [tableFilterPeriod]);

  const handlePrevDay = () => {
    setSelectedDayIdx((prev) => (prev > 0 ? prev - 1 : PRAYER_SCHEDULE_DAYS.length - 1));
  };

  const handleNextDay = () => {
    setSelectedDayIdx((prev) => (prev < PRAYER_SCHEDULE_DAYS.length - 1 ? prev + 1 : 0));
  };

  const formatMiladiFull = (shortDate: string): string => {
    return shortDate
      .replace(/окт/i, 'октября')
      .replace(/ноя/i, 'ноября')
      .replace(/дек/i, 'декабря')
      .replace(/янв/i, 'января');
  };

  const liveClockStr = useMemo(() => {
    const ufa = getUfaTimeParts(now);
    const hh = String(ufa.hours).padStart(2, '0');
    const mm = String(ufa.minutes).padStart(2, '0');
    const ss = String(ufa.seconds).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }, [now]);

  const isPostMaghrib =
    prayerStatus.currentKey === 'maghrib' || prayerStatus.currentKey === 'isha';
  const isJumaEve = selectedDay.dayOfWeekShortRu === 'Чт' && isPostMaghrib;

  return (
    <section aria-label="Время намаза (Намаз вакытлары)" className="space-y-4">
      <div className="bg-[#06372C] text-[#FEF3C7] rounded-3xl p-4 sm:p-6 shadow-sm border border-[#052e24] space-y-4">
        {/* Stage 1: Header Title, Juma Badge & Dual Calendar (Gregorian + Hijri) */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#EAB308]">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>РАСПИСАНИЕ НАМАЗОВ · 12 ОКТ — 8 ЯНВ</span>
              {selectedDay.isJuma && (
                <span className="px-2 py-0.5 rounded bg-[#EAB308] text-slate-950 text-[10px] font-bold normal-case tracking-normal">
                  Җомга көн
                </span>
              )}
              {isJumaEve && (
                <span className="px-2 py-0.5 rounded bg-[#EAB308]/90 text-slate-950 text-[10px] font-bold normal-case tracking-normal">
                  Җомга киче
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span
                className="px-2.5 py-0.5 rounded-full bg-[#164A3B]/90 border border-[#3E6B58] text-[#FEF3C7] text-[11px] font-mono-tabular font-bold"
                title="Текущее время"
              >
                {liveClockStr}
              </span>
              {!isSelectedToday && (
                <button
                  type="button"
                  onClick={() => setSelectedDayIdx(todayDayIdx)}
                  className="px-2.5 py-0.5 rounded-full bg-[#164A3B] hover:bg-[#1E5C4A] border border-[#EAB308]/60 text-[#FEF3C7] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Вернуться к сегодняшней дате"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EAB308]" />
                  <span>Сегодня</span>
                </button>
              )}
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-[#FEF3C7] font-display tracking-tight leading-tight">
            Время намаза (Уфа)
          </h2>

          {/* Dual Calendar Subtitle: Gregorian (Миләди) + Islamic Hijri (Һиҗри) */}
          <div className="text-xs sm:text-sm text-[#A7F3D0]/95 font-sans leading-relaxed">
            <span>Миләди: </span>
            <strong className="font-bold text-[#FEF3C7]">
              {formatMiladiFull(selectedDay.miladiDate)} {selectedDay.monthNum === 1 ? 2027 : 2026} г.
            </strong>
            <span>
              {' '}
              · {selectedDay.dayOfWeekTatar} ({selectedDay.dayOfWeekRu}) ·{' '}
            </span>
            <span>Һиҗри: </span>
            <strong className="font-bold text-[#FEF3C7]">
              {selectedDay.hijriDay} {selectedPeriod.hijriMonthTatar} ({selectedPeriod.hijriMonthRu}){' '}
              {selectedPeriod.hijriYear} г.х.
            </strong>
          </div>
        </div>

        {/* Stage 1: Date Stepper Row */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevDay}
            title="Предыдущий день"
            className="w-10 h-10 rounded-xl bg-[#164A3B] hover:bg-[#1E5C4A] border border-[#3E6B58] flex items-center justify-center text-[#FEF3C7] transition-colors shrink-0 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="relative flex-1 min-w-0 h-10 rounded-full bg-[#164A3B] hover:bg-[#1B5443] border border-[#3E6B58] px-3.5 flex items-center gap-2 transition-colors">
            <Calendar className="w-4 h-4 text-[#EAB308] shrink-0 pointer-events-none" />
            <select
              aria-label="Выбрать дату из расписания намазов"
              value={selectedDayIdx}
              onChange={(e) => setSelectedDayIdx(Number(e.target.value))}
              className="w-full bg-transparent text-xs sm:text-sm font-bold text-[#FEF3C7] appearance-none cursor-pointer focus:outline-none truncate pr-5 [&>optgroup]:text-slate-900 [&>option]:text-slate-900"
            >
              {PRAYER_PERIODS.map((period) => (
                <optgroup key={period.id} label={period.label}>
                  {PRAYER_SCHEDULE_DAYS.map((day, idx) => {
                    if (day.periodId !== period.id) return null;
                    return (
                      <option key={day.miladiDate} value={idx}>
                        {day.miladiDate} · {day.dayOfWeekTatar} ({day.dayOfWeekRu}) ·{' '}
                        {day.hijriDay} {period.hijriMonthTatar} {period.hijriYear} Һиҗри
                        {day.isJuma ? ' ★ Җомга' : ''}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#FEF3C7]/80 shrink-0 pointer-events-none absolute right-3.5" />
          </div>

          <button
            type="button"
            onClick={handleNextDay}
            title="Следующий день"
            className="w-10 h-10 rounded-xl bg-[#164A3B] hover:bg-[#1E5C4A] border border-[#3E6B58] flex items-center justify-center text-[#FEF3C7] transition-colors shrink-0 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Stage 2 & 3: White Rounded Tray with 6 Prayer Time Pill Cards in One Single Row */}
        <div
          role="region"
          aria-label="Шесть времён намаза на выбранный день"
          className="-mx-2.5 sm:-mx-3 bg-white rounded-2xl px-1.5 py-2 sm:p-3 shadow-xs space-y-2"
        >
          <div className="grid grid-cols-6 gap-1 sm:gap-2">
            {PRAYER_COLUMNS_META.map((col) => {
              const timeValue = selectedDay[col.key];
              const isCurrent = prayerStatus.currentKey === col.key;
              const isNext = prayerStatus.nextKey === col.key;
              const isSelectedCard = selectedCardKey === col.key;
              const compact = COMPACT_CARD_LABELS[col.key];
              const stateBadgeText = isCurrent
                ? ' · Текущий период'
                : isNext
                ? ' · Следующий период'
                : '';

              return (
                <button
                  key={col.key}
                  type="button"
                  onClick={() =>
                    setSelectedCardKey((prev) => (prev === col.key ? null : col.key))
                  }
                  title={`${compact.shortTatar} (${compact.shortRu}) — ${timeValue}${stateBadgeText}`}
                  className={`rounded-xl py-2 sm:py-2.5 px-0.5 sm:px-2 border text-center flex flex-col items-center justify-between min-w-0 transition-all select-none cursor-pointer ${
                    isCurrent
                      ? 'bg-[#06372C] border-[#06372C] text-white shadow-xs'
                      : isNext
                      ? 'bg-[#FFFBEB] border-[#FACC15] text-slate-900'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-900 hover:border-slate-300'
                  } ${isSelectedCard ? 'ring-2 ring-[#06372C]/40' : ''}`}
                >
                  <div className="w-full space-y-0.5 min-w-0">
                    <div
                      className={`text-[8.5px] sm:text-xs font-extrabold uppercase tracking-[-0.04em] sm:tracking-tight whitespace-nowrap leading-[1.15] ${
                        isCurrent
                          ? 'text-[#EAB308]'
                          : isNext
                          ? 'text-[#9A3412]'
                          : 'text-[#06372C]'
                      }`}
                    >
                      {compact.shortTatar}
                    </div>
                    <div
                      className={`text-[8.5px] sm:text-[11px] font-normal whitespace-nowrap leading-[1.15] ${
                        isCurrent ? 'text-[#D1FAE5]/90' : 'text-[#64748B]'
                      }`}
                    >
                      {compact.shortRu}
                    </div>
                  </div>

                  <div
                    className={`mt-1.5 sm:mt-2 text-[11.5px] sm:text-lg font-bold font-mono-tabular tracking-tight whitespace-nowrap ${
                      isCurrent
                        ? 'text-[#FEF3C7]'
                        : isNext
                        ? 'text-[#06372C]'
                        : 'text-[#0F172A]'
                    }`}
                  >
                    {timeValue}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedCardKey && (
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-slate-800 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-[#06372C] flex flex-wrap items-center gap-1.5">
                  <span>
                    {COMPACT_CARD_LABELS[selectedCardKey].shortTatar} (
                    {COMPACT_CARD_LABELS[selectedCardKey].shortRu}) —{' '}
                    <span className="font-mono-tabular">{selectedDay[selectedCardKey]}</span>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="font-serif text-amber-800">
                    {COMPACT_CARD_LABELS[selectedCardKey].arabicName}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  {COMPACT_CARD_LABELS[selectedCardKey].rakaatsSummary}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCardKey(null)}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-200/60 shrink-0 cursor-pointer"
              >
                Скрыть
              </button>
            </div>
          )}
        </div>

        {/* Stage 2: Inner Dark Status, Progress Bar, Live HH:MM:SS Countdown & Ramadan Box */}
        <div className="rounded-2xl bg-[#042B22]/90 border border-[#3E6B58]/50 p-4 sm:p-5 space-y-4">
          {/* Current & Next Prayer + Progress Bar */}
          <div className="space-y-2">
            <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#6EE7B7]/90">
              СЕЙЧАС: {prayerStatus.currentStatusTitle}
            </div>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-base sm:text-lg font-bold text-white">
                Далее: {prayerStatus.nextPrayer.meta.tatarTitle} (
                {COMPACT_CARD_LABELS[prayerStatus.nextKey].shortRu})
              </span>
              <span className="text-sm sm:text-base font-bold text-[#EAB308] font-mono-tabular">
                в {prayerStatus.nextPrayer.timeStr}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                style={{ width: `${prayerStatus.progressPercent}%` }}
                className="h-full rounded-full bg-gradient-to-r from-[#FACC15] to-[#EAB308] transition-all duration-500"
              />
            </div>
          </div>

          {/* Live HH:MM:SS Countdown */}
          <div className="space-y-0.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#D9B863]">
              ОСТАЛОСЬ
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono-tabular tracking-wider text-[#FEF3C7]">
              {prayerStatus.countdownHhMmSs}
            </div>
          </div>

          <div className="border-t border-white/10" />

          {/* Ramadan Countdown Block */}
          <div className="space-y-2">
            <div className="flex items-start sm:items-center gap-2 text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#6EE7B7]/90">
              <Moon className="w-3.5 h-3.5 text-[#EAB308] shrink-0 mt-0.5 sm:mt-0" />
              <span>СВЯЩЕННЫЙ МЕСЯЦ · НАЧАЛО 8 ФЕВРАЛЯ · ПЕРВЫЙ ДЕНЬ ПОСТА</span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm sm:text-base font-bold text-[#FEF3C7]">
                До месяца Рамадан
              </span>
              <span className="text-xs sm:text-sm font-semibold text-[#EAB308]">
                Ещё {ramadanInfo.daysLeft} {pluralizeDaysRu(ramadanInfo.daysLeft)}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                style={{ width: `${ramadanInfo.progressPercent}%` }}
                className="h-full rounded-full bg-gradient-to-r from-[#10B981] via-[#BEF264] to-[#FEF08A]"
              />
            </div>
          </div>
        </div>

        {/* Full-Width Stacked Pill Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={() => setShowOriginalImage((prev) => !prev)}
            className="w-full rounded-full py-2.5 px-4 bg-[#184D3D] hover:bg-[#1F5E4B] border border-[#3E6B58] text-[#FEF3C7] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ImageIcon className="w-4 h-4 text-[#EAB308] shrink-0" />
            <span>
              {showOriginalImage ? 'Скрыть оригиналы таблиц (3)' : 'Оригиналы таблиц (3)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowFullTable((prev) => !prev)}
            className="w-full rounded-full py-2.5 px-4 bg-[#31552A] hover:bg-[#3A6432] border border-[#728C3A] text-[#FEF3C7] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>{showFullTable ? 'Скрыть расписание' : 'Показать расписание'}</span>
            <ChevronDown
              className={`w-4 h-4 text-[#FEF3C7] shrink-0 transition-transform duration-200 ${
                showFullTable ? 'rotate-180' : ''
              }`}
            />
          </button>

          {onStartPostSalahTasbih && (
            <button
              type="button"
              onClick={onStartPostSalahTasbih}
              className="w-full rounded-full py-2.5 px-4 bg-[#184D3D] hover:bg-[#1F5E4B] border border-[#3E6B58] text-[#FEF3C7] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#EAB308] shrink-0" />
              <span>Зикры после намаза</span>
            </button>
          )}

          {onOpenQibla && (
            <button
              type="button"
              onClick={onOpenQibla}
              className="w-full rounded-full py-2.5 px-4 bg-[#0B4A39] hover:bg-[#125C48] border border-[#EAB308]/50 text-[#FEF3C7] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
            >
              <Compass className="w-4 h-4 text-[#EAB308] shrink-0" />
              <span>Направление Киблы (Компас и Карта по дому)</span>
            </button>
          )}
        </div>
      </div>

      {/* Optional Original Image Preview (all 3 images: 12 Oct - 9 Nov, 10 Nov - 9 Dec & 10 Dec - 8 Jan) */}
      {showOriginalImage && (
        <div className="rounded-xl bg-[#F8F6F1] border border-stone-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-800">
              Оригинальные изображения расписания намазов (12 окт — 9 ноя, 10 ноя — 9 дек и 10 дек — 8 янв)
            </div>
            <button
              type="button"
              onClick={() => setShowOriginalImage(false)}
              className="text-xs font-medium text-amber-900 hover:underline cursor-pointer"
            >
              Свернуть фото
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PRAYER_PERIODS.map((period) => (
              <div
                key={period.id}
                className={`bg-white p-3 rounded-lg border space-y-2 ${
                  selectedDay.periodId === period.id
                    ? 'border-[#06372C] ring-1 ring-[#06372C]/30'
                    : 'border-stone-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800 px-1">
                  <span>{period.label}</span>
                  {selectedDay.periodId === period.id && (
                    <span className="text-[11px] text-[#06372C] font-mono-tabular">
                      Выбранный период
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto flex justify-center">
                  <img
                    src={period.imageSrc}
                    alt={`Расписание времени намаза: ${period.label}`}
                    referrerPolicy="no-referrer"
                    className="max-w-full h-auto max-h-[640px] rounded border border-stone-200"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Schedule Table (matching exact image structure & green rows) */}
      {showFullTable && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 font-display">
                Полное расписание намазов (12 октября 2026 — 8 января 2027)
              </h3>
              <p className="text-xs text-stone-500">
                Нажмите на любую строку таблицы, чтобы выбрать этот день. Пятничные дни (Җомга), начало месяца и благословенные ночи выделены зелёным цветом, как в оригинале.
              </p>
            </div>

            {/* Period Filter Tabs for Table */}
            <div className="inline-flex flex-wrap items-center gap-1 bg-[#F8F6F1] border border-stone-200 rounded-xl p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTableFilterPeriod('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  tableFilterPeriod === 'all'
                    ? 'bg-[#06372C] text-[#FEF3C7]'
                    : 'text-slate-700 hover:bg-stone-200/70'
                }`}
              >
                Все дни ({PRAYER_SCHEDULE_DAYS.length})
              </button>
              {PRAYER_PERIODS.map((period) => (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => setTableFilterPeriod(period.id)}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    tableFilterPeriod === period.id
                      ? 'bg-[#06372C] text-[#FEF3C7]'
                      : 'text-slate-700 hover:bg-stone-200/70'
                  }`}
                >
                  {period.shortLabel} · {period.hijriMonthTatar} ({period.hijriRange})
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-emerald-700/40 shadow-xs">
            <table className="w-full text-center border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-white text-slate-950 border-b-2 border-emerald-600/60 font-serif">
                  <th className="py-2.5 px-2 border-r border-emerald-600/40 font-bold">
                    <div>Иртәнге</div>
                    <div>намаз</div>
                  </th>
                  <th className="py-2.5 px-2 border-r border-emerald-600/40 font-bold">
                    <div>Кояш</div>
                    <div>чыга</div>
                  </th>
                  <th className="py-2.5 px-2 border-r border-emerald-600/40 font-bold">
                    <div>Өйлә</div>
                    <div>намаз</div>
                  </th>
                  <th className="py-2.5 px-2 border-r border-emerald-600/40 font-bold">
                    <div>Икенде</div>
                    <div>намаз</div>
                  </th>
                  <th className="py-2.5 px-2 border-r border-emerald-600/40 font-bold">
                    <div>Ахшам</div>
                    <div>намаз</div>
                  </th>
                  <th className="py-2.5 px-2 border-r border-emerald-600/40 font-bold">
                    <div>Ястү</div>
                    <div>намаз</div>
                  </th>
                  <th className="py-2.5 px-2 border-r border-emerald-600/40 font-bold">
                    Миләди
                  </th>
                  <th className="py-2.5 px-2 border-r border-emerald-600/40 font-bold">
                    <div>Атна</div>
                    <div>көннәре</div>
                  </th>
                  <th className="py-2.5 px-2 font-bold">Һиҗри (1448)</th>
                </tr>
              </thead>
              <tbody className="font-mono-tabular">
                {filteredTableRows.map(({ day: row, globalIdx }) => {
                  const isSelected = globalIdx === selectedDayIdx;
                  const isEvenRow = globalIdx % 2 === 1;
                  const rowPeriod =
                    PRAYER_PERIODS.find((p) => p.id === row.periodId) || PRAYER_PERIODS[0];

                  let rowBgClass = isEvenRow
                    ? 'bg-[#D9ECCB] text-slate-900 hover:bg-[#C9E3B6]'
                    : 'bg-white text-slate-900 hover:bg-stone-100';

                  if (row.isHighlightedGreen || row.isJuma) {
                    rowBgClass =
                      'bg-[#17A34A] text-white font-bold hover:bg-[#15803D]';
                  }

                  return (
                    <tr
                      key={row.miladiDate}
                      onClick={() => setSelectedDayIdx(globalIdx)}
                      className={`cursor-pointer border-b border-emerald-600/30 transition-colors ${rowBgClass} ${
                        isSelected ? 'ring-2 ring-inset ring-amber-500' : ''
                      }`}
                    >
                      <td className="py-1.5 px-2 border-r border-emerald-600/30">
                        {row.fajr}
                      </td>
                      <td className="py-1.5 px-2 border-r border-emerald-600/30">
                        {row.sunrise}
                      </td>
                      <td className="py-1.5 px-2 border-r border-emerald-600/30">
                        {row.dhuhr}
                      </td>
                      <td className="py-1.5 px-2 border-r border-emerald-600/30">
                        {row.asr}
                      </td>
                      <td className="py-1.5 px-2 border-r border-emerald-600/30">
                        {row.maghrib}
                      </td>
                      <td className="py-1.5 px-2 border-r border-emerald-600/30">
                        {row.isha}
                      </td>
                      <td className="py-1.5 px-2 border-r border-emerald-600/30 font-sans font-medium whitespace-nowrap">
                        {row.miladiDate}
                      </td>
                      <td className="py-1.5 px-2 border-r border-emerald-600/30 font-sans whitespace-nowrap">
                        {row.dayOfWeekTatar}{' '}
                        <span className="opacity-75 text-[11px]">({row.dayOfWeekShortRu})</span>
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <span className="font-bold">{row.hijriDay}</span>{' '}
                        <span className="font-sans text-[11px] opacity-85 hidden sm:inline">
                          {rowPeriod.hijriMonthTatar}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(tableFilterPeriod === 'all' || tableFilterPeriod === 'dec10_jan8') && (
            <div className="rounded-xl bg-[#F8F6F1] border border-stone-200 p-3.5 text-xs sm:text-sm text-slate-800 space-y-1.5 font-serif leading-relaxed">
              <div>
                <strong className="text-red-700 font-bold">1-2 рәҗәб</strong>, пәнҗешәмбе / җомга (10-11 декабрь) –{' '}
                <strong className="font-bold text-slate-950">Рәгаиб кичәсе</strong>. Пәйгамбәребез Мөхәммәд (с.г.с.)нең әтисе Габдуллаһ һәм әнисе Әминәнең никах кичәсе һәм көне.
              </div>
              <div>
                <strong className="text-red-700 font-bold">26 рәҗәб</strong>, дүшәмбе (4 гыйнвар) – Рәсүлебез Мөхәммәд (с.г.с.)нең{' '}
                <strong className="font-bold text-slate-950">Мигъраҗ кичәсе</strong>.
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
