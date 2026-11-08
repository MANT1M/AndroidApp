import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  DEFAULT_DHIKR_LIST,
  DhikrItem,
  TASBIH_CATEGORIES,
  TasbihCategoryId,
} from '../data/tasbihData';

const STORAGE_KEY_TASBIH_STATE = 'interactive_reader_tasbih_state_v1';

interface DhikrProgressRecord {
  currentCount: number;
  targetCount: number; // 0 means infinity (без лимита)
  completedRounds: number;
  totalCount: number;
}

interface StoredTasbihState {
  selectedDhikrId: string;
  activeCategory: TasbihCategoryId;
  soundEnabled: boolean;
  salahSequenceMode: boolean;
  progressById: Record<string, DhikrProgressRecord>;
  customDhikrs: DhikrItem[];
}

const SALAH_SEQUENCE_IDS = ['subhanallah', 'alhamdulillah', 'allahu_akbar', 'tahlil_100'];

function loadTasbihState(): StoredTasbihState {
  const defaultProgress: Record<string, DhikrProgressRecord> = {};
  for (const item of DEFAULT_DHIKR_LIST) {
    defaultProgress[item.id] = {
      currentCount: 0,
      targetCount: item.recommendedTarget,
      completedRounds: 0,
      totalCount: 0,
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_TASBIH_STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      const customDhikrs: DhikrItem[] = Array.isArray(parsed.customDhikrs)
        ? parsed.customDhikrs
        : [];
      for (const c of customDhikrs) {
        defaultProgress[c.id] = {
          currentCount: 0,
          targetCount: c.recommendedTarget || 33,
          completedRounds: 0,
          totalCount: 0,
        };
      }
      return {
        selectedDhikrId:
          typeof parsed.selectedDhikrId === 'string' ? parsed.selectedDhikrId : 'subhanallah',
        activeCategory: parsed.activeCategory || 'all',
        soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
        salahSequenceMode: Boolean(parsed.salahSequenceMode),
        progressById: { ...defaultProgress, ...(parsed.progressById || {}) },
        customDhikrs,
      };
    }
  } catch {
    // ignore storage errors
  }

  return {
    selectedDhikrId: 'subhanallah',
    activeCategory: 'all',
    soundEnabled: true,
    salahSequenceMode: false,
    progressById: defaultProgress,
    customDhikrs: [],
  };
}

interface TasbihSectionProps {
  arabicScaleFactor: number;
  onChangeArabicScale: (nextScale: number) => void;
  onOpenChapter: (chapterId: number, chapterNumber?: number) => void;
  onShowToast: (msg: string) => void;
  externalCategory?: TasbihCategoryId;
  externalSelectedDhikrId?: string | null;
  onCategoryChange?: (cat: TasbihCategoryId) => void;
}

export default function TasbihSection({
  arabicScaleFactor,
  onChangeArabicScale,
  onOpenChapter,
  onShowToast,
  externalCategory,
  externalSelectedDhikrId,
  onCategoryChange,
}: TasbihSectionProps) {
  const [state, setState] = useState<StoredTasbihState>(loadTasbihState);
  const [isPressed, setIsPressed] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newArabic, setNewArabic] = useState('');
  const [newTranscription, setNewTranscription] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [newTarget, setNewTarget] = useState(33);

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (externalSelectedDhikrId) {
      setState((prev) => ({
        ...prev,
        activeCategory: externalCategory || 'all',
        selectedDhikrId: externalSelectedDhikrId,
      }));
      return;
    }
    if (externalCategory && externalCategory !== state.activeCategory) {
      setState((prev) => {
        const matchingDhikr = [...DEFAULT_DHIKR_LIST, ...prev.customDhikrs].find(
          (d) => externalCategory === 'all' || d.category === externalCategory
        );
        return {
          ...prev,
          activeCategory: externalCategory,
          selectedDhikrId: matchingDhikr ? matchingDhikr.id : prev.selectedDhikrId,
        };
      });
    }
  }, [externalCategory, externalSelectedDhikrId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TASBIH_STATE, JSON.stringify(state));
    } catch {
      // ignore storage errors
    }
  }, [state]);

  const allDhikrs = useMemo(
    () => [...DEFAULT_DHIKR_LIST, ...state.customDhikrs],
    [state.customDhikrs]
  );

  const filteredDhikrs = useMemo(() => {
    if (state.activeCategory === 'all') return allDhikrs;
    return allDhikrs.filter((item) => item.category === state.activeCategory);
  }, [allDhikrs, state.activeCategory]);

  const activeDhikr = useMemo(() => {
    return (
      allDhikrs.find((item) => item.id === state.selectedDhikrId) ||
      filteredDhikrs[0] ||
      allDhikrs[0]
    );
  }, [allDhikrs, filteredDhikrs, state.selectedDhikrId]);

  const activeProgress: DhikrProgressRecord = useMemo(() => {
    const rec = state.progressById[activeDhikr.id];
    if (rec) return rec;
    return {
      currentCount: 0,
      targetCount: activeDhikr.recommendedTarget,
      completedRounds: 0,
      totalCount: 0,
    };
  }, [state.progressById, activeDhikr]);

  const playTapSound = useCallback(
    (isTargetReached: boolean) => {
      if (!state.soundEnabled) return;
      try {
        const AudioContextClass =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContextClass();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (isTargetReached) {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(528, now);
          osc.frequency.exponentialRampToValueAtTime(660, now + 0.14);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now);
          osc.stop(now + 0.23);
        } else {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(340, now);
          osc.frequency.exponentialRampToValueAtTime(190, now + 0.035);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          osc.start(now);
          osc.stop(now + 0.045);
        }
      } catch {
        // ignore audio errors
      }
    },
    [state.soundEnabled]
  );

  const handleIncrement = useCallback(() => {
    setIsPressed(true);
    window.setTimeout(() => setIsPressed(false), 110);

    setState((prev) => {
      const currentDhikr =
        [...DEFAULT_DHIKR_LIST, ...prev.customDhikrs].find(
          (d) => d.id === prev.selectedDhikrId
        ) || DEFAULT_DHIKR_LIST[0];

      const existing = prev.progressById[currentDhikr.id] || {
        currentCount: 0,
        targetCount: currentDhikr.recommendedTarget,
        completedRounds: 0,
        totalCount: 0,
      };

      const target = existing.targetCount;
      const nextCountRaw = existing.currentCount + 1;
      const reachedTarget = target > 0 && nextCountRaw >= target;

      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(reachedTarget ? [35, 50, 35] : 12);
        }
      } catch {
        // ignore vibration errors
      }

      playTapSound(reachedTarget);

      // Post-salah automatic chain (33 SubhanAllah -> 33 Alhamdulillah -> 33 Allahu Akbar -> 1 Tahlil)
      if (prev.salahSequenceMode && reachedTarget) {
        const seqIdx = SALAH_SEQUENCE_IDS.indexOf(currentDhikr.id);
        if (seqIdx !== -1 && seqIdx + 1 < SALAH_SEQUENCE_IDS.length) {
          const nextId = SALAH_SEQUENCE_IDS[seqIdx + 1];
          const nextDhikrDef = DEFAULT_DHIKR_LIST.find((d) => d.id === nextId);
          const nextExisting = prev.progressById[nextId] || {
            currentCount: 0,
            targetCount: nextDhikrDef?.recommendedTarget || 33,
            completedRounds: 0,
            totalCount: 0,
          };

          return {
            ...prev,
            selectedDhikrId: nextId,
            progressById: {
              ...prev.progressById,
              [currentDhikr.id]: {
                ...existing,
                currentCount: 0,
                completedRounds: existing.completedRounds + 1,
                totalCount: existing.totalCount + 1,
              },
              [nextId]: {
                ...nextExisting,
                currentCount: 0,
                targetCount: nextDhikrDef?.recommendedTarget || 33,
              },
            },
          };
        } else if (seqIdx === SALAH_SEQUENCE_IDS.length - 1) {
          // Completed full 100 post-salah cycle
          const firstId = SALAH_SEQUENCE_IDS[0];
          return {
            ...prev,
            selectedDhikrId: firstId,
            progressById: {
              ...prev.progressById,
              [currentDhikr.id]: {
                ...existing,
                currentCount: 0,
                completedRounds: existing.completedRounds + 1,
                totalCount: existing.totalCount + 1,
              },
            },
          };
        }
      }

      return {
        ...prev,
        progressById: {
          ...prev.progressById,
          [currentDhikr.id]: {
            ...existing,
            currentCount: reachedTarget ? 0 : nextCountRaw,
            completedRounds: reachedTarget
              ? existing.completedRounds + 1
              : existing.completedRounds,
            totalCount: existing.totalCount + 1,
          },
        },
      };
    });
  }, [playTapSound]);

  // Keyboard support: Space / Enter increments counter when modal is closed
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isAddModalOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleIncrement();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleIncrement, isAddModalOpen]);

  const handleSelectDhikr = (dhikr: DhikrItem) => {
    setState((prev) => ({
      ...prev,
      selectedDhikrId: dhikr.id,
    }));
  };

  const handleChangeTarget = (target: number) => {
    setState((prev) => {
      const existing = prev.progressById[activeDhikr.id] || {
        currentCount: 0,
        targetCount: activeDhikr.recommendedTarget,
        completedRounds: 0,
        totalCount: 0,
      };
      return {
        ...prev,
        progressById: {
          ...prev.progressById,
          [activeDhikr.id]: {
            ...existing,
            targetCount: target,
            currentCount: target > 0 && existing.currentCount >= target ? 0 : existing.currentCount,
          },
        },
      };
    });
  };

  const handleResetCurrentDhikr = () => {
    setState((prev) => {
      const existing = prev.progressById[activeDhikr.id];
      if (!existing) return prev;
      return {
        ...prev,
        progressById: {
          ...prev.progressById,
          [activeDhikr.id]: {
            ...existing,
            currentCount: 0,
          },
        },
      };
    });
    onShowToast(`Счётчик «${activeDhikr.transcription}» обнулён`);
  };

  const handleResetAllTasbih = () => {
    const fresh: Record<string, DhikrProgressRecord> = {};
    for (const item of allDhikrs) {
      fresh[item.id] = {
        currentCount: 0,
        targetCount: item.recommendedTarget,
        completedRounds: 0,
        totalCount: 0,
      };
    }
    setState((prev) => ({
      ...prev,
      progressById: fresh,
    }));
    onShowToast('Общая статистика тасбиха сброшена');
  };

  const handleToggleSalahSequence = () => {
    setState((prev) => {
      const nextMode = !prev.salahSequenceMode;
      const firstSalahId = 'subhanallah';
      return {
        ...prev,
        salahSequenceMode: nextMode,
        activeCategory: nextMode ? 'after_salah' : prev.activeCategory,
        selectedDhikrId: nextMode ? firstSalahId : prev.selectedDhikrId,
      };
    });
  };

  const handleCreateCustomDhikr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() && !newTranscription.trim()) return;

    const id = `custom_${Date.now()}`;
    const targetVal = Math.max(1, Number(newTarget) || 33);
    const created: DhikrItem = {
      id,
      category: 'easy_deeds',
      title: newTitle.trim() || newTranscription.trim(),
      arabic: newArabic.trim() || 'ذِكْرُ اللَّهِ',
      transcription: newTranscription.trim() || newTitle.trim(),
      translation: newTranslation.trim() || 'Персональное поминание Аллаха',
      recommendedTarget: targetVal,
      virtue: 'Добавлено пользователем в личный список зикров.',
      source: 'Личный список поминаний',
      isCustom: true,
    };

    setState((prev) => ({
      ...prev,
      customDhikrs: [...prev.customDhikrs, created],
      selectedDhikrId: created.id,
      activeCategory: 'all',
      progressById: {
        ...prev.progressById,
        [created.id]: {
          currentCount: 0,
          targetCount: targetVal,
          completedRounds: 0,
          totalCount: 0,
        },
      },
    }));

    setNewTitle('');
    setNewArabic('');
    setNewTranscription('');
    setNewTranslation('');
    setNewTarget(33);
    setIsAddModalOpen(false);
    onShowToast(`Зикр «${created.title}» добавлен в Тасбих`);
  };

  const handleDeleteCustomDhikr = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setState((prev) => {
      const nextCustom = prev.customDhikrs.filter((item) => item.id !== id);
      const nextSelected =
        prev.selectedDhikrId === id ? DEFAULT_DHIKR_LIST[0].id : prev.selectedDhikrId;
      return {
        ...prev,
        customDhikrs: nextCustom,
        selectedDhikrId: nextSelected,
      };
    });
    onShowToast('Персональный зикр удалён');
  };

  const progressRatio =
    activeProgress.targetCount > 0
      ? Math.min(1, activeProgress.currentCount / activeProgress.targetCount)
      : (activeProgress.currentCount % 33) / 33;

  const circleRadius = 112;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference * (1 - progressRatio);

  const targetPresets = useMemo(() => {
    const base = [33, 99, 100, 0];
    if (
      activeDhikr.recommendedTarget > 0 &&
      !base.includes(activeDhikr.recommendedTarget)
    ) {
      return [activeDhikr.recommendedTarget, ...base];
    }
    return base;
  }, [activeDhikr.recommendedTarget]);

  const arabicFontSizePx = Math.round(26 * arabicScaleFactor);

  const handleDecreaseScale = () => {
    onChangeArabicScale(Math.max(1.0, Math.round((arabicScaleFactor - 0.1) * 10) / 10));
  };

  const handleIncreaseScale = () => {
    onChangeArabicScale(Math.min(2.0, Math.round((arabicScaleFactor + 0.1) * 10) / 10));
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Main 12-Column Workspace: Left = Tactile Tasbih Counter, Right = Dhikr Catalog */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 items-start">
        {/* Left Column (7 cols): Active Dhikr Card + Tactile Emerald Counter */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-stone-200/90 p-3 sm:p-4.5 shadow-xs space-y-2 sm:space-y-2.5">
          {/* Top Bar inside Counter Card: Category & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-stone-100/90 pb-2">
            <div className="min-w-0 space-y-0.5">
              {activeDhikr.chapterNumber && (
                <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#155E4B] leading-none">
                  {activeDhikr.duaBadge || `ГЛАВА ${activeDhikr.chapterNumber}${activeDhikr.chapterTitle ? ` · ${activeDhikr.chapterTitle}` : ''}`}
                </div>
              )}
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-display leading-tight">
                {activeDhikr.title}
              </h2>
              {activeDhikr.source && (
                <div className="text-xs text-stone-500 font-medium truncate">
                  {activeDhikr.source}
                  {activeDhikr.chapterTitle && !activeDhikr.chapterNumber ? ` · ${activeDhikr.chapterTitle}` : ''}
                </div>
              )}
            </div>

            {/* Controls Bar: Strictly single row (flex-nowrap) */}
            <div className="flex items-center flex-nowrap gap-1.5 shrink-0 overflow-x-auto">
              {/* Quick font size toggle A- / A+ */}
              <div className="flex items-center rounded-xl border border-stone-200 bg-[#F8F6F1] p-0.5 min-h-[34px] shrink-0">
                <button
                  type="button"
                  onClick={handleDecreaseScale}
                  disabled={arabicScaleFactor <= 1.0}
                  title="Уменьшить шрифт"
                  aria-label="Уменьшить шрифт"
                  className="px-2 py-0.5 rounded-lg text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-white disabled:opacity-30 transition-all"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={handleIncreaseScale}
                  disabled={arabicScaleFactor >= 2.0}
                  title="Увеличить шрифт"
                  aria-label="Увеличить шрифт"
                  className="px-2 py-0.5 rounded-lg text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-white disabled:opacity-30 transition-all"
                >
                  A+
                </button>
              </div>

              {/* Sound Toggle Button */}
              <button
                type="button"
                onClick={() =>
                  setState((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
                }
                title={state.soundEnabled ? 'Звук щелчка включён' : 'Звук щелчка выключен'}
                className="min-h-[34px] px-2.5 rounded-xl border border-stone-200 bg-[#F8F6F1] hover:border-slate-900 text-slate-800 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors shrink-0"
              >
                {state.soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-[#06372C]" />
                ) : (
                  <VolumeX className="w-4 h-4 text-stone-400" />
                )}
                <span className="hidden md:inline">
                  {state.soundEnabled ? 'Звук' : 'Без звука'}
                </span>
              </button>

              {/* Reset Button */}
              <button
                type="button"
                onClick={handleResetCurrentDhikr}
                title="Сбросить текущий круг счётчика"
                className="min-h-[34px] px-2.5 sm:px-3 rounded-xl border border-stone-200 bg-[#F8F6F1] hover:border-slate-900 text-slate-800 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сброс</span>
              </button>

              {/* 99+1 Button */}
              <button
                type="button"
                onClick={handleToggleSalahSequence}
                title="Цепочка после намаза: Субханаллах (33), Альхамдулиллях (33), Аллаху Акбар (33), Ля иляха илля-Ллах (1)"
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 border shrink-0 ${
                  state.salahSequenceMode
                    ? 'bg-[#06372C] text-[#FEF3C7] border-[#06372C] shadow-xs'
                    : 'bg-[#F8F6F1] text-slate-800 border-stone-200 hover:border-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>99+1</span>
                {state.salahSequenceMode && <Check className="w-3.5 h-3.5 text-amber-400" />}
              </button>
            </div>
          </div>

          {/* Arabic Text & Transcription Box */}
          <div className="rounded-2xl bg-[#F8F6F1] border border-stone-200/90 p-3 sm:p-4 space-y-2 text-center">
            <div
              dir="rtl"
              style={{
                fontSize: `${arabicFontSizePx}px`,
                lineHeight: Math.max(1.65, arabicScaleFactor * 1.42),
              }}
              className="font-reader text-[#06372C] font-bold select-text py-0.5"
            >
              {activeDhikr.arabic}
            </div>

            <div className="space-y-1 pt-1.5 border-t border-stone-200/70">
              <div
                style={{ fontSize: `${Math.round(17 * (1 + (arabicScaleFactor - 1) * 0.45))}px` }}
                className="font-semibold text-slate-900 transition-all duration-150 leading-snug"
              >
                {activeDhikr.transcription}
              </div>
              <p
                style={{ fontSize: `${Math.round(13.5 * (1 + (arabicScaleFactor - 1) * 0.35))}px` }}
                className="text-stone-600 leading-snug max-w-xl mx-auto transition-all duration-150"
              >
                «{activeDhikr.translation}»
              </p>
            </div>
          </div>

          {/* Interactive Circular Tasbih Button */}
          <div className="flex flex-col items-center justify-center py-2">
            <button
              type="button"
              onClick={handleIncrement}
              aria-label="Нажмите для отсчёта зикра"
              className={`relative w-64 h-64 sm:w-72 sm:h-72 rounded-full bg-[#06372C] text-[#FEF3C7] shadow-lg flex flex-col items-center justify-center select-none cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/60 transition-transform duration-100 ${
                isPressed ? 'scale-95' : 'hover:scale-[1.01] active:scale-95'
              }`}
            >
              {/* SVG Progress Ring */}
              <svg
                className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                viewBox="0 0 256 256"
              >
                <circle
                  cx="128"
                  cy="128"
                  r={circleRadius}
                  fill="none"
                  stroke="rgba(254, 243, 199, 0.14)"
                  strokeWidth="8"
                />
                <circle
                  cx="128"
                  cy="128"
                  r={circleRadius}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circleCircumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-150"
                />
              </svg>

              <span className="text-[11px] font-mono-tabular uppercase tracking-widest text-amber-300/90">
                Нажмите для зикра
              </span>

              <div className="text-6xl sm:text-7xl font-bold font-mono-tabular my-2 tracking-tight text-[#FEF3C7]">
                {activeProgress.currentCount}
              </div>

              <div className="text-xs font-mono-tabular text-amber-200/90">
                {activeProgress.targetCount > 0
                  ? `Цель: ${activeProgress.currentCount} из ${activeProgress.targetCount}`
                  : 'Режим без лимита (∞)'}
              </div>

              <div className="text-[11px] font-mono-tabular text-emerald-200/75 mt-1">
                Кругов: {activeProgress.completedRounds} · Всего: {activeProgress.totalCount}
              </div>
            </button>

            <div className="text-xs text-stone-500 font-mono-tabular mt-2 text-center">
              Касайтесь круга или нажимайте клавишу «Пробел» для отсчёта
            </div>
          </div>

          {/* Target Count Selector */}
          <div className="space-y-1.5 pt-2 border-t border-stone-100">
            <div className="text-xs font-semibold text-stone-600">
              Цель одного круга (по Сунне: {activeDhikr.recommendedTarget})
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {targetPresets.map((preset) => {
                const isSelected = activeProgress.targetCount === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleChangeTarget(preset)}
                    aria-label={preset === 0 ? 'Режим без лимита' : `Цель ${preset}`}
                    className={`px-3 py-1 rounded-lg text-xs font-mono-tabular font-semibold border transition-colors min-h-[34px] flex items-center justify-center ${
                      isSelected
                        ? 'bg-[#06372C] text-[#FEF3C7] border-[#06372C]'
                        : 'bg-[#F8F6F1] text-slate-800 border-stone-200 hover:border-slate-900'
                    }`}
                  >
                    {preset === 0 ? (
                      <span className="text-lg font-bold leading-none select-none">∞</span>
                    ) : (
                      preset
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hadith / Virtue Box matching Dua section style */}
          <div className="rounded-2xl bg-[#F8F6F1] border border-stone-200/90 p-3.5 sm:p-4.5 space-y-2 text-stone-800">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/70 pb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[#06372C]">
                {activeDhikr.chapterNumber
                  ? `Глава ${activeDhikr.chapterNumber}${activeDhikr.chapterTitle ? ` · ${activeDhikr.chapterTitle}` : ''}`
                  : 'Достоинство и награда из Сунны'}
              </div>
              <span className="text-xs font-mono-tabular text-stone-500 font-medium">
                {activeDhikr.source}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
              <span className="font-bold text-[#06372C]">Достоинство из книги: </span>
              {activeDhikr.virtue}
            </p>
            {activeDhikr.relatedChapterId && (
              <div className="pt-1.5 border-t border-stone-200/70 flex justify-end">
                <button
                  type="button"
                  onClick={() => onOpenChapter(activeDhikr.relatedChapterId!, activeDhikr.chapterNumber)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#155E4B] hover:text-[#06372C] transition-colors"
                >
                  <BookOpen className="w-4 h-4 shrink-0" />
                  <span>
                    Открыть главу {activeDhikr.chapterNumber || ''} в книге →
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): List of Dhikrs & Azkars */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-stone-200/90 p-3.5 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 font-display">
                {state.activeCategory === 'morning_evening'
                  ? `Азкары из книги «Простые благодеяния» (${filteredDhikrs.length})`
                  : `Список поминаний (${filteredDhikrs.length})`}
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                {state.activeCategory === 'morning_evening'
                  ? 'Утренние, вечерние и постоянные поминания из книги шейха Мухаммада Таки Усмани'
                  : 'Выберите формулу поминания для отсчёта и чтения достоинств'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetAllTasbih}
              title="Сбросить весь счётчик"
              className="text-xs text-stone-400 hover:text-slate-800 transition-colors underline underline-offset-2 font-medium shrink-0"
            >
              Сбросить всё
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-[#F8F6F1] rounded-xl border border-stone-200/80 overflow-x-auto">
            {TASBIH_CATEGORIES.map((cat) => {
              const isActive = state.activeCategory === cat.id;
              const count =
                cat.id === 'all'
                  ? allDhikrs.length
                  : allDhikrs.filter((d) => d.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setState((prev) => ({ ...prev, activeCategory: cat.id }));
                    if (onCategoryChange) onCategoryChange(cat.id);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                    isActive
                      ? 'bg-[#1F482D] text-[#FEF3C7] shadow-xs'
                      : 'text-stone-600 hover:text-slate-900 hover:bg-stone-200/60'
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>

          <div className="space-y-2 max-h-[760px] overflow-y-auto pr-1">
            {filteredDhikrs.map((item) => {
              const isSelected = item.id === activeDhikr.id;
              const prog = state.progressById[item.id] || {
                currentCount: 0,
                targetCount: item.recommendedTarget,
                completedRounds: 0,
                totalCount: 0,
              };
              const isCompletedAtLeastOnce = prog.completedRounds > 0;

              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectDhikr(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectDhikr(item);
                    }
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer space-y-2 ${
                    isSelected
                      ? 'bg-[#06372C] text-[#FEF3C7] border-[#06372C] shadow-xs'
                      : 'bg-[#F8F6F1] text-slate-900 border-stone-200/90 hover:border-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-mono-tabular font-bold mt-0.5 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950'
                            : isCompletedAtLeastOnce
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-900 text-white'
                        }`}
                      >
                        {isCompletedAtLeastOnce ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <span>{item.recommendedTarget}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {item.chapterNumber && (
                          <div
                            className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${
                              isSelected ? 'text-amber-300' : 'text-[#155E4B]'
                            }`}
                          >
                            {item.duaBadge || `ГЛАВА ${item.chapterNumber}${item.chapterTitle ? ` · ${item.chapterTitle}` : ''}`}
                          </div>
                        )}
                        <div className="text-sm font-bold leading-snug break-words">
                          {item.title}
                        </div>
                        {item.source && (
                          <div
                            className={`text-[11px] font-medium truncate mt-0.5 ${
                              isSelected ? 'text-amber-200/80' : 'text-stone-500'
                            }`}
                          >
                            {item.source}
                          </div>
                        )}
                        <div
                          className={`text-[11px] font-mono-tabular mt-1 ${
                            isSelected ? 'text-amber-200/90' : 'text-stone-500'
                          }`}
                        >
                          Счёт: {prog.currentCount}/
                          {prog.targetCount > 0 ? prog.targetCount : '∞'} · Кругов:{' '}
                          {prog.completedRounds} · Всего: {prog.totalCount}
                        </div>
                      </div>
                    </div>

                    {item.isCustom && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCustomDhikr(item.id, e)}
                        title="Удалить зикр"
                        className={`p-1.5 rounded-lg transition-colors ${
                          isSelected
                            ? 'text-amber-200 hover:bg-white/10'
                            : 'text-stone-400 hover:text-rose-600 hover:bg-stone-200/60'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Arabic Text */}
                  <div
                    dir="rtl"
                    className={`font-reader text-right text-lg leading-relaxed break-words py-1 ${
                      isSelected ? 'text-[#FEF3C7]' : 'text-[#06372C]'
                    }`}
                  >
                    {item.arabic}
                  </div>

                  {/* Transcription & Translation */}
                  <div className="space-y-1">
                    <div
                      className={`text-xs italic leading-relaxed break-words ${
                        isSelected ? 'text-emerald-100' : 'text-stone-500'
                      }`}
                    >
                      {item.transcription}
                    </div>
                    {item.translation && (
                      <div
                        className={`text-xs sm:text-sm font-medium leading-relaxed break-words ${
                          isSelected ? 'text-white' : 'text-slate-900 font-reader'
                        }`}
                      >
                        «{item.translation}»
                      </div>
                    )}
                  </div>

                  {/* Virtue block matching Dua style */}
                  {item.virtue && (
                    <div
                      className={`rounded-lg p-2.5 text-xs leading-relaxed ${
                        isSelected
                          ? 'bg-black/25 text-emerald-100 border border-white/10'
                          : 'bg-white border border-stone-200/80 text-stone-700'
                      }`}
                    >
                      <span className={`font-bold ${isSelected ? 'text-amber-300' : 'text-[#06372C]'}`}>
                        Достоинство из книги:{' '}
                      </span>
                      {item.virtue}
                    </div>
                  )}

                  {/* Open chapter in book button */}
                  {item.relatedChapterId && (
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenChapter(item.relatedChapterId!, item.chapterNumber);
                        }}
                        className={`inline-flex items-center gap-1.5 text-xs font-bold transition-colors ${
                          isSelected
                            ? 'text-[#FEF3C7] hover:underline'
                            : 'text-[#155E4B] hover:text-[#06372C]'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5 shrink-0" />
                        <span>Открыть главу {item.chapterNumber || ''} в книге →</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal: Add Custom Dhikr */}
      {isAddModalOpen && (
        <div
          onClick={() => setIsAddModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-lg rounded-2xl border border-stone-200 shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 bg-[#06372C] text-[#FEF3C7] flex items-center justify-between">
              <h3 className="text-lg font-bold font-display">Добавить персональный зикр</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-xs font-medium text-amber-200 hover:underline"
              >
                Закрыть
              </button>
            </div>

            <form onSubmit={handleCreateCustomDhikr} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Название зикра
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Например: Мольба о прощении и милости"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-[#F8F6F1] text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Арабский текст (необязательно)
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={newArabic}
                  onChange={(e) => setNewArabic(e.target.value)}
                  placeholder="رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-[#F8F6F1] text-base font-reader text-right text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Транскрипция на кириллице
                </label>
                <input
                  type="text"
                  required
                  value={newTranscription}
                  onChange={(e) => setNewTranscription(e.target.value)}
                  placeholder="Рабби-гфир ли ва туб ‘аляййя"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-[#F8F6F1] text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Перевод смысла
                </label>
                <textarea
                  rows={2}
                  value={newTranslation}
                  onChange={(e) => setNewTranslation(e.target.value)}
                  placeholder="Господи, прости меня и прими моё покаяние"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-[#F8F6F1] text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Рекомендуемая цель (количество повторений за круг)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={newTarget}
                  onChange={(e) => setNewTarget(Number(e.target.value) || 33)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-[#F8F6F1] text-sm font-mono-tabular text-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold text-slate-700 hover:bg-stone-100"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#06372C] text-[#FEF3C7] text-xs font-semibold hover:opacity-95"
                >
                  Сохранить зикр
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
