import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  Download,
  FileCode2,
  HelpCircle,
  Home,
  Info,
  Lock,
  Play,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trophy,
  Type,
  User,
  X,
  XCircle,
} from 'lucide-react';
import {
  BookData,
  ChapterData,
  ChapterProgressRecord,
  ChapterStatus,
  LIBRARY_BOOKS,
} from './data/booksCatalogData';
import {
  READER_THEMES,
  ReaderThemeId,
} from './data/sherlockData';
import { DhikrItem, TasbihCategoryId } from './data/tasbihData';
import { useOnlineStatus } from './hooks/usePWAInstall';
import {
  downloadAndroidProjectZip,
  getAndroidProjectFiles,
} from './utils/androidProjectBuilder';
import {
  auditNormalizedChapter,
  buildChapterFromNormalizedDocument,
  DEMO_RAW_CHAPTER_INPUT,
  normalizeChapterContent,
  NormalizedChapterDocument,
  normalizeForFts5,
  parseNormalizedJsonInput,
} from './utils/chapterContentArchitect';
import TasbihSection from './components/TasbihSection';
import PrayerTimesBlock from './components/PrayerTimesBlock';
import DuaSection, { HomeDuaBlock } from './components/DuaSection';

type ActiveSection = 'tasbih' | 'dua' | 'prayer' | 'library' | 'reader' | 'quiz' | 'apk';

const STORAGE_KEY_PROGRESS_V2 = 'interactive_reader_catalog_progress_v2';
const STORAGE_KEY_SETTINGS = 'interactive_reader_datastore_settings_v1';
const STORAGE_KEY_CUSTOM_CHAPTERS = 'interactive_reader_custom_chapters_v1';
const PASSING_SCORE_PERCENT = 75;

interface StoredSettings {
  fontSizeSp: number;
  arabicScaleFactor: number;
  theme: ReaderThemeId;
}

const ARABIC_WORD_WITH_TASHKEEL_REGEX =
  /([\u0610-\u061A\u0620-\u065F\u066E-\u06D3\u06D5-\u06ED\u0640\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)/g;

function isArabicParagraphLine(line: string): boolean {
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
    line
  );
  if (!hasArabic) return false;
  const hasCyrillicOrLatin = /[А-Яа-яЁёA-Za-z]/.test(line);
  return !hasCyrillicOrLatin;
}

function renderMixedArabicFragment(
  textFragment: string,
  baseFontSizeSp: number,
  arabicScaleFactor: number,
  keyPrefix: string
): React.ReactNode {
  if (!textFragment || Math.abs(arabicScaleFactor - 1.0) < 0.001) {
    return textFragment;
  }
  const parts = textFragment.split(ARABIC_WORD_WITH_TASHKEEL_REGEX);
  if (parts.length === 1) {
    return textFragment;
  }
  const scaledPx = Math.round(baseFontSizeSp * arabicScaleFactor * 10) / 10;
  return parts.map((chunk, i) => {
    if (i % 2 === 1) {
      return (
        <span
          key={`${keyPrefix}-ar-${i}`}
          style={{
            fontSize: `${scaledPx}px`,
          }}
        >
          {chunk}
        </span>
      );
    }
    return <React.Fragment key={`${keyPrefix}-tx-${i}`}>{chunk}</React.Fragment>;
  });
}

function getInitialCatalogProgress(): Record<number, ChapterProgressRecord> {
  const initial: Record<number, ChapterProgressRecord> = {};
  for (const book of LIBRARY_BOOKS) {
    for (const ch of book.chapters) {
      initial[ch.id] = {
        chapterId: ch.id,
        isCompleted: false,
        testPassed: false,
        score: 0,
        lastCharOffset: 0,
      };
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROGRESS_V2);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...initial, ...parsed };
    }
  } catch {
    // ignore storage errors
  }
  return initial;
}

function getInitialSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        fontSizeSp: Math.min(28, Math.max(14, Number(parsed.fontSizeSp) || 18)),
        arabicScaleFactor: Math.min(
          2.0,
          Math.max(1.0, Number(parsed.arabicScaleFactor) || 1.35)
        ),
        theme: parsed.theme in READER_THEMES ? parsed.theme : 'LIGHT',
      };
    }
  } catch {
    // ignore
  }
  return {
    fontSizeSp: 18,
    arabicScaleFactor: 1.35,
    theme: 'LIGHT',
  };
}

/**
 * Renders a resilient 3:4 book poster with custom SVG artwork and optional cover image
 */
function BookCoverPoster({
  book,
  className = '',
}: {
  book: BookData;
  className?: string;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{
        backgroundColor: book.coverPalette.bg,
        color: book.coverPalette.text,
      }}
      className={`aspect-[3/4] rounded-xl relative overflow-hidden select-none shadow-xs border border-black/10 ${className}`}
    >
      {/* Editorial SVG Vector Poster (always rendered underneath or when offline) */}
      <div className="absolute inset-0 p-4 flex flex-col justify-between">
        <div
          style={{ borderColor: `${book.coverPalette.accent}55` }}
          className="border rounded-lg p-3.5 h-full flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[10px] font-mono-tabular opacity-75">
            <span>{book.year}</span>
            <span>
              {book.id === 5 ? 'СУННА · АДАБ' : book.id === 6 ? 'МОНОГРАФИЯ' : 'КЛАССИКА'}
            </span>
          </div>

          <div className="my-auto py-2 text-center space-y-2.5">
            <div
              style={{ color: book.coverPalette.accent }}
              className="w-11 h-11 mx-auto flex items-center justify-center"
            >
              {book.coverPalette.motif === 'arch' && (
                <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2">
                  <path
                    d="M10 40V22C10 13 24 6 24 6C24 6 38 13 38 22V40H10Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polygon
                    points="24,14 26.5,19.5 32,22 26.5,24.5 24,30 21.5,24.5 16,22 21.5,19.5"
                    strokeLinejoin="round"
                  />
                  <line x1="14" y1="36" x2="34" y2="36" strokeOpacity="0.5" />
                </svg>
              )}
              {book.coverPalette.motif === 'axe' && (
                <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="24" cy="24" r="18" strokeOpacity="0.35" />
                  <path d="M16 34L32 14M26 12C32 14 35 19 33 25L23 20" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {book.coverPalette.motif === 'moon' && (
                <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M30 10A14 14 0 1 0 38 32A11 11 0 0 1 30 10Z" />
                  <circle cx="18" cy="18" r="2" fill="currentColor" />
                </svg>
              )}
              {book.coverPalette.motif === 'eye' && (
                <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M4 24C10 14 17 10 24 10C31 10 38 14 44 24C38 34 31 38 24 38C17 38 10 34 4 24Z" />
                  <circle cx="24" cy="24" r="6" />
                  <circle cx="24" cy="24" r="2" fill="currentColor" />
                </svg>
              )}
              {book.coverPalette.motif === 'star' && (
                <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="24,6 29,18 42,19 32,28 35,41 24,34 13,41 16,28 6,19 19,18" />
                </svg>
              )}
            </div>

            <div className="font-display font-bold text-base sm:text-lg leading-tight line-clamp-3">
              {book.title}
            </div>
            <div
              style={{ backgroundColor: book.coverPalette.accent }}
              className="w-8 h-0.5 mx-auto opacity-70"
            />
            <div className="text-[11px] opacity-85 line-clamp-1">{book.author}</div>
          </div>

          <div className="text-[10px] font-mono-tabular text-center opacity-65">
            {book.chapters.length} {book.chapters.length >= 5 ? 'глав' : 'главы'} ·{' '}
            {book.chapters.reduce((acc, c) => acc + c.quiz.length, 0)} тестов
          </div>
        </div>
      </div>

      {/* High-res cover image overlay with graceful fallback */}
      {!imgError && book.coverUrl && (
        <img
          src={book.coverUrl}
          alt={book.title}
          referrerPolicy="no-referrer"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 z-10 ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('prayer');
  const [tasbihCategory, setTasbihCategory] = useState<TasbihCategoryId>('all');
  const [externalSelectedDhikrId, setExternalSelectedDhikrId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem('interactive_reader_user_email') || null;
    } catch {
      return null;
    }
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [loginInputEmail, setLoginInputEmail] = useState<string>('1tim.manti777@gmail.com');
  const [progressMap, setProgressMap] = useState<Record<number, ChapterProgressRecord>>(
    getInitialCatalogProgress
  );
  const [settings, setSettings] = useState<StoredSettings>(getInitialSettings);

  // Library MVI State (Search with 300ms debounce + BottomSheet BookDetails)
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [selectedBookIdForSheet, setSelectedBookIdForSheet] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Book & Chapter for Reader / Quiz (defaults to 'Простые благодеяния')
  const [activeBookId, setActiveBookId] = useState<number>(5);
  const [activeChapterId, setActiveChapterId] = useState<number>(501);

  // Reader MVI State
  const [isControlsVisible, setIsControlsVisible] = useState<boolean>(true);
  const [isSettingsSheetOpen, setIsSettingsSheetOpen] = useState<boolean>(false);

  // Quiz MVI State
  const [quizQuestionIndex, setQuizQuestionIndex] = useState<number>(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(false);
  const [correctAnswersCount, setCorrectAnswersCount] = useState<number>(0);
  const [isQuizCompleted, setIsQuizCompleted] = useState<boolean>(false);

  // APK Export State
  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);
  const [isDownloadingApk, setIsDownloadingApk] = useState<boolean>(false);
  const [apkVerifiedBytes, setApkVerifiedBytes] = useState<number | null>(null);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number>(0);
  const [copiedFile, setCopiedFile] = useState<boolean>(false);

  // Content-Architect (JSON / FTS5 / BiDi / Footnotes) State
  const [customChaptersByBook, setCustomChaptersByBook] = useState<Record<number, ChapterData[]>>(
    () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_CHAPTERS);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    }
  );
  const [isArchitectOpen, setIsArchitectOpen] = useState<boolean>(false);
  const [architectMode, setArchitectMode] = useState<'inspect' | 'create_raw' | 'create_json'>(
    'inspect'
  );
  const [architectBookId, setArchitectBookId] = useState<number>(5);
  const [architectChapterId, setArchitectChapterId] = useState<number>(506);
  const [rawChapterTitle, setRawChapterTitle] = useState<string>(
    '22. Примирение'
  );
  const [rawBookSlug, setRawBookSlug] = useState<string>('easy_good_deeds');
  const [rawChapterNumber, setRawChapterNumber] = useState<number>(26);
  const [rawChunkInfo, setRawChunkInfo] = useState<string>('часть 1 из 1');
  const [rawInputText, setRawInputText] = useState<string>(DEMO_RAW_CHAPTER_INPUT);
  const [jsonInputText, setJsonInputText] = useState<string>('');
  const [activeFootnotePopup, setActiveFootnotePopup] = useState<{
    id: string;
    anchor_text: string;
    text: string | null;
    is_missing: boolean;
  } | null>(null);
  const [footnoteFontSize, setFootnoteFontSize] = useState<number>(18);
  const [copiedJsonBadge, setCopiedJsonBadge] = useState<boolean>(false);

  const isOnline = useOnlineStatus();
  const projectFiles = useMemo(() => getAndroidProjectFiles(), []);
  const totalCatalogChaptersCount = useMemo(
    () => LIBRARY_BOOKS.reduce((acc, b) => acc + b.chapters.length, 0),
    []
  );
  const totalCatalogQuestionsCount = useMemo(
    () =>
      LIBRARY_BOOKS.reduce(
        (acc, b) => acc + b.chapters.reduce((qa, c) => qa + c.quiz.length, 0),
        0
      ),
    []
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_CHAPTERS, JSON.stringify(customChaptersByBook));
    } catch {}
  }, [customChaptersByBook]);

  // Debounce search query (300ms) as specified in LibraryViewModel requirement
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Toast auto-dismiss
  const showToast = (msg: string) => {
    setToastMessage(msg);
  };
  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  // Verify APK availability on server
  useEffect(() => {
    fetch(`/InteractiveReader.apk?check=${Date.now()}`, { method: 'HEAD', cache: 'no-store' })
      .then((res) => {
        if (res.ok) {
          const len = Number(res.headers.get('content-length')) || 175102;
          setApkVerifiedBytes(len);
        }
      })
      .catch(() => {});
  }, []);

  // Persist Progress & Settings
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROGRESS_V2, JSON.stringify(progressMap));
    } catch {}
  }, [progressMap]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // Synchronize navigation state with history for Android WebView hardware/gesture Back button
  const navStateRef = useRef({
    activeSection,
    activeFootnotePopup,
    isSettingsSheetOpen,
    selectedBookIdForSheet,
  });
  useEffect(() => {
    navStateRef.current = {
      activeSection,
      activeFootnotePopup,
      isSettingsSheetOpen,
      selectedBookIdForSheet,
    };
  }, [activeSection, activeFootnotePopup, isSettingsSheetOpen, selectedBookIdForSheet]);

  useEffect(() => {
    if (
      activeFootnotePopup !== null ||
      isSettingsSheetOpen ||
      selectedBookIdForSheet !== null ||
      activeSection !== 'prayer'
    ) {
      try {
        window.history.pushState(
          {
            section: activeSection,
            fn: Boolean(activeFootnotePopup),
            settings: isSettingsSheetOpen,
          },
          ''
        );
      } catch {}
    }
  }, [activeSection, Boolean(activeFootnotePopup), isSettingsSheetOpen, selectedBookIdForSheet]);

  useEffect(() => {
    const onPopState = () => {
      const cur = navStateRef.current;
      if (cur.activeFootnotePopup !== null) {
        setActiveFootnotePopup(null);
        return;
      }
      if (cur.isSettingsSheetOpen) {
        setIsSettingsSheetOpen(false);
        return;
      }
      if (cur.selectedBookIdForSheet !== null) {
        setSelectedBookIdForSheet(null);
        return;
      }
      if (cur.activeSection === 'quiz') {
        setActiveSection('reader');
        return;
      }
      if (cur.activeSection === 'reader') {
        setActiveSection('library');
        return;
      }
      if (cur.activeSection !== 'prayer') {
        setActiveSection('prayer');
        return;
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // GetLibraryBooksUseCase + GetBookDetailsUseCase computation (merged with custom chapters)
  const booksWithProgress = useMemo(() => {
    return LIBRARY_BOOKS.map((baseBook) => {
      const extraChapters = customChaptersByBook[baseBook.id] || [];
      const book: BookData = {
        ...baseBook,
        chapters: [...baseBook.chapters, ...extraChapters],
      };
      const sortedChapters = [...book.chapters].sort((a, b) => a.chapterOrder - b.chapterOrder);

      const chapterItems = sortedChapters.map((ch) => {
        const prog = progressMap[ch.id];
        const isPassed = Boolean(prog?.isCompleted && prog?.testPassed);
        const status = (isPassed ? 'PASSED' : 'AVAILABLE') as ChapterStatus;

        return {
          ...ch,
          status,
          score: prog?.score || 0,
          lastCharOffset: prog?.lastCharOffset || 0,
        };
      });

      const totalChaptersCount = chapterItems.length;
      const completedChaptersCount = chapterItems.filter((c) => c.status === 'PASSED').length;
      const progressRatio =
        totalChaptersCount > 0 ? completedChaptersCount / totalChaptersCount : 0;

      return {
        book,
        completedChaptersCount,
        totalChaptersCount,
        progressRatio,
        chapters: chapterItems,
      };
    });
  }, [progressMap, customChaptersByBook]);

  // Filtered books by debounced search query (title or author, case-insensitive)
  const filteredBooks = useMemo(() => {
    if (!debouncedQuery) return booksWithProgress;
    const q = debouncedQuery.toLowerCase();
    return booksWithProgress.filter(
      (item) =>
        item.book.title.toLowerCase().includes(q) ||
        item.book.author.toLowerCase().includes(q)
    );
  }, [booksWithProgress, debouncedQuery]);

  // Selected BookDetails for ModalBottomSheet
  const selectedBookDetails = useMemo(() => {
    if (selectedBookIdForSheet === null) return null;
    return booksWithProgress.find((b) => b.book.id === selectedBookIdForSheet) || null;
  }, [booksWithProgress, selectedBookIdForSheet]);

  // Active Book & Chapter for Reader/Quiz
  const activeBookEntry = useMemo(
    () => booksWithProgress.find((b) => b.book.id === activeBookId) || booksWithProgress[0],
    [booksWithProgress, activeBookId]
  );

  const currentChapter = useMemo(() => {
    return (
      activeBookEntry.chapters.find((c) => c.id === activeChapterId) ||
      activeBookEntry.chapters[0]
    );
  }, [activeBookEntry, activeChapterId]);

  // Observe reader viewport width only (height is fixed so page count never changes when turning to a shorter page)
  // Handle chapter click from BookDetailsBottomSheet or reader navigation
  const handleChapterClicked = (
    bookId: number,
    chapter: ChapterData & { status: ChapterStatus; lastCharOffset?: number }
  ) => {
    setActiveBookId(bookId);
    setActiveChapterId(chapter.id);
    setSelectedBookIdForSheet(null);
    setIsSettingsSheetOpen(false);
    setActiveFootnotePopup(null);
    setActiveSection('reader');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartQuiz = (bookId: number = activeBookId, chapterId: number = currentChapter.id) => {
    setActiveBookId(bookId);
    setActiveChapterId(chapterId);
    setQuizQuestionIndex(0);
    setSelectedOptionIndex(null);
    setIsAnswerSubmitted(false);
    setCorrectAnswersCount(0);
    setIsQuizCompleted(false);
    setSelectedBookIdForSheet(null);
    setActiveSection('quiz');
  };

  const handleSubmitQuizAnswer = () => {
    if (selectedOptionIndex === null || isAnswerSubmitted) return;
    const question = currentChapter.quiz[quizQuestionIndex];
    if (!question) return;

    const isCorrect = selectedOptionIndex === question.correctAnswerIndex;
    const updatedCorrect = isCorrect ? correctAnswersCount + 1 : correctAnswersCount;
    setCorrectAnswersCount(updatedCorrect);
    setIsAnswerSubmitted(true);
  };

  const handleNextQuizQuestion = () => {
    if (!isAnswerSubmitted) return;
    const totalQ = currentChapter.quiz.length;

    if (quizQuestionIndex + 1 < totalQ) {
      setQuizQuestionIndex((prev) => prev + 1);
      setSelectedOptionIndex(null);
      setIsAnswerSubmitted(false);
    } else {
      const finalScore = Math.round((correctAnswersCount / totalQ) * 100);
      const isPassed = finalScore >= PASSING_SCORE_PERCENT;

      if (isPassed) {
        setProgressMap((prev) => {
          const existing = prev[currentChapter.id] || {
            chapterId: currentChapter.id,
            isCompleted: false,
            testPassed: false,
            score: 0,
            lastCharOffset: 0,
          };
          return {
            ...prev,
            [currentChapter.id]: {
              ...existing,
              isCompleted: true,
              testPassed: true,
              score: Math.max(existing.score, finalScore),
            },
          };
        });
      }
      setIsQuizCompleted(true);
    }
  };

  const handleResetCatalogProgress = () => {
    const fresh: Record<number, ChapterProgressRecord> = {};
    for (const book of LIBRARY_BOOKS) {
      for (const ch of book.chapters) {
        fresh[ch.id] = {
          chapterId: ch.id,
          isCompleted: false,
          testPassed: false,
          score: 0,
          lastCharOffset: 0,
        };
      }
    }
    setProgressMap(fresh);
    showToast('Прогресс всех книг сброшен');
  };

  const handleDownloadApk = async () => {
    setIsDownloadingApk(true);
    try {
      const response = await fetch(`/InteractiveReader.apk?dl=${Date.now()}`, {
        cache: 'no-store',
      });
      const buffer = await response.arrayBuffer();
      setApkVerifiedBytes(buffer.byteLength);
      const blob = new Blob([buffer], {
        type: 'application/vnd.android.package-archive',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'InteractiveReader.apk';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingApk(false);
    }
  };

  const handleDownloadZip = async () => {
    setIsDownloadingZip(true);
    try {
      await downloadAndroidProjectZip();
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleCopySource = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(true);
    window.setTimeout(() => setCopiedFile(false), 1800);
  };

  const activeTheme = READER_THEMES[settings.theme];
  const prevChapterObj = activeBookEntry.chapters.find(
    (c) => c.chapterOrder === currentChapter.chapterOrder - 1
  );
  const nextChapterObj = activeBookEntry.chapters.find(
    (c) => c.chapterOrder === currentChapter.chapterOrder + 1
  );

  const currentQuestion = currentChapter.quiz[quizQuestionIndex];
  const quizScorePercent =
    currentChapter.quiz.length > 0
      ? Math.round((correctAnswersCount / currentChapter.quiz.length) * 100)
      : 0;
  const isQuizPassed = quizScorePercent >= PASSING_SCORE_PERCENT;

  const currentReaderNormalizedDoc = useMemo(() => {
    const slug =
      activeBookEntry.book.id === 5 ? 'prostye-blagodeyaniya' : 'psihologiya-islamskiy-diskurs';
    return normalizeChapterContent({
      book_id: slug,
      book_title: activeBookEntry.book.title,
      chapter_number: currentChapter.chapterOrder,
      chapter_title_ru: currentChapter.title,
      chunk_info: 'часть 1 из 1',
      raw_content: currentChapter.content,
    });
  }, [activeBookEntry.book.id, activeBookEntry.book.title, currentChapter]);

  // Content-Architect: compute NormalizedChapterDocument for inspected or created chapter
  const architectBookEntry = useMemo(
    () => booksWithProgress.find((b) => b.book.id === architectBookId) || booksWithProgress[0],
    [booksWithProgress, architectBookId]
  );

  const architectInspectedChapter = useMemo(
    () =>
      architectBookEntry.chapters.find((c) => c.id === architectChapterId) ||
      architectBookEntry.chapters[0],
    [architectBookEntry, architectChapterId]
  );

  const architectDocumentResult = useMemo((): {
    doc: NormalizedChapterDocument;
    error: string | null;
  } => {
    if (architectMode === 'inspect') {
      const slug =
        architectBookEntry.book.id === 5 ? 'prostye-blagodeyaniya' : 'psihologiya-islamskiy-diskurs';
      const doc = normalizeChapterContent({
        book_id: slug,
        book_title: architectBookEntry.book.title,
        chapter_number: architectInspectedChapter.chapterOrder,
        chapter_title_ru: architectInspectedChapter.title,
        chunk_info: 'часть 1 из 1',
        raw_content: architectInspectedChapter.content,
      });
      return { doc, error: null };
    }
    if (architectMode === 'create_raw') {
      const doc = normalizeChapterContent({
        book_id: rawBookSlug || 'prostye-blagodeyaniya',
        book_title: architectBookEntry.book.title,
        chapter_number: rawChapterNumber || architectBookEntry.chapters.length + 1,
        chapter_title_ru: rawChapterTitle.trim() || `Глава ${rawChapterNumber}`,
        chunk_info: rawChunkInfo || 'часть 1 из 1',
        raw_content: rawInputText,
      });
      return { doc, error: null };
    }
    // create_json mode
    const parsed = parseNormalizedJsonInput(jsonInputText);
    if (parsed.doc) {
      return { doc: parsed.doc, error: null };
    }
    const fallbackDoc = normalizeChapterContent({
      book_id: rawBookSlug || 'prostye-blagodeyaniya',
      book_title: architectBookEntry.book.title,
      chapter_number: rawChapterNumber || architectBookEntry.chapters.length + 1,
      chapter_title_ru: rawChapterTitle.trim() || `Глава ${rawChapterNumber}`,
      chunk_info: rawChunkInfo || 'часть 1 из 1',
      raw_content: DEMO_RAW_CHAPTER_INPUT,
    });
    return { doc: fallbackDoc, error: parsed.error };
  }, [
    architectMode,
    architectBookEntry,
    architectInspectedChapter,
    rawBookSlug,
    rawChapterNumber,
    rawChapterTitle,
    rawChunkInfo,
    rawInputText,
    jsonInputText,
  ]);

  const architectAudit = useMemo(
    () => auditNormalizedChapter(architectDocumentResult.doc),
    [architectDocumentResult.doc]
  );

  const handleAddNormalizedChapterToBook = () => {
    if (architectMode === 'create_json' && architectDocumentResult.error) {
      showToast(`Ошибка JSON: ${architectDocumentResult.error}`);
      return;
    }
    const targetBook = architectBookEntry.book;
    const nextOrder = targetBook.chapters.length + 1;
    const nextId = targetBook.id * 100 + nextOrder;
    const newChapter = buildChapterFromNormalizedDocument(
      architectDocumentResult.doc,
      targetBook.id,
      nextId,
      nextOrder
    );

    setCustomChaptersByBook((prev) => ({
      ...prev,
      [targetBook.id]: [...(prev[targetBook.id] || []), newChapter],
    }));

    setProgressMap((prev) => ({
      ...prev,
      [newChapter.id]: {
        chapterId: newChapter.id,
        isCompleted: false,
        testPassed: false,
        score: 0,
        lastCharOffset: 0,
      },
    }));

    setArchitectChapterId(newChapter.id);
    setArchitectMode('inspect');
    showToast(`Глава «${newChapter.title}» нормализована (JSON + FTS5) и добавлена в книгу!`);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = loginInputEmail.trim().toLowerCase();
    if (!trimmed) return;
    setUserEmail(trimmed);
    try {
      localStorage.setItem('interactive_reader_user_email', trimmed);
    } catch {}
    setIsLoginModalOpen(false);
    showToast(`Вы вошли как ${trimmed}`);
  };

  const handleLogout = () => {
    setUserEmail(null);
    try {
      localStorage.removeItem('interactive_reader_user_email');
    } catch {}
    setIsLoginModalOpen(false);
    showToast('Вы вышли из аккаунта');
  };

  const isNavHome = activeSection === 'prayer';
  const isNavTasbih =
    activeSection === 'tasbih' &&
    (tasbihCategory === 'all' ||
      tasbihCategory === 'after_salah' ||
      tasbihCategory === 'easy_deeds' ||
      tasbihCategory === 'istighfar_salawat');
  const isNavDua = activeSection === 'dua';
  const isNavAzkar = activeSection === 'tasbih' && tasbihCategory === 'morning_evening';
  const isNavLibrary =
    activeSection === 'library' ||
    activeSection === 'reader' ||
    activeSection === 'quiz' ||
    activeSection === 'apk';

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F6F1] text-slate-900">
      {/* Main Rounded Dark-Emerald Header */}
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 pt-2 sm:pt-3">
        <header className="bg-[#06372C] text-[#FEF3C7] rounded-2xl px-3.5 py-2.5 sm:px-5 sm:py-3.5 shadow-sm border border-[#052e24]">
          {/* Top Row: Brand & Icon-Only Login Button */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <button
              type="button"
              onClick={() => setActiveSection('prayer')}
              className="flex items-center gap-2.5 sm:gap-3 text-left group min-w-0"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#274A35] border border-[#4E6E52] flex items-center justify-center text-[#FEF3C7] shrink-0 group-hover:bg-[#2F5940] transition-colors">
                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-[#FEF3C7]" />
              </div>
              <div className="min-w-0">
                <div className="text-xl sm:text-2xl font-bold text-[#FEF3C7] font-display tracking-tight leading-none whitespace-nowrap truncate">
                  Благие дела
                </div>
              </div>
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                aria-label={userEmail ? `Аккаунт ${userEmail}` : 'Войти'}
                title={userEmail ? `Аккаунт: ${userEmail}` : 'Войти'}
                onClick={() => setIsLoginModalOpen(true)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#114232] hover:bg-[#16523E] border border-[#3E6B52] text-[#FEF3C7] flex items-center justify-center transition-colors shrink-0"
              >
                <User className="w-4 h-4 sm:w-5 sm:h-5 text-[#EAB308] shrink-0" />
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10 my-2 sm:my-2.5" />

          {/* Bottom Navigation: Row 1 (Главная, Тасбих, Дуа, Азкары) + Row 2 (Книги) */}
          <nav className="space-y-1.5">
            <div className="grid grid-cols-4 sm:flex sm:items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setActiveSection('prayer')}
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[13px] sm:text-[15px] leading-none flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap shrink-0 transition-colors ${
                  isNavHome
                    ? 'bg-[#FEF3C7] text-[#06372C] font-bold shadow-xs'
                    : 'bg-[#124235] hover:bg-[#185243] text-[#FEF3C7] font-semibold border border-white/5'
                }`}
              >
                <Home
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                    isNavHome ? 'text-[#06372C]' : 'text-[#EAB308]'
                  }`}
                />
                <span>Главная</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTasbihCategory('all');
                  setActiveSection('tasbih');
                }}
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[13px] sm:text-[15px] leading-none flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap shrink-0 transition-colors ${
                  isNavTasbih
                    ? 'bg-[#FEF3C7] text-[#06372C] font-bold shadow-xs'
                    : 'bg-[#124235] hover:bg-[#185243] text-[#FEF3C7] font-semibold border border-white/5'
                }`}
              >
                <Compass
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                    isNavTasbih ? 'text-[#06372C]' : 'text-[#EAB308]'
                  }`}
                />
                <span>Тасбих</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSection('dua');
                }}
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[13px] sm:text-[15px] leading-none flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap shrink-0 transition-colors ${
                  isNavDua
                    ? 'bg-[#FEF3C7] text-[#06372C] font-bold shadow-xs'
                    : 'bg-[#124235] hover:bg-[#185243] text-[#FEF3C7] font-semibold border border-white/5'
                }`}
              >
                <Sparkles
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                    isNavDua ? 'text-[#06372C]' : 'text-[#EAB308]'
                  }`}
                />
                <span>Дуа</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTasbihCategory('morning_evening');
                  setActiveSection('tasbih');
                }}
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[13px] sm:text-[15px] leading-none flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap shrink-0 transition-colors ${
                  isNavAzkar
                    ? 'bg-[#FEF3C7] text-[#06372C] font-bold shadow-xs'
                    : 'bg-[#124235] hover:bg-[#185243] text-[#FEF3C7] font-semibold border border-white/5'
                }`}
              >
                <Sun
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                    isNavAzkar ? 'text-[#06372C]' : 'text-[#EAB308]'
                  }`}
                />
                <span>Азкары</span>
              </button>
            </div>

            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setActiveSection('library')}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[13px] sm:text-[15px] leading-none flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 transition-colors ${
                  isNavLibrary
                    ? 'bg-[#FEF3C7] text-[#06372C] font-bold shadow-xs'
                    : 'bg-[#124235] hover:bg-[#185243] text-[#FEF3C7] font-semibold border border-white/5'
                }`}
              >
                <BookOpen
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                    isNavLibrary ? 'text-[#06372C]' : 'text-[#EAB308]'
                  }`}
                />
                <span>Книги</span>
              </button>
            </div>
          </nav>
        </header>
      </div>

      {/* Login Modal */}
      {isLoginModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsLoginModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 font-display">Вход в аккаунт</h3>
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-slate-700 hover:bg-stone-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {userEmail ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-[#F8F6F1] border border-stone-200 text-sm">
                  Вы авторизованы как: <strong className="font-semibold">{userEmail}</strong>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors"
                  >
                    Выйти
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-stone-600">
                    Email аккаунта
                  </label>
                  <input
                    type="email"
                    required
                    value={loginInputEmail}
                    onChange={(e) => setLoginInputEmail(e.target.value)}
                    placeholder="Введите ваш email"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-[#F8F6F1] text-sm focus:outline-none focus:border-[#06372C]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLoginModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#06372C] text-[#FEF3C7] text-xs font-semibold hover:opacity-95"
                  >
                    Войти
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-amber-900 text-amber-50 px-6 py-2 text-xs font-medium text-center mt-2">
          Автономный офлайн-режим · Книга «Простые благодеяния» ({totalCatalogChaptersCount} глав, {totalCatalogQuestionsCount} вопросов) доступна локально
        </div>
      )}

      {/* Toast Notification (LibraryEffect.ShowToast) */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg text-xs sm:text-sm font-medium flex items-center gap-2.5 border border-slate-700">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-5">
        {/* SECTION 0: PRAYER TIMES FULL VIEW (FIRST PLACE) */}
        {activeSection === 'prayer' && (
          <div className="space-y-4">
            <PrayerTimesBlock
              defaultShowFullTable={false}
              onStartPostSalahTasbih={() => {
                setExternalSelectedDhikrId(null);
                setTasbihCategory('after_salah');
                setActiveSection('tasbih');
                showToast('Переход к Тасбиху после намаза');
              }}
            />

            {/* Dua Block after Prayer Times with all Duas from "Простые благодеяния" */}
            <HomeDuaBlock
              arabicScaleFactor={settings.arabicScaleFactor}
              onOpenAllDuasSection={() => setActiveSection('dua')}
              onOpenInTasbih={(dua: DhikrItem) => {
                setExternalSelectedDhikrId(dua.id);
                setTasbihCategory(dua.category);
                setActiveSection('tasbih');
                showToast(`Открыта мольба «${dua.title}» в Тасбихе`);
              }}
              onOpenChapter={(targetChapterId) => {
                const book5 = booksWithProgress.find((b) => b.book.id === 5);
                const ch = book5?.chapters.find((c) => c.id === targetChapterId);
                if (ch) {
                  handleChapterClicked(5, ch);
                } else {
                  setActiveBookId(5);
                  setActiveChapterId(targetChapterId);
                  setActiveSection('reader');
                }
              }}
            />
          </div>
        )}

        {/* SECTION 0.25: ALL DUAS FROM "ПРОСТЫЕ БЛАГОДЕЯНИЯ" */}
        {activeSection === 'dua' && (
          <DuaSection
            arabicScaleFactor={settings.arabicScaleFactor}
            onChangeArabicScale={(nextScale) =>
              setSettings((s) => ({ ...s, arabicScaleFactor: nextScale }))
            }
            onOpenInTasbih={(dua: DhikrItem) => {
              setExternalSelectedDhikrId(dua.id);
              setTasbihCategory(dua.category);
              setActiveSection('tasbih');
              showToast(`Открыта мольба «${dua.title}» в Тасбихе`);
            }}
            onOpenChapter={(targetChapterId) => {
              const book5 = booksWithProgress.find((b) => b.book.id === 5);
              const ch = book5?.chapters.find((c) => c.id === targetChapterId);
              if (ch) {
                handleChapterClicked(5, ch);
              } else {
                setActiveBookId(5);
                setActiveChapterId(targetChapterId);
                setActiveSection('reader');
              }
            }}
          />
        )}

        {/* SECTION 0.5: TASBIH & DHIKR */}
        {activeSection === 'tasbih' && (
          <TasbihSection
            arabicScaleFactor={settings.arabicScaleFactor}
            externalCategory={tasbihCategory}
            externalSelectedDhikrId={externalSelectedDhikrId}
            onCategoryChange={(cat) => {
              setExternalSelectedDhikrId(null);
              setTasbihCategory(cat);
            }}
            onChangeArabicScale={(nextScale) =>
              setSettings((s) => ({ ...s, arabicScaleFactor: nextScale }))
            }
            onOpenChapter={(targetChapterId) => {
              const book5 = booksWithProgress.find((b) => b.book.id === 5);
              const targetChapter =
                book5?.chapters.find((c) => c.id === targetChapterId) ||
                activeBookEntry.chapters.find((c) => c.id === targetChapterId);
              if (targetChapter) {
                handleChapterClicked(targetChapter.bookId || 5, targetChapter);
              } else {
                setActiveSection('reader');
              }
            }}
            onShowToast={showToast}
          />
        )}

        {/* SECTION 1: MULTI-BOOK LIBRARY CATALOG (LibraryCatalogScreen) */}
        {activeSection === 'library' && (
          <div className="space-y-7">

            {/* Book Card + Interactive Chapters Catalog */}
            {booksWithProgress.map((item) => {
              const percent = Math.round(item.progressRatio * 100);
              const q = normalizeForFts5(debouncedQuery);
              const bookMatches =
                !q ||
                normalizeForFts5(item.book.title).includes(q) ||
                normalizeForFts5(item.book.author).includes(q) ||
                normalizeForFts5(item.book.description).includes(q);
              const matchingChapters = !q || bookMatches
                ? item.chapters
                : item.chapters.filter(
                    (ch) =>
                      normalizeForFts5(ch.title).includes(q) ||
                      normalizeForFts5(ch.content).includes(q)
                  );

              if (q && !bookMatches && matchingChapters.length === 0) {
                return null;
              }

              return (
                <div key={item.book.id} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Book Poster Card */}
                  <div className="lg:col-span-4 bg-white rounded-2xl border border-stone-200/90 p-5 flex flex-col justify-between">
                    <div className="space-y-4">
                      <BookCoverPoster book={item.book} />

                      <div className="space-y-1.5">
                        <div className="text-[11px] text-stone-500 font-mono-tabular">
                          {item.book.genre} · {item.book.year}
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 font-display">
                          {item.book.title}
                        </h2>
                        <p className="text-xs font-medium text-stone-600">{item.book.author}</p>
                      </div>

                      <p className="text-xs text-stone-600 leading-relaxed">
                        {item.book.description}
                      </p>
                    </div>

                    <div className="pt-4 mt-4 border-t border-stone-100 space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-mono-tabular">
                        <span className="text-stone-600">Общий прогресс</span>
                        <span className="font-semibold text-slate-900">
                          {item.completedChaptersCount} / {item.totalChaptersCount} глав ({percent}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-700 transition-all duration-300 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Interactive Table of Contents & Quizzes */}
                  <div className="lg:col-span-8 bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                      <div>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-display">
                          Оглавление книги и проверочные тесты
                        </h2>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Все главы открыты — выберите любую главу для чтения или прохождения теста без ограничений.
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-mono-tabular font-semibold text-stone-600">
                          {matchingChapters.length} из {item.chapters.length} глав
                        </span>
                      </div>
                    </div>

                    {matchingChapters.length === 0 ? (
                      <div className="p-8 text-center space-y-2">
                        <p className="text-sm font-medium text-slate-800">
                          По запросу «{debouncedQuery}» главы не найдены
                        </p>
                        <button
                          onClick={() => setSearchInput('')}
                          className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                        >
                          Сбросить поиск
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {matchingChapters.map((ch) => {
                          const isLocked = ch.status === 'LOCKED';
                          const isPassed = ch.status === 'PASSED';

                          return (
                            <button
                              key={ch.id}
                              onClick={() => handleChapterClicked(item.book.id, ch)}
                              className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between gap-4 min-h-[64px] ${
                                isLocked
                                  ? 'bg-stone-100/80 border-stone-200/80 opacity-65'
                                  : 'bg-[#F8F6F1] border-stone-200/90 hover:border-slate-900'
                              }`}
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                <div
                                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                    isPassed
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : isLocked
                                      ? 'bg-stone-200 text-stone-500'
                                      : 'bg-slate-900 text-white'
                                  }`}
                                >
                                  {isPassed ? (
                                    <CheckCircle2 className="w-5 h-5" />
                                  ) : isLocked ? (
                                    <Lock className="w-4 h-4" />
                                  ) : (
                                    <Play className="w-4 h-4 fill-current" />
                                  )}
                                </div>

                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-slate-900 truncate">
                                    {ch.title}
                                  </div>
                                  {(isPassed || isLocked || ch.lastCharOffset > 0) && (
                                    <div className="text-xs text-stone-500 font-mono-tabular mt-0.5">
                                      {isPassed
                                        ? `Пройдено · Тест сдан на ${ch.score}% (${ch.quiz.length} вопроса)`
                                        : isLocked
                                        ? 'Заблокировано · Сначала пройдите предыдущую главу и тест'
                                        : `Продолжить чтение (смещение ${ch.lastCharOffset} симв.)`}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* SECTION 2: READER */}
        {activeSection === 'reader' && (
          <div className="max-w-3xl mx-auto pb-12">
            <div
              style={{
                backgroundColor: activeTheme.bgHex,
                color: activeTheme.textHex,
                borderColor: activeTheme.borderHex,
              }}
              className="rounded-2xl border shadow-sm overflow-hidden flex flex-col transition-colors duration-200"
            >
              {isControlsVisible && (
                <div
                  style={{
                    backgroundColor: activeTheme.surfaceHex,
                    borderColor: activeTheme.borderHex,
                  }}
                  className="sticky top-0 px-4 sm:px-6 py-3 border-b flex items-center justify-between gap-4 z-20 backdrop-blur-md shadow-xs"
                >
                  <button
                    onClick={() => {
                      setSelectedBookIdForSheet(activeBookId);
                      setActiveSection('library');
                    }}
                    className="min-h-[44px] min-w-[44px] flex items-center gap-2 text-sm font-medium rounded-lg px-2 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">{activeBookEntry.book.title}</span>
                  </button>

                  <div className="text-center truncate">
                    <div className="text-sm font-semibold truncate">{currentChapter.title}</div>
                    <div
                      style={{ color: activeTheme.mutedHex }}
                      className="text-[11px] font-mono-tabular"
                    >
                      {activeBookEntry.book.title} · Глава {currentChapter.chapterOrder}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setIsSettingsSheetOpen((prev) => !prev)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity cursor-pointer"
                      aria-label="Настройки чтения"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="px-6 sm:px-10 py-8 flex flex-col relative">
                {/* Full chapter text rendered continuously on one page */}
                <div
                  style={{
                    fontSize: `${settings.fontSizeSp}px`,
                    lineHeight: Math.max(1.65, settings.arabicScaleFactor * 1.45),
                  }}
                  className="font-reader tracking-normal space-y-4"
                >
                  {currentChapter.content
                    .split('\n')
                    .map((lineText, lineIdx) => {
                      const isRtlLine = isArabicParagraphLine(lineText);
                      if (!lineText.trim()) {
                        return <div key={lineIdx} className="h-2" />;
                      }
                      return (
                        <div
                          key={lineIdx}
                          dir={isRtlLine ? 'rtl' : 'ltr'}
                          className={isRtlLine ? 'text-right' : 'text-left'}
                        >
                          {lineText.split(/([¹²³⁴⁵⁶⁷⁸⁹⁰]+)/g).map((part, idx) => {
                            const supMap: Record<string, string> = {
                              '¹': '1',
                              '²': '2',
                              '³': '3',
                              '⁴': '4',
                              '⁵': '5',
                              '⁶': '6',
                              '⁷': '7',
                              '⁸': '8',
                              '⁹': '9',
                              '⁰': '0',
                            };
                            if (/^[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/.test(part)) {
                              const fnId = part
                                .split('')
                                .map((c) => supMap[c] || c)
                                .join('');
                              const fnObj = currentReaderNormalizedDoc.footnotes.find(
                                (f) => f.id === fnId
                              );
                              if (fnObj) {
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveFootnotePopup(fnObj);
                                    }}
                                    title={`Сноска ${fnId}: ${fnObj.anchor_text}`}
                                    className="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-[11px] font-mono-tabular font-bold rounded bg-amber-500/20 text-amber-700 border border-amber-600/40 align-super hover:bg-amber-500/30 transition-colors cursor-pointer"
                                  >
                                    {part}
                                  </button>
                                );
                              }
                            }
                            return (
                              <React.Fragment key={idx}>
                                {renderMixedArabicFragment(
                                  part,
                                  settings.fontSizeSp,
                                  settings.arabicScaleFactor,
                                  `p-${lineIdx}-${idx}`
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>


                {/* Chapter footer & actions styled as in user's reference */}
                <div className="pt-4 mt-8 flex flex-col items-center w-full">
                  {/* Dashed line */}
                  <div className="w-full border-t-2 border-dashed border-[#cbb396]/70 dark:border-stone-700 my-6" />

                  {/* 3 Diamonds + "Конец главы" */}
                  <div className="flex flex-col items-center gap-1.5 mb-6 text-center">
                    <div className="flex items-center gap-2.5 text-[#a84b0b] dark:text-amber-500 text-sm select-none">
                      <span>❖</span>
                      <span>❖</span>
                      <span>❖</span>
                    </div>
                    <div className="font-serif font-bold text-slate-800 dark:text-stone-200 text-sm tracking-wide">
                      Конец главы
                    </div>
                  </div>

                  {/* Buttons stack */}
                  <div className="w-full max-w-md mx-auto flex flex-col items-center gap-3.5">
                    {/* Button 1: Test */}
                    {currentChapter.quiz && currentChapter.quiz.length > 0 && (
                      <button
                        onClick={() => handleStartQuiz(activeBookId, currentChapter.id)}
                        className="w-full rounded-2xl bg-[#a64708] hover:bg-[#913d05] text-white p-4 shadow-md shadow-amber-950/20 flex items-center justify-between gap-3 font-serif font-bold text-base transition-all transform active:scale-[0.99] cursor-pointer"
                      >
                        <span className="flex-1 text-center pl-4">
                          Пройти тест по главе ({currentChapter.quiz.length} вопр.)
                        </span>
                        <ArrowRight className="w-5 h-5 shrink-0 text-white/90 mr-1" />
                      </button>
                    )}

                    {/* Button 2: Previous Chapter */}
                    {prevChapterObj && (
                      <button
                        onClick={() => {
                          handleChapterClicked(activeBookId, {
                            ...prevChapterObj,
                            status: 'AVAILABLE',
                            lastCharOffset: 0,
                          });
                        }}
                        className="w-full rounded-2xl border border-[#d7be9f] bg-[#ede7df]/90 hover:bg-[#e3dcd1] dark:bg-stone-800 dark:border-stone-700 p-3.5 text-center shadow-xs transition-colors cursor-pointer text-slate-900 dark:text-stone-100 font-serif font-semibold text-sm leading-snug"
                      >
                        ← Предыдущая глава: {prevChapterObj.title}
                      </button>
                    )}

                    {/* Button 3: Next Chapter */}
                    {nextChapterObj && (
                      <button
                        onClick={() => {
                          handleChapterClicked(activeBookId, {
                            ...nextChapterObj,
                            status: 'AVAILABLE',
                            lastCharOffset: 0,
                          });
                        }}
                        className="rounded-xl bg-[#157942] hover:bg-[#116737] text-white py-3 px-6 text-center shadow-md shadow-emerald-950/20 font-serif font-semibold text-sm transition-all transform active:scale-[0.99] cursor-pointer"
                      >
                        Следующая глава: {nextChapterObj.title} →
                      </button>
                    )}

                    {/* Button 4: Return to Contents */}
                    <button
                      onClick={() => {
                        setSelectedBookIdForSheet(activeBookId);
                        setActiveSection('library');
                      }}
                      className="rounded-xl border border-[#d7be9f] bg-[#faf8f5]/80 hover:bg-[#f1ece4] dark:bg-stone-900/60 dark:border-stone-700 py-2.5 px-6 text-center text-[#9b4006] dark:text-amber-500 font-serif font-bold text-sm shadow-xs transition-colors cursor-pointer mt-1"
                    >
                      Вернуться к оглавлению
                    </button>
                  </div>
                </div>
              </div>

              {/* Footnote bottom sheet modal matching user's design reference */}
              {activeFootnotePopup && (
                <div
                  className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 select-text"
                  onClick={() => setActiveFootnotePopup(null)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      backgroundColor: activeTheme.surfaceHex,
                      borderColor: activeTheme.borderHex,
                      color: activeTheme.textHex,
                    }}
                    className="w-full max-w-xl rounded-t-3xl sm:rounded-2xl border p-5 sm:p-6 shadow-2xl space-y-3 animate-in fade-in slide-in-from-bottom duration-200"
                  >
                    {/* Header Row 1: [ID] Badge + "Сноска к тексту" */}
                    <div className="flex items-center gap-2.5">
                      <span className="bg-[#b34b07] text-white text-xs sm:text-sm font-bold px-2 py-0.5 rounded-md tracking-wide">
                        [{activeFootnotePopup.id}]
                      </span>
                      <span className="font-serif font-bold text-base sm:text-lg text-[#963e05] dark:text-amber-500">
                        Сноска к тексту
                      </span>
                    </div>

                    {/* Header Row 2: A- 18 A+ pill and ✕ Закрыть button */}
                    <div
                      className="flex items-center justify-between gap-3 pb-3 border-b"
                      style={{ borderColor: activeTheme.borderHex }}
                    >
                      <div className="flex items-center gap-2.5 bg-[#e8decb]/80 dark:bg-stone-800 border border-[#d9ccb6] dark:border-stone-700 rounded-xl px-3 py-1">
                        <button
                          type="button"
                          onClick={() => setFootnoteFontSize((s) => Math.max(12, s - 2))}
                          disabled={footnoteFontSize <= 12}
                          className="font-bold text-sm text-stone-800 dark:text-stone-200 hover:opacity-75 disabled:opacity-40 cursor-pointer min-h-[32px] px-1"
                          title="Уменьшить шрифт сноски"
                        >
                          A-
                        </button>
                        <span className="font-mono font-bold text-sm text-[#b34b07] dark:text-amber-500 min-w-[20px] text-center">
                          {footnoteFontSize}
                        </span>
                        <button
                          type="button"
                          onClick={() => setFootnoteFontSize((s) => Math.min(28, s + 2))}
                          disabled={footnoteFontSize >= 28}
                          className="font-bold text-sm text-stone-800 dark:text-stone-200 hover:opacity-75 disabled:opacity-40 cursor-pointer min-h-[32px] px-1"
                          title="Увеличить шрифт сноски"
                        >
                          A+
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveFootnotePopup(null)}
                        className="bg-[#b34b07] hover:bg-[#973f05] text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <span className="text-sm leading-none">✕</span>
                        <span>Закрыть</span>
                      </button>
                    </div>

                    {/* Footnote Body Text */}
                    <div
                      style={{
                        fontSize: `${footnoteFontSize}px`,
                        lineHeight: 1.6,
                      }}
                      className="pt-2 font-serif text-slate-900 dark:text-stone-100 max-h-[55vh] overflow-y-auto space-y-2 pr-1"
                    >
                      {(activeFootnotePopup.text || '').split('\n').map((fnLine, fnIdx) => {
                        const isRtlFn = isArabicParagraphLine(fnLine);
                        return (
                          <div
                            key={fnIdx}
                            dir={isRtlFn ? 'rtl' : 'ltr'}
                            className={isRtlFn ? 'text-right' : 'text-left'}
                          >
                            {renderMixedArabicFragment(
                              fnLine,
                              footnoteFontSize,
                              settings.arabicScaleFactor,
                              `fn-${fnIdx}`
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {isSettingsSheetOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4"
                  onClick={() => setIsSettingsSheetOpen(false)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      backgroundColor: activeTheme.surfaceHex,
                      borderColor: activeTheme.borderHex,
                      color: activeTheme.textHex,
                    }}
                    className="w-full max-w-xl rounded-t-3xl sm:rounded-2xl border p-6 shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom duration-200"
                  >
                    <div className="w-10 h-1.5 bg-stone-400/50 rounded-full mx-auto -mt-2 mb-2" />
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold">Настройки чтения</h3>
                      <button
                        onClick={() => setIsSettingsSheetOpen(false)}
                        className="text-xs font-medium underline min-h-[36px] px-2 cursor-pointer"
                      >
                        Готово
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Type className="w-4 h-4" />
                        <span>Размер шрифта</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            setSettings((s) => ({
                              ...s,
                              fontSizeSp: Math.max(14, s.fontSizeSp - 2),
                            }))
                          }
                          disabled={settings.fontSizeSp <= 14}
                          className="min-h-[44px] min-w-[44px] rounded-xl border border-current/20 font-bold text-sm disabled:opacity-40 cursor-pointer"
                        >
                          А-
                        </button>
                        <span className="font-mono-tabular text-sm font-semibold w-14 text-center">
                          {settings.fontSizeSp} sp
                        </span>
                        <button
                          onClick={() =>
                            setSettings((s) => ({
                              ...s,
                              fontSizeSp: Math.min(28, s.fontSizeSp + 2),
                            }))
                          }
                          disabled={settings.fontSizeSp >= 28}
                          className="min-h-[44px] min-w-[44px] rounded-xl border border-current/20 font-bold text-sm disabled:opacity-40 cursor-pointer"
                        >
                          А+
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span>
                          Масштаб арабской вязи:{' '}
                          <strong className="font-mono-tabular">
                            {settings.arabicScaleFactor.toFixed(2)}x (
                            {(settings.fontSizeSp * settings.arabicScaleFactor).toFixed(1)} sp)
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSettings((s) => ({ ...s, arabicScaleFactor: 1.0 }))
                          }
                          className="px-2 py-0.5 rounded border border-current/20 text-[11px] font-mono-tabular hover:opacity-80 cursor-pointer"
                        >
                          Сброс 1.0x
                        </button>
                      </div>
                      <input
                        type="range"
                        min={1.0}
                        max={2.0}
                        step={0.05}
                        value={settings.arabicScaleFactor}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            arabicScaleFactor: Math.min(
                              2.0,
                              Math.max(1.0, parseFloat(e.target.value) || 1.0)
                            ),
                          }))
                        }
                        className="w-full accent-[#06372C] cursor-pointer"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {(Object.keys(READER_THEMES) as ReaderThemeId[]).map((themeKey) => {
                        const t = READER_THEMES[themeKey];
                        const isSelected = settings.theme === themeKey;
                        return (
                          <button
                            key={themeKey}
                            onClick={() => setSettings((s) => ({ ...s, theme: themeKey }))}
                            style={{
                              backgroundColor: t.bgHex,
                              color: t.textHex,
                              borderColor: isSelected ? '#B45309' : t.borderHex,
                            }}
                            className="min-h-[48px] rounded-xl border-2 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-amber-700" />}
                            <span>{t.displayName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 3: QUIZ */}
        {activeSection === 'quiz' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border border-stone-200/90 p-6 sm:p-8 shadow-xs">
              {!isQuizCompleted && currentQuestion ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4 border-b border-stone-100 pb-4">
                    <div>
                      <div className="text-xs text-stone-500 font-mono-tabular">
                        {activeBookEntry.book.title} · {currentChapter.title}
                      </div>
                      <h2 className="text-xl font-bold text-slate-900 font-display mt-0.5">
                        Вопрос {quizQuestionIndex + 1} из {currentChapter.quiz.length}
                      </h2>
                    </div>
                    <div className="text-xs font-mono-tabular font-semibold text-stone-600">
                      Верных: {correctAnswersCount}
                    </div>
                  </div>

                  <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-900 transition-all duration-300"
                      style={{
                        width: `${Math.round(
                          ((quizQuestionIndex + 1) / currentChapter.quiz.length) * 100
                        )}%`,
                      }}
                    />
                  </div>

                  <h3 className="text-lg sm:text-xl font-semibold text-slate-900 leading-snug">
                    {currentQuestion.question}
                  </h3>

                  <div className="space-y-3">
                    {currentQuestion.options.map((optText, idx) => {
                      const isSelected = selectedOptionIndex === idx;
                      const isCorrectOption = idx === currentQuestion.correctAnswerIndex;

                      let cardStyle =
                        'bg-stone-50/70 border-stone-200 text-slate-800 hover:border-stone-300';
                      if (isAnswerSubmitted) {
                        if (isCorrectOption) {
                          cardStyle = 'bg-emerald-50 border-emerald-600 text-emerald-950 font-medium';
                        } else if (isSelected && !isCorrectOption) {
                          cardStyle = 'bg-rose-50 border-rose-600 text-rose-950';
                        }
                      } else if (isSelected) {
                        cardStyle = 'bg-slate-900/5 border-slate-900 text-slate-900 font-medium';
                      }

                      const letter = String.fromCharCode(65 + idx);

                      return (
                        <button
                          key={idx}
                          disabled={isAnswerSubmitted}
                          onClick={() => setSelectedOptionIndex(idx)}
                          className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between gap-3 min-h-[56px] ${cardStyle}`}
                        >
                          <div className="flex items-center gap-3.5">
                            <span className="w-7 h-7 rounded-full border border-current/25 flex items-center justify-center text-xs font-mono-tabular font-bold shrink-0">
                              {letter}
                            </span>
                            <span className="text-sm sm:text-base">{optText}</span>
                          </div>

                          {isAnswerSubmitted && isCorrectOption && (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                          )}
                          {isAnswerSubmitted && isSelected && !isCorrectOption && (
                            <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {isAnswerSubmitted && (
                    <div className="rounded-xl bg-amber-50/90 border border-amber-200 p-4 flex items-start gap-3 text-amber-950">
                      <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-sm">
                        <div className="font-semibold">Пояснение</div>
                        <p className="text-amber-900/90 leading-relaxed">
                          {currentQuestion.explanation}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    {!isAnswerSubmitted ? (
                      <button
                        onClick={handleSubmitQuizAnswer}
                        disabled={selectedOptionIndex === null}
                        className="w-full py-3.5 px-6 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 hover:bg-slate-800 transition-colors min-h-[48px]"
                      >
                        Проверить ответ
                      </button>
                    ) : (
                      <button
                        onClick={handleNextQuizQuestion}
                        className="w-full py-3.5 px-6 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
                      >
                        <span>
                          {quizQuestionIndex + 1 < currentChapter.quiz.length
                            ? 'Следующий вопрос'
                            : 'Завершить тест'}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 space-y-6">
                  <div
                    className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${
                      isQuizPassed
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {isQuizPassed ? (
                      <Trophy className="w-10 h-10" />
                    ) : (
                      <BookOpen className="w-10 h-10" />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div
                      className={`text-5xl font-bold font-mono-tabular ${
                        isQuizPassed ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {quizScorePercent}%
                    </div>
                    <h2 className="text-2xl font-bold font-display text-slate-900">
                      {isQuizPassed ? 'Глава успешно пройдена!' : 'Тест не пройден'}
                    </h2>
                    <p className="text-sm text-stone-600 max-w-md mx-auto">
                      Правильных ответов: {correctAnswersCount} из {currentChapter.quiz.length}.{' '}
                      {isQuizPassed
                        ? nextChapterObj
                          ? `Следующая глава («${nextChapterObj.title}») разблокирована!`
                          : `Вы завершили все главы книги «${activeBookEntry.book.title}»!`
                        : `Для разблокировки следующей главы необходимо набрать минимум ${PASSING_SCORE_PERCENT}%.`}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                    {isQuizPassed ? (
                      <>
                        {nextChapterObj ? (
                          <button
                            onClick={() =>
                              handleChapterClicked(activeBookId, {
                                ...nextChapterObj,
                                status: 'AVAILABLE',
                                lastCharOffset: 0,
                              })
                            }
                            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold flex items-center justify-center gap-2 min-h-[48px]"
                          >
                            <span>Следующая глава</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setActiveSection('library')}
                            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold flex items-center justify-center gap-2 min-h-[48px]"
                          >
                            <span>Вернуться в библиотеку</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => setActiveSection('reader')}
                        className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 min-h-[48px]"
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>Перечитать главу</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleStartQuiz(activeBookId, currentChapter.id)}
                      className="w-full sm:w-auto px-5 py-3.5 rounded-xl border border-stone-300 text-slate-800 hover:bg-stone-100 text-sm font-semibold flex items-center justify-center gap-2 min-h-[48px]"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Повторить тест</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 4: APK EXPORT */}
        {activeSection === 'apk' && (
          <div className="space-y-8">
            <div className="bg-white rounded-2xl border border-stone-200/90 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-stone-100 pb-6">
                <div className="flex items-start sm:items-center gap-5 max-w-2xl">
                  <img
                    src="/icon.svg"
                    alt="Иконка Android-приложения"
                    referrerPolicy="no-referrer"
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl shadow-md border border-amber-500/30 shrink-0"
                  />
                  <div className="space-y-2">
                    <div className="text-xs text-stone-500 font-mono-tabular">
                      Kotlin 2.0.21 · Target SDK 35 · Room 2.6.1 · «Простые благодеяния» ({totalCatalogChaptersCount} глав, {totalCatalogQuestionsCount} вопросов) · Иконка ic_launcher
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
                      Скачивание готового APK и исходного проекта Android Studio
                    </h1>
                    <p className="text-sm text-stone-600 leading-relaxed">
                      Скачайте подписанный установочный файл{' '}
                      <code className="font-mono-tabular">InteractiveReader.apk</code> с фирменной
                      иконкой полумесяца и чёток напрямую на смартфон или архив проекта с исходным кодом.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    onClick={handleDownloadApk}
                    disabled={isDownloadingApk}
                    className="px-5 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold flex items-center gap-2.5 min-h-[48px] shadow-xs transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {isDownloadingApk
                        ? 'Скачивание APK...'
                        : `Скачать InteractiveReader.apk (${
                            apkVerifiedBytes ? `${Math.round(apkVerifiedBytes / 1024)} КБ` : 'Готов'
                          })`}
                    </span>
                  </button>
                  <button
                    onClick={handleDownloadZip}
                    disabled={isDownloadingZip}
                    className="px-5 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2.5 min-h-[48px] shadow-xs transition-colors"
                  >
                    <FileCode2 className="w-4 h-4" />
                    <span>
                      {isDownloadingZip
                        ? 'Упаковка архива...'
                        : 'Скачать Android Studio проект (.zip)'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="pt-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900 font-display">
                    Инспектор файлов проекта ({projectFiles.length})
                  </h2>
                  <button
                    onClick={() =>
                      handleCopySource(projectFiles[selectedSourceIndex]?.content || '')
                    }
                    className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs font-medium text-slate-700 hover:bg-stone-100 flex items-center gap-1.5"
                  >
                    {copiedFile ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Копировать код файла</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-4 space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                    {projectFiles.map((file, idx) => (
                      <button
                        key={file.path}
                        onClick={() => setSelectedSourceIndex(idx)}
                        className={`w-full text-left p-3 rounded-xl border text-xs transition-colors ${
                          selectedSourceIndex === idx
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-[#F8F6F1] text-slate-800 border-stone-200/80 hover:bg-stone-200/50'
                        }`}
                      >
                        <div className="font-mono-tabular font-semibold truncate">{file.path}</div>
                        <div
                          className={`text-[11px] mt-0.5 truncate ${
                            selectedSourceIndex === idx ? 'text-stone-300' : 'text-stone-500'
                          }`}
                        >
                          {file.description}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="lg:col-span-8 bg-slate-950 text-slate-100 rounded-xl p-4 overflow-x-auto max-h-[420px]">
                    <div className="text-xs font-mono-tabular text-amber-400 mb-2 pb-2 border-b border-slate-800">
                      {projectFiles[selectedSourceIndex]?.path}
                    </div>
                    <pre className="text-xs font-mono-tabular leading-relaxed">
                      <code>{projectFiles[selectedSourceIndex]?.content}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* BookDetailsBottomSheet (ModalBottomSheet equivalent) */}
      {selectedBookDetails && (
        <div
          onClick={() => setSelectedBookIdForSheet(null)}
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-stone-200"
          >
            {/* Drag handle */}
            <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto mt-3 sm:hidden" />

            {/* Sheet Header: Poster, Title, Author, Full Scrollable Description */}
            <div className="p-6 border-b border-stone-100 flex flex-col sm:flex-row gap-5 items-start">
              <div className="w-24 sm:w-28 shrink-0 mx-auto sm:mx-0">
                <BookCoverPoster book={selectedBookDetails.book} />
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-stone-500 font-mono-tabular">
                      {selectedBookDetails.book.genre} · {selectedBookDetails.book.year}
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 font-display">
                      {selectedBookDetails.book.title}
                    </h2>
                    <p className="text-sm font-medium text-stone-600">
                      {selectedBookDetails.book.author}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedBookIdForSheet(null)}
                    aria-label="Закрыть шторку"
                    className="min-h-[38px] min-w-[38px] rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-500"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed max-h-28 overflow-y-auto pr-1">
                  {selectedBookDetails.book.description}
                </p>

                <div className="pt-1 flex items-center justify-between text-xs font-mono-tabular">
                  <span className="text-stone-500">Прогресс чтения книги</span>
                  <span className="font-semibold text-slate-900">
                    {selectedBookDetails.completedChaptersCount} /{' '}
                    {selectedBookDetails.totalChaptersCount} глав (
                    {Math.round(selectedBookDetails.progressRatio * 100)}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Chapters List (LazyColumn with PASSED / AVAILABLE / LOCKED statuses) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Оглавление ({selectedBookDetails.chapters.length}{' '}
                {selectedBookDetails.chapters.length >= 5 ? 'глав' : 'главы'})
              </div>

              {selectedBookDetails.chapters.map((ch) => {
                const isLocked = ch.status === 'LOCKED';
                const isPassed = ch.status === 'PASSED';

                return (
                  <button
                    key={ch.id}
                    onClick={() => handleChapterClicked(selectedBookDetails.book.id, ch)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between gap-4 min-h-[64px] ${
                      isLocked
                        ? 'bg-stone-100/80 border-stone-200/80 opacity-65'
                        : 'bg-[#F8F6F1] border-stone-200/90 hover:border-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          isPassed
                            ? 'bg-emerald-100 text-emerald-700'
                            : isLocked
                            ? 'bg-stone-200 text-stone-500'
                            : 'bg-slate-900 text-white'
                        }`}
                      >
                        {isPassed ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : isLocked ? (
                          <Lock className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4 fill-current" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{ch.title}</div>
                        {(isPassed || isLocked || ch.lastCharOffset > 0) && (
                          <div className="text-xs text-stone-500 font-mono-tabular mt-0.5">
                            {isPassed
                              ? `Пройдено · Тест сдан на ${ch.score}%`
                              : isLocked
                              ? 'Заблокировано · Сначала пройдите предыдущую главу и тест'
                              : `Продолжить чтение (смещение ${ch.lastCharOffset} симв.)`}
                          </div>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Content-Architect Modal (Jetpack Compose / Room FTS5 / Kotlinx Serialization JSON Pipeline) */}
      {isArchitectOpen && (
        <div
          onClick={() => setIsArchitectOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-6xl rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-stone-200"
          >
            {/* Header */}
            <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono-tabular text-amber-400">
                  Jetpack Compose · Room FTS5 · Kotlinx Serialization / Moshi · BiDi (\u2067...\u2069)
                </div>
                <h2 className="text-lg sm:text-xl font-bold font-display">
                  Контент-архитектор и проверка добавления глав (RU / EN / AR)
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setArchitectMode('inspect')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    architectMode === 'inspect'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-stone-200 hover:bg-slate-700'
                  }`}
                >
                  Инспектор глав
                </button>
                <button
                  onClick={() => {
                    setRawBookSlug('prostye-blagodeyaniya');
                    setRawChapterNumber(architectBookEntry.chapters.length + 1);
                    setArchitectMode('create_raw');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    architectMode === 'create_raw'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-stone-200 hover:bg-slate-700'
                  }`}
                >
                  + Из сырого текста (Raw → JSON)
                </button>
                <button
                  onClick={() => {
                    if (!jsonInputText.trim()) {
                      setJsonInputText(JSON.stringify(architectDocumentResult.doc, null, 2));
                    }
                    setArchitectMode('create_json');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    architectMode === 'create_json'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-stone-200 hover:bg-slate-700'
                  }`}
                >
                  + Из JSON схемы
                </button>
                <button
                  onClick={() => setIsArchitectOpen(false)}
                  aria-label="Закрыть"
                  className="ml-2 p-1.5 rounded-lg hover:bg-slate-800 text-stone-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 bg-[#F8F6F1]">
              {/* Top Controls: Select Book / Chapter or Input Raw Params */}
              {architectMode === 'inspect' && (
                <div className="bg-white rounded-xl border border-stone-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1.5">
                      Книга библиотеки (`book_id`)
                    </label>
                    <select
                      value={architectBookId}
                      onChange={(e) => {
                        const newBookId = Number(e.target.value);
                        setArchitectBookId(newBookId);
                        const found = booksWithProgress.find((b) => b.book.id === newBookId);
                        if (found && found.chapters[0]) {
                          setArchitectChapterId(found.chapters[0].id);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-[#F8F6F1] text-sm font-medium text-slate-900"
                    >
                      {booksWithProgress.map((b) => (
                        <option key={b.book.id} value={b.book.id}>
                          {b.book.title} ({b.chapters.length} глав)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1.5">
                      Глава для проверки нормализации JSON и FTS5
                    </label>
                    <select
                      value={architectChapterId}
                      onChange={(e) => setArchitectChapterId(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-[#F8F6F1] text-sm font-medium text-slate-900"
                    >
                      {architectBookEntry.chapters.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          Глава {ch.chapterOrder}: {ch.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {architectMode === 'create_raw' && (
                <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Входные параметры Контент-архитектора (`book_id`, `chapter_number`, `chunk_info`, `raw_content`)
                      </h3>
                      <p className="text-xs text-stone-500">
                        Автоматическая очистка OCR-переносов, кавычек «...», BiDi изолятов `\u2067...\u2069`, сносок `&#123;&#123;fn:ID&#125;&#125;`, бейтов `sadr || ajuz` и генерация `search_text` для Room FTS5.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setRawChapterTitle(
                          'Глава 13. Достоинство чтения салаватов и зикра (RU / AR / FTS5)'
                        );
                        setRawInputText(DEMO_RAW_CHAPTER_INPUT);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs font-semibold text-slate-700 hover:bg-stone-100"
                    >
                      Загрузить эталонный пример (RU + AR + Бейт + Словарь + Сноски)
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Книга назначения
                      </label>
                      <select
                        value={architectBookId}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          setArchitectBookId(id);
                          setRawBookSlug(
                            id === 5 ? 'prostye-blagodeyaniya' : 'psihologiya-islamskiy-diskurs'
                          );
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-[#F8F6F1] text-xs font-medium"
                      >
                        {booksWithProgress.map((b) => (
                          <option key={b.book.id} value={b.book.id}>
                            {b.book.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        `book_id` (slug/uuid)
                      </label>
                      <input
                        type="text"
                        value={rawBookSlug}
                        onChange={(e) => setRawBookSlug(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-[#F8F6F1] text-xs font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        `chapter_number`
                      </label>
                      <input
                        type="number"
                        value={rawChapterNumber}
                        onChange={(e) => setRawChapterNumber(Number(e.target.value) || 1)}
                        className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-[#F8F6F1] text-xs font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        `chunk_info`
                      </label>
                      <input
                        type="text"
                        value={rawChunkInfo}
                        onChange={(e) => setRawChunkInfo(e.target.value)}
                        placeholder="часть 1 из 3"
                        className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-[#F8F6F1] text-xs font-mono-tabular"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      Заголовок главы (`title.ru`)
                    </label>
                    <input
                      type="text"
                      value={rawChapterTitle}
                      onChange={(e) => setRawChapterTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-[#F8F6F1] text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      `raw_content` (поддерживаются сноски `[1]` или `&#123;&#123;fn:fn_1&#125;&#125;`, бейты через `||`, словарь `Слово — перевод`, арабский текст с огласовками)
                    </label>
                    <textarea
                      rows={6}
                      value={rawInputText}
                      onChange={(e) => setRawInputText(e.target.value)}
                      className="w-full p-3 rounded-xl border border-stone-300 bg-[#F8F6F1] text-xs font-mono-tabular leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleAddNormalizedChapterToBook}
                      className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-2 shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>Нормализовать и добавить главу в книгу «{architectBookEntry.book.title}»</span>
                    </button>
                  </div>
                </div>
              )}

              {architectMode === 'create_json' && (
                <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Прямой импорт и валидация JSON (Kotlinx Serialization / Moshi)
                      </h3>
                      <p className="text-xs text-stone-500">
                        Вставьте JSON-объект по схеме промта (`book_id`, `chapter_number`, `chunk_meta`, `title`, `blocks`, `footnotes`).
                      </p>
                    </div>
                    {architectDocumentResult.error ? (
                      <span className="px-2.5 py-1 rounded-md bg-rose-100 text-rose-800 text-xs font-semibold">
                        {architectDocumentResult.error}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-semibold">
                        Валидный JSON
                      </span>
                    )}
                  </div>

                  <textarea
                    rows={8}
                    value={jsonInputText}
                    onChange={(e) => setJsonInputText(e.target.value)}
                    className="w-full p-3 rounded-xl border border-stone-300 bg-slate-950 text-emerald-300 text-xs font-mono-tabular leading-relaxed"
                  />

                  <div className="flex justify-end">
                    <button
                      onClick={handleAddNormalizedChapterToBook}
                      disabled={Boolean(architectDocumentResult.error)}
                      className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-2 shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>Импортировать JSON как новую главу в «{architectBookEntry.book.title}»</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 5-Point Prompt Verification Audit Report */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {architectAudit.map((check) => (
                  <div
                    key={check.ruleNumber}
                    className="bg-white p-3.5 rounded-xl border border-stone-200 space-y-1"
                  >
                    <div
                      className={`flex items-center justify-between text-xs font-bold ${
                        check.passed ? 'text-emerald-800' : 'text-amber-800'
                      }`}
                    >
                      <span>
                        {check.ruleNumber}. {check.ruleTitle.split('(')[0].trim()}
                      </span>
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${
                          check.passed ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      />
                    </div>
                    <p className="text-[11px] text-stone-600 leading-snug">{check.details}</p>
                  </div>
                ))}
              </div>

              {/* Two-Column Inspector: Left = Interactive Blocks & Footnotes Preview, Right = Strict JSON Output */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left: Rendered Jetpack Compose Block Preview */}
                <div className="lg:col-span-6 bg-white rounded-xl border border-stone-200 p-4 sm:p-5 space-y-4 max-h-[460px] overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Предпросмотр блоков Jetpack Compose (`AnnotatedString` + BiDi)
                      </h3>
                      <p className="text-[11px] text-stone-500">
                        Нажмите на маркер сноски `[fn]` для проверки `anchor_text` и `is_missing`
                      </p>
                    </div>
                    <span className="text-[11px] font-mono-tabular text-stone-500">
                      {architectDocumentResult.doc.blocks.length} блоков
                    </span>
                  </div>

                  {activeFootnotePopup && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold text-amber-950">
                        <span>
                          Сноска `{activeFootnotePopup.id}` · Привязка (`anchor_text`): «{activeFootnotePopup.anchor_text}»
                        </span>
                        <button
                          onClick={() => setActiveFootnotePopup(null)}
                          className="text-amber-900 hover:underline text-[11px]"
                        >
                          Закрыть
                        </button>
                      </div>
                      <p className="text-amber-900">
                        {activeFootnotePopup.is_missing
                          ? 'Пояснение отсутствует в исходнике (text: null, is_missing: true)'
                          : activeFootnotePopup.text}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {architectDocumentResult.doc.blocks.map((block) => {
                      const isRtl = block.direction === 'rtl';
                      const blockRawContent = `${block.text || ''} ${block.sadr || ''} ${block.ajuz || ''}`;
                      return (
                        <div
                          key={block.id}
                          dir={isRtl ? 'rtl' : 'ltr'}
                          className={`p-3.5 rounded-xl border space-y-2 ${
                            isRtl
                              ? 'bg-amber-50/40 border-amber-200/80'
                              : 'bg-[#F8F6F1] border-stone-200/80'
                          }`}
                        >
                          <div
                            dir="ltr"
                            className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-tabular text-stone-500 border-b border-stone-200/60 pb-1.5"
                          >
                            <span>
                              #{block.id} · `{block.type}` · lang=`{block.language}` · dir=`{block.direction}` · scale={block.typography.font_scale} · lh={block.typography.line_height_multiplier}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(block.copy_text);
                                showToast('Скопирован copy_text с атрибуцией книги и главы!');
                              }}
                              className="px-2 py-0.5 rounded bg-white border border-stone-300 text-slate-700 hover:bg-stone-100"
                            >
                              Копировать `copy_text`
                            </button>
                          </div>

                          {block.type === 'verse_pair' && block.sadr && block.ajuz ? (
                            <div
                              style={{
                                fontSize: `${Math.round(16 * (block.typography.font_scale || 1.25))}px`,
                                lineHeight: block.typography.line_height_multiplier || 1.6,
                              }}
                              className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-reader text-slate-900 py-1"
                            >
                              <div className="text-right pr-2 border-r border-amber-300">
                                <span className="block text-[10px] font-mono-tabular text-stone-400">
                                  sadr (1-е полустишие)
                                </span>
                                {block.sadr}
                              </div>
                              <div className="text-left pl-2">
                                <span className="block text-[10px] font-mono-tabular text-stone-400">
                                  ajuz (2-е полустишие)
                                </span>
                                {block.ajuz}
                              </div>
                            </div>
                          ) : block.type === 'vocabulary_item' && block.term ? (
                            <div className="flex flex-wrap items-baseline justify-between gap-3 py-1">
                              <span
                                dir="rtl"
                                style={{ fontSize: '20px', lineHeight: 1.6 }}
                                className="font-bold text-slate-900"
                              >
                                {block.term}
                              </span>
                              <span dir="ltr" className="text-xs font-medium text-stone-700">
                                — {block.morphology}
                              </span>
                            </div>
                          ) : (
                            <div
                              style={{
                                fontSize: `${Math.round(15 * (block.typography.font_scale || 1))}px`,
                                lineHeight: block.typography.line_height_multiplier || 1.5,
                              }}
                              className="font-reader text-slate-900 whitespace-pre-line"
                            >
                              {block.text}
                            </div>
                          )}

                          {/* Interactive footnote chips if present in block */}
                          {architectDocumentResult.doc.footnotes
                            .filter((fn) => blockRawContent.includes(`{{fn:${fn.id}}}`))
                            .map((fn) => (
                              <button
                                key={fn.id}
                                dir="ltr"
                                onClick={() => setActiveFootnotePopup(fn)}
                                className={`mr-1.5 mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono-tabular font-semibold ${
                                  fn.is_missing
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : 'bg-amber-100 text-amber-950 border border-amber-300'
                                }`}
                              >
                                <span>{`{{fn:${fn.id}}}`}</span>
                                <span>→ «{fn.anchor_text}»</span>
                              </button>
                            ))}

                          <div
                            dir="ltr"
                            className="pt-1 text-[10px] font-mono-tabular text-stone-500 truncate"
                            title={block.search_text}
                          >
                            <span className="font-semibold text-stone-600">FTS5 search_text:</span>{' '}
                            {block.search_text}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Strict Normalized JSON Output */}
                <div className="lg:col-span-6 bg-slate-950 text-slate-100 rounded-xl p-4 sm:p-5 flex flex-col max-h-[460px]">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                    <div>
                      <div className="text-xs font-mono-tabular text-amber-400 font-semibold">
                        NormalizedChapterDocument (Kotlinx Serialization / Moshi)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Строго валидный JSON без markdown-оберток · Готов к Room FTS5
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          JSON.stringify(architectDocumentResult.doc, null, 2)
                        );
                        setCopiedJsonBadge(true);
                        window.setTimeout(() => setCopiedJsonBadge(false), 1800);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono-tabular text-amber-300 flex items-center gap-1.5"
                    >
                      {copiedJsonBadge ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>JSON скопирован</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Копировать JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="flex-1 overflow-auto text-xs font-mono-tabular leading-relaxed text-emerald-300">
                    <code>{JSON.stringify(architectDocumentResult.doc, null, 2)}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
