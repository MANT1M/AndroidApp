import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Generates high-resolution SVG and PNG app icons matching the user's artwork:
 * - Deep midnight royal blue squircle (#061F3E -> #0E3A66)
 * - Gold & turquoise Islamic arabesque filigree corner ornaments on all 4 corners
 * - Mosque domes & minarets silhouette against soft evening clouds
 * - Golden horizon sunrise glow at the base of the crescent
 * - Ornate golden filigree crescent moon with turquoise accents & 5-pointed gold star
 * - Figure-8 loop of dark glossy pearl prayer beads (tasbih) with a golden tassel pointing bottom-left
 */

const SVG_ICON_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Deep Midnight Royal Blue Background Gradient -->
    <radialGradient id="bgGrad" cx="50%" cy="46%" r="65%" fx="50%" fy="46%">
      <stop offset="0%" stop-color="#175282"/>
      <stop offset="48%" stop-color="#0A2B52"/>
      <stop offset="100%" stop-color="#04152D"/>
    </radialGradient>

    <!-- Warm Golden Sunrise / Horizon Glow -->
    <radialGradient id="horizonGlow" cx="50%" cy="54%" r="38%">
      <stop offset="0%" stop-color="#FFFBEB" stop-opacity="1"/>
      <stop offset="22%" stop-color="#FCD34D" stop-opacity="0.9"/>
      <stop offset="52%" stop-color="#D97706" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#0A2B52" stop-opacity="0"/>
    </radialGradient>

    <!-- Metallic Gold Linear Gradient -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFF3B8"/>
      <stop offset="30%" stop-color="#F5C451"/>
      <stop offset="65%" stop-color="#D49424"/>
      <stop offset="100%" stop-color="#8C5808"/>
    </linearGradient>

    <!-- Bright Gold Rim Gradient -->
    <linearGradient id="goldBright" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#B47615"/>
      <stop offset="50%" stop-color="#FDE07B"/>
      <stop offset="100%" stop-color="#FFF6C7"/>
    </linearGradient>

    <!-- Turquoise Enamel Accent Gradient -->
    <linearGradient id="turquoiseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4DD0E1"/>
      <stop offset="50%" stop-color="#14968B"/>
      <stop offset="100%" stop-color="#0A5C56"/>
    </linearGradient>

    <!-- 3D Dark Pearl Bead Radial Gradient -->
    <radialGradient id="beadGrad" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#7A93AC"/>
      <stop offset="22%" stop-color="#283C52"/>
      <stop offset="68%" stop-color="#0D1826"/>
      <stop offset="100%" stop-color="#050A12"/>
    </radialGradient>

    <!-- Gold Bead Spacer Gradient -->
    <radialGradient id="goldBead" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#FFF8D6"/>
      <stop offset="40%" stop-color="#F5C451"/>
      <stop offset="100%" stop-color="#784706"/>
    </radialGradient>

    <!-- Corner Arabesque Filigree Symbol (Top-Left Quadrant) -->
    <g id="cornerOrnament">
      <path d="M 24 148 C 24 64, 64 24, 148 24 L 184 24 C 110 42, 42 110, 24 184 Z" fill="#072142" stroke="url(#goldGrad)" stroke-width="4.5"/>
      <polygon points="44,126 56,112 68,122 54,136" fill="url(#turquoiseGrad)" stroke="url(#goldBright)" stroke-width="2"/>
      <polygon points="126,44 112,56 122,68 136,54" fill="url(#turquoiseGrad)" stroke="url(#goldBright)" stroke-width="2"/>
      <circle cx="64" cy="64" r="10" fill="url(#turquoiseGrad)" stroke="url(#goldBright)" stroke-width="2.5"/>
      <path d="M 38 148 Q 48 96 96 48 M 52 96 C 68 78, 78 68, 96 52 M 72 86 C 88 94, 94 88, 86 72" fill="none" stroke="url(#goldBright)" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 48 98 C 36 80, 48 56, 70 48 C 56 48, 80 36, 98 48" fill="none" stroke="url(#goldGrad)" stroke-width="3" stroke-linecap="round"/>
    </g>

    <!-- Single Dark Pearl Bead -->
    <g id="pearlBead">
      <circle cx="0" cy="3" r="11.5" fill="#020813" fill-opacity="0.65"/>
      <circle cx="0" cy="0" r="11" fill="url(#beadGrad)" stroke="#4A607A" stroke-width="0.7" stroke-opacity="0.55"/>
      <circle cx="-3.8" cy="-3.8" r="2.8" fill="#FFF8E7" fill-opacity="0.82"/>
      <circle cx="3.5" cy="4" r="4" fill="#FCD34D" fill-opacity="0.22"/>
    </g>

    <clipPath id="squircleClip">
      <rect x="8" y="8" width="496" height="496" rx="112" ry="112"/>
    </clipPath>
    <clipPath id="innerGoldClip">
      <rect x="22" y="22" width="468" height="468" rx="98" ry="98"/>
    </clipPath>
  </defs>

  <g clip-path="url(#squircleClip)">
    <!-- 1. Base Midnight Blue Background -->
    <rect x="8" y="8" width="496" height="496" rx="112" fill="url(#bgGrad)"/>

    <g clip-path="url(#innerGoldClip)">
      <!-- 2. Soft Evening Clouds -->
      <g fill="#2C5E8A" fill-opacity="0.28">
        <circle cx="145" cy="190" r="54"/>
        <circle cx="195" cy="175" r="64"/>
        <circle cx="310" cy="180" r="58"/>
        <circle cx="365" cy="200" r="48"/>
      </g>

      <!-- 3. Mosque Domes & Minarets Silhouette -->
      <g fill="#071D38" stroke="#24537A" stroke-width="1" stroke-opacity="0.45">
        <rect x="50" y="252" width="412" height="36"/>
        <rect x="108" y="168" width="12" height="86"/>
        <rect x="105" y="186" width="18" height="4" rx="2"/>
        <path d="M108 168 Q114 152 120 168 Z"/>
        <line x1="114" y1="146" x2="114" y2="156" stroke="#FCD34D" stroke-width="1.5"/>
        <path d="M126 252 Q150 212 174 252 Z"/>
        <path d="M214 252 C214 196, 298 196, 298 252 Z"/>
        <line x1="256" y1="184" x2="256" y2="205" stroke="#FCD34D" stroke-width="2"/>
        <rect x="196" y="198" width="9" height="54"/>
        <path d="M196 198 Q200.5 186 205 198 Z"/>
        <rect x="307" y="176" width="10" height="76"/>
        <path d="M307 176 Q312 162 317 176 Z"/>
        <path d="M336 252 Q362 210 388 252 Z"/>
        <rect x="394" y="168" width="12" height="86"/>
        <rect x="391" y="186" width="18" height="4" rx="2"/>
        <path d="M394 168 Q400 152 406 168 Z"/>
      </g>

      <!-- 4. Glossy Dark Navy Table Reflection Plane -->
      <rect x="8" y="268" width="496" height="236" fill="#051933" fill-opacity="0.72"/>

      <!-- 5. Luminous Golden Sunrise Glow on Horizon -->
      <ellipse cx="256" cy="268" rx="195" ry="110" fill="url(#horizonGlow)"/>
      <ellipse cx="256" cy="270" rx="170" ry="6" fill="#FFF7D6" fill-opacity="0.88"/>
      <ellipse cx="256" cy="270" rx="58" ry="32" fill="#FFFBEB" fill-opacity="0.96"/>

      <!-- 6. Central Ornate Filigree Crescent Moon -->
      <g>
        <path d="M 272 86 C 194 92, 152 168, 184 236 C 214 298, 312 292, 336 220 C 344 196, 342 168, 332 146 C 334 178, 316 218, 282 232 C 236 250, 196 210, 208 156 C 216 118, 244 94, 272 86 Z"
              fill="url(#goldGrad)" stroke="url(#goldBright)" stroke-width="3.5"/>
        <path d="M 244 102 C 210 128, 192 172, 206 216 C 222 258, 276 266, 314 236"
              fill="none" stroke="#784706" stroke-width="2.5" stroke-dasharray="8 6"/>
        <path d="M 224 124 Q 204 150 220 174 Q 192 192 214 220 Q 238 248 268 242 Q 296 246 318 216"
              fill="none" stroke="url(#goldBright)" stroke-width="2.5" stroke-linecap="round"/>
        <polygon points="195,180 203,172 211,180 203,188" fill="url(#turquoiseGrad)" stroke="url(#goldBright)" stroke-width="1.5"/>
        <polygon points="300,224 307,218 314,224 307,230" fill="url(#turquoiseGrad)" stroke="url(#goldBright)" stroke-width="1.5"/>
      </g>

      <!-- 7. Five-Pointed Golden Star -->
      <polygon points="282,102 288,118 305,118 291,128 296,144 282,134 268,144 273,128 259,118 276,118"
               fill="url(#goldBright)" stroke="#B47615" stroke-width="1.5"/>

      <!-- 8. Tasbih / Prayer Beads Figure-8 Loop in Foreground -->
      <g>
        <use href="#pearlBead" x="218" y="294"/>
        <use href="#pearlBead" x="198" y="301"/>
        <use href="#pearlBead" x="178" y="311"/>
        <use href="#pearlBead" x="159" y="324"/>
        <use href="#pearlBead" x="145" y="340"/>
        <use href="#pearlBead" x="142" y="360"/>
        <use href="#pearlBead" x="154" y="376"/>
        <use href="#pearlBead" x="174" y="384"/>
        <use href="#pearlBead" x="196" y="386"/>
        <use href="#pearlBead" x="218" y="382"/>

        <use href="#pearlBead" x="235" y="302"/>
        <use href="#pearlBead" x="218" y="316"/>
        <use href="#pearlBead" x="206" y="332"/>
        <use href="#pearlBead" x="216" y="348"/>
        <use href="#pearlBead" x="238" y="345"/>
        <use href="#pearlBead" x="258" y="336"/>
        <use href="#pearlBead" x="278" y="325"/>
        <use href="#pearlBead" x="298" y="314"/>
        <use href="#pearlBead" x="318" y="305"/>
        <use href="#pearlBead" x="340" y="300"/>
        <use href="#pearlBead" x="362" y="303"/>
        <use href="#pearlBead" x="380" y="315"/>
        <use href="#pearlBead" x="386" y="334"/>
        <use href="#pearlBead" x="372" y="350"/>
        <use href="#pearlBead" x="350" y="354"/>
        <use href="#pearlBead" x="328" y="346"/>

        <use href="#pearlBead" x="240" y="374"/>
        <use href="#pearlBead" x="262" y="365"/>
        <use href="#pearlBead" x="284" y="356"/>
        <use href="#pearlBead" x="306" y="368"/>
        <use href="#pearlBead" x="328" y="380"/>
        <use href="#pearlBead" x="352" y="384"/>
        <use href="#pearlBead" x="374" y="376"/>

        <!-- Golden Imame & Tassel pointing bottom-left -->
        <g transform="translate(286, 382) rotate(148)">
          <circle cx="0" cy="0" r="7" fill="url(#goldBead)"/>
          <rect x="6" y="-5" width="24" height="10" rx="4" fill="url(#goldGrad)" stroke="#784706" stroke-width="1"/>
          <circle cx="33" cy="0" r="6.5" fill="url(#goldBead)"/>
          <path d="M 38 -4 L 84 -16 C 88 -6, 88 6, 84 16 L 38 4 Z" fill="url(#goldGrad)" stroke="#925B09" stroke-width="1"/>
          <line x1="42" y1="-2" x2="83" y2="-11" stroke="#FFF6C7" stroke-width="1.2"/>
          <line x1="42" y1="0" x2="85" y2="0" stroke="#FFF6C7" stroke-width="1.2"/>
          <line x1="42" y1="2" x2="83" y2="11" stroke="#784706" stroke-width="1.2"/>
        </g>
      </g>

      <!-- 9. Four Symmetrical Ornate Gold & Turquoise Corner Frames -->
      <use href="#cornerOrnament"/>
      <use href="#cornerOrnament" transform="translate(512, 0) scale(-1, 1)"/>
      <use href="#cornerOrnament" transform="translate(0, 512) scale(1, -1)"/>
      <use href="#cornerOrnament" transform="translate(512, 512) scale(-1, -1)"/>
    </g>

    <!-- 10. Outer Double Metallic Gold & Royal Blue Border Frame -->
    <rect x="12" y="12" width="488" height="488" rx="108" fill="none" stroke="#0B3B69" stroke-width="8"/>
    <rect x="22" y="22" width="468" height="468" rx="98" fill="none" stroke="url(#goldGrad)" stroke-width="6"/>
  </g>
</svg>
`;

/**
 * High-precision procedural rasterizer that renders the Islamic crescent + mosque + prayer beads icon
 * into a crisp RGBA pixel buffer and encodes a valid PNG file at any resolution (180, 192, 512).
 */
function renderIconPng(size, isMaskable = false) {
  const buf = Buffer.alloc(size * size * 4);

  const clamp = (v, min = 0, max = 1) => (v < min ? min : v > max ? max : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Continuous tightly-spaced prayer beads along the figure-8 loop
  const beads = [
    // Left loop
    [-0.14, 0.14], [-0.21, 0.16], [-0.28, 0.19], [-0.35, 0.23],
    [-0.41, 0.28], [-0.45, 0.34], [-0.46, 0.41], [-0.42, 0.47],
    [-0.35, 0.50], [-0.27, 0.51], [-0.19, 0.50], [-0.11, 0.47],
    // Inner figure-8 crossover
    [-0.08, 0.17], [-0.14, 0.22], [-0.19, 0.28], [-0.19, 0.35],
    [-0.12, 0.37], [-0.04, 0.35], [0.04, 0.31], [0.11, 0.27],
    [0.18, 0.23], [0.25, 0.19], [0.33, 0.17], [0.41, 0.18],
    [0.47, 0.22], [0.50, 0.28], [0.49, 0.35], [0.43, 0.40],
    [0.35, 0.41], [0.27, 0.38], [0.19, 0.35], [0.11, 0.39],
    [0.03, 0.43], [0.15, 0.45], [0.23, 0.49], [0.31, 0.51],
    [0.39, 0.50], [0.45, 0.46],
  ];

  // Precompute 10 vertices of a classic 5-pointed star centered at (0.10, -0.52)
  const starCx = 0.10, starCy = -0.52, outerR = 0.072, innerR = 0.029;
  const starPoly = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? outerR : innerR;
    starPoly.push([starCx + Math.cos(a) * rad, starCy + Math.sin(a) * rad]);
  }

  function pointInStar(px, py) {
    let inside = false;
    for (let i = 0, j = starPoly.length - 1; i < starPoly.length; j = i++) {
      const xi = starPoly[i][0], yi = starPoly[i][1];
      const xj = starPoly[j][0], yj = starPoly[j][1];
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const scale = isMaskable ? 1.12 : 1.0;
      const nx = ((x + 0.5) / size * 2 - 1) * scale;
      const ny = ((y + 0.5) / size * 2 - 1) * scale;

      const ax = Math.abs(nx);
      const ay = Math.abs(ny);

      // Squircle SDF: corner radius 0.42
      const rad = 0.42;
      const qx = Math.max(ax - (0.96 - rad), 0);
      const qy = Math.max(ay - (0.96 - rad), 0);
      const squircleDist = Math.hypot(qx, qy) - rad;

      if (!isMaskable && squircleDist > 0.015) {
        const idx = (y * size + x) * 4;
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      const edgeAlpha = isMaskable ? 1.0 : 1.0 - smoothstep(-0.005, 0.012, squircleDist);

      // 1. Deep Midnight Royal Blue Background
      const radialDist = Math.hypot(nx, ny + 0.08);
      let r = lerp(24, 5, clamp(radialDist * 0.85));
      let g = lerp(82, 21, clamp(radialDist * 0.85));
      let b = lerp(130, 46, clamp(radialDist * 0.85));

      // Soft night clouds around (-0.35, -0.25) and (0.35, -0.22)
      const cloud1 = Math.exp(-Math.pow(Math.hypot(nx + 0.28, ny + 0.26) * 4.2, 2));
      const cloud2 = Math.exp(-Math.pow(Math.hypot(nx - 0.28, ny + 0.24) * 4.2, 2));
      const cloudMix = clamp((cloud1 + cloud2) * 0.26);
      r = lerp(r, 72, cloudMix);
      g = lerp(g, 128, cloudMix);
      b = lerp(b, 168, cloudMix);

      // 2. Mosque Domes & Minarets Silhouette near horizon (ny between -0.36 and 0.05)
      if (ny < 0.06 && ny > -0.45) {
        const domeCenter = Math.hypot(nx - 0.0, (ny - 0.04) * 1.15) < 0.165;
        const domeLeft = Math.hypot(nx + 0.40, (ny - 0.05) * 1.15) < 0.098;
        const domeRight = Math.hypot(nx - 0.40, (ny - 0.05) * 1.15) < 0.098;
        const minLeft = Math.abs(nx + 0.55) < 0.022 && ny > -0.34;
        const minRight = Math.abs(nx - 0.55) < 0.022 && ny > -0.34;
        const minInnerL = Math.abs(nx + 0.21) < 0.016 && ny > -0.24;
        const minInnerR = Math.abs(nx - 0.22) < 0.018 && ny > -0.30;
        if (domeCenter || domeLeft || domeRight || minLeft || minRight || minInnerL || minInnerR || ny > -0.01) {
          r = lerp(r, 6, 0.72);
          g = lerp(g, 24, 0.72);
          b = lerp(b, 48, 0.72);
        }
      }

      // 3. Glossy dark table below horizon (ny > 0.05)
      if (ny > 0.05) {
        r = lerp(r, 4, 0.48);
        g = lerp(g, 22, 0.48);
        b = lerp(b, 46, 0.48);
      }

      // 4. Warm Golden Horizon Glow around (0, 0.05)
      const glowDist = Math.hypot(nx * 0.70, (ny - 0.045) * 1.4);
      const glowFactor = Math.exp(-glowDist * glowDist * 8.5);
      const horizonLine = Math.exp(-Math.pow((ny - 0.05) * 42, 2)) * Math.exp(-nx * nx * 2.2);
      const totalGlow = clamp(glowFactor * 0.94 + horizonLine * 0.82);
      r = lerp(r, 255, totalGlow);
      g = lerp(g, 228, totalGlow * 0.94);
      b = lerp(b, 132, totalGlow * 0.68);

      // 5. Golden Filigree Crescent Moon
      const c1 = Math.hypot(nx - 0.01, ny + 0.29);
      const c2 = Math.hypot(nx - 0.115, ny + 0.345);
      if (c1 < 0.375 && c2 > 0.295) {
        const crescentEdge = Math.min(0.375 - c1, c2 - 0.295);
        const crescentBlend = smoothstep(0.0, 0.012, crescentEdge);
        const isRim = crescentEdge < 0.018;
        // Delicate connected filigree arabesque lattice lines inside crescent
        const latticeLine =
          Math.abs(Math.sin((nx + ny) * 38)) < 0.24 ||
          Math.abs(Math.cos((nx - ny) * 38)) < 0.24;
        const isTurquoiseInlay =
          Math.hypot(nx + 0.22, ny + 0.28) < 0.025 ||
          Math.hypot(nx - 0.18, ny + 0.11) < 0.022;

        if (isTurquoiseInlay && !isRim) {
          r = lerp(r, 42, crescentBlend);
          g = lerp(g, 196, crescentBlend);
          b = lerp(b, 198, crescentBlend);
        } else if (isRim) {
          r = lerp(r, 255, crescentBlend);
          g = lerp(g, 236, crescentBlend);
          b = lerp(b, 156, crescentBlend);
        } else {
          const shade = latticeLine ? 1.06 : 0.82;
          r = lerp(r, clamp(244 * shade, 0, 255), crescentBlend);
          g = lerp(g, clamp(194 * shade, 0, 255), crescentBlend);
          b = lerp(b, clamp(78 * shade, 0, 255), crescentBlend);
        }
      }

      // 6. Crisp Five-Pointed Golden Star at (0.10, -0.52)
      if (Math.hypot(nx - starCx, ny - starCy) < outerR + 0.01 && pointInStar(nx, ny)) {
        r = 255;
        g = 232;
        b = 128;
      }

      // 7. Dark Pearl Tasbih Beads Loop in Foreground
      for (let i = 0; i < beads.length; i++) {
        const bx = beads[i][0];
        const by = beads[i][1];
        const bd = Math.hypot(nx - bx, ny - by);
        const beadR = 0.041;
        if (bd < beadR + 0.008) {
          const sd = Math.hypot(nx - bx, ny - (by + 0.012));
          if (bd >= beadR && sd < beadR) {
            r *= 0.65; g *= 0.65; b *= 0.65;
          }
        }
        if (bd < beadR) {
          const bBlend = smoothstep(beadR, beadR - 0.008, bd);
          const spec = Math.hypot(nx - (bx - 0.014), ny - (by - 0.014));
          const rimFactor = smoothstep(beadR - 0.014, beadR, bd);
          const warmRefl = clamp((nx - bx + ny - by) * 10, 0, 1) * 0.35;
          let br = lerp(16, 145, warmRefl);
          let bg = lerp(28, 115, warmRefl);
          let bb = lerp(46, 55, warmRefl);

          br = lerp(br, 82, rimFactor * 0.6);
          bg = lerp(bg, 108, rimFactor * 0.6);
          bb = lerp(bb, 138, rimFactor * 0.6);

          if (spec < 0.014) {
            const sp = 1.0 - smoothstep(0.004, 0.014, spec);
            br = lerp(br, 250, sp);
            bg = lerp(bg, 248, sp);
            bb = lerp(bb, 240, sp);
          }
          r = lerp(r, br, bBlend);
          g = lerp(g, bg, bBlend);
          b = lerp(b, bb, bBlend);
        }
      }

      // 8. Golden Tassel & Imame pointing bottom-left from (0.13, 0.48) to (-0.11, 0.64)
      const tx0 = 0.13, ty0 = 0.48;
      const tx1 = -0.11, ty1 = 0.64;
      const tdx = tx1 - tx0, tdy = ty1 - ty0;
      const tLen2 = tdx * tdx + tdy * tdy;
      const tProj = clamp(((nx - tx0) * tdx + (ny - ty0) * tdy) / tLen2, 0, 1);
      const tPerp = Math.hypot(nx - (tx0 + tProj * tdx), ny - (ty0 + tProj * tdy));
      const tasselWidth = tProj < 0.32 ? 0.019 : lerp(0.016, 0.048, (tProj - 0.32) / 0.68);
      if (tProj > 0 && tProj < 1 && tPerp < tasselWidth) {
        const tb = smoothstep(tasselWidth, tasselWidth - 0.008, tPerp);
        const threadStripe = Math.sin(tPerp * 210) * 22;
        r = lerp(r, clamp(242 + threadStripe, 0, 255), tb);
        g = lerp(g, clamp(190 + threadStripe, 0, 255), tb);
        b = lerp(b, clamp(72 + threadStripe, 0, 255), tb);
      }

      // 9. Ornate Gold & Turquoise Corner Arabesques (strictly inside squircleDist < -0.04)
      if (squircleDist < -0.035) {
        const cornerDist = Math.hypot(ax - 0.84, ay - 0.84);
        const inCornerZone = ax > 0.38 && ay > 0.38 && cornerDist < 0.40;
        if (inCornerZone) {
          const isCornerArc = Math.abs(cornerDist - 0.38) < 0.020 || Math.abs(cornerDist - 0.24) < 0.015;
          const scrollCurve =
            Math.abs(Math.sin((ax - ay) * 28)) < 0.18 ||
            Math.abs(Math.cos((ax + ay) * 24)) < 0.16;
          const isScrollFiligree = cornerDist < 0.36 && scrollCurve;
          const isCornerGem =
            Math.hypot(ax - 0.72, ay - 0.72) < 0.036 ||
            Math.hypot(ax - 0.80, ay - 0.56) < 0.025 ||
            Math.hypot(ax - 0.56, ay - 0.80) < 0.025;

          if (isCornerGem) {
            r = 38; g = 192; b = 196;
          } else if (isCornerArc || isScrollFiligree) {
            r = 245; g = 198; b = 82;
          }
        }
      }

      // 10. Outer Double Gold & Royal Blue Squircle Border
      if (squircleDist > -0.052 && squircleDist < -0.024) {
        const rimBlend = 1.0 - Math.abs(squircleDist + 0.038) / 0.014;
        r = lerp(r, 246, clamp(rimBlend));
        g = lerp(g, 198, clamp(rimBlend));
        b = lerp(b, 82, clamp(rimBlend));
      } else if (squircleDist >= -0.024) {
        r = lerp(r, 11, 0.7);
        g = lerp(g, 58, 0.7);
        b = lerp(b, 104, 0.7);
      }

      const idx = (y * size + x) * 4;
      buf[idx] = Math.round(clamp(r, 0, 255));
      buf[idx + 1] = Math.round(clamp(g, 0, 255));
      buf[idx + 2] = Math.round(clamp(b, 0, 255));
      buf[idx + 3] = Math.round(clamp(edgeAlpha * 255, 0, 255));
    }
  }

  return encodeRgbaToPng(buf, size, size);
}

function encodeRgbaToPng(rgba, width, height) {
  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawScanlines[rowStart] = 0;
    rgba.copy(rawScanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idatData = zlib.deflateSync(rawScanlines, { level: 9 });

  function makeChunk(typeStr, dataBuf) {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(dataBuf.length, 0);
    const typeBuf = Buffer.from(typeStr, 'ascii');
    const crcInput = Buffer.concat([typeBuf, dataBuf]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(zlib.crc32(crcInput) >>> 0, 0);
    return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const publicDir = path.resolve(process.cwd(), 'public');
fs.writeFileSync(path.join(publicDir, 'icon.svg'), SVG_ICON_CONTENT, 'utf8');
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderIconPng(180, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), renderIconPng(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), renderIconPng(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), renderIconPng(512, true));

console.log('Generated public/icon.svg, apple-touch-icon.png, pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png');
