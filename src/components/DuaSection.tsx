import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  DUA_BOOK_CATEGORIES,
  DuaBookCategoryId,
  DhikrItem,
  EASY_GOOD_DEEDS_DUAS,
} from '../data/tasbihData';

interface DuaCardProps {
  dua: DhikrItem;
  index?: number;
  arabicScaleFactor?: number;
  onOpenChapter: (chapterId: number, chapterNumber?: number) => void;
  onOpenInTasbih?: (dua: DhikrItem) => void;
  onOpenAllDuasSection?: () => void;
  showAllDuasButton?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}

export function DuaCard({
  dua,
  index,
  arabicScaleFactor = 1.35,
  onOpenChapter,
  onOpenAllDuasSection,
  showAllDuasButton = false,
  isOpen,
  onToggle,
}: DuaCardProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isExpanded = isOpen !== undefined ? isOpen : internalOpen;
  const handleToggle = onToggle || (() => setInternalOpen((prev) => !prev));
  const arabicFontSizePx = Math.round(22 * arabicScaleFactor);

  return (
    <div className="bg-white rounded-2xl border border-[#2B5D3B] shadow-2xs overflow-hidden transition-all duration-150 hover:border-[#3E7D51]">
      {/* Spoiler Clickable Header */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left bg-[#1F482D] hover:bg-[#255435] transition-colors cursor-pointer select-none"
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 text-[#FEF3C7] flex items-center justify-center shrink-0 font-bold text-xs font-mono-tabular shadow-2xs">
            {index !== undefined ? `№${index}` : (dua.chapterNumber ? `№${dua.chapterNumber}` : '1')}
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#FEF3C7]/80 leading-none truncate">
              {dua.duaBadge || `ГЛАВА ${dua.chapterNumber || ''}`}
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white font-display leading-snug">
              {dua.title}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-emerald-200/80 hidden sm:inline">
            {isExpanded ? 'Свернуть' : 'Открыть'}
          </span>
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-200 ${
              isExpanded
                ? 'bg-white/20 text-[#FEF3C7] border-white/30 rotate-180'
                : 'bg-white/10 text-[#FEF3C7] border-white/20 hover:bg-white/15'
            }`}
          >
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </button>

      {/* Spoiler Expanded Body */}
      {isExpanded && (
        <div className="px-4 pb-5 sm:px-6 sm:pb-6 pt-3 space-y-4 border-t border-stone-200/90 bg-white">
          {/* Source / Reference */}
          <div className="text-xs sm:text-sm text-stone-500 font-medium">
            {dua.source}
            {dua.chapterTitle ? ` · ${dua.chapterTitle}` : ''}
          </div>

          {/* Arabic Text Box */}
          <div className="bg-[#F7F5EE] border border-[#E6E1D3] rounded-2xl px-5 py-5 sm:px-7 sm:py-7 text-right">
            <div
              dir="rtl"
              style={{
                fontSize: `${arabicFontSizePx}px`,
                lineHeight: Math.max(1.7, arabicScaleFactor * 1.35),
              }}
              className="font-reader text-[#134E3E] leading-relaxed select-text"
            >
              {dua.arabic}
            </div>
          </div>

          {/* Transcription & Translation */}
          <div className="space-y-1.5">
            <div className="text-xs sm:text-sm italic text-slate-500 leading-relaxed">
              {dua.transcription}
            </div>
            <div className="text-sm sm:text-base font-medium text-slate-900 font-reader leading-relaxed">
              «{dua.translation}»
            </div>
          </div>

          {/* Virtue Box if available */}
          {dua.virtue && (
            <div className="rounded-xl bg-[#F8F6F1] border border-stone-200/80 px-4 py-3 text-xs sm:text-sm text-stone-700 leading-relaxed">
              <span className="font-bold text-[#06372C]">Достоинство из книги: </span>
              {dua.virtue}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
            {showAllDuasButton && onOpenAllDuasSection && (
              <button
                type="button"
                onClick={onOpenAllDuasSection}
                className="px-3.5 py-2 rounded-xl bg-[#06372C] hover:bg-[#094739] text-[#FEF3C7] text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Все мольбы ({EASY_GOOD_DEEDS_DUAS.length})</span>
              </button>
            )}

            {dua.relatedChapterId && (
              <button
                type="button"
                onClick={() => onOpenChapter(dua.relatedChapterId!, dua.chapterNumber)}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#155E4B] hover:text-[#06372C] transition-colors ml-auto"
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>
                  Открыть главу {dua.chapterNumber || ''} в книге →
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface HomeDuaBlockProps {
  arabicScaleFactor?: number;
  onOpenChapter: (chapterId: number, chapterNumber?: number) => void;
  onOpenInTasbih: (dua: DhikrItem) => void;
  onOpenAllDuasSection: () => void;
}

export function HomeDuaBlock({
  arabicScaleFactor = 1.35,
  onOpenChapter,
  onOpenAllDuasSection,
}: HomeDuaBlockProps) {
  // Фиксированное дуа под временем намаза: «Мольба о прощении каждого греха и покаянии (Истигфар)» (Глава 4)
  const activeDua =
    EASY_GOOD_DEEDS_DUAS.find((d) => d.id === 'istighfar_min_kulli_zanbin') ||
    EASY_GOOD_DEEDS_DUAS[0];

  return (
    <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-7 shadow-xs space-y-4">
      {/* Top Header */}
      <div className="space-y-1.5">
        <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#155E4B] leading-snug">
          {activeDua.duaBadge || 'ПРОЩЕНИЕ ГРЕХОВ · ГЛАВА 4'}
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-display leading-snug">
          {activeDua.title}
        </h2>
        <div className="text-xs sm:text-sm text-slate-400 font-medium">
          {activeDua.source}
        </div>
      </div>

      <div className="border-t border-stone-100" />

      <div className="bg-[#F7F5EE] border border-[#E6E1D3] rounded-2xl px-5 py-6 sm:px-7 sm:py-8 text-right">
        <div
          dir="rtl"
          style={{
            fontSize: `${Math.round(22 * arabicScaleFactor)}px`,
            lineHeight: Math.max(1.7, arabicScaleFactor * 1.35),
          }}
          className="font-reader text-[#134E3E] leading-relaxed select-text"
        >
          {activeDua.arabic}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs sm:text-sm italic text-slate-500 leading-relaxed">
          {activeDua.transcription}
        </div>
        <div className="text-sm sm:text-base font-medium text-slate-900 font-reader leading-relaxed">
          «{activeDua.translation}»
        </div>
      </div>

      <div className="border-t border-stone-100" />

      <div className="flex flex-col items-start gap-3 pt-0.5">
        <button
          type="button"
          onClick={onOpenAllDuasSection}
          className="px-4 py-2.5 rounded-xl bg-[#06372C] hover:bg-[#094739] text-[#FEF3C7] text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors shadow-xs"
        >
          <Sparkles className="w-4 h-4 text-[#EAB308] shrink-0" />
          <span>Все мольбы в разделе «Дуа» ({EASY_GOOD_DEEDS_DUAS.length})</span>
        </button>

        {activeDua.relatedChapterId && (
          <button
            type="button"
            onClick={() =>
              onOpenChapter(activeDua.relatedChapterId!, activeDua.chapterNumber)
            }
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#155E4B] hover:text-[#06372C] transition-colors"
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>
              Открыть главу {activeDua.chapterNumber || 4} в книге →
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

interface DuaSectionProps {
  arabicScaleFactor: number;
  onChangeArabicScale: (nextScale: number) => void;
  onOpenChapter: (chapterId: number, chapterNumber?: number) => void;
  onOpenInTasbih: (dua: DhikrItem) => void;
}

export default function DuaSection({
  arabicScaleFactor,
  onChangeArabicScale,
  onOpenChapter,
  onOpenInTasbih,
}: DuaSectionProps) {
  const [activeCategory, setActiveCategory] = useState<DuaBookCategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openDuaIds, setOpenDuaIds] = useState<Record<string, boolean>>({});

  const filteredDuas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return EASY_GOOD_DEEDS_DUAS.filter((item) => {
      if (activeCategory !== 'all' && item.duaCategory !== activeCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.transcription.toLowerCase().includes(q) ||
        item.translation.toLowerCase().includes(q) ||
        item.arabic.includes(q) ||
        (item.chapterTitle && item.chapterTitle.toLowerCase().includes(q)) ||
        item.source.toLowerCase().includes(q)
      );
    });
  }, [activeCategory, searchQuery]);

  const toggleDua = (id: string) => {
    setOpenDuaIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const d of filteredDuas) {
      next[d.id] = true;
    }
    setOpenDuaIds(next);
  };

  const collapseAll = () => {
    setOpenDuaIds({});
  };

  const openedCount = useMemo(() => {
    return filteredDuas.filter((d) => !!openDuaIds[d.id]).length;
  }, [filteredDuas, openDuaIds]);

  return (
    <div className="space-y-4">
      {/* Header & Category Filter Card */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-6 shadow-xs space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#155E4B]">
              СБОРНИК МОЛЬБ ИЗ СУННЫ · МУФТИЙ МУХАММАД ТАКИ УСМАНИ
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
              Все Дуа из книги «Простые благодеяния» ({EASY_GOOD_DEEDS_DUAS.length})
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed max-w-3xl">
              Нажмите на любое дуа, чтобы раскрыть его арабский оригинал, транскрипцию, перевод и
              достоинство из книги.
            </p>
          </div>

          {/* Arabic Font Scale Control */}
          <div className="bg-[#F8F6F1] border border-stone-200/90 rounded-xl px-3.5 py-2.5 min-w-[200px] space-y-1 shrink-0">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-600">
              <span>Размер текста: {arabicScaleFactor.toFixed(2)}x</span>
              <button
                type="button"
                onClick={() => onChangeArabicScale(1.35)}
                className="text-[11px] font-bold text-[#155E4B] hover:underline"
              >
                Сброс
              </button>
            </div>
            <input
              type="range"
              min={1.0}
              max={2.0}
              step={0.05}
              value={arabicScaleFactor}
              onChange={(e) =>
                onChangeArabicScale(
                  Math.min(2.0, Math.max(1.0, parseFloat(e.target.value) || 1.35))
                )
              }
              className="w-full accent-[#06372C] cursor-pointer"
            />
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск дуа по названию, переводу, транскрипции или главе (например: утренние, прощение, исцеление, азан, рынок)..."
            className="w-full pl-11 pr-10 py-2.5 bg-[#F8F6F1] border border-stone-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-stone-400 focus:outline-none focus:border-[#06372C] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Очистить поиск"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-stone-500 hover:text-slate-900 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Filter Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-[#F8F6F1] rounded-xl border border-stone-200/80 overflow-x-auto">
          {DUA_BOOK_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            const count =
              cat.id === 'all'
                ? EASY_GOOD_DEEDS_DUAS.length
                : EASY_GOOD_DEEDS_DUAS.filter((d) => d.duaCategory === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
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
      </div>

      {/* Spoilers Controls Bar (Expand / Collapse All) */}
      <div className="flex items-center justify-between px-2 text-xs text-stone-500">
        <span className="font-semibold text-slate-800">
          Найдено Дуа: {filteredDuas.length}
          {openedCount > 0 && ` · Раскрыто: ${openedCount}`}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="text-stone-600 hover:text-[#06372C] font-semibold underline underline-offset-2 transition-colors"
          >
            Раскрыть все
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-stone-600 hover:text-[#06372C] font-semibold underline underline-offset-2 transition-colors"
          >
            Свернуть все
          </button>
        </div>
      </div>

      {/* List of Dua Cards (as Spoilers) */}
      {filteredDuas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200/90 p-8 text-center space-y-3">
          <p className="text-sm font-medium text-slate-800">
            По запросу «{searchQuery}» мольбы не найдены
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setActiveCategory('all');
            }}
            className="px-4 py-2 rounded-xl bg-[#06372C] text-[#FEF3C7] text-xs font-bold"
          >
            Показать все мольбы ({EASY_GOOD_DEEDS_DUAS.length})
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredDuas.map((dua, idx) => {
            const isExpanded =
              searchQuery.trim().length > 0 ? true : !!openDuaIds[dua.id];
            return (
              <DuaCard
                key={dua.id}
                dua={dua}
                index={idx + 1}
                arabicScaleFactor={arabicScaleFactor}
                onOpenChapter={onOpenChapter}
                onOpenInTasbih={onOpenInTasbih}
                isOpen={isExpanded}
                onToggle={() => toggleDua(dua.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
