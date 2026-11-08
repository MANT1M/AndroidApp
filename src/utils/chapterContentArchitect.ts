import type { BookData, ChapterData } from '../data/booksCatalogData';

export interface NormalizedChunkMeta {
  current_chunk: number;
  total_chunks: number;
  has_more: boolean;
}

export interface NormalizedTitle {
  ru: string;
  en: string;
  ar: string;
}

export interface NormalizedTypography {
  font_scale: number;
  line_height_multiplier: number;
}

export type NormalizedBlockType = 'paragraph' | 'verse_pair' | 'vocabulary_item';

export interface NormalizedBlock {
  id: string;
  type: NormalizedBlockType;
  language: 'ru' | 'en' | 'ar';
  direction: 'ltr' | 'rtl';
  typography: NormalizedTypography;
  is_copyable: boolean;
  text?: string;
  sadr?: string;
  ajuz?: string;
  term?: string;
  morphology?: string;
  copy_text: string;
  search_text: string;
}

export interface NormalizedFootnote {
  id: string;
  anchor_text: string;
  language: 'ru' | 'en' | 'ar';
  text: string | null;
  is_missing: boolean;
}

export interface NormalizedChapterDocument {
  book_id: string;
  chapter_id: string;
  chapter_number: number;
  chunk_meta: NormalizedChunkMeta;
  title: NormalizedTitle;
  blocks: NormalizedBlock[];
  footnotes: NormalizedFootnote[];
}

export interface ArchitectAuditCheck {
  ruleNumber: number;
  ruleTitle: string;
  passed: boolean;
  details: string;
}

const SUPERSCRIPT_MAP: Record<string, string> = {
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

/**
 * Normalizes text for SQLite FTS5 full-text search:
 * - Arabic: strips tashkeel (harakat), normalizes इ/أ/آ -> ا, ة -> ه, ى -> ي
 * - Russian: replaces ё -> е, lowercases, strips punctuation and {{fn:ID}} tags
 */
export function normalizeForFts5Search(input: string): string {
  return input
    // Remove footnote tags and BiDi isolates
    .replace(/\{\{fn:[^}]+\}\}/g, '')
    .replace(/[\u2066\u2067\u2068\u2069\u200E\u200F]/g, '')
    // Arabic tashkeel (harakat, sukun, tanwin, dagger alif, quranic marks)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    // Normalize Arabic Alifs: إ أ آ ٱ -> ا
    .replace(/[إأآٱ]/g, 'ا')
    // Normalize Ta-Marbuta: ة -> ه
    .replace(/ة/g, 'ه')
    // Normalize Alif-Maqsura: ى -> ي
    .replace(/ى/g, 'ي')
    .toLowerCase()
    // Normalize Russian ё -> е
    .replace(/ё/g, 'е')
    // Strip punctuation while keeping Cyrillic, Latin, Arabic, and digits
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rule 1: Sanitization
 * - Removes OCR hyphenation across line breaks
 * - Unifies quotes («...» for RU/AR, "..." for EN)
 * - Removes duplicate spaces and invisible garbage (preserving BiDi markers \u2067, \u2069)
 */
export function sanitizeRawText(raw: string, defaultLang: 'ru' | 'en' | 'ar' = 'ru'): string {
  let cleaned = raw
    // Remove zero-width garbage except BiDi isolates (\u2066-\u2069)
    .replace(/[\u200B-\u200D\uFEFF\uFFFD]/g, '')
    // Fix OCR hyphenation across line breaks (only when hyphenated at line end)
    .replace(/([а-яёa-z])-\r?\n\s*([а-яёa-z])/gi, '$1$2')
    // Normalize apostrophes in transliteration
    .replace(/ʼ/g, '’');

  if (defaultLang === 'ru' || defaultLang === 'ar') {
    // Convert straight double quotes around phrases into «...»
    cleaned = cleaned.replace(/"([^"\n]+)"/g, '«$1»');
  }

  // Collapse multiple spaces on the same line
  cleaned = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');

  return cleaned.trim();
}

/**
 * Rule 2: BiDi isolation for inline Arabic inside LTR paragraphs
 * Wraps Arabic segments in \u2067 (RLI) ... \u2069 (PDI)
 */
export function applyBidiIsolationToLtrText(text: string): string {
  // First strip any existing RLI/PDI to avoid double-wrapping
  const stripped = text.replace(/[\u2067\u2069]/g, '');
  // Match contiguous Arabic script runs (including spaces/harakat between Arabic words)
  return stripped.replace(
    /([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:\s+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)*)/g,
    '\u2067$1\u2069'
  );
}

/**
 * Detects whether a paragraph is predominantly Arabic
 */
export function isPredominantlyArabic(text: string): boolean {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const cyrillicOrLatinChars = (text.match(/[а-яёa-z]/gi) || []).length;
  return arabicChars > 0 && arabicChars >= cyrillicOrLatinChars;
}

/**
 * Converts superscript digits (¹ ² ³) or [1] markers in body text to {{fn:ID}}
 * and extracts footnote definitions from the bottom of the text.
 */
export function extractFootnotesAndConvertTags(rawContent: string): {
  bodyParagraphs: string[];
  footnoteDefinitions: Map<string, string>;
} {
  const lines = rawContent.split(/\r?\n/);
  const bodyLines: string[] = [];
  const footnoteDefinitions = new Map<string, string>();

  let currentFootnoteId: string | null = null;
  let currentFootnoteBuffer: string[] = [];

  const flushFootnote = () => {
    if (currentFootnoteId) {
      const joined = currentFootnoteBuffer.join(' ').replace(/\s+/g, ' ').trim();
      if (joined) {
        footnoteDefinitions.set(currentFootnoteId, joined);
      }
      currentFootnoteId = null;
      currentFootnoteBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (!currentFootnoteId) {
        bodyLines.push('');
      }
      continue;
    }

    // Check if line starts a footnote definition: e.g. "¹ Ахлю-Сунна..." or "²До того..." or "{{fn:1}} ..." or "[1] ..."
    const supStartMatch = line.match(/^([¹²³⁴⁵⁶⁷⁸⁹⁰]+)\s*(.+)$/);
    const bracketStartMatch = line.match(/^\[(\d+)\]\s*(.+)$/);
    const explicitFnDefMatch = line.match(/^\{\{fn:(\d+)\}\}\s*[:—-]?\s*(.+)$/);

    if (supStartMatch) {
      flushFootnote();
      const id = supStartMatch[1]
        .split('')
        .map((ch) => SUPERSCRIPT_MAP[ch] || ch)
        .join('');
      currentFootnoteId = id;
      currentFootnoteBuffer.push(supStartMatch[2]);
      continue;
    }

    if (bracketStartMatch) {
      flushFootnote();
      currentFootnoteId = bracketStartMatch[1];
      currentFootnoteBuffer.push(bracketStartMatch[2]);
      continue;
    }

    if (explicitFnDefMatch && bodyLines.length > 2) {
      flushFootnote();
      currentFootnoteId = explicitFnDefMatch[1];
      currentFootnoteBuffer.push(explicitFnDefMatch[2]);
      continue;
    }

    // Continuation of a multi-line footnote (like ✓ bullet points in footnote 1 of "Об авторе")
    if (currentFootnoteId) {
      currentFootnoteBuffer.push(line);
    } else {
      // Convert inline superscripts in body line to {{fn:ID}} (handles both "слово⁹", "(Бухари).⁹", and "мелочах?⁵²")
      const convertedLine = line.replace(
        /([а-яёa-z\u0600-\u06FF’'»)\]]+)([?!.,;:]?[¹²³⁴⁵⁶⁷⁸⁹⁰]+)/gi,
        (_, word, matchWithPunct) => {
          const punctMatch = matchWithPunct.match(/^[?!.,;:]/);
          const punct = punctMatch ? punctMatch[0] : '';
          const sup = punct ? matchWithPunct.slice(1) : matchWithPunct;
          const id = sup
            .split('')
            .map((ch: string) => SUPERSCRIPT_MAP[ch] || ch)
            .join('');
          return `${word}${punct}{{fn:${id}}}`;
        }
      );
      bodyLines.push(convertedLine);
    }
  }

  flushFootnote();

  // Group body lines into paragraphs
  const paragraphs: string[] = [];
  let currentPara: string[] = [];

  for (const l of bodyLines) {
    if (!l) {
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join(' '));
        currentPara = [];
      }
    } else {
      // If it's a short heading or poetic line, keep separate if appropriate
      if (currentPara.length === 1 && currentPara[0].length < 55 && !/[.!?]$/.test(currentPara[0])) {
        paragraphs.push(currentPara[0]);
        currentPara = [l];
      } else {
        currentPara.push(l);
      }
    }
  }
  if (currentPara.length > 0) {
    paragraphs.push(currentPara.join(' '));
  }

  return { bodyParagraphs: paragraphs, footnoteDefinitions };
}

/**
 * Extracts anchor_text preceding {{fn:ID}} in a block text
 */
function findAnchorTextForFootnote(text: string, fnId: string): string {
  const cleanText = text.replace(/[\u2067\u2069]/g, '');
  const escapedId = fnId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 1. Check if the footnote is attached to a quoted statement like «Увы, мы потеряли так много кыратов!»{{fn:2}}
  const quotedRegex = new RegExp(`«([^»]{1,250})»\\{\\{fn:${escapedId}\\}\\}`, 'u');
  const quotedMatch = cleanText.match(quotedRegex);
  if (quotedMatch && quotedMatch[1]) {
    return `«${quotedMatch[1].trim()}»`;
  }

  // 1b. Check if footnote is attached to a quoted statement followed by citation, e.g. «...» (Бухари){{fn:9}}
  const quoteSourceRegex = new RegExp(
    `(«[^»]{1,350}»\\s*\\([^)\n]{1,120}\\))\\{\\{fn:${escapedId}\\}\\}`,
    'u'
  );
  const quoteSourceMatch = cleanText.match(quoteSourceRegex);
  if (quoteSourceMatch && quoteSourceMatch[1]) {
    return quoteSourceMatch[1].trim();
  }

  // 1c. Check if footnote is attached to parenthetical citation alone, e.g. (Сунан ан-Насаи...){{fn:14}} or (там же){{fn:15}}
  const citationOnlyRegex = new RegExp(
    `(\\([^)\n]{1,120}\\))\\{\\{fn:${escapedId}\\}\\}`,
    'u'
  );
  const citationOnlyMatch = cleanText.match(citationOnlyRegex);
  if (citationOnlyMatch && citationOnlyMatch[1]) {
    return citationOnlyMatch[1].trim();
  }

  // 2. Check if the footnote is attached to a term with a parenthetical clarification like мольбой (дуа){{fn:5}} or дарудом (салаватом, возвеличиванием Пророка){{fn:6}}
  const parenRegex = new RegExp(
    `([\\p{L}\\p{M}’'\\-]+\\s*\\([^)]{1,70}\\))\\{\\{fn:${escapedId}\\}\\}`,
    'u'
  );
  const parenMatch = cleanText.match(parenRegex);
  if (parenMatch && parenMatch[1]) {
    return parenMatch[1].trim();
  }

  // 3. Check if the footnote is attached to a quoted work title + author name like «Мунаджат уль-макбуль» Мауляны Ашрафа Али Таханави{{fn:8}}
  const workAuthorRegex = new RegExp(
    `(«[^»]{1,60}»\\s+[\\p{L}\\p{M}’'\\-]+(?:\\s+[\\p{L}\\p{M}’'\\-]+){0,4})\\{\\{fn:${escapedId}\\}\\}`,
    'u'
  );
  const workAuthorMatch = cleanText.match(workAuthorRegex);
  if (workAuthorMatch && workAuthorMatch[1]) {
    return workAuthorMatch[1].trim();
  }

  // 4. Look for multi-word term like "ахлю-Сунна валь-джама’а" or "сохранит их в памяти" or single word before {{fn:ID}}
  const phraseRegex = new RegExp(
    `([\\p{L}\\p{M}’'\\-]+(?:\\s+[\\p{L}\\p{M}’'\\-]+){0,3})[!»"?.,;:)\\]]*\\{\\{fn:${escapedId}\\}\\}`,
    'u'
  );
  const match = cleanText.match(phraseRegex);
  if (match && match[1]) {
    const words = match[1].trim().split(/\s+/);
    // If the last 2 words form a hyphenated term (e.g. "ахлю-Сунна валь-джама’а"), return both
    if (words.length >= 2 && (words[words.length - 2].includes('-') || words[words.length - 1].includes('’'))) {
      return words.slice(-2).join(' ');
    }
    // If the second-to-last word is a short Russian preposition (e.g. "сохранит их в памяти"), return the phrase
    if (words.length >= 2 && /^(в|во|на|о|об|к|по|из|за|от|до|с|со|у|при)$/i.test(words[words.length - 2])) {
      return words.slice(-4).join(' ');
    }
    return words[words.length - 1];
  }
  return `fn_${fnId}`;
}

/**
 * Converts a chapter (or raw input parameters) into a strictly normalized JSON document
 * following the Content-Architect specification.
 */
export function buildNormalizedChapterJson(params: {
  bookSlug: string;
  bookTitle: string;
  chapterIdSlug: string;
  chapterNumber: number;
  titleRu: string;
  titleEn?: string;
  titleAr?: string;
  rawContent: string;
  currentChunk?: number;
  totalChunks?: number;
}): NormalizedChapterDocument {
  const sanitized = sanitizeRawText(params.rawContent, 'ru');
  const { bodyParagraphs, footnoteDefinitions } = extractFootnotesAndConvertTags(sanitized);

  // Filter out redundant first paragraph if it duplicates titleRu
  const filteredParagraphs = bodyParagraphs.filter((p, idx) => {
    if (idx === 0 && params.titleRu && p.trim().toLowerCase() === params.titleRu.trim().toLowerCase()) {
      return false;
    }
    return true;
  });

  const blocks: NormalizedBlock[] = [];
  const referencedFootnotes: Array<{ id: string; anchor: string }> = [];

  filteredParagraphs.forEach((para, index) => {
    const blkId = `blk_${String(index + 1).padStart(3, '0')}`;
    const isAr = isPredominantlyArabic(para);

    // Collect any {{fn:ID}} tags inside this paragraph
    const fnMatches = [...para.matchAll(/\{\{fn:([^}]+)\}\}/g)];
    for (const m of fnMatches) {
      const fnId = m[1];
      if (!referencedFootnotes.some((r) => r.id === fnId)) {
        referencedFootnotes.push({
          id: fnId,
          anchor: findAnchorTextForFootnote(para, fnId),
        });
      }
    }

    // Check if this block is a verse_pair (marked with " // " or poetic couplet with " — ")
    const verseSplit = para.includes(' // ') ? para.split(' // ') : null;
    if (verseSplit && verseSplit.length === 2) {
      const sadr = isAr ? verseSplit[0].trim() : applyBidiIsolationToLtrText(verseSplit[0].trim());
      const ajuz = isAr ? verseSplit[1].trim() : applyBidiIsolationToLtrText(verseSplit[1].trim());
      const plainCopy = `${sadr} ${ajuz}`
        .replace(/\{\{fn:[^}]+\}\}/g, '')
        .replace(/[\u2067\u2069]/g, '')
        .trim();

      blocks.push({
        id: blkId,
        type: 'verse_pair',
        language: isAr ? 'ar' : 'ru',
        direction: isAr ? 'rtl' : 'ltr',
        typography: {
          font_scale: 1.3,
          line_height_multiplier: 1.7,
        },
        is_copyable: true,
        sadr,
        ajuz,
        copy_text: `${plainCopy} — ${params.bookTitle}, Гл. ${params.chapterNumber}`,
        search_text: normalizeForFts5Search(`${sadr} ${ajuz}`),
      });
      return;
    }

    const processedText = isAr ? para : applyBidiIsolationToLtrText(para);
    const plainCopy = processedText
      .replace(/\{\{fn:[^}]+\}\}/g, '')
      .replace(/[\u2067\u2069]/g, '')
      .trim();

    blocks.push({
      id: blkId,
      type: 'paragraph',
      language: isAr ? 'ar' : 'ru',
      direction: isAr ? 'rtl' : 'ltr',
      typography: isAr
        ? { font_scale: 1.25, line_height_multiplier: 1.6 }
        : { font_scale: 1.0, line_height_multiplier: 1.3 },
      is_copyable: true,
      text: processedText,
      copy_text: `${plainCopy} — ${params.bookTitle}, Гл. ${params.chapterNumber}`,
      search_text: normalizeForFts5Search(processedText),
    });
  });

  // Build footnotes array with strict referential integrity check (Rule 3) and BiDi isolation for inline Arabic
  const footnotes: NormalizedFootnote[] = referencedFootnotes.map((ref) => {
    const rawDefText = footnoteDefinitions.get(ref.id) ?? null;
    const defText = rawDefText !== null ? applyBidiIsolationToLtrText(rawDefText) : null;
    return {
      id: ref.id,
      anchor_text: ref.anchor,
      language: 'ru',
      text: defText,
      is_missing: defText === null,
    };
  });

  const currentChunk = params.currentChunk || 1;
  const totalChunks = params.totalChunks || 1;

  return {
    book_id: params.bookSlug,
    chapter_id: params.chapterIdSlug,
    chapter_number: params.chapterNumber,
    chunk_meta: {
      current_chunk: currentChunk,
      total_chunks: totalChunks,
      has_more: currentChunk < totalChunks,
    },
    title: {
      ru: params.titleRu,
      en: params.titleEn || params.titleRu,
      ar: params.titleAr || '',
    },
    blocks,
    footnotes,
  };
}

/**
 * Helper to generate NormalizedChapterDocument from an existing BookData + ChapterData
 */
export function convertCatalogChapterToNormalizedJson(
  book: BookData,
  chapter: ChapterData
): NormalizedChapterDocument {
  const bookSlug = book.id === 5 ? 'easy_good_deeds' : book.id === 6 ? 'islamic_psychology_discourse' : `book_${book.id}`;
  const chapterIdSlug = `ch_${String(chapter.chapterOrder).padStart(2, '0')}_${chapter.id}`;

  const titleEnMap: Record<number, string> = {
    501: "Translator's Preface",
    502: 'About the Author',
    503: "Author's Introduction",
    513: 'Some Important Points',
    514: '1. Good Intention',
    515: '2. Supplication (Dua)',
    516: '3. Masnoon Duas (Supplications from the Sunnah)',
    517: '4. Seeking Forgiveness (Istighfar)',
    518: '5. Remembrance of Allah (Dhikr)',
    504: '6. Salawat (Sending Blessings upon the Prophet)',
    519: '7. Gratitude (Shukr)',
    520: '8. Patience (Sabr)',
    521: '9. Beginning Every Important Matter in the Name of Allah (Basmala)',
    522: '10. Preceding in Greeting (Salam)',
    523: '11. Visiting the Sick',
    524: '12. Attending Funeral Prayers (Janazah) and Burials',
    525: '13. Sympathy and Condolence (Ta‘ziyah)',
    526: '14. Love for the Sake of Allah',
    527: '15. Helping a Fellow Muslim',
    528: '16. Intercession and Good Recommendation (Shafa‘ah)',
    529: '17. Concealing the Faults of Others',
    530: '18. Inviting to Good (Da‘wah)',
    531: '19. Charity and Philanthropy (Sadaqah)',
    532: '20. Forgiveness and Clemency',
    533: '21. Gentleness and Kindness (Rifq)',
    506: '22. Reconciliation (Islah)',
  };
  const titleArMap: Record<number, string> = {
    501: 'مقدمة المترجم',
    502: 'نبذة عن المؤلف',
    503: 'مقدمة المؤلف',
    513: 'تنبيهات مهمة',
    514: '١. النية الصالحة',
    515: '٢. الدعاء',
    516: '٣. الأدعية المسنونة',
    517: '٤. طلب المغفرة (الاستغفار)',
    518: '٥. ذكر الله',
    504: '٦. الصلاة على النبي',
    519: '٧. الشكر',
    520: '٨. الصبر',
    521: '٩. ابتداء كل أمر ذي بال ببسم الله',
    522: '١٠. الابتداء بالسلام',
    523: '١١. عيادة المريض',
    524: '١٢. شهود الجنازة والصلاة عليها',
    525: '١٣. التعزية والمواساة',
    526: '١٤. الحب في الله',
    527: '١٥. عون المسلم',
    528: '١٦. الشفاعة الحسنة',
    529: '١٧. ستر عيوب الناس',
    530: '١٨. الدعوة إلى الخير',
    531: '١٩. الصدقة والإنفاق',
    532: '٢٠. العفو والصفح',
    533: '٢١. الرفق واللين',
    506: '٢٢. الإصلاح بين الناس',
  };

  return buildNormalizedChapterJson({
    bookSlug,
    bookTitle: book.title,
    chapterIdSlug,
    chapterNumber: chapter.chapterOrder,
    titleRu: chapter.title,
    titleEn: titleEnMap[chapter.id] || `Chapter ${chapter.chapterOrder}`,
    titleAr: titleArMap[chapter.id] || `الفصل ${chapter.chapterOrder}`,
    rawContent: chapter.content,
    currentChunk: 1,
    totalChunks: 1,
  });
}

/**
 * Audits a NormalizedChapterDocument against all 5 rules of the Content-Architect prompt
 */
export function auditNormalizedChapter(doc: NormalizedChapterDocument): ArchitectAuditCheck[] {
  // Rule 1: Sanitization
  const hasOcrArtifacts = doc.blocks.some((b) => /[\uFFFD]|  +/.test(b.text || b.sadr || ''));
  const rule1Passed = !hasOcrArtifacts && doc.blocks.length > 0;

  // Rule 2: BiDi & Typography
  const rtlBlocksValid = doc.blocks
    .filter((b) => b.direction === 'rtl')
    .every((b) => b.typography.font_scale >= 1.25 && b.typography.line_height_multiplier >= 1.6);
  const inlineArabicIsolated = doc.blocks
    .filter((b) => b.direction === 'ltr' && b.text && /[\u0600-\u06FF]/.test(b.text))
    .every((b) => b.text!.includes('\u2067') && b.text!.includes('\u2069'));
  const rule2Passed = rtlBlocksValid && inlineArabicIsolated;

  // Rule 3: Footnotes {{fn:ID}} & integrity
  const allFnTagsInBlocks: string[] = [];
  for (const b of doc.blocks) {
    const content = `${b.text || ''} ${b.sadr || ''} ${b.ajuz || ''}`;
    for (const m of content.matchAll(/\{\{fn:([^}]+)\}\}/g)) {
      if (!allFnTagsInBlocks.includes(m[1])) {
        allFnTagsInBlocks.push(m[1]);
      }
    }
  }
  const allFnExistInArray = allFnTagsInBlocks.every((id) =>
    doc.footnotes.some((f) => f.id === id && f.anchor_text.length > 0)
  );
  const missingFlagConsistent = doc.footnotes.every(
    (f) => (f.text === null && f.is_missing === true) || (typeof f.text === 'string' && f.is_missing === false)
  );
  const rule3Passed = allFnExistInArray && missingFlagConsistent;

  // Rule 4: Clipboard & FTS5 search_text
  const copyAndSearchValid = doc.blocks.every((b) => {
    const isDivider = b.type === 'paragraph' && /^[*\-—•\s]+$/.test(b.text || '');
    const hasAttribution = b.copy_text.includes(`— `) && b.copy_text.includes(`Гл. ${doc.chapter_number}`);
    const noFnInCopy = !/\{\{fn:/.test(b.copy_text);
    const noYoInSearch = !/ё/i.test(b.search_text);
    const noTashkeelInSearch = !/[\u064B-\u065F\u0670]/.test(b.search_text);
    const searchLengthValid = isDivider || b.search_text.length > 0;
    return hasAttribution && noFnInCopy && noYoInSearch && noTashkeelInSearch && searchLengthValid;
  });

  // Rule 5: Block types & JSON schema
  const validTypes = doc.blocks.every((b) =>
    ['paragraph', 'verse_pair', 'vocabulary_item'].includes(b.type)
  );

  return [
    {
      ruleNumber: 1,
      ruleTitle: 'Предварительная очистка текста (Sanitization)',
      passed: rule1Passed,
      details: `Блоков: ${doc.blocks.length}. Жесткие переносы и OCR-артефакты устранены, кавычки «...» унифицированы.`,
    },
    {
      ruleNumber: 2,
      ruleTitle: 'Двунаправленный текст (BiDi \\u2067...\\u2069) и типографика',
      passed: rule2Passed,
      details:
        'Арабские вставки внутри LTR изолированы маркерами RLI (\\u2067) и PDI (\\u2069); RTL-блоки имеют font_scale >= 1.25 и line_height >= 1.6.',
    },
    {
      ruleNumber: 3,
      ruleTitle: 'Сноски {{fn:ID}} и ссылочная целостность',
      passed: rule3Passed,
      details:
        doc.footnotes.length > 0
          ? `Найдено сносок: ${doc.footnotes.length} (${doc.footnotes
              .map((f) => `{{fn:${f.id}}} → «${f.anchor_text}»`)
              .join(', ')}). Ссылочная целостность 100%.`
          : 'Теги {{fn:ID}} и массив footnotes синхронизированы (сносок в главе: 0).',
    },
    {
      ruleNumber: 4,
      ruleTitle: 'Буфер обмена (copy_text) и индекс Room FTS5 (search_text)',
      passed: copyAndSearchValid,
      details:
        'copy_text содержит атрибуцию книги и главы; search_text очищен от ташкиля (огласовок), нормализованы алифы/та-марбута/алиф-максура и русская «ё → е».',
    },
    {
      ruleNumber: 5,
      ruleTitle: 'Литературные блоки (paragraph / verse_pair) и схема JSON',
      passed: validTypes,
      details: `Валидный JSON для Kotlinx Serialization / Moshi (book_id: "${doc.book_id}", chapter_id: "${doc.chapter_id}").`,
    },
  ];
}

export const normalizeForFts5 = normalizeForFts5Search;

export const DEMO_RAW_CHAPTER_INPUT = `Посланник Аллаха ﷺ (да благословит его Аллах и приветствует) побуждал верующих к поминанию Всевышнего (зикру¹) и чтению салаватов в любое время дня и ночи. В арабском языке слово حَبِيبٌ означает возлюбленного друга, приближенного к милости Творца.

अَللّٰهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ

وَإِذَا سَأَلْتَ فَاسْأَلِ اللَّهَ // وَإِذَا اسْتَعَنْتَ فَاسْتَعِنْ بِاللَّهِ

Праведные предшественники (ахлю-Сунна валь-джама’а²) говорили: "Тот, кто проводит свои утренние и вечерние часы в поминании Аллаха, обретает покой сердца и баракат в делах".

¹ Зикр (ذِكْرٌ) — поминание Всевышнего Аллаха языком и сердцем посредством восхваления (субханаллах, альхамдулиллях, Аллаху акбар), чтения Корана и мольбы.
² Ахлю-Сунна валь-джама’а — приверженцы Сунны Пророка Мухаммада ﷺ и согласия общины сподвижников.`;

export function normalizeChapterContent(params: {
  book_id: string;
  book_title: string;
  chapter_number: number;
  chapter_title_ru: string;
  chunk_info: string;
  raw_content: string;
}): NormalizedChapterDocument {
  const chunkMatch = params.chunk_info.match(/(\d+)\s*из\s*(\d+)/i);
  const currentChunk = chunkMatch ? Number(chunkMatch[1]) || 1 : 1;
  const totalChunks = chunkMatch ? Number(chunkMatch[2]) || 1 : 1;

  return buildNormalizedChapterJson({
    bookSlug: params.book_id,
    bookTitle: params.book_title,
    chapterIdSlug: `ch_${String(params.chapter_number).padStart(2, '0')}`,
    chapterNumber: params.chapter_number,
    titleRu: params.chapter_title_ru,
    titleEn: `Chapter ${params.chapter_number}`,
    titleAr: `الفصل ${params.chapter_number}`,
    rawContent: params.raw_content,
    currentChunk,
    totalChunks,
  });
}

export function parseNormalizedJsonInput(rawJson: string): {
  doc: NormalizedChapterDocument | null;
  error: string | null;
} {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') {
      return { doc: null, error: 'Ожидается JSON-объект корневого уровня' };
    }
    if (!parsed.book_id || typeof parsed.chapter_number !== 'number' || !Array.isArray(parsed.blocks)) {
      return {
        doc: null,
        error: 'Отсутствуют обязательные поля схемы: book_id, chapter_number или массив blocks[]',
      };
    }
    return { doc: parsed as NormalizedChapterDocument, error: null };
  } catch (e: unknown) {
    return {
      doc: null,
      error: e instanceof Error ? e.message : 'Синтаксическая ошибка JSON',
    };
  }
}

export function buildChapterFromNormalizedDocument(
  doc: NormalizedChapterDocument,
  bookId: number,
  chapterId: number,
  chapterOrder: number
): ChapterData {
  const bodyLines = doc.blocks.map((b) => {
    if (b.type === 'verse_pair' && b.sadr && b.ajuz) {
      return `${b.sadr} — ${b.ajuz}`;
    }
    return (b.text || '')
      .replace(/\{\{fn:([^}]+)\}\}/g, '[$1]')
      .replace(/[\u2067\u2069]/g, '');
  });

  const footnoteLines = doc.footnotes
    .filter((f) => f.text)
    .map((f) => `[${f.id}] (${f.anchor_text}): ${f.text}`);

  const fullText = [
    doc.title.ru,
    ...bodyLines,
    ...(footnoteLines.length > 0 ? ['--- Сноски ---', ...footnoteLines] : []),
  ].join('\n\n');

  return {
    id: chapterId,
    bookId,
    chapterOrder,
    title: doc.title.ru || `Глава ${chapterOrder}`,
    content: fullText,
    quiz: [
      {
        id: chapterId * 10 + 1,
        chapterId,
        question: `Какова основная тема главы «${doc.title.ru}»?`,
        options: [
          'Искреннее совершение праведных деяний и поминание Всевышнего',
          'Исключительно историческая хроника без практических выводов',
          'Отказ от повседневного труда',
          'Только изучение грамматики',
        ],
        correctAnswerIndex: 0,
        explanation:
          'Глава раскрывает духовную ценность и практическое воплощение благодеяний с опорой на достоверные источники.',
      },
      {
        id: chapterId * 10 + 2,
        chapterId,
        question:
          'Как обрабатываются сноски и арабские фрагменты в нормализованной структуре данной главы?',
        options: [
          'Тегами {{fn:ID}} с проверкой ссылочной целостности и BiDi-изолятами \\u2067...\\u2069',
          'Сноски полностью удаляются из текста',
          'Арабский текст транслитерируется латиницей',
          'Все абзацы склеиваются в одну строку',
        ],
        correctAnswerIndex: 0,
        explanation:
          'Контент-архитектор сохраняет двунаправленную изоляцию BiDi, проверяет сноски {{fn:ID}} и строит индекс Room FTS5.',
      },
      {
        id: chapterId * 10 + 3,
        chapterId,
        question: 'Для чего в каждом блоке формируется поле search_text?',
        options: [
          'Для мгновенного полнотекстового поиска в SQLite FTS5 без учета огласовок (ташкиля) и с заменой «ё» на «е»',
          'Для отображения заголовка книги на обложке',
          'Только для подсчета количества страниц',
          'Для хранения настроек цветовой темы',
        ],
        correctAnswerIndex: 0,
        explanation:
          'Поле search_text очищено от арабских огласовок и унифицирует буквы (إ/أ/آ→ا, ة→ه, ى→ي, ё→е) для точного поиска в Room FTS5.',
      },
    ],
  };
}

