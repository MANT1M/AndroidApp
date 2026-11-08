import type { ProjectFileItem } from './androidProjectBuilder';

export const ADDITIONAL_KOTLIN_FILES: ProjectFileItem[] = [
  {
    path: 'app/src/main/java/com/example/interactivereader/core/database/converter/RoomTypeConverters.kt',
    category: 'Core & Room DB',
    description: '@ProvidedTypeConverter для List<String> через kotlinx.serialization.json.Json',
    content: `package com.example.interactivereader.core.database.converter

import androidx.room.ProvidedTypeConverter
import androidx.room.TypeConverter
import com.example.interactivereader.core.domain.model.ChapterStatus
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@ProvidedTypeConverter
@Singleton
class RoomTypeConverters @Inject constructor(
    private val json: Json
) {
    private val stringListSerializer = ListSerializer(String.serializer())

    @TypeConverter
    fun fromStringList(value: List<String>?): String {
        if (value.isNullOrEmpty()) return "[]"
        return json.encodeToString(stringListSerializer, value)
    }

    @TypeConverter
    fun toStringList(value: String?): List<String> {
        if (value.isNullOrBlank()) return emptyList()
        return json.decodeFromString(stringListSerializer, value)
    }

    @TypeConverter
    fun fromChapterStatus(status: ChapterStatus): String = status.name

    @TypeConverter
    fun toChapterStatus(value: String): ChapterStatus =
        runCatching { ChapterStatus.valueOf(value) }.getOrDefault(ChapterStatus.LOCKED)
}
`,
  },
  {
    path: 'app/src/main/java/com/example/interactivereader/core/database/dao/Daos.kt',
    category: 'Core & Room DB',
    description: 'BookDao, ChapterDao и ProgressDao с реактивными Flow и @Transaction методами',
    content: `package com.example.interactivereader.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.example.interactivereader.core.database.entity.BookEntity
import com.example.interactivereader.core.database.entity.ChapterEntity
import com.example.interactivereader.core.database.entity.ChapterProgressEntity
import com.example.interactivereader.core.database.entity.ChapterWithProgressRelation
import com.example.interactivereader.core.database.entity.QuizQuestionEntity
import com.example.interactivereader.core.domain.model.ChapterStatus
import kotlinx.coroutines.flow.Flow
import kotlin.math.max

@Dao
interface BookDao {
    @Query("SELECT * FROM books ORDER BY id ASC")
    fun observeAllBooks(): Flow<List<BookEntity>>

    @Query("SELECT * FROM books WHERE id = :bookId LIMIT 1")
    fun observeBookById(bookId: Long): Flow<BookEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBook(book: BookEntity): Long
}

@Dao
interface ChapterDao {
    @Transaction
    @Query("SELECT id, bookId, chapterIndex, title FROM chapters WHERE bookId = :bookId ORDER BY chapterIndex ASC")
    fun observeChaptersWithProgressByBookId(bookId: Long): Flow<List<ChapterWithProgressRelation>>

    @Query("SELECT * FROM chapters WHERE id = :chapterId LIMIT 1")
    fun observeChapterById(chapterId: Long): Flow<ChapterEntity?>

    @Query("SELECT * FROM chapters WHERE id = :chapterId LIMIT 1")
    suspend fun getChapterById(chapterId: Long): ChapterEntity?

    @Query("SELECT * FROM chapters WHERE bookId = :bookId AND chapterIndex = :nextChapterIndex LIMIT 1")
    suspend fun getChapterByIndex(bookId: Long, nextChapterIndex: Int): ChapterEntity?

    @Query("SELECT * FROM quiz_questions WHERE chapterId = :chapterId ORDER BY id ASC")
    fun observeQuizQuestionsByChapterId(chapterId: Long): Flow<List<QuizQuestionEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChapters(chapters: List<ChapterEntity>): List<Long>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertQuizQuestions(questions: List<QuizQuestionEntity>): List<Long>
}

@Dao
interface ProgressDao {
    @Query("SELECT * FROM chapter_progress WHERE bookId = :bookId AND chapterId = :chapterId LIMIT 1")
    suspend fun getProgress(bookId: Long, chapterId: Long): ChapterProgressEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProgress(progress: ChapterProgressEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProgressList(progressList: List<ChapterProgressEntity>)

    @Transaction
    suspend fun updateReadingOffsetTransactional(
        bookId: Long,
        chapterId: Long,
        lastCharOffset: Int,
        updatedAt: Long
    ) {
        val existing = getProgress(bookId, chapterId)
        if (existing != null) {
            upsertProgress(existing.copy(lastCharOffset = lastCharOffset, updatedAt = updatedAt))
        } else {
            upsertProgress(
                ChapterProgressEntity(
                    bookId = bookId,
                    chapterId = chapterId,
                    status = ChapterStatus.AVAILABLE,
                    lastCharOffset = lastCharOffset,
                    bestQuizScore = 0,
                    updatedAt = updatedAt
                )
            )
        }
    }

    @Transaction
    suspend fun completeChapterAndUnlockNextTransactional(
        bookId: Long,
        currentChapterId: Long,
        nextChapterId: Long?,
        quizScore: Int,
        updatedAt: Long
    ) {
        val currentProgress = getProgress(bookId, currentChapterId)
        val bestScore = if (currentProgress != null) max(currentProgress.bestQuizScore, quizScore) else quizScore

        upsertProgress(
            ChapterProgressEntity(
                bookId = bookId,
                chapterId = currentChapterId,
                status = ChapterStatus.PASSED,
                lastCharOffset = currentProgress?.lastCharOffset ?: 0,
                bestQuizScore = bestScore,
                updatedAt = updatedAt
            )
        )

        if (nextChapterId != null) {
            val nextProgress = getProgress(bookId, nextChapterId)
            if (nextProgress == null || nextProgress.status == ChapterStatus.LOCKED) {
                upsertProgress(
                    ChapterProgressEntity(
                        bookId = bookId,
                        chapterId = nextChapterId,
                        status = ChapterStatus.AVAILABLE,
                        lastCharOffset = nextProgress?.lastCharOffset ?: 0,
                        bestQuizScore = nextProgress?.bestQuizScore ?: 0,
                        updatedAt = updatedAt
                    )
                )
            }
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/example/interactivereader/feature_reader/domain/pagination/TextPaginator.kt',
    category: 'Feature Reader',
    description: 'Математический расчет пагинации на Dispatchers.Default с переносом по границам слов и LRU-кешем',
    content: `package com.example.interactivereader.feature_reader.domain.pagination

import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.coroutineContext

@Immutable
data class ScreenConstraints(
    val widthPx: Int,
    val heightPx: Int,
    val density: Float,
    val fontScale: Float = 1f
) {
    val isValid: Boolean get() = widthPx > 0 && heightPx > 0 && density > 0f
}

@Immutable
data class PageModel(
    val pageIndex: Int,
    val startCharOffset: Int,
    val endCharOffset: Int,
    val text: String
)

@Immutable
data class PaginationCacheKey(
    val chapterId: Long,
    val widthPx: Int,
    val heightPx: Int,
    val fontSizeSp: Float,
    val lineHeightSp: Float
)

@Singleton
class TextPaginator @Inject constructor(
    private val fontFamilyResolver: FontFamily.Resolver,
    private val defaultDispatcher: CoroutineDispatcher = Dispatchers.Default
) {
    private val cacheMutex = Mutex()
    private val lruCache = object : LinkedHashMap<PaginationCacheKey, List<PageModel>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<PaginationCacheKey, List<PageModel>>?): Boolean = size > 24
    }

    suspend fun paginate(
        chapterId: Long,
        content: String,
        constraints: ScreenConstraints,
        style: TextStyle
    ): List<PageModel> = withContext(defaultDispatcher) {
        if (!constraints.isValid) return@withContext emptyList()
        val key = PaginationCacheKey(
            chapterId = chapterId,
            widthPx = constraints.widthPx,
            heightPx = constraints.heightPx,
            fontSizeSp = if (style.fontSize.isSp) style.fontSize.value else 18f,
            lineHeightSp = if (style.lineHeight.isSp) style.lineHeight.value else 27f
        )
        cacheMutex.withLock { lruCache[key]?.let { return@withContext it } }

        val measurer = TextMeasurer(
            defaultFontFamilyResolver = fontFamilyResolver,
            defaultDensity = Density(constraints.density, constraints.fontScale),
            defaultLayoutDirection = LayoutDirection.Ltr,
            cacheSize = 0
        )

        val pages = ArrayList<PageModel>()
        val totalLength = content.length
        var currentStartOffset = 0
        var pageIndex = 0
        val maxHeightFloat = constraints.heightPx.toFloat()
        val layoutConstraints = Constraints(maxWidth = constraints.widthPx, maxHeight = Constraints.Infinity)

        while (currentStartOffset < totalLength) {
            coroutineContext.ensureActive()
            while (currentStartOffset < totalLength && (content[currentStartOffset] == ' ' || content[currentStartOffset] == '\\n')) {
                currentStartOffset++
            }
            if (currentStartOffset >= totalLength) break

            val windowEnd = (currentStartOffset + 5500).coerceAtMost(totalLength)
            val slice = content.substring(currentStartOffset, windowEnd)
            val layoutResult = measurer.measure(
                text = AnnotatedString(slice),
                style = style,
                overflow = TextOverflow.Clip,
                softWrap = true,
                constraints = layoutConstraints
            )

            val candidateLine = layoutResult.getLineForVerticalPosition(maxHeightFloat).coerceIn(0, layoutResult.lineCount - 1)
            val lastVisibleLine = if (candidateLine > 0 && layoutResult.getLineBottom(candidateLine) > maxHeightFloat) {
                candidateLine - 1
            } else {
                candidateLine
            }

            val relativeEnd = layoutResult.getLineEnd(lastVisibleLine, visibleEnd = false).coerceAtLeast(1)
            val rawEndOffset = (currentStartOffset + relativeEnd).coerceAtMost(totalLength)
            val finalEndOffset = adjustToWordBoundary(content, currentStartOffset, rawEndOffset)

            pages.add(
                PageModel(
                    pageIndex = pageIndex,
                    startCharOffset = currentStartOffset,
                    endCharOffset = finalEndOffset,
                    text = content.substring(currentStartOffset, finalEndOffset).trimEnd()
                )
            )
            currentStartOffset = finalEndOffset
            pageIndex++
        }

        cacheMutex.withLock { lruCache[key] = pages }
        pages
    }

    private fun adjustToWordBoundary(content: String, startOffset: Int, rawEndOffset: Int): Int {
        if (rawEndOffset >= content.length || rawEndOffset <= startOffset) return rawEndOffset
        if (content[rawEndOffset - 1].isWhitespace() || content[rawEndOffset].isWhitespace()) return rawEndOffset
        var cursor = rawEndOffset - 1
        while (cursor > startOffset) {
            if (content[cursor].isWhitespace()) return cursor + 1
            cursor--
        }
        return rawEndOffset
    }

    fun findPageIndexForOffset(pages: List<PageModel>, charOffset: Int): Int {
        if (pages.isEmpty()) return 0
        val clamped = charOffset.coerceAtLeast(0)
        val found = pages.indexOfFirst { clamped in it.startCharOffset until it.endCharOffset }
        return if (found != -1) found else pages.lastIndex
    }

    fun getOffsetForPage(pages: List<PageModel>, pageIndex: Int): Int {
        if (pages.isEmpty()) return 0
        return pages[pageIndex.coerceIn(0, pages.lastIndex)].startCharOffset
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/example/interactivereader/core/database/entity/ChapterContentJsonModels.kt',
    category: 'Core & Room DB',
    description: 'Kotlinx Serialization + Room FTS5 модели нормализованной главы (BiDi \\u2067...\\u2069, {{fn:ID}}, search_text)',
    content: `package com.example.interactivereader.core.database.entity

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.unit.sp
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Fts4
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class NormalizedChapterDocument(
    @SerialName("book_id") val bookId: String,
    @SerialName("chapter_id") val chapterId: String,
    @SerialName("chapter_number") val chapterNumber: Int,
    @SerialName("chunk_meta") val chunkMeta: NormalizedChunkMeta,
    @SerialName("title") val title: NormalizedTitle,
    @SerialName("blocks") val blocks: List<NormalizedBlock>,
    @SerialName("footnotes") val footnotes: List<NormalizedFootnote>
)

@Serializable
data class NormalizedChunkMeta(
    @SerialName("current_chunk") val currentChunk: Int,
    @SerialName("total_chunks") val totalChunks: Int,
    @SerialName("has_more") val hasMore: Boolean
)

@Serializable
data class NormalizedTitle(
    @SerialName("ru") val ru: String,
    @SerialName("en") val en: String,
    @SerialName("ar") val ar: String
)

@Serializable
data class NormalizedTypography(
    @SerialName("font_scale") val fontScale: Float = 1.0f,
    @SerialName("line_height_multiplier") val lineHeightMultiplier: Float = 1.3f
)

@Serializable
data class NormalizedBlock(
    @SerialName("id") val id: String,
    @SerialName("type") val type: String, // "paragraph" | "verse_pair" | "vocabulary_item"
    @SerialName("language") val language: String, // "ru" | "en" | "ar"
    @SerialName("direction") val direction: String, // "ltr" | "rtl"
    @SerialName("typography") val typography: NormalizedTypography,
    @SerialName("is_copyable") val isCopyable: Boolean = true,
    @SerialName("text") val text: String? = null,
    @SerialName("sadr") val sadr: String? = null,
    @SerialName("ajuz") val ajuz: String? = null,
    @SerialName("copy_text") val copyText: String,
    @SerialName("search_text") val searchText: String
)

@Serializable
data class NormalizedFootnote(
    @SerialName("id") val id: String,
    @SerialName("anchor_text") val anchorText: String,
    @SerialName("language") val language: String,
    @SerialName("text") val text: String? = null,
    @SerialName("is_missing") val isMissing: Boolean = false
)

@Fts4
@Entity(tableName = "chapter_blocks_fts")
data class ChapterBlockFtsEntity(
    @ColumnInfo(name = "book_id") val bookId: String,
    @ColumnInfo(name = "chapter_id") val chapterId: String,
    @ColumnInfo(name = "block_id") val blockId: String,
    @ColumnInfo(name = "search_text") val searchText: String
)

/**
 * Преобразует строку блока с маркерами {{fn:ID}} и BiDi-изоляторами (\\u2067...\\u2069)
 * в кликабельный AnnotatedString для Jetpack Compose Text.
 */
fun buildFootnoteAnnotatedString(rawText: String): AnnotatedString = buildAnnotatedString {
    val regex = Regex("""\\{\\{fn:([^}]+)\\}\\}""")
    var lastIndex = 0
    for (match in regex.findAll(rawText)) {
        append(rawText.substring(lastIndex, match.range.first))
        val fnId = match.groupValues[1]
        pushStringAnnotation(tag = "FOOTNOTE", annotation = fnId)
        pushStyle(
            SpanStyle(
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                baselineShift = BaselineShift.Superscript
            )
        )
        append("[$fnId]")
        pop()
        pop()
        lastIndex = match.range.last + 1
    }
    if (lastIndex < rawText.length) {
        append(rawText.substring(lastIndex))
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/example/interactivereader/core/ui/text/ArabicTextScaler.kt',
    category: 'Feature Reader',
    description: 'Высокопроизводительное выборочное масштабирование арабской вязи и ташкиля [\\p{sc=Arabic}&&[\\p{L}\\p{M}]] с LRU-кешем и защитой метрик строки',
    content: `package com.example.interactivereader.core.ui.text

import android.util.LruCache
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.isUnspecified
import androidx.compose.ui.unit.sp
import java.util.regex.Pattern
import kotlin.math.abs
import kotlin.math.max

@Immutable
data class ArabicSpanRange(
    val startIndex: Int,
    val endIndex: Int
) {
    init {
        require(startIndex >= 0 && endIndex > startIndex) {
            "Invalid range: [$startIndex, $endIndex)"
        }
    }
}

object ArabicTextScaler {

    private const val SCALE_EPSILON = 0.001f
    private const val MIN_SCALE_FACTOR = 0.5f
    private const val MAX_SCALE_FACTOR = 3.0f
    private const val RANGE_CACHE_MAX_ENTRIES = 256

    private val ARABIC_PATTERN: Pattern = Pattern.compile(
        "[\\\\p{sc=Arabic}&&[\\\\p{L}\\\\p{M}\\\\u0640]]+"
    )

    private val rangeCache = object : LruCache<String, List<ArabicSpanRange>>(RANGE_CACHE_MAX_ENTRIES) {}

    fun formatMixedText(
        text: String,
        baseFontSize: TextUnit,
        scaleFactor: Float
    ): AnnotatedString {
        if (text.isEmpty()) return AnnotatedString("")
        if (baseFontSize.isUnspecified || !scaleFactor.isFinite() || scaleFactor <= 0f) {
            return AnnotatedString(text)
        }

        val clampedScale = scaleFactor.coerceIn(MIN_SCALE_FACTOR, MAX_SCALE_FACTOR)
        if (abs(clampedScale - 1.0f) < SCALE_EPSILON) {
            return AnnotatedString(text)
        }

        if (!containsArabicCodeUnits(text)) {
            return AnnotatedString(text)
        }

        val ranges = getOrComputeArabicRanges(text)
        if (ranges.isEmpty()) {
            return AnnotatedString(text)
        }

        val scaledArabicSpanStyle = SpanStyle(
            fontSize = baseFontSize * clampedScale
        )

        return AnnotatedString.Builder(text).apply {
            for (i in ranges.indices) {
                val range = ranges[i]
                addStyle(
                    style = scaledArabicSpanStyle,
                    start = range.startIndex,
                    end = range.endIndex
                )
            }
        }.toAnnotatedString()
    }

    fun getOrComputeArabicRanges(text: String): List<ArabicSpanRange> {
        synchronized(rangeCache) {
            rangeCache.get(text)?.let { return it }
        }

        val matcher = ARABIC_PATTERN.matcher(text)
        var computedRanges: MutableList<ArabicSpanRange>? = null

        while (matcher.find()) {
            val start = matcher.start()
            val end = matcher.end()
            if (end > start) {
                val list = computedRanges ?: ArrayList<ArabicSpanRange>(4).also {
                    computedRanges = it
                }
                list.add(ArabicSpanRange(startIndex = start, endIndex = end))
            }
        }

        val result = computedRanges ?: emptyList()
        synchronized(rangeCache) {
            rangeCache.put(text, result)
        }
        return result
    }

    private fun containsArabicCodeUnits(text: CharSequence): Boolean {
        for (i in 0 until text.length) {
            val code = text[i].code
            if (
                code in 0x0600..0x06FF ||
                code in 0x0750..0x077F ||
                code in 0x08A0..0x08FF ||
                code in 0xFB50..0xFDFF ||
                code in 0xFE70..0xFEFF ||
                Character.isHighSurrogate(text[i])
            ) {
                return true
            }
        }
        return false
    }
}

@Composable
fun rememberScaledArabicText(
    text: String,
    baseFontSize: TextUnit,
    scaleFactor: Float
): AnnotatedString {
    return remember(text, baseFontSize, scaleFactor) {
        ArabicTextScaler.formatMixedText(
            text = text,
            baseFontSize = baseFontSize,
            scaleFactor = scaleFactor
        )
    }
}

fun createMixedArabicTextStyle(
    baseStyle: TextStyle,
    baseFontSize: TextUnit = 18.sp,
    arabicScaleFactor: Float = 1.35f,
    hasArabicContent: Boolean = true
): TextStyle {
    val effectiveScale = if (hasArabicContent) {
        arabicScaleFactor.coerceIn(1.0f, 2.5f)
    } else {
        1.0f
    }

    val dynamicLineHeightMultiplier = if (hasArabicContent && effectiveScale > 1.0f) {
        max(1.55f, effectiveScale * 1.38f)
    } else {
        1.5f
    }

    return baseStyle.merge(
        TextStyle(
            fontSize = baseFontSize,
            lineHeight = baseFontSize * dynamicLineHeightMultiplier,
            textDirection = TextDirection.ContentOrLtr,
            platformStyle = PlatformTextStyle(
                includeFontPadding = false
            ),
            lineHeightStyle = LineHeightStyle(
                alignment = LineHeightStyle.Alignment.Center,
                trim = LineHeightStyle.Trim.None
            )
        )
    )
}

@Composable
fun MixedArabicText(
    text: String,
    modifier: Modifier = Modifier,
    baseFontSize: TextUnit = 18.sp,
    arabicScaleFactor: Float = 1.35f,
    color: Color = Color.Unspecified,
    fontWeight: FontWeight? = null,
    fontFamily: FontFamily? = null,
    textAlign: TextAlign? = null,
    style: TextStyle = LocalTextStyle.current,
    onTextLayout: (TextLayoutResult) -> Unit = {}
) {
    val annotatedText = rememberScaledArabicText(
        text = text,
        baseFontSize = baseFontSize,
        scaleFactor = arabicScaleFactor
    )

    val hasArabicSpans = annotatedText.spanStyles.isNotEmpty()

    val safeTextStyle = remember(style, baseFontSize, arabicScaleFactor, hasArabicSpans) {
        createMixedArabicTextStyle(
            baseStyle = style,
            baseFontSize = baseFontSize,
            arabicScaleFactor = arabicScaleFactor,
            hasArabicContent = hasArabicSpans
        )
    }

    Text(
        text = annotatedText,
        modifier = modifier,
        color = color,
        fontWeight = fontWeight,
        fontFamily = fontFamily,
        textAlign = textAlign,
        style = safeTextStyle,
        onTextLayout = onTextLayout
    )
}
`,
  },
  {
    path: 'app/src/main/java/com/example/interactivereader/feature_reader/presentation/ArabicTypographyDemoScreen.kt',
    category: 'Feature Reader',
    description: 'Демонстрационный экран масштабирования арабской вязи с ползунком scaleFactor (1.0f..2.0f) и LazyColumn',
    content: `package com.example.interactivereader.feature_reader.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.interactivereader.core.ui.text.ArabicTextScaler
import com.example.interactivereader.core.ui.text.MixedArabicText
import java.util.Locale

data class MixedSampleItem(
    val id: Int,
    val chapterTitle: String,
    val mixedContent: String
)

private val DEMO_SAMPLES = listOf(
    MixedSampleItem(
        id = 1,
        chapterTitle = "Глава 43. Чтение Корана (инлайн-вязь, европейские 0–9 и индо-арабские цифры ٠–٩)",
        mixedContent = """Абдуллах ибн Мас’уд рассказывает, что наш Пророк ﷺ сказал: مَنْ قَرَأَ حَرْفًا مِنْ كِتَابِ اللَّهِ فَلَهُ بِهِ حَسَنَةٌ وَالْحَسَنَةُ بِعَشْرِ أَمْثَالِهَا لَا أَقُولُ الم حَرْفٌ وَلَكِنْ أَلِفٌ حَرْفٌ وَلَامٌ حَرْفٌ وَمِيمٌ حَرْفٌ — «Тому, кто прочтет (хотя бы 1 / ١) букву из Книги Аллаха, запишется 10 (١٠) добрых дел, а за три буквы “Алиф, Лям, Мим” — 30 (٣٠) наград» (Джами ат-Тирмизи, 2910 / ٢٩١٠)."""
    ),
    MixedSampleItem(
        id = 2,
        chapterTitle = "Глава 44. Чтение сур «Фатиха» и «Ихляс» (встроенный аят внутри кириллицы)",
        mixedContent = """Пророк ﷺ сказал: «Читайте (قُلْ هُوَ اللَّهُ أَحَدٌ) (Куль Хува Аллаhу ахад), это равно 1/3 (١/٣) Корана» (Сахих Муслим, 811 б). Оригинал текста: إِنَّ اللَّهَ جَزَّأَ الْقُرْآنَ ثَلَاثَةَ أَجْزَاءٍ فَجَعَلَ قُلْ هُوَ اللَّهُ أَحَدٌ جُزْءًا مِنْ أَجْزَاءِ الْقُرْآنِ."""
    ),
    MixedSampleItem(
        id = 3,
        chapterTitle = "Глава 47. Зикр после омовения (высокая плотность шадды и огласовок)",
        mixedContent = """Тот, кто после тщательного омовения прочтет: أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ وَأَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ — перед ним распахнутся все 8 (٨) небесных врат Рая (Сахих Муслим)."""
    ),
    MixedSampleItem(
        id = 4,
        chapterTitle = "Граничный случай: абзац без арабских букв (Fast-path 0 аллокаций)",
        mixedContent = """Этот абзац содержит только кириллицу, латиницу (Latin text), европейские цифры 12345 и индо-арабские цифры ٠١٢٣٤٥٦٧٨٩. При любом положении ползунка размер всех символов этого блока остается строго 18.sp."""
    )
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArabicTypographyDemoScreen(
    modifier: Modifier = Modifier
) {
    var arabicScaleFactor by rememberSaveable { mutableFloatStateOf(1.35f) }
    val baseFontSize = 18.sp

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Масштабирование арабской вязи",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                },
                actions = {
                    TextButton(onClick = { arabicScaleFactor = 1.0f }) {
                        Text("Сброс (1.0x)")
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            Surface(
                tonalElevation = 2.dp,
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Масштаб арабского шрифта (scaleFactor):",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = String.format(
                                Locale.US,
                                "%.2fx (%.1f sp)",
                                arabicScaleFactor,
                                baseFontSize.value * arabicScaleFactor
                            ),
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Slider(
                        value = arabicScaleFactor,
                        onValueChange = { arabicScaleFactor = it },
                        valueRange = 1.0f..2.0f,
                        steps = 19,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Text(
                        text = "Кириллица, латиница, цифры (0–9, ٠–٩) и пунктуация фиксированы на 18.sp.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                itemsIndexed(
                    items = DEMO_SAMPLES,
                    key = { _, item -> item.id }
                ) { _, sample ->
                    val spanCount = ArabicTextScaler.getOrComputeArabicRanges(sample.mixedContent).size

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = sample.chapterTitle,
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.weight(1f)
                                )
                                Text(
                                    text = "Спанов: $spanCount",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            MixedArabicText(
                                text = sample.mixedContent,
                                baseFontSize = baseFontSize,
                                arabicScaleFactor = arabicScaleFactor,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }
            }
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/example/interactivereader/core/navigation/AppNavHost.kt',
    category: 'Navigation & App',
    description: 'Навигационный граф Navigation Compose 2.8+ с сохранением Back Stack и многоуровневым перехватом BackHandler (Predictive Back API 33+)',
    content: `package com.example.interactivereader.core.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import kotlinx.serialization.Serializable

@Serializable
sealed interface AppRoute {
    @Serializable
    data object Library : AppRoute

    @Serializable
    data class Reader(val bookId: Long, val chapterId: Long) : AppRoute

    @Serializable
    data class Quiz(val bookId: Long, val chapterId: Long) : AppRoute
}

/**
 * Безопасный возврат назад: не сворачивает Activity, если стек уже на стартовом экране.
 */
fun NavHostController.navigateBackSafely(): Boolean {
    return if (previousBackStackEntry != null) {
        popBackStack()
    } else {
        false
    }
}

@Composable
fun AppNavHost(
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController()
) {
    NavHost(
        navController = navController,
        startDestination = AppRoute.Library,
        modifier = modifier
    ) {
        composable<AppRoute.Library> {
            var selectedBookSheetId by rememberSaveable { mutableStateOf<Long?>(null) }
            var searchQuery by rememberSaveable { mutableStateOf("") }

            // Приоритет 2 (внешний): если активен поиск — очищаем строку поиска вместо выхода из приложения
            BackHandler(enabled = searchQuery.isNotEmpty()) {
                searchQuery = ""
            }

            // Приоритет 1 (внутренний, регистрируется последним -> срабатывает первым):
            // закрытие открытой шторки оглавления книги
            BackHandler(enabled = selectedBookSheetId != null) {
                selectedBookSheetId = null
            }

            LibraryCatalogScreen(
                searchQuery = searchQuery,
                selectedBookSheetId = selectedBookSheetId,
                onSearchQueryChange = { searchQuery = it },
                onOpenBookSheet = { bookId -> selectedBookSheetId = bookId },
                onDismissBookSheet = { selectedBookSheetId = null },
                onOpenChapter = { bookId, chapterId ->
                    selectedBookSheetId = null
                    // Переход вперед БЕЗ popUpTo(Library) { inclusive = true },
                    // чтобы экран Library гарантированно оставался в Back Stack
                    navController.navigate(AppRoute.Reader(bookId = bookId, chapterId = chapterId)) {
                        launchSingleTop = true
                    }
                }
            )
        }

        composable<AppRoute.Reader> { backStackEntry ->
            val route = backStackEntry.toRoute<AppRoute.Reader>()
            var isSettingsSheetOpen by rememberSaveable { mutableStateOf(false) }
            var activeFootnoteId by rememberSaveable { mutableStateOf<String?>(null) }

            // Уровень 3: выход из режима чтения обратно в каталог (Library)
            BackHandler(enabled = true) {
                navController.navigateBackSafely()
            }

            // Уровень 2: закрытие нижней шторки настроек шрифта/темы
            BackHandler(enabled = isSettingsSheetOpen) {
                isSettingsSheetOpen = false
            }

            // Уровень 1 (наивысший приоритет — композируется последним):
            // закрытие всплывающего окна сноски [N]
            BackHandler(enabled = activeFootnoteId != null) {
                activeFootnoteId = null
            }

            ReaderScreen(
                bookId = route.bookId,
                chapterId = route.chapterId,
                isSettingsSheetOpen = isSettingsSheetOpen,
                activeFootnoteId = activeFootnoteId,
                onToggleSettingsSheet = { isSettingsSheetOpen = !isSettingsSheetOpen },
                onOpenFootnote = { fnId -> activeFootnoteId = fnId },
                onDismissFootnote = { activeFootnoteId = null },
                onNavigateBack = { navController.navigateBackSafely() },
                onStartQuiz = {
                    // Переход к тесту сохраняет Reader в стеке, чтобы жест «Назад» в тесте
                    // возвращал пользователя обратно к тексту главы
                    navController.navigate(
                        AppRoute.Quiz(bookId = route.bookId, chapterId = route.chapterId)
                    ) {
                        launchSingleTop = true
                    }
                }
            )
        }

        composable<AppRoute.Quiz> { backStackEntry ->
            val route = backStackEntry.toRoute<AppRoute.Quiz>()

            // Перехват системного свайпа «Назад» на экране теста -> возврат в главу (Reader)
            BackHandler(enabled = true) {
                navController.navigateBackSafely()
            }

            QuizScreen(
                bookId = route.bookId,
                chapterId = route.chapterId,
                onBackToReader = { navController.navigateBackSafely() },
                onReturnToLibrary = {
                    // Возврат в корень каталога без удаления самого Library из стека (inclusive = false)
                    navController.popBackStack(
                        route = AppRoute.Library,
                        inclusive = false
                    )
                },
                onOpenNextChapter = { nextChapterId ->
                    // Заменяем текущий стек Quiz -> Reader на новую главу, оставляя Library внизу стека
                    navController.navigate(
                        AppRoute.Reader(bookId = route.bookId, chapterId = nextChapterId)
                    ) {
                        popUpTo(navController.graph.findStartDestination().id) {
                            inclusive = false
                        }
                        launchSingleTop = true
                    }
                }
            )
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/example/interactivereader/feature_reader/presentation/components/VerticalReaderScrollbar.kt',
    category: 'Feature Reader',
    description: 'Минималистичная вертикальная полоса прокрутки (4dp ширина, 4dp отступ справа, капсула #06372C в цвет кнопки «Читать главу», дорожка 5%)',
    content: `package com.example.interactivereader.feature_reader.presentation.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.math.max

/**
 * Фирменная палитра скроллбара:
 * - Бегунок (#06372C) — точный цвет кнопки «Читать главу»
 * - Едва заметная светло-бежевая/серая дорожка с 5% непрозрачности (0x0DD6D0C4)
 */
private val ScrollbarThumbDarkGreen = Color(0xFF06372C)
private val ScrollbarTrackSubtleBeige = Color(0x0DD6D0C4) // 5% alpha

/**
 * 1. Модификатор вертикального скроллбара для LazyColumn (список глав / карточек / блоков текста).
 * Располагается справа с отступом 4.dp от края экрана, ширина капсулы — 4.dp.
 */
fun Modifier.drawVerticalScrollbar(
    state: LazyListState,
    thumbWidth: Dp = 4.dp,
    endPadding: Dp = 4.dp,
    minThumbLength: Dp = 36.dp,
    thumbColor: Color = ScrollbarThumbDarkGreen,
    trackColor: Color = ScrollbarTrackSubtleBeige
): Modifier = composed {
    var isRecentlyScrolled by remember { mutableStateOf(false) }
    val isScrollInProgress = state.isScrollInProgress

    LaunchedEffect(isScrollInProgress, state.firstVisibleItemIndex, state.firstVisibleItemScrollOffset) {
        if (isScrollInProgress) {
            isRecentlyScrolled = true
        } else if (isRecentlyScrolled) {
            delay(1200L)
            isRecentlyScrolled = false
        }
    }

    // При скролле/касании — высокая контрастность (0.92f), в покое — мягкая полупрозрачность (0.38f)
    val thumbAlpha by animateFloatAsState(
        targetValue = when {
            isScrollInProgress -> 0.92f
            isRecentlyScrolled -> 0.65f
            else -> 0.35f
        },
        animationSpec = tween(
            durationMillis = if (isScrollInProgress) 150 else 500,
            easing = FastOutSlowInEasing
        ),
        label = "LazyScrollbarThumbAlpha"
    )

    val trackAlpha by animateFloatAsState(
        targetValue = if (isScrollInProgress || isRecentlyScrolled) 1f else 0f,
        animationSpec = tween(durationMillis = 300),
        label = "LazyScrollbarTrackAlpha"
    )

    drawWithContent {
        drawContent()

        val layoutInfo = state.layoutInfo
        val visibleItems = layoutInfo.visibleItemsInfo
        val totalItemsCount = layoutInfo.totalItemsCount
        if (totalItemsCount <= 0 || visibleItems.isEmpty()) return@drawWithContent

        val viewportHeight = size.height
        val avgItemSize = visibleItems.sumOf { it.size }.toFloat() / visibleItems.size.coerceAtLeast(1)
        val estimatedTotalContentHeight = max(viewportHeight, avgItemSize * totalItemsCount)

        if (estimatedTotalContentHeight <= viewportHeight + 1f) return@drawWithContent

        val thumbWidthPx = thumbWidth.toPx()
        val endPaddingPx = endPadding.toPx()
        val cornerRadius = CornerRadius(thumbWidthPx / 2f, thumbWidthPx / 2f)
        val xOffset = size.width - thumbWidthPx - endPaddingPx

        // Дорожка (Track) — 5% непрозрачности
        if (trackAlpha > 0.01f) {
            drawRoundRect(
                color = trackColor.copy(alpha = trackColor.alpha * trackAlpha),
                topLeft = Offset(x = xOffset, y = 0f),
                size = Size(width = thumbWidthPx, height = viewportHeight),
                cornerRadius = cornerRadius
            )
        }

        // Бегунок (Thumb) — капсула #0D3B2E шириной 4dp
        val minThumbPx = minThumbLength.toPx()
        val thumbHeightPx = (viewportHeight * (viewportHeight / estimatedTotalContentHeight))
            .coerceIn(minThumbPx, viewportHeight)

        val estimatedScrolledPx = state.firstVisibleItemIndex * avgItemSize + state.firstVisibleItemScrollOffset
        val scrollFraction = (estimatedScrolledPx / (estimatedTotalContentHeight - viewportHeight)).coerceIn(0f, 1f)
        val thumbOffsetY = scrollFraction * (viewportHeight - thumbHeightPx)

        drawRoundRect(
            color = thumbColor.copy(alpha = thumbAlpha),
            topLeft = Offset(x = xOffset, y = thumbOffsetY),
            size = Size(width = thumbWidthPx, height = thumbHeightPx),
            cornerRadius = cornerRadius
        )
    }
}

/**
 * 2. Модификатор вертикального скроллбара для вертикального ScrollState (Column.verticalScroll).
 */
fun Modifier.drawVerticalScrollbar(
    scrollState: ScrollState,
    thumbWidth: Dp = 4.dp,
    endPadding: Dp = 4.dp,
    minThumbLength: Dp = 36.dp,
    thumbColor: Color = ScrollbarThumbDarkGreen,
    trackColor: Color = ScrollbarTrackSubtleBeige
): Modifier = composed {
    val isScrollInProgress = scrollState.isScrollInProgress
    var isRecentlyScrolled by remember { mutableStateOf(false) }

    LaunchedEffect(isScrollInProgress, scrollState.value) {
        if (isScrollInProgress) {
            isRecentlyScrolled = true
        } else if (isRecentlyScrolled) {
            delay(1200L)
            isRecentlyScrolled = false
        }
    }

    val thumbAlpha by animateFloatAsState(
        targetValue = when {
            isScrollInProgress -> 0.92f
            isRecentlyScrolled -> 0.65f
            else -> 0.35f
        },
        animationSpec = tween(durationMillis = if (isScrollInProgress) 150 else 500),
        label = "ScrollStateThumbAlpha"
    )

    drawWithContent {
        drawContent()
        val maxScroll = scrollState.maxValue
        if (maxScroll <= 0) return@drawWithContent

        val viewportHeight = size.height
        val totalContentHeight = viewportHeight + maxScroll
        val thumbWidthPx = thumbWidth.toPx()
        val endPaddingPx = endPadding.toPx()
        val cornerRadius = CornerRadius(thumbWidthPx / 2f, thumbWidthPx / 2f)
        val xOffset = size.width - thumbWidthPx - endPaddingPx

        drawRoundRect(
            color = trackColor,
            topLeft = Offset(x = xOffset, y = 0f),
            size = Size(width = thumbWidthPx, height = viewportHeight),
            cornerRadius = cornerRadius
        )

        val thumbHeightPx = (viewportHeight * (viewportHeight / totalContentHeight))
            .coerceIn(minThumbLength.toPx(), viewportHeight)
        val scrollFraction = (scrollState.value.toFloat() / maxScroll.toFloat()).coerceIn(0f, 1f)
        val thumbOffsetY = scrollFraction * (viewportHeight - thumbHeightPx)

        drawRoundRect(
            color = thumbColor.copy(alpha = thumbAlpha),
            topLeft = Offset(x = xOffset, y = thumbOffsetY),
            size = Size(width = thumbWidthPx, height = thumbHeightPx),
            cornerRadius = cornerRadius
        )
    }
}

/**
 * 3. Интерактивный компонент вертикального скроллбара для экрана чтения с поддержкой касания и перетаскивания.
 * Повышает контрастность бегунка (#0D3B2E) при касании пальцем и позволяет быстро перемещаться по главе.
 */
@Composable
fun VerticalReaderScrollbar(
    progressFraction: Float,
    visibleRatio: Float,
    isScrolling: Boolean,
    onSeekProgress: (Float) -> Unit,
    modifier: Modifier = Modifier,
    thumbWidth: Dp = 4.dp,
    endPadding: Dp = 4.dp,
    minThumbLength: Dp = 36.dp,
    thumbColor: Color = ScrollbarThumbDarkGreen,
    trackColor: Color = ScrollbarTrackSubtleBeige
) {
    var isTouching by remember { mutableStateOf(false) }
    var isRecentlyActive by remember { mutableStateOf(false) }
    var trackHeightPx by remember { mutableFloatStateOf(1f) }

    LaunchedEffect(isScrolling, progressFraction, isTouching) {
        if (isScrolling || isTouching) {
            isRecentlyActive = true
        } else {
            delay(1300L)
            isRecentlyActive = false
        }
    }

    val animatedThumbAlpha by animateFloatAsState(
        targetValue = when {
            isTouching -> 0.98f       // Максимальный контраст при касании
            isScrolling -> 0.86f      // Яркий при активном скролле
            isRecentlyActive -> 0.62f // Плавное затухание после скролла
            else -> 0.36f             // Полупрозрачный в состоянии покоя
        },
        animationSpec = tween(durationMillis = if (isTouching || isScrolling) 120 else 450),
        label = "InteractiveThumbAlpha"
    )

    val clampedProgress by remember(progressFraction) {
        derivedStateOf { progressFraction.coerceIn(0f, 1f) }
    }

    Box(
        modifier = modifier
            .fillMaxHeight()
            .padding(end = endPadding) // Отступ 4dp от правого края экрана
            .width(thumbWidth)         // Ширина капсулы 4dp
            .onSizeChanged { trackHeightPx = max(1f, it.height.toFloat()) }
            .pointerInput(Unit) {
                detectTapGestures(
                    onPress = { offset ->
                        isTouching = true
                        onSeekProgress((offset.y / trackHeightPx).coerceIn(0f, 1f))
                        tryAwaitRelease()
                        isTouching = false
                    }
                )
            }
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragStart = { offset ->
                        isTouching = true
                        onSeekProgress((offset.y / trackHeightPx).coerceIn(0f, 1f))
                    },
                    onVerticalDrag = { change, _ ->
                        change.consume()
                        onSeekProgress((change.position.y / trackHeightPx).coerceIn(0f, 1f))
                    },
                    onDragEnd = { isTouching = false },
                    onDragCancel = { isTouching = false }
                )
            }
            .drawBehind {
                val radius = CornerRadius(size.width / 2f, size.width / 2f)

                // Фон (дорожка) — 5% непрозрачности
                drawRoundRect(
                    color = trackColor,
                    topLeft = Offset.Zero,
                    size = size,
                    cornerRadius = radius
                )

                // Бегунок (активная капсула #0D3B2E)
                val thumbHeight = (size.height * visibleRatio.coerceIn(0.08f, 1f))
                    .coerceIn(minThumbLength.toPx(), size.height)
                val availableTravel = (size.height - thumbHeight).coerceAtLeast(0f)
                val thumbTopY = clampedProgress * availableTravel

                drawRoundRect(
                    color = thumbColor.copy(alpha = animatedThumbAlpha),
                    topLeft = Offset(x = 0f, y = thumbTopY),
                    size = Size(width = size.width, height = thumbHeight),
                    cornerRadius = radius
                )
            },
        contentAlignment = Alignment.TopEnd
    ) {}
}
`,
  },
];

