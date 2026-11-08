import JSZip from 'jszip';
import { EASY_GOOD_DEEDS_BOOK } from '../data/easyGoodDeedsData';
import { ADDITIONAL_KOTLIN_FILES } from './androidKotlinSources';

export interface ProjectFileItem {
  path: string;
  category: 'Gradle & Config' | 'Core & Room DB' | 'Domain & Data' | 'Feature Reader' | 'Feature Quiz' | 'Navigation & App' | 'CI/CD Автосборка APK';
  description: string;
  content: string;
}

export function getAndroidProjectFiles(): ProjectFileItem[] {
  const chaptersKotlinList = EASY_GOOD_DEEDS_BOOK.chapters
    .map(
      (ch, idx) =>
        `ChapterEntity(${ch.id}L, bookId, ${idx}, ${JSON.stringify(ch.title)}, ${JSON.stringify(ch.content)})`
    )
    .join(',\n                    ');

  const progressKotlinList = EASY_GOOD_DEEDS_BOOK.chapters
    .map(
      (ch) =>
        `ChapterProgressEntity(bookId, ${ch.id}L, ChapterStatus.AVAILABLE, 0, 0, now)`
    )
    .join(',\n                    ');

  return [
    {
      path: 'README_APK_RU.md',
      category: 'CI/CD Автосборка APK',
      description: 'Инструкция по сборке установочного APK-файла (локально или через GitHub Actions без установки Android Studio)',
      content: `# Интерактивная Читалка — Сборка APK для Android-смартфона

Этот архив содержит полный исходный код Android-приложения (Kotlin 2.0.21, Jetpack Compose, Material 3, Room 2.6.1, DataStore, Dagger-Hilt, Navigation Compose 2.8.4, Target SDK 35).

## Способ 1. Сборка APK в облаке через GitHub Actions (без установки Android Studio на ПК)
В проект уже встроен готовый пайплайн \`.github/workflows/build-apk.yml\`.
1. Создайте новый репозиторий на GitHub и загрузите туда содержимое распакованного архива.
2. Перейдите во вкладку **Actions** вашего репозитория.
3. Выберите workflow **Build Android APK** и нажмите **Run workflow**.
4. Через ~2 минуты скачайте готовый файл \`InteractiveReader-debug.apk\` в разделе **Artifacts** и установите его на смартфон.

## Способ 2. Сборка в Android Studio (Ladybug 2024.2.1+)
1. Откройте распакованную папку проекта в **Android Studio**.
2. Дождитесь окончания синхронизации Gradle (Gradle Sync).
3. В верхнем меню выберите **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. Готовый установочный файл появится по пути:
   \`app/build/outputs/apk/debug/app-debug.apk\`
`,
    },
    {
      path: '.github/workflows/build-apk.yml',
      category: 'CI/CD Автосборка APK',
      description: 'Автоматическая облачная сборка APK на серверах GitHub Actions (JDK 17 + Android SDK 35)',
      content: `name: Build Android APK

on:
  push:
    branches: [ "main", "master" ]
  workflow_dispatch:

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout source code
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.9'

      - name: Build Debug APK
        run: gradle assembleDebug --no-daemon

      - name: Upload Ready APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: InteractiveReader-debug-apk
          path: app/build/outputs/apk/debug/app-debug.apk
`,
    },
    {
      path: 'gradle/libs.versions.toml',
      category: 'Gradle & Config',
      description: 'Version Catalog со всеми зависимостями Kotlin 2.0.21, Room 2.6.1, Hilt 2.52 и Compose',
      content: `[versions]
agp = "8.7.2"
kotlin = "2.0.21"
ksp = "2.0.21-1.0.28"
coreKtx = "1.15.0"
lifecycleRuntimeKtx = "2.8.7"
activityCompose = "1.9.3"
composeBom = "2024.11.00"
navigationCompose = "2.8.4"
room = "2.6.1"
datastore = "1.1.1"
hilt = "2.52"
hiltNavigationCompose = "1.2.0"
coroutines = "1.9.0"
kotlinxSerializationJson = "1.7.3"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
androidx-lifecycle-runtime-ktx = { group = "androidx.lifecycle", name = "lifecycle-runtime-ktx", version.ref = "lifecycleRuntimeKtx" }
androidx-lifecycle-runtime-compose = { group = "androidx.lifecycle", name = "lifecycle-runtime-compose", version.ref = "lifecycleRuntimeKtx" }
androidx-lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycleRuntimeKtx" }
androidx-activity-compose = { group = "androidx.activity", name = "activity-compose", version.ref = "activityCompose" }

androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-compose-ui = { group = "androidx.compose.ui", name = "ui" }
androidx-compose-ui-graphics = { group = "androidx.compose.ui", name = "ui-graphics" }
androidx-compose-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
androidx-compose-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
androidx-compose-foundation = { group = "androidx.compose.foundation", name = "foundation" }
androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3" }
androidx-compose-material-icons-extended = { group = "androidx.compose.material", name = "material-icons-extended" }

androidx-navigation-compose = { group = "androidx.navigation", name = "navigation-compose", version.ref = "navigationCompose" }

androidx-room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
androidx-room-ktx = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
androidx-room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }

androidx-datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastore" }

hilt-android = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }
hilt-compiler = { group = "com.google.dagger", name = "hilt-android-compiler", version.ref = "hilt" }
androidx-hilt-navigation-compose = { group = "androidx.hilt", name = "hilt-navigation-compose", version.ref = "hiltNavigationCompose" }

kotlinx-coroutines-core = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-core", version.ref = "coroutines" }
kotlinx-coroutines-android = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }
kotlinx-serialization-json = { group = "org.jetbrains.kotlinx", name = "kotlinx-serialization-json", version.ref = "kotlinxSerializationJson" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
hilt-android = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
androidx-room = { id = "androidx.room", version.ref = "room" }
`,
    },
    {
      path: 'settings.gradle.kts',
      category: 'Gradle & Config',
      description: 'Настройки репозиториев и модулей Gradle',
      content: `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "InteractiveReader"
include(":app")
`,
    },
    {
      path: 'gradle.properties',
      category: 'Gradle & Config',
      description: 'JVM и AndroidX флаги компиляции',
      content: `org.gradle.jvmargs=-Xmx4096m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`,
    },
    {
      path: 'build.gradle.kts',
      category: 'Gradle & Config',
      description: 'Корневой файл сборки проекта',
      content: `plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt.android) apply false
    alias(libs.plugins.androidx.room) apply false
}
`,
    },
    {
      path: 'app/build.gradle.kts',
      category: 'Gradle & Config',
      description: 'Конфигурация модуля :app (Target SDK 35, Kotlin 2.0, KSP, Room, Hilt)',
      content: `import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.androidx.room)
}

android {
    namespace = "com.example.interactivereader"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.example.interactivereader"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
            freeCompilerArgs.addAll(
                "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
                "-opt-in=androidx.compose.foundation.ExperimentalFoundationApi"
            )
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    room {
        schemaDirectory("$projectDir/schemas")
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.navigation.compose)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    implementation(libs.androidx.datastore.preferences)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)
}
`,
    },
    {
      path: 'app/proguard-rules.pro',
      category: 'Gradle & Config',
      description: 'Правила R8 для сохранения @Serializable маршрутов и сущностей Room',
      content: `-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.example.interactivereader.**$$serializer { *; }
-keepclassmembers class com.example.interactivereader.** { *** Companion; }
-keepclasseswithmembers class com.example.interactivereader.** { kotlinx.serialization.KSerializer serializer(...); }
-keep @kotlinx.serialization.Serializable class com.example.interactivereader.core.navigation.** { *; }
-keep class * extends androidx.room.RoomDatabase { void <init>(); }
-keep @androidx.room.Entity class * { *; }
`,
    },
    {
      path: 'app/src/main/AndroidManifest.xml',
      category: 'Gradle & Config',
      description: 'Манифест Android 15 (Predictive Back, Edge-to-Edge, точка входа InteractiveReaderApplication)',
      content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <application
        android:name=".InteractiveReaderApplication"
        android:allowBackup="true"
        android:enableOnBackInvokedCallback="true"
        android:hardwareAccelerated="true"
        android:label="Интерактивная Читалка"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar"
        tools:targetApi="35">

        <activity
            android:name=".MainActivity"
            android:configChanges="uiMode|density|fontScale"
            android:exported="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>
</manifest>
`,
    },
    {
      path: 'app/src/main/java/com/example/interactivereader/core/domain/model/DomainModels.kt',
      category: 'Domain & Data',
      description: 'Чистые Domain-модели книги, глав, прогресса и вопросов теста',
      content: `package com.example.interactivereader.core.domain.model

enum class ChapterStatus {
    LOCKED,
    AVAILABLE,
    PASSED
}

data class Book(
    val id: Long,
    val title: String,
    val author: String,
    val coverUrl: String?,
    val description: String
)

data class Chapter(
    val id: Long,
    val bookId: Long,
    val chapterIndex: Int,
    val title: String,
    val content: String
)

data class ChapterWithProgress(
    val id: Long,
    val bookId: Long,
    val chapterIndex: Int,
    val title: String,
    val status: ChapterStatus,
    val lastCharOffset: Int,
    val bestQuizScore: Int,
    val updatedAt: Long
)

data class BookDetailsWithProgress(
    val book: Book,
    val chapters: List<ChapterWithProgress>,
    val completedChaptersCount: Int,
    val totalChaptersCount: Int,
    val completionRatio: Float
)

data class QuizQuestion(
    val id: Long,
    val chapterId: Long,
    val questionText: String,
    val options: List<String>,
    val correctOptionIndex: Int,
    val explanation: String
)
`,
    },
    {
      path: 'app/src/main/java/com/example/interactivereader/core/database/entity/Entities.kt',
      category: 'Core & Room DB',
      description: 'Сущности Room с индексами и каскадным удалением ForeignKey.CASCADE',
      content: `package com.example.interactivereader.core.database.entity

import androidx.room.ColumnInfo
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Relation
import com.example.interactivereader.core.domain.model.ChapterStatus

@Entity(
    tableName = "books",
    indices = [Index(value = ["title"]), Index(value = ["author"])]
)
data class BookEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0L,
    val title: String,
    val author: String,
    val coverUrl: String?,
    val description: String
)

@Entity(
    tableName = "chapters",
    foreignKeys = [
        ForeignKey(
            entity = BookEntity::class,
            parentColumns = ["id"],
            childColumns = ["bookId"],
            onDelete = ForeignKey.CASCADE,
            onUpdate = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["bookId"]),
        Index(value = ["bookId", "chapterIndex"], unique = true)
    ]
)
data class ChapterEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0L,
    val bookId: Long,
    val chapterIndex: Int,
    val title: String,
    val content: String
)

@Entity(
    tableName = "quiz_questions",
    foreignKeys = [
        ForeignKey(
            entity = ChapterEntity::class,
            parentColumns = ["id"],
            childColumns = ["chapterId"],
            onDelete = ForeignKey.CASCADE,
            onUpdate = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["chapterId"])]
)
data class QuizQuestionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0L,
    val chapterId: Long,
    val questionText: String,
    val optionsJson: List<String>,
    val correctOptionIndex: Int,
    val explanation: String
)

@Entity(
    tableName = "chapter_progress",
    primaryKeys = ["bookId", "chapterId"],
    foreignKeys = [
        ForeignKey(
            entity = BookEntity::class,
            parentColumns = ["id"],
            childColumns = ["bookId"],
            onDelete = ForeignKey.CASCADE,
            onUpdate = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = ChapterEntity::class,
            parentColumns = ["id"],
            childColumns = ["chapterId"],
            onDelete = ForeignKey.CASCADE,
            onUpdate = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["bookId"]),
        Index(value = ["chapterId"], unique = true)
    ]
)
data class ChapterProgressEntity(
    val bookId: Long,
    val chapterId: Long,
    val status: ChapterStatus,
    val lastCharOffset: Int = 0,
    val bestQuizScore: Int = 0,
    val updatedAt: Long
)

data class ChapterSummaryTuple(
    @ColumnInfo(name = "id") val id: Long,
    @ColumnInfo(name = "bookId") val bookId: Long,
    @ColumnInfo(name = "chapterIndex") val chapterIndex: Int,
    @ColumnInfo(name = "title") val title: String
)

data class ChapterWithProgressRelation(
    @Embedded val chapter: ChapterSummaryTuple,
    @Relation(parentColumn = "id", entityColumn = "chapterId")
    val progress: ChapterProgressEntity?
)
`,
    },
    {
      path: 'app/src/main/java/com/example/interactivereader/core/database/seeder/DatabaseSeeder.kt',
      category: 'Core & Room DB',
      description: 'Предзаполнение БД книгой «Простые благодеяния» (Муфтий Мухаммад Таки Усмани, 12 частей и 36 вопросов)',
      content: `package com.example.interactivereader.core.database.seeder

import androidx.room.RoomDatabase
import androidx.room.withTransaction
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.interactivereader.core.database.AppDatabase
import com.example.interactivereader.core.database.entity.BookEntity
import com.example.interactivereader.core.database.entity.ChapterEntity
import com.example.interactivereader.core.database.entity.ChapterProgressEntity
import com.example.interactivereader.core.domain.model.ChapterStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

@Singleton
class DatabaseSeeder @Inject constructor(
    private val databaseProvider: Provider<AppDatabase>
) : RoomDatabase.Callback() {

    private val seederScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate(db: SupportSQLiteDatabase) {
        super.onCreate(db)
        seederScope.launch { seedInitialDataIfNeeded() }
    }

    suspend fun seedInitialDataIfNeeded() {
        val database = databaseProvider.get()
        val bookDao = database.bookDao()
        val chapterDao = database.chapterDao()
        val progressDao = database.progressDao()

        if (!bookDao.observeAllBooks().firstOrNull().isNullOrEmpty()) return
        val now = System.currentTimeMillis()

        database.withTransaction {
            val bookId = bookDao.insertBook(
                BookEntity(
                    id = 5L,
                    title = ${JSON.stringify(EASY_GOOD_DEEDS_BOOK.title)},
                    author = ${JSON.stringify(EASY_GOOD_DEEDS_BOOK.author)},
                    coverUrl = ${JSON.stringify(EASY_GOOD_DEEDS_BOOK.coverUrl)},
                    description = ${JSON.stringify(EASY_GOOD_DEEDS_BOOK.description)}
                )
            )

            chapterDao.insertChapters(
                listOf(
                    ${chaptersKotlinList}
                )
            )

            progressDao.upsertProgressList(
                listOf(
                    ${progressKotlinList}
                )
            )
        }
    }
}
`,
    },
    ...ADDITIONAL_KOTLIN_FILES,
  ];
}

export async function downloadAndroidProjectZip(): Promise<void> {
  const zip = new JSZip();
  const files = getAndroidProjectFiles();

  for (const file of files) {
    zip.file(file.path, file.content);
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'InteractiveReader-Android-APK-Project.zip';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
