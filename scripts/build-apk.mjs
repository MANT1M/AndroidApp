import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { execSync } from 'child_process';
import esbuild from 'esbuild';

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

  const coverPngPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/____________60fd26fa.png'
  );
  if (fs.existsSync(coverPngPath)) {
    const coverB64 = fs.readFileSync(coverPngPath).toString('base64');
    appJs = appJs
      .split('/assets/aistudio/____________60fd26fa.png')
      .join(`data:image/png;base64,${coverB64}`);
  }

  // Prevent any accidental </script> sequence inside string literals from closing the script tag
  const safeAppJs = appJs.replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<title>Простые благодеяния — Намаз, Дуа, Тасбих и Книги</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
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
 * Builds a valid Android Binary XML (AXML) for AndroidManifest.xml
 */
function buildBinaryAndroidManifest() {
  // Attribute resource IDs in Android framework (must be sorted ascending per element)
  const ATTR_THEME = 0x01010000;
  const ATTR_LABEL = 0x01010001;
  const ATTR_ICON = 0x01010002;
  const ATTR_NAME = 0x01010003;
  const ATTR_EXPORTED = 0x01010010;
  const ATTR_MIN_SDK = 0x0101020c;
  const ATTR_VERSION_CODE = 0x0101021b;
  const ATTR_VERSION_NAME = 0x0101021c;
  const ATTR_TARGET_SDK = 0x01010270;
  const ATTR_HARDWARE_ACCEL = 0x010102d3;

  // First 10 strings correspond to the resource IDs in the exact order below:
  const resIds = [
    ATTR_THEME,
    ATTR_LABEL,
    ATTR_ICON,
    ATTR_NAME,
    ATTR_EXPORTED,
    ATTR_MIN_SDK,
    ATTR_VERSION_CODE,
    ATTR_VERSION_NAME,
    ATTR_TARGET_SDK,
    ATTR_HARDWARE_ACCEL,
  ];

  const strings = [
    'theme',                                      // 0 -> 0x01010000
    'label',                                      // 1 -> 0x01010001
    'icon',                                       // 2 -> 0x01010002
    'name',                                       // 3 -> 0x01010003
    'exported',                                   // 4 -> 0x01010010
    'minSdkVersion',                              // 5 -> 0x0101020c
    'versionCode',                                // 6 -> 0x0101021b
    'versionName',                                // 7 -> 0x0101021c
    'targetSdkVersion',                           // 8 -> 0x01010270
    'hardwareAccelerated',                        // 9 -> 0x010102d3
    'android',                                    // 10
    'http://schemas.android.com/apk/res/android', // 11
    'manifest',                                   // 12
    'package',                                    // 13
    'com.example.interactivereader',              // 14
    '3.0.0',                                      // 15
    'uses-sdk',                                   // 16
    'application',                                // 17
    'Простые благодеяния',                        // 18
    'activity',                                   // 19
    'com.example.interactivereader.MainActivity', // 20
    'intent-filter',                              // 21
    'action',                                     // 22
    'android.intent.action.MAIN',                 // 23
    'category',                                   // 24
    'android.intent.category.LAUNCHER',           // 25
  ];

  // Encode UTF-16LE string pool
  const encodedStrings = strings.map((str) => {
    const strBuf = Buffer.from(str, 'utf16le');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16LE(str.length, 0);
    const nullBuf = Buffer.alloc(2, 0);
    return Buffer.concat([lenBuf, strBuf, nullBuf]);
  });

  const offsets = [];
  let curOffset = 0;
  for (const b of encodedStrings) {
    offsets.push(curOffset);
    curOffset += b.length;
  }
  while (curOffset % 4 !== 0) {
    encodedStrings.push(Buffer.alloc(1, 0));
    curOffset += 1;
  }

  const stringPoolHeaderSize = 28;
  const offsetsSize = strings.length * 4;
  const stringsStart = stringPoolHeaderSize + offsetsSize;
  const stringPoolChunkSize = stringsStart + curOffset;

  const stringPoolBuf = Buffer.alloc(stringPoolChunkSize);
  stringPoolBuf.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  stringPoolBuf.writeUInt16LE(stringPoolHeaderSize, 2);
  stringPoolBuf.writeUInt32LE(stringPoolChunkSize, 4);
  stringPoolBuf.writeUInt32LE(strings.length, 8);
  stringPoolBuf.writeUInt32LE(0, 12); // styleCount
  stringPoolBuf.writeUInt32LE(0, 16); // flags (UTF-16)
  stringPoolBuf.writeUInt32LE(stringsStart, 20);
  stringPoolBuf.writeUInt32LE(0, 24); // stylesStart

  for (let i = 0; i < offsets.length; i++) {
    stringPoolBuf.writeUInt32LE(offsets[i], stringPoolHeaderSize + i * 4);
  }
  Buffer.concat(encodedStrings).copy(stringPoolBuf, stringsStart);

  // Resource Map Chunk
  const resMapChunkSize = 8 + resIds.length * 4;
  const resMapBuf = Buffer.alloc(resMapChunkSize);
  resMapBuf.writeUInt16LE(0x0180, 0); // RES_XML_RESOURCE_MAP_TYPE
  resMapBuf.writeUInt16LE(8, 2);
  resMapBuf.writeUInt32LE(resMapChunkSize, 4);
  for (let i = 0; i < resIds.length; i++) {
    resMapBuf.writeUInt32LE(resIds[i], 8 + i * 4);
  }

  function makeNamespaceChunk(isStart, prefixIdx, uriIdx, line) {
    const buf = Buffer.alloc(24);
    buf.writeUInt16LE(isStart ? 0x0100 : 0x0101, 0);
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(24, 4);
    buf.writeUInt32LE(line, 8);
    buf.writeInt32LE(-1, 12);
    buf.writeInt32LE(prefixIdx, 16);
    buf.writeInt32LE(uriIdx, 20);
    return buf;
  }

  function makeStartElement(nameIdx, line, attrs) {
    const chunkSize = 36 + attrs.length * 20;
    const buf = Buffer.alloc(chunkSize);
    buf.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(chunkSize, 4);
    buf.writeUInt32LE(line, 8);
    buf.writeInt32LE(-1, 12);
    buf.writeInt32LE(-1, 16); // ns
    buf.writeInt32LE(nameIdx, 20);
    buf.writeUInt16LE(20, 24); // attributeStart
    buf.writeUInt16LE(20, 26); // attributeSize
    buf.writeUInt16LE(attrs.length, 28);
    buf.writeUInt16LE(0, 30);
    buf.writeUInt16LE(0, 32);
    buf.writeUInt16LE(0, 34);

    attrs.forEach((a, idx) => {
      const base = 36 + idx * 20;
      buf.writeInt32LE(a.ns, base);
      buf.writeInt32LE(a.nameIdx, base + 4);
      buf.writeInt32LE(a.rawValIdx, base + 8);
      buf.writeUInt16LE(8, base + 12);
      buf.writeUInt8(0, base + 14);
      buf.writeUInt8(a.type, base + 16);
      buf.writeUInt32LE(a.data >>> 0, base + 16); // wait: offset 15 is type!
    });
    return buf;
  }

  // Fix attribute layout:
  // +0: ns (int32)
  // +4: name (int32)
  // +8: rawValue (int32)
  // +12: size (uint16 = 8)
  // +14: res0 (uint8 = 0)
  // +15: dataType (uint8: 0x03=string, 0x10=int, 0x12=bool, 0x01=reference)
  // +16: data (uint32)
  function makeStartElementCorrect(nameIdx, line, attrs) {
    const chunkSize = 36 + attrs.length * 20;
    const buf = Buffer.alloc(chunkSize);
    buf.writeUInt16LE(0x0102, 0);
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(chunkSize, 4);
    buf.writeUInt32LE(line, 8);
    buf.writeInt32LE(-1, 12);
    buf.writeInt32LE(-1, 16);
    buf.writeInt32LE(nameIdx, 20);
    buf.writeUInt16LE(20, 24);
    buf.writeUInt16LE(20, 26);
    buf.writeUInt16LE(attrs.length, 28);
    buf.writeUInt16LE(0, 30);
    buf.writeUInt16LE(0, 32);
    buf.writeUInt16LE(0, 34);

    attrs.forEach((a, idx) => {
      const base = 36 + idx * 20;
      buf.writeInt32LE(a.ns, base);
      buf.writeInt32LE(a.nameIdx, base + 4);
      buf.writeInt32LE(a.rawValIdx, base + 8);
      buf.writeUInt16LE(8, base + 12);
      buf.writeUInt8(0, base + 14);
      buf.writeUInt8(a.type, base + 15);
      buf.writeUInt32LE(a.data >>> 0, base + 16);
    });
    return buf;
  }

  function makeEndElement(nameIdx, line) {
    const buf = Buffer.alloc(24);
    buf.writeUInt16LE(0x0103, 0);
    buf.writeUInt16LE(16, 2);
    buf.writeUInt32LE(24, 4);
    buf.writeUInt32LE(line, 8);
    buf.writeInt32LE(-1, 12);
    buf.writeInt32LE(-1, 16);
    buf.writeInt32LE(nameIdx, 20);
    return buf;
  }

  const TYPE_REFERENCE = 0x01;
  const TYPE_STRING = 0x03;
  const TYPE_INT_DEC = 0x10;
  const TYPE_INT_BOOLEAN = 0x12;

  const xmlChunks = [
    makeNamespaceChunk(true, 10, 11, 2),
    // <manifest android:versionCode="3" android:versionName="3.0.0" package="com.example.interactivereader">
    makeStartElementCorrect(12, 2, [
      { ns: 11, nameIdx: 6, rawValIdx: -1, type: TYPE_INT_DEC, data: 3 },
      { ns: 11, nameIdx: 7, rawValIdx: 15, type: TYPE_STRING, data: 15 },
      { ns: -1, nameIdx: 13, rawValIdx: 14, type: TYPE_STRING, data: 14 },
    ]),
    // <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="28" />
    makeStartElementCorrect(16, 6, [
      { ns: 11, nameIdx: 5, rawValIdx: -1, type: TYPE_INT_DEC, data: 21 },
      { ns: 11, nameIdx: 8, rawValIdx: -1, type: TYPE_INT_DEC, data: 28 },
    ]),
    makeEndElement(16, 6),
    // <application android:theme="@android:style/Theme.Material.Light.NoActionBar" android:label="Простые благодеяния" android:icon="@drawable/ic_launcher" (0x7f010000) android:hardwareAccelerated="true">
    makeStartElementCorrect(17, 8, [
      { ns: 11, nameIdx: 0, rawValIdx: -1, type: TYPE_REFERENCE, data: 0x01030224 },
      { ns: 11, nameIdx: 1, rawValIdx: 18, type: TYPE_STRING, data: 18 },
      { ns: 11, nameIdx: 2, rawValIdx: -1, type: TYPE_REFERENCE, data: 0x7f010000 },
      { ns: 11, nameIdx: 9, rawValIdx: -1, type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    // <activity android:icon="@drawable/ic_launcher" android:name="com.example.interactivereader.MainActivity" android:exported="true">
    makeStartElementCorrect(19, 12, [
      { ns: 11, nameIdx: 2, rawValIdx: -1, type: TYPE_REFERENCE, data: 0x7f010000 },
      { ns: 11, nameIdx: 3, rawValIdx: 20, type: TYPE_STRING, data: 20 },
      { ns: 11, nameIdx: 4, rawValIdx: -1, type: TYPE_INT_BOOLEAN, data: 0xffffffff },
    ]),
    // <intent-filter>
    makeStartElementCorrect(21, 15, []),
    // <action android:name="android.intent.action.MAIN" />
    makeStartElementCorrect(22, 16, [
      { ns: 11, nameIdx: 3, rawValIdx: 23, type: TYPE_STRING, data: 23 },
    ]),
    makeEndElement(22, 16),
    // <category android:name="android.intent.category.LAUNCHER" />
    makeStartElementCorrect(24, 17, [
      { ns: 11, nameIdx: 3, rawValIdx: 25, type: TYPE_STRING, data: 25 },
    ]),
    makeEndElement(24, 17),
    makeEndElement(21, 18),
    makeEndElement(19, 19),
    makeEndElement(17, 20),
    makeEndElement(12, 21),
    makeNamespaceChunk(false, 10, 11, 21),
  ];

  const bodyBuf = Buffer.concat([stringPoolBuf, resMapBuf, ...xmlChunks]);
  const headerBuf = Buffer.alloc(8);
  headerBuf.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  headerBuf.writeUInt16LE(8, 2);
  headerBuf.writeUInt32LE(8 + bodyBuf.length, 4);

  return Buffer.concat([headerBuf, bodyBuf]);
}

/**
 * Builds a valid Android resources.arsc table mapping 0x7f010000 (@drawable/ic_launcher)
 * to res/drawable/ic_launcher.png
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
    buf.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
    buf.writeUInt16LE(headerSize, 2);
    buf.writeUInt32LE(totalSize, 4);
    buf.writeUInt32LE(strList.length, 8);
    buf.writeUInt32LE(0, 12);
    buf.writeUInt32LE(0, 16); // UTF-16
    buf.writeUInt32LE(stringsStart, 20);
    buf.writeUInt32LE(0, 24);
    for (let i = 0; i < offsets.length; i++) {
      buf.writeUInt32LE(offsets[i], headerSize + i * 4);
    }
    Buffer.concat(encoded).copy(buf, stringsStart);
    return buf;
  }

  const globalPool = makeUtf16StringPool(['res/drawable/ic_launcher.png']);
  const typePool = makeUtf16StringPool(['drawable']);
  const keyPool = makeUtf16StringPool(['ic_launcher']);

  // ResTable_typeSpec (type 0x0202)
  const typeSpecBuf = Buffer.alloc(20);
  typeSpecBuf.writeUInt16LE(0x0202, 0);
  typeSpecBuf.writeUInt16LE(16, 2);
  typeSpecBuf.writeUInt32LE(20, 4);
  typeSpecBuf.writeUInt8(1, 8); // id = 1 (drawable)
  typeSpecBuf.writeUInt32LE(1, 12); // entryCount = 1
  typeSpecBuf.writeUInt32LE(0, 16); // flags[0] = 0

  // ResTable_type (type 0x0201)
  // Header: 8 (ResChunk_header) + 4 (id/res0/res1) + 4 (entryCount) + 4 (entriesStart) + 36 (ResTable_config) = 56 bytes
  const typeHeaderSize = 56;
  const entriesStart = typeHeaderSize + 4; // 1 offset (4 bytes)
  const entryDataSize = 16; // ResTable_entry (8) + Res_value (8)
  const typeChunkSize = entriesStart + entryDataSize;
  const typeBuf = Buffer.alloc(typeChunkSize);
  typeBuf.writeUInt16LE(0x0201, 0);
  typeBuf.writeUInt16LE(typeHeaderSize, 2);
  typeBuf.writeUInt32LE(typeChunkSize, 4);
  typeBuf.writeUInt8(1, 8); // id = 1
  typeBuf.writeUInt32LE(1, 12); // entryCount = 1
  typeBuf.writeUInt32LE(entriesStart, 16); // entriesStart = 60
  typeBuf.writeUInt32LE(36, 20); // ResTable_config.size = 36
  // entryOffsets[0] at offset 56 = 0
  typeBuf.writeUInt32LE(0, 56);
  // ResTable_entry at offset 60:
  typeBuf.writeUInt16LE(8, 60); // size = 8
  typeBuf.writeUInt16LE(0, 62); // flags = 0
  typeBuf.writeUInt32LE(0, 64); // key = 0 ('ic_launcher' in keyPool)
  // Res_value at offset 68:
  typeBuf.writeUInt16LE(8, 68); // size = 8
  typeBuf.writeUInt8(0, 70); // res0 = 0
  typeBuf.writeUInt8(0x03, 71); // dataType = TYPE_STRING (0x03)
  typeBuf.writeUInt32LE(0, 72); // data = 0 ('res/drawable/ic_launcher.png' in globalPool)

  // ResTable_package (type 0x0200, headerSize = 288)
  const pkgHeaderSize = 288;
  const pkgBody = Buffer.concat([typePool, keyPool, typeSpecBuf, typeBuf]);
  const pkgTotalSize = pkgHeaderSize + pkgBody.length;
  const pkgHeader = Buffer.alloc(pkgHeaderSize);
  pkgHeader.writeUInt16LE(0x0200, 0);
  pkgHeader.writeUInt16LE(pkgHeaderSize, 2);
  pkgHeader.writeUInt32LE(pkgTotalSize, 4);
  pkgHeader.writeUInt32LE(0x7f, 8); // package id = 0x7f
  const pkgNameBuf = Buffer.from('com.example.interactivereader', 'utf16le');
  pkgNameBuf.copy(pkgHeader, 12);
  pkgHeader.writeUInt32LE(pkgHeaderSize, 268); // typeStrings offset
  pkgHeader.writeUInt32LE(1, 272); // lastPublicType
  pkgHeader.writeUInt32LE(pkgHeaderSize + typePool.length, 276); // keyStrings offset
  pkgHeader.writeUInt32LE(1, 280); // lastPublicKey
  pkgHeader.writeUInt32LE(0, 284); // typeIdOffset

  const pkgChunk = Buffer.concat([pkgHeader, pkgBody]);

  // ResTable_header (type 0x0002, headerSize = 12)
  const tableHeader = Buffer.alloc(12);
  const tableTotalSize = 12 + globalPool.length + pkgChunk.length;
  tableHeader.writeUInt16LE(0x0002, 0);
  tableHeader.writeUInt16LE(12, 2);
  tableHeader.writeUInt32LE(tableTotalSize, 4);
  tableHeader.writeUInt32LE(1, 8); // packageCount = 1

  return Buffer.concat([tableHeader, globalPool, pkgChunk]);
}

/**
 * Builds a valid Dalvik Executable (classes.dex) for com.example.interactivereader.MainActivity
 * that opens an Android WebView and loads file:///android_asset/index.html
 */
function buildClassesDex() {
  // Strings in strict lexicographical order!
  const strings = [
    '<init>',                                           // 0
    'Landroid/app/Activity;',                           // 1
    'Landroid/content/Context;',                        // 2
    'Landroid/os/Bundle;',                              // 3
    'Landroid/view/View;',                              // 4
    'Landroid/webkit/WebSettings;',                     // 5
    'Landroid/webkit/WebView;',                         // 6
    'Lcom/example/interactivereader/MainActivity;',     // 7
    'Ljava/lang/Object;',                               // 8
    'Ljava/lang/String;',                               // 9
    'V',                                                // 10
    'VL',                                               // 11
    'VZ',                                               // 12
    'Z',                                                // 13
    'file:///android_asset/index.html',                 // 14
    'getSettings',                                      // 15
    'loadUrl',                                          // 16
    'onCreate',                                         // 17
    'setContentView',                                   // 18
    'setDomStorageEnabled',                             // 19
    'setJavaScriptEnabled',                             // 20
  ];

  // Type IDs (indices into strings, sorted)
  // 0: Landroid/app/Activity; (1)
  // 1: Landroid/content/Context; (2)
  // 2: Landroid/os/Bundle; (3)
  // 3: Landroid/view/View; (4)
  // 4: Landroid/webkit/WebSettings; (5)
  // 5: Landroid/webkit/WebView; (6)
  // 6: Lcom/example/interactivereader/MainActivity; (7)
  // 7: Ljava/lang/String; (9)
  // 8: V (10)
  // 9: Z (13)
  const typeIds = [1, 2, 3, 4, 5, 6, 7, 9, 10, 13];

  // Type Lists for Proto parameters:
  // List A: (Landroid/content/Context;) -> [1]
  // List B: (Landroid/os/Bundle;) -> [2]
  // List C: (Landroid/view/View;) -> [3]
  // List D: (Ljava/lang/String;) -> [7]
  // List E: (Z) -> [9]

  // Proto IDs (sorted by return_type_idx, then parameters_list):
  // 0: ()Landroid/webkit/WebSettings; -> shorty=8('L'? Wait: let's add 'L' to strings!)
  return buildClassesDexWithShorties();
}

function buildClassesDexWithShorties() {
  // Strictly sorted UTF-8 strings:
  const strings = [
    '<init>',                                           // 0
    'L',                                                // 1
    'Landroid/app/Activity;',                           // 2
    'Landroid/content/Context;',                        // 3
    'Landroid/os/Bundle;',                              // 4
    'Landroid/view/View;',                              // 5
    'Landroid/webkit/WebSettings;',                     // 6
    'Landroid/webkit/WebView;',                         // 7
    'Lcom/example/interactivereader/MainActivity;',     // 8
    'Ljava/lang/String;',                               // 9
    'V',                                                // 10
    'VL',                                               // 11
    'VZ',                                               // 12
    'Z',                                                // 13
    'canGoBack',                                        // 14
    'file:///android_asset/index.html',                 // 15
    'getSettings',                                      // 16
    'goBack',                                           // 17
    'loadUrl',                                          // 18
    'onBackPressed',                                    // 19
    'onCreate',                                         // 20
    'setContentView',                                   // 21
    'setDomStorageEnabled',                             // 22
    'setJavaScriptEnabled',                             // 23
    'webView',                                          // 24
  ];

  // Verify strict lexicographical sort
  for (let i = 1; i < strings.length; i++) {
    if (strings[i - 1] >= strings[i]) {
      throw new Error(`Strings not sorted: ${strings[i - 1]} vs ${strings[i]}`);
    }
  }

  // Type IDs (index into strings):
  // 0: Landroid/app/Activity; (2)
  // 1: Landroid/content/Context; (3)
  // 2: Landroid/os/Bundle; (4)
  // 3: Landroid/view/View; (5)
  // 4: Landroid/webkit/WebSettings; (6)
  // 5: Landroid/webkit/WebView; (7)
  // 6: Lcom/example/interactivereader/MainActivity; (8)
  // 7: Ljava/lang/String; (9)
  // 8: V (10)
  // 9: Z (13)
  const typeIds = [2, 3, 4, 5, 6, 7, 8, 9, 10, 13];

  // Protos (sorted by return_type_idx, then parameter type_idx):
  // 0: ()Landroid/webkit/WebSettings;  | shorty=1 ('L'), return=4, params=0
  // 1: ()V                             | shorty=10 ('V'), return=8, params=0
  // 2: (Landroid/content/Context;)V    | shorty=11 ('VL'), return=8, params=[1]
  // 3: (Landroid/os/Bundle;)V          | shorty=11 ('VL'), return=8, params=[2]
  // 4: (Landroid/view/View;)V          | shorty=11 ('VL'), return=8, params=[3]
  // 5: (Ljava/lang/String;)V           | shorty=11 ('VL'), return=8, params=[7]
  // 6: (Z)V                            | shorty=12 ('VZ'), return=8, params=[9]
  // 7: ()Z                             | shorty=13 ('Z'), return=9, params=0
  const protos = [
    { shortyIdx: 1, returnTypeIdx: 4, paramTypeIdx: null },
    { shortyIdx: 10, returnTypeIdx: 8, paramTypeIdx: null },
    { shortyIdx: 11, returnTypeIdx: 8, paramTypeIdx: 1 },
    { shortyIdx: 11, returnTypeIdx: 8, paramTypeIdx: 2 },
    { shortyIdx: 11, returnTypeIdx: 8, paramTypeIdx: 3 },
    { shortyIdx: 11, returnTypeIdx: 8, paramTypeIdx: 7 },
    { shortyIdx: 12, returnTypeIdx: 8, paramTypeIdx: 9 },
    { shortyIdx: 13, returnTypeIdx: 9, paramTypeIdx: null },
  ];

  // Field IDs:
  // 0: Lcom/example/interactivereader/MainActivity;.webView:Landroid/webkit/WebView; (class=6, type=5, name=24)
  const fields = [
    { classIdx: 6, typeIdx: 5, nameIdx: 24 },
  ];

  // Method IDs (sorted by class_idx, then name_idx, then proto_idx):
  // 0: Landroid/app/Activity;.<init>:()V                                     (class=0, name=0, proto=1)
  // 1: Landroid/app/Activity;.onBackPressed:()V                              (class=0, name=19, proto=1)
  // 2: Landroid/app/Activity;.onCreate:(Landroid/os/Bundle;)V                (class=0, name=20, proto=3)
  // 3: Landroid/app/Activity;.setContentView:(Landroid/view/View;)V          (class=0, name=21, proto=4)
  // 4: Landroid/webkit/WebSettings;.setDomStorageEnabled:(Z)V                (class=4, name=22, proto=6)
  // 5: Landroid/webkit/WebSettings;.setJavaScriptEnabled:(Z)V                (class=4, name=23, proto=6)
  // 6: Landroid/webkit/WebView;.<init>:(Landroid/content/Context;)V          (class=5, name=0, proto=2)
  // 7: Landroid/webkit/WebView;.canGoBack:()Z                                (class=5, name=14, proto=7)
  // 8: Landroid/webkit/WebView;.getSettings:()Landroid/webkit/WebSettings;   (class=5, name=16, proto=0)
  // 9: Landroid/webkit/WebView;.goBack:()V                                   (class=5, name=17, proto=1)
  // 10: Landroid/webkit/WebView;.loadUrl:(Ljava/lang/String;)V               (class=5, name=18, proto=5)
  // 11: Lcom/example/interactivereader/MainActivity;.<init>:()V              (class=6, name=0, proto=1)
  // 12: Lcom/example/interactivereader/MainActivity;.onBackPressed:()V       (class=6, name=19, proto=1)
  // 13: Lcom/example/interactivereader/MainActivity;.onCreate:(Landroid/os/Bundle;)V (class=6, name=20, proto=3)
  const methods = [
    { classIdx: 0, protoIdx: 1, nameIdx: 0 },
    { classIdx: 0, protoIdx: 1, nameIdx: 19 },
    { classIdx: 0, protoIdx: 3, nameIdx: 20 },
    { classIdx: 0, protoIdx: 4, nameIdx: 21 },
    { classIdx: 4, protoIdx: 6, nameIdx: 22 },
    { classIdx: 4, protoIdx: 6, nameIdx: 23 },
    { classIdx: 5, protoIdx: 2, nameIdx: 0 },
    { classIdx: 5, protoIdx: 7, nameIdx: 14 },
    { classIdx: 5, protoIdx: 0, nameIdx: 16 },
    { classIdx: 5, protoIdx: 1, nameIdx: 17 },
    { classIdx: 5, protoIdx: 5, nameIdx: 18 },
    { classIdx: 6, protoIdx: 1, nameIdx: 0 },
    { classIdx: 6, protoIdx: 1, nameIdx: 19 },
    { classIdx: 6, protoIdx: 3, nameIdx: 20 },
  ];

  // ULEB128 helper
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

  // Code item 1: MainActivity.<init>()V
  const initCodeItem = Buffer.alloc(16 + 8);
  initCodeItem.writeUInt16LE(1, 0); // registers_size
  initCodeItem.writeUInt16LE(1, 2); // ins_size
  initCodeItem.writeUInt16LE(1, 4); // outs_size
  initCodeItem.writeUInt16LE(0, 6); // tries_size
  initCodeItem.writeUInt32LE(0, 8); // debug_info_off
  initCodeItem.writeUInt32LE(4, 12); // insns_size (4 units)
  Buffer.from([0x70, 0x10, 0x00, 0x00, 0x00, 0x00, 0x0e, 0x00]).copy(initCodeItem, 16);

  // Code item 2: MainActivity.onBackPressed()V
  // registers_size = 3 (v0=webView, v1=canGoBack, v2=this), ins_size = 1 (v2), outs_size = 1
  const onBackPressedInsns = Buffer.from([
    0x54, 0x20, 0x00, 0x00,             // iget-object v0, v2, MainActivity.webView (field 0)
    0x38, 0x00, 0x0c, 0x00,             // if-eqz v0, :call_super (+12 units -> 0x000e)
    0x6e, 0x10, 0x07, 0x00, 0x00, 0x00, // invoke-virtual {v0}, WebView.canGoBack:()Z (method 7)
    0x0a, 0x01,                         // move-result v1
    0x38, 0x01, 0x06, 0x00,             // if-eqz v1, :call_super (+6 units -> 0x000e)
    0x6e, 0x10, 0x09, 0x00, 0x00, 0x00, // invoke-virtual {v0}, WebView.goBack:()V (method 9)
    0x0e, 0x00,                         // return-void
    0x6f, 0x10, 0x01, 0x00, 0x02, 0x00, // invoke-super {v2}, Activity.onBackPressed:()V (method 1)
    0x0e, 0x00,                         // return-void
  ]);
  const onBackPressedCodeItem = Buffer.alloc(16 + onBackPressedInsns.length); // 16 + 36 = 52 bytes (4-byte aligned)
  onBackPressedCodeItem.writeUInt16LE(3, 0); // registers_size
  onBackPressedCodeItem.writeUInt16LE(1, 2); // ins_size
  onBackPressedCodeItem.writeUInt16LE(1, 4); // outs_size
  onBackPressedCodeItem.writeUInt16LE(0, 6); // tries_size
  onBackPressedCodeItem.writeUInt32LE(0, 8); // debug_info_off
  onBackPressedCodeItem.writeUInt32LE(onBackPressedInsns.length / 2, 12); // insns_size (18 units)
  onBackPressedInsns.copy(onBackPressedCodeItem, 16);

  // Code item 3: MainActivity.onCreate(Landroid/os/Bundle;)V
  // registers_size = 5 (v0=webView, v1=settings, v2=const1/url, v3=this, v4=bundle)
  // ins_size = 2 (v3, v4), outs_size = 2
  const onCreateInsns = Buffer.from([
    0x6f, 0x20, 0x02, 0x00, 0x43, 0x00, // invoke-super {v3, v4}, Activity.onCreate (method 2)
    0x22, 0x00, 0x05, 0x00,             // new-instance v0, Landroid/webkit/WebView; (type 5)
    0x70, 0x20, 0x06, 0x00, 0x30, 0x00, // invoke-direct {v0, v3}, WebView.<init>(Context) (method 6)
    0x5b, 0x30, 0x00, 0x00,             // iput-object v0, v3, MainActivity.webView (field 0)
    0x6e, 0x10, 0x08, 0x00, 0x00, 0x00, // invoke-virtual {v0}, WebView.getSettings() (method 8)
    0x0c, 0x01,                         // move-result-object v1
    0x12, 0x12,                         // const/4 v2, #1
    0x6e, 0x20, 0x05, 0x00, 0x21, 0x00, // invoke-virtual {v1, v2}, WebSettings.setJavaScriptEnabled(Z) (method 5)
    0x6e, 0x20, 0x04, 0x00, 0x21, 0x00, // invoke-virtual {v1, v2}, WebSettings.setDomStorageEnabled(Z) (method 4)
    0x1a, 0x02, 0x0f, 0x00,             // const-string v2, "file:///android_asset/index.html" (str 15)
    0x6e, 0x20, 0x0a, 0x00, 0x20, 0x00, // invoke-virtual {v0, v2}, WebView.loadUrl(String) (method 10)
    0x6e, 0x20, 0x03, 0x00, 0x03, 0x00, // invoke-virtual {v3, v0}, Activity.setContentView(View) (method 3)
    0x0e, 0x00,                         // return-void
  ]);
  const onCreateCodeItem = Buffer.alloc(16 + onCreateInsns.length + 2); // +2 for 4-byte alignment
  onCreateCodeItem.writeUInt16LE(5, 0); // registers_size
  onCreateCodeItem.writeUInt16LE(2, 2); // ins_size
  onCreateCodeItem.writeUInt16LE(2, 4); // outs_size
  onCreateCodeItem.writeUInt16LE(0, 6); // tries_size
  onCreateCodeItem.writeUInt32LE(0, 8); // debug_info_off
  onCreateCodeItem.writeUInt32LE(onCreateInsns.length / 2, 12); // insns_size (27 units)
  onCreateInsns.copy(onCreateCodeItem, 16);

  const headerSize = 0x70;
  const stringIdsOff = headerSize;
  const typeIdsOff = stringIdsOff + strings.length * 4;
  const protoIdsOff = typeIdsOff + typeIds.length * 4;
  const fieldIdsOff = protoIdsOff + protos.length * 12;
  const methodIdsOff = fieldIdsOff + fields.length * 8;
  const classDefsOff = methodIdsOff + methods.length * 8;
  const dataOff = classDefsOff + 32;

  // Data Section items:
  // 1) Type Lists (5 lists of 1 item each, 4-byte aligned -> 8 bytes each = 40 bytes)
  const typeListsOff = dataOff;
  const paramTypes = [1, 2, 3, 7, 9];
  const typeListsBuf = Buffer.alloc(paramTypes.length * 8);
  paramTypes.forEach((tIdx, i) => {
    typeListsBuf.writeUInt32LE(1, i * 8);
    typeListsBuf.writeUInt16LE(tIdx, i * 8 + 4);
    typeListsBuf.writeUInt16LE(0, i * 8 + 6); // padding
  });

  // 2) Code items (4-byte aligned)
  const initCodeOff = typeListsOff + typeListsBuf.length;
  const onBackPressedCodeOff = initCodeOff + initCodeItem.length;
  const onCreateCodeOff = onBackPressedCodeOff + onBackPressedCodeItem.length;

  // 3) String Data items
  const stringDataStartOff = onCreateCodeOff + onCreateCodeItem.length;
  const stringDataOffsets = [];
  const stringDataChunks = [];
  let curStrOff = stringDataStartOff;
  for (const s of strings) {
    stringDataOffsets.push(curStrOff);
    const utf8Buf = Buffer.from(s, 'utf8');
    const lenPrefix = uleb128(s.length);
    const chunk = Buffer.concat([lenPrefix, utf8Buf, Buffer.from([0])]);
    stringDataChunks.push(chunk);
    curStrOff += chunk.length;
  }

  // 4) Class Data item for MainActivity
  const classDataOff = curStrOff;
  // static_fields=0, instance_fields=1, direct_methods=1, virtual_methods=2
  const classDataBuf = Buffer.concat([
    uleb128(0), // static_fields_size
    uleb128(1), // instance_fields_size
    uleb128(1), // direct_methods_size
    uleb128(2), // virtual_methods_size
    // instance_field[0]: field_idx_diff=0, access_flags=0x0002 (PRIVATE)
    uleb128(0),
    uleb128(0x0002),
    // direct_method[0]: method_idx_diff=11, access_flags=0x10001 (PUBLIC | CONSTRUCTOR), code_off=initCodeOff
    uleb128(11),
    uleb128(0x10001),
    uleb128(initCodeOff),
    // virtual_method[0]: method_idx_diff=12, access_flags=0x0001 (PUBLIC), code_off=onBackPressedCodeOff
    uleb128(12),
    uleb128(0x0001),
    uleb128(onBackPressedCodeOff),
    // virtual_method[1]: method_idx_diff=1 (13 - 12), access_flags=0x0004 (PROTECTED), code_off=onCreateCodeOff
    uleb128(1),
    uleb128(0x0004),
    uleb128(onCreateCodeOff),
  ]);

  let afterClassDataOff = classDataOff + classDataBuf.length;
  const alignPadLen = (4 - (afterClassDataOff % 4)) % 4;
  const alignPadBuf = Buffer.alloc(alignPadLen, 0);
  const mapListOff = afterClassDataOff + alignPadLen;

  // 5) Map List (12 items)
  const mapItems = [
    { type: 0x0000, size: 1, offset: 0 },
    { type: 0x0001, size: strings.length, offset: stringIdsOff },
    { type: 0x0002, size: typeIds.length, offset: typeIdsOff },
    { type: 0x0003, size: protos.length, offset: protoIdsOff },
    { type: 0x0004, size: fields.length, offset: fieldIdsOff },
    { type: 0x0005, size: methods.length, offset: methodIdsOff },
    { type: 0x0006, size: 1, offset: classDefsOff },
    { type: 0x1001, size: paramTypes.length, offset: typeListsOff },
    { type: 0x2001, size: 3, offset: initCodeOff },
    { type: 0x2002, size: strings.length, offset: stringDataStartOff },
    { type: 0x2000, size: 1, offset: classDataOff },
    { type: 0x1000, size: 1, offset: mapListOff },
  ];

  const mapListBuf = Buffer.alloc(4 + mapItems.length * 12);
  mapListBuf.writeUInt32LE(mapItems.length, 0);
  mapItems.forEach((m, i) => {
    const base = 4 + i * 12;
    mapListBuf.writeUInt16LE(m.type, base);
    mapListBuf.writeUInt16LE(0, base + 2);
    mapListBuf.writeUInt32LE(m.size, base + 4);
    mapListBuf.writeUInt32LE(m.offset, base + 8);
  });

  const fileSize = mapListOff + mapListBuf.length;
  const dataSize = fileSize - dataOff;

  const dex = Buffer.alloc(fileSize, 0);

  // Write magic "dex\n035\0"
  Buffer.from('dex\n035\0', 'ascii').copy(dex, 0);
  dex.writeUInt32LE(fileSize, 32);
  dex.writeUInt32LE(0x70, 36);
  dex.writeUInt32LE(0x12345678, 40); // ENDIAN_CONSTANT
  dex.writeUInt32LE(0, 44); // link_size
  dex.writeUInt32LE(0, 48); // link_off
  dex.writeUInt32LE(mapListOff, 52);
  dex.writeUInt32LE(strings.length, 56);
  dex.writeUInt32LE(stringIdsOff, 60);
  dex.writeUInt32LE(typeIds.length, 64);
  dex.writeUInt32LE(typeIdsOff, 68);
  dex.writeUInt32LE(protos.length, 72);
  dex.writeUInt32LE(protoIdsOff, 76);
  dex.writeUInt32LE(fields.length, 80); // field_ids_size
  dex.writeUInt32LE(fieldIdsOff, 84); // field_ids_off
  dex.writeUInt32LE(methods.length, 88);
  dex.writeUInt32LE(methodIdsOff, 92);
  dex.writeUInt32LE(1, 96); // class_defs_size
  dex.writeUInt32LE(classDefsOff, 100);
  dex.writeUInt32LE(dataSize, 104);
  dex.writeUInt32LE(dataOff, 108);

  // String IDs
  stringDataOffsets.forEach((off, i) => {
    dex.writeUInt32LE(off, stringIdsOff + i * 4);
  });

  // Type IDs
  typeIds.forEach((sIdx, i) => {
    dex.writeUInt32LE(sIdx, typeIdsOff + i * 4);
  });

  // Proto IDs
  let paramListIdx = 0;
  protos.forEach((p, i) => {
    const base = protoIdsOff + i * 12;
    dex.writeUInt32LE(p.shortyIdx, base);
    dex.writeUInt32LE(p.returnTypeIdx, base + 4);
    if (p.paramTypeIdx !== null) {
      dex.writeUInt32LE(typeListsOff + paramListIdx * 8, base + 8);
      paramListIdx++;
    } else {
      dex.writeUInt32LE(0, base + 8);
    }
  });

  // Field IDs
  fields.forEach((f, i) => {
    const base = fieldIdsOff + i * 8;
    dex.writeUInt16LE(f.classIdx, base);
    dex.writeUInt16LE(f.typeIdx, base + 2);
    dex.writeUInt32LE(f.nameIdx, base + 4);
  });

  // Method IDs
  methods.forEach((m, i) => {
    const base = methodIdsOff + i * 8;
    dex.writeUInt16LE(m.classIdx, base);
    dex.writeUInt16LE(m.protoIdx, base + 2);
    dex.writeUInt32LE(m.nameIdx, base + 4);
  });

  // Class Def (MainActivity = type 6, PUBLIC=0x0001, superclass=Activity=type 0)
  dex.writeUInt32LE(6, classDefsOff); // class_idx
  dex.writeUInt32LE(0x0001, classDefsOff + 4); // access_flags
  dex.writeUInt32LE(0, classDefsOff + 8); // superclass_idx
  dex.writeUInt32LE(0, classDefsOff + 12); // interfaces_off
  dex.writeUInt32LE(0xffffffff, classDefsOff + 16); // source_file_idx (NO_INDEX)
  dex.writeUInt32LE(0, classDefsOff + 20); // annotations_off
  dex.writeUInt32LE(classDataOff, classDefsOff + 24); // class_data_off
  dex.writeUInt32LE(0, classDefsOff + 28); // static_values_off

  // Copy Data Section
  typeListsBuf.copy(dex, typeListsOff);
  initCodeItem.copy(dex, initCodeOff);
  onBackPressedCodeItem.copy(dex, onBackPressedCodeOff);
  onCreateCodeItem.copy(dex, onCreateCodeOff);
  Buffer.concat(stringDataChunks).copy(dex, stringDataStartOff);
  classDataBuf.copy(dex, classDataOff);
  alignPadBuf.copy(dex, afterClassDataOff);
  mapListBuf.copy(dex, mapListOff);

  // Compute SHA-1 signature (bytes 32..end) and store at offset 12..31
  const sha1 = crypto.createHash('sha1').update(dex.subarray(32)).digest();
  sha1.copy(dex, 12);

  // Compute Adler32 checksum (bytes 12..end) and store at offset 8..11
  let a = 1;
  let b = 0;
  for (let i = 12; i < dex.length; i++) {
    a = (a + dex[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  dex.writeUInt32LE(adler, 8);

  return dex;
}

/**
 * Creates a signed APK (JAR Signature v1 + 4-byte aligned ZIP entries)
 */
function buildSignedApk(outputPath) {
  const tmpDir = '/tmp/apk_build_' + Date.now();
  fs.mkdirSync(tmpDir, { recursive: true });

  const manifestBin = buildBinaryAndroidManifest();
  const resourcesArsc = buildResourcesArsc();
  const icLauncherPng = fs.readFileSync(path.resolve(process.cwd(), 'public/pwa-192x192.png'));
  const classesDex = buildClassesDex();
  const indexHtml = Buffer.from(buildStandaloneReaderHtml(), 'utf8');

  // Generate v1 JAR signing files (META-INF/MANIFEST.MF, CERT.SF, CERT.RSA)
  const sha256B64 = (buf) => crypto.createHash('sha256').update(buf).digest('base64');

  const manifestMf = [
    'Manifest-Version: 1.0',
    'Created-By: 1.0 (Android)',
    '',
    'Name: AndroidManifest.xml',
    `SHA-256-Digest: ${sha256B64(manifestBin)}`,
    '',
    'Name: resources.arsc',
    `SHA-256-Digest: ${sha256B64(resourcesArsc)}`,
    '',
    'Name: res/drawable/ic_launcher.png',
    `SHA-256-Digest: ${sha256B64(icLauncherPng)}`,
    '',
    'Name: classes.dex',
    `SHA-256-Digest: ${sha256B64(classesDex)}`,
    '',
    'Name: assets/index.html',
    `SHA-256-Digest: ${sha256B64(indexHtml)}`,
    '',
  ].join('\r\n');

  const mfBuf = Buffer.from(manifestMf, 'utf8');

  const sectionHash = (name, digest) => {
    const chunk = `Name: ${name}\r\nSHA-256-Digest: ${digest}\r\n\r\n`;
    return sha256B64(Buffer.from(chunk, 'utf8'));
  };

  const certSf = [
    'Signature-Version: 1.0',
    'Created-By: 1.0 (Android)',
    `SHA-256-Digest-Manifest: ${sha256B64(mfBuf)}`,
    '',
    'Name: AndroidManifest.xml',
    `SHA-256-Digest: ${sectionHash('AndroidManifest.xml', sha256B64(manifestBin))}`,
    '',
    'Name: resources.arsc',
    `SHA-256-Digest: ${sectionHash('resources.arsc', sha256B64(resourcesArsc))}`,
    '',
    'Name: res/drawable/ic_launcher.png',
    `SHA-256-Digest: ${sectionHash('res/drawable/ic_launcher.png', sha256B64(icLauncherPng))}`,
    '',
    'Name: classes.dex',
    `SHA-256-Digest: ${sectionHash('classes.dex', sha256B64(classesDex))}`,
    '',
    'Name: assets/index.html',
    `SHA-256-Digest: ${sectionHash('assets/index.html', sha256B64(indexHtml))}`,
    '',
  ].join('\r\n');

  const sfPath = path.join(tmpDir, 'CERT.SF');
  const keyPath = path.join(tmpDir, 'key.pem');
  const certPath = path.join(tmpDir, 'cert.pem');
  const rsaPath = path.join(tmpDir, 'CERT.RSA');

  fs.writeFileSync(sfPath, certSf);

  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 10000 -nodes -subj "/CN=InteractiveReader/O=Android/C=US"`,
    { stdio: 'ignore' }
  );
  execSync(
    `openssl cms -sign -binary -in "${sfPath}" -signer "${certPath}" -inkey "${keyPath}" -outform DER -out "${rsaPath}" -nodetach -md sha256`,
    { stdio: 'ignore' }
  );

  const certRsaBuf = fs.readFileSync(rsaPath);
  const certDerBuf = execSync(`openssl x509 -in "${certPath}" -outform DER`);

  // Assemble uncompressed, 4-byte aligned ZIP archive with APK Signature Scheme v2 block!
  const entries = [
    { name: 'AndroidManifest.xml', data: manifestBin },
    { name: 'resources.arsc', data: resourcesArsc },
    { name: 'res/drawable/ic_launcher.png', data: icLauncherPng },
    { name: 'classes.dex', data: classesDex },
    { name: 'assets/index.html', data: indexHtml },
    { name: 'META-INF/MANIFEST.MF', data: mfBuf },
    { name: 'META-INF/CERT.SF', data: Buffer.from(certSf, 'utf8') },
    { name: 'META-INF/CERT.RSA', data: certRsaBuf },
  ];

  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = zlib.crc32(entry.data) >>> 0;
    const dataOffsetUnaligned = offset + 30 + nameBuf.length;
    const padLen = (4 - (dataOffsetUnaligned % 4)) % 4;
    const extraBuf = Buffer.alloc(padLen, 0);

    const localHeader = Buffer.alloc(30 + nameBuf.length + extraBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression = STORED
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x21, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(extraBuf.length, 28);
    nameBuf.copy(localHeader, 30);
    extraBuf.copy(localHeader, 30 + nameBuf.length);

    localHeaders.push(localHeader, entry.data);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x21, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const contentsSection = Buffer.concat(localHeaders);
  const centralDirSection = Buffer.concat(centralHeaders);

  const eocdForV2 = Buffer.alloc(22);
  eocdForV2.writeUInt32LE(0x06054b50, 0);
  eocdForV2.writeUInt16LE(0, 4);
  eocdForV2.writeUInt16LE(0, 6);
  eocdForV2.writeUInt16LE(entries.length, 8);
  eocdForV2.writeUInt16LE(entries.length, 10);
  eocdForV2.writeUInt32LE(centralDirSection.length, 12);
  eocdForV2.writeUInt32LE(contentsSection.length, 16);
  eocdForV2.writeUInt16LE(0, 20);

  // Build APK Signature Scheme v2 Block (ID 0x7109871a)
  const apkV2Block = buildApkSigBlockV2(
    contentsSection,
    centralDirSection,
    eocdForV2,
    fs.readFileSync(keyPath, 'utf8'),
    certDerBuf
  );

  // Update EOCD with the new Central Directory offset (after APK Sig Block)
  const finalEocd = Buffer.from(eocdForV2);
  finalEocd.writeUInt32LE(contentsSection.length + apkV2Block.length, 16);

  const finalApk = Buffer.concat([contentsSection, apkV2Block, centralDirSection, finalEocd]);
  fs.writeFileSync(outputPath, finalApk);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return finalApk.length;
}

/**
 * Builds APK Signature Scheme v2 ("APK Sig Block 42") for Android 7.0 – Android 15 compatibility
 */
function buildApkSigBlockV2(contentsBuf, cdBuf, eocdBuf, privateKeyPem, certDerBuf) {
  const CHUNK_SIZE = 1024 * 1024;

  function digestChunks(buffers) {
    const chunkDigests = [];
    for (const buf of buffers) {
      let pos = 0;
      while (pos < buf.length) {
        const slice = buf.subarray(pos, Math.min(pos + CHUNK_SIZE, buf.length));
        const header = Buffer.alloc(5);
        header.writeUInt8(0xa5, 0);
        header.writeUInt32LE(slice.length, 1);
        const d = crypto.createHash('sha256').update(header).update(slice).digest();
        chunkDigests.push(d);
        pos += slice.length;
      }
    }
    const topHeader = Buffer.alloc(5);
    topHeader.writeUInt8(0x5a, 0);
    topHeader.writeUInt32LE(chunkDigests.length, 1);
    return crypto
      .createHash('sha256')
      .update(topHeader)
      .update(Buffer.concat(chunkDigests))
      .digest();
  }

  const topDigest = digestChunks([contentsBuf, cdBuf, eocdBuf]);

  const lenPrefixed = (buf) => {
    const l = Buffer.alloc(4);
    l.writeUInt32LE(buf.length, 0);
    return Buffer.concat([l, buf]);
  };

  // Signature algorithm 0x0103 = RSASSA-PKCS1-v1_5 with SHA2-256
  const SIG_ALGO_RSA_PKCS1_SHA256 = 0x0103;

  // digest entry: uint32 algoId + lenPrefixed(digest)
  const algoBuf = Buffer.alloc(4);
  algoBuf.writeUInt32LE(SIG_ALGO_RSA_PKCS1_SHA256, 0);
  const digestEntry = lenPrefixed(Buffer.concat([algoBuf, lenPrefixed(topDigest)]));
  const digestsSeq = lenPrefixed(digestEntry);

  const certsSeq = lenPrefixed(lenPrefixed(certDerBuf));
  const additionalAttrsSeq = lenPrefixed(Buffer.alloc(0));

  const signedData = Buffer.concat([
    digestsSeq,
    certsSeq,
    additionalAttrsSeq,
    Buffer.alloc(4, 0), // v2 padding
  ]);
  // Note: v2 signed data format is: digests (len-prefixed), certificates (len-prefixed), additional_attributes (len-prefixed)
  const signedDataPure = Buffer.concat([digestsSeq, certsSeq, additionalAttrsSeq]);

  const signatureBytes = crypto.sign('sha256', signedDataPure, privateKeyPem);
  const signatureEntry = lenPrefixed(Buffer.concat([algoBuf, lenPrefixed(signatureBytes)]));
  const signaturesSeq = lenPrefixed(signatureEntry);

  const pubKeySpki = crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'der' });

  const signerBlock = lenPrefixed(
    Buffer.concat([
      lenPrefixed(signedDataPure),
      signaturesSeq,
      lenPrefixed(pubKeySpki),
    ])
  );
  const signersSeq = lenPrefixed(signerBlock);

  // Pair: uint64 length, uint32 ID (0x7109871a), value (signersSeq)
  const pairBody = Buffer.alloc(4 + signersSeq.length);
  pairBody.writeUInt32LE(0x7109871a, 0);
  signersSeq.copy(pairBody, 4);

  const pairLenBuf = Buffer.alloc(8);
  pairLenBuf.writeBigUInt64LE(BigInt(pairBody.length), 0);
  const pairsBuf = Buffer.concat([pairLenBuf, pairBody]);

  // Block size excluding first 8 bytes = pairsBuf.length + 8 (second size) + 16 (magic)
  const blockSizeField = BigInt(pairsBuf.length + 24);
  const sizeBuf1 = Buffer.alloc(8);
  sizeBuf1.writeBigUInt64LE(blockSizeField, 0);
  const sizeBuf2 = Buffer.from(sizeBuf1);
  const magicBuf = Buffer.from('APK Sig Block 42', 'ascii');

  return Buffer.concat([sizeBuf1, pairsBuf, sizeBuf2, magicBuf]);
}

const outPath = path.resolve(process.cwd(), 'public/InteractiveReader.apk');
const sizeBytes = buildSignedApk(outPath);
console.log(`Successfully built signed APK at ${outPath} (${sizeBytes} bytes)`);

const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  const distApk = path.resolve(distDir, 'InteractiveReader.apk');
  fs.copyFileSync(outPath, distApk);
  console.log(`Successfully mirrored APK to ${distApk}`);
}

