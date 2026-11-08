import { EASY_GOOD_DEEDS_BOOK } from './easyGoodDeedsData';

export type ChapterStatus = 'LOCKED' | 'AVAILABLE' | 'PASSED';

export interface QuizItem {
  id: number;
  chapterId: number;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface ChapterData {
  id: number;
  bookId: number;
  chapterOrder: number;
  title: string;
  content: string;
  quiz: QuizItem[];
}

export interface BookData {
  id: number;
  orderIndex: number;
  title: string;
  author: string;
  year: string;
  genre: string;
  description: string;
  coverUrl: string;
  coverPalette: {
    bg: string;
    accent: string;
    text: string;
    border: string;
    motif: 'arch' | 'axe' | 'moon' | 'eye' | 'star';
  };
  chapters: ChapterData[];
}

export interface ChapterProgressRecord {
  chapterId: number;
  isCompleted: boolean;
  testPassed: boolean;
  score: number;
  lastCharOffset: number;
}

export const LIBRARY_BOOKS: BookData[] = [
  EASY_GOOD_DEEDS_BOOK,
];
