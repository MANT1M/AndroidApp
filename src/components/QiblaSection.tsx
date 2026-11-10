import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Info,
  Layers,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  Sliders,
  Smartphone,
} from 'lucide-react';
import {
  BASHKORTOSTAN_AND_RUSSIA_LOCATIONS,
  calculateDistanceToKaabaKm,
  calculateGreatCircleWaypoints,
  calculateQiblaAzimuth,
  DEFAULT_UFA_LOCATION,
  estimateMagneticDeclination,
  getCardinalDirectionInfo,
  KAABA_COORDS,
  projectGeodesicPoint,
  QiblaLocationItem,
} from '../data/qiblaData';

const STORAGE_KEY_QIBLA_LOCATION = 'interactive_reader_qibla_location_v1';

interface StoredQiblaLocation {
  id: string;
  nameRu: string;
  lat: number;
  lon: number;
  addressLabel?: string;
}

interface NominatimSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

function loadSavedLocation(): StoredQiblaLocation {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_QIBLA_LOCATION);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.lat === 'number' &&
        typeof parsed.lon === 'number' &&
        !Number.isNaN(parsed.lat) &&
        !Number.isNaN(parsed.lon)
      ) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return {
    id: DEFAULT_UFA_LOCATION.id,
    nameRu: DEFAULT_UFA_LOCATION.nameRu,
    lat: DEFAULT_UFA_LOCATION.lat,
    lon: DEFAULT_UFA_LOCATION.lon,
  };
}

type QiblaMapLayerId = 'yandex_map' | 'yandex_hybrid';

const WGS84_ECCENTRICITY = 0.08181919084262149;

/**
 * Yandex Maps projection helpers (EPSG:3395 — WGS-84 Ellipsoidal Mercator)
 */
function lonToWorldX(lon: number, zoom: number): number {
  const scale = 256 * Math.pow(2, zoom);
  return ((lon + 180) / 360) * scale;
}

function latToWorldY(lat: number, zoom: number): number {
  const scale = 256 * Math.pow(2, zoom);
  const clampedLat = Math.max(-85.084059, Math.min(85.084059, lat));
  const phi = (clampedLat * Math.PI) / 180;
  const esin = WGS84_ECCENTRICITY * Math.sin(phi);
  const psi = Math.log(
    Math.tan(Math.PI / 4 + phi / 2) *
      Math.pow((1 - esin) / (1 + esin), WGS84_ECCENTRICITY / 2)
  );
  return (0.5 - psi / (2 * Math.PI)) * scale;
}

function worldXToLon(worldX: number, zoom: number): number {
  const scale = 256 * Math.pow(2, zoom);
  return (worldX / scale) * 360 - 180;
}

function worldYToLat(worldY: number, zoom: number): number {
  const scale = 256 * Math.pow(2, zoom);
  const psi = Math.PI - (2 * Math.PI * worldY) / scale;
  let phi = 2 * Math.atan(Math.exp(psi)) - Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const esin = WGS84_ECCENTRICITY * Math.sin(phi);
    phi =
      2 *
        Math.atan(
          Math.exp(psi) *
            Math.pow((1 + esin) / (1 - esin), WGS84_ECCENTRICITY / 2)
        ) -
      Math.PI / 2;
  }
  return (phi * 180) / Math.PI;
}

function getScreenOrientationAngle(): number {
  if (typeof window === 'undefined') return 0;
  if (
    window.screen &&
    window.screen.orientation &&
    typeof window.screen.orientation.angle === 'number'
  ) {
    return window.screen.orientation.angle;
  }
  const legacyOrientation = (window as unknown as { orientation?: number }).orientation;
  if (typeof legacyOrientation === 'number') {
    return legacyOrientation;
  }
  return 0;
}

export default function QiblaSection() {
  const [activeTab, setActiveTab] = useState<'compass' | 'map'>('compass');
  const [location, setLocation] = useState<StoredQiblaLocation>(loadSavedLocation);

  // Address Search State (Nominatim)
  const [addressQuery, setAddressQuery] = useState<string>('');
  const [isSearchingAddress, setIsSearchingAddress] = useState<boolean>(false);
  const [addressResults, setAddressResults] = useState<NominatimSearchResult[]>([]);
  const [addressError, setAddressError] = useState<string | null>(null);

  // GPS State
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [gpsStatusMessage, setGpsStatusMessage] = useState<string | null>(null);

  // Compass Sensor State
  const [sensorSupported, setSensorSupported] = useState<boolean>(false);
  const [sensorSource, setSensorSource] = useState<
    'absolute' | 'webkit' | 'relative' | 'manual'
  >('manual');
  const [needsIosPermission, setNeedsIosPermission] = useState<boolean>(false);
  const [isManualCompassMode, setIsManualCompassMode] = useState<boolean>(false);
  const [manualHeadingDeg, setManualHeadingDeg] = useState<number>(0);
  const [smoothedSensorHeading, setSmoothedSensorHeading] = useState<number>(0);
  const [applyDeclinationOffset, setApplyDeclinationOffset] = useState<boolean>(false);
  const [tiltBeta, setTiltBeta] = useState<number>(0);
  const [tiltGamma, setTiltGamma] = useState<number>(0);
  const [compassAccuracyDeg, setCompassAccuracyDeg] = useState<number | null>(null);
  const [showCalibrationHelp, setShowCalibrationHelp] = useState<boolean>(false);

  // Trigonometric low-pass filter state (sin/cos accumulator to prevent 0°/360° wrap jump)
  const filterSinRef = useRef<number>(0);
  const filterCosRef = useRef<number>(1);
  const hasInitialReadingRef = useRef<boolean>(false);
  const lastVibrateTimeRef = useRef<number>(0);

  // Interactive Map State (Default: Яндекс Схема с проекцией EPSG:3395)
  const [mapLayer, setMapLayer] = useState<QiblaMapLayerId>('yandex_map');
  const [mapZoom, setMapZoom] = useState<number>(17);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number }>(() => ({
    lat: location.lat,
    lon: location.lon,
  }));
  const [tileLoadErrorCount, setTileLoadErrorCount] = useState<number>(0);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 720,
    height: 460,
  });
  const dragRef = useRef<{
    isDragging: boolean;
    moved: boolean;
    wasMultiTouch: boolean;
    startX: number;
    startY: number;
    startCenterWorldX: number;
    startCenterWorldY: number;
  }>({
    isDragging: false,
    moved: false,
    wasMultiTouch: false,
    startX: 0,
    startY: 0,
    startCenterWorldX: 0,
    startCenterWorldY: 0,
  });

  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    isPinching: boolean;
    lastStepDist: number;
    lastMidX: number;
    lastMidY: number;
  }>({
    isPinching: false,
    lastStepDist: 0,
    lastMidX: 0,
    lastMidY: 0,
  });
  const mapStateRef = useRef<{ zoom: number; center: { lat: number; lon: number } }>({
    zoom: mapZoom,
    center: mapCenter,
  });
  useEffect(() => {
    mapStateRef.current = { zoom: mapZoom, center: mapCenter };
  }, [mapZoom, mapCenter]);

  // Save location changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_QIBLA_LOCATION, JSON.stringify(location));
    } catch {
      // ignore
    }
  }, [location]);

  // Core Geodesic Computations
  const qiblaAzimuth = useMemo(
    () => calculateQiblaAzimuth(location.lat, location.lon),
    [location.lat, location.lon]
  );

  const distanceKm = useMemo(
    () => Math.round(calculateDistanceToKaabaKm(location.lat, location.lon)),
    [location.lat, location.lon]
  );

  const magneticDeclination = useMemo(
    () => estimateMagneticDeclination(location.lat, location.lon),
    [location.lat, location.lon]
  );

  const cardinalInfo = useMemo(
    () => getCardinalDirectionInfo(qiblaAzimuth),
    [qiblaAzimuth]
  );

  const greatCircleWaypoints = useMemo(
    () => calculateGreatCircleWaypoints(location.lat, location.lon, 50),
    [location.lat, location.lon]
  );

  // Detect iOS permission requirement
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const doe = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (doe && typeof doe.requestPermission === 'function') {
      setNeedsIosPermission(true);
    }
  }, []);

  // Attach DeviceOrientation listeners with screen.orientation.angle compensation & atan2(sin, cos) filter
  useEffect(() => {
    if (typeof window === 'undefined' || isManualCompassMode) return;

    let hasAbsoluteEvent = false;

    const processHeading = (
      rawHeadingDeg: number,
      beta: number | null,
      gamma: number | null,
      source: 'absolute' | 'webkit' | 'relative',
      accuracy: number | null
    ) => {
      const screenAngle = getScreenOrientationAngle();
      const compensated = (rawHeadingDeg + screenAngle + 360) % 360;
      const rad = (compensated * Math.PI) / 180;

      if (!hasInitialReadingRef.current) {
        filterSinRef.current = Math.sin(rad);
        filterCosRef.current = Math.cos(rad);
        hasInitialReadingRef.current = true;
      } else {
        const alpha = 0.22; // smooth low-pass factor
        filterSinRef.current =
          filterSinRef.current * (1 - alpha) + Math.sin(rad) * alpha;
        filterCosRef.current =
          filterCosRef.current * (1 - alpha) + Math.cos(rad) * alpha;
      }

      const filteredDeg =
        ((Math.atan2(filterSinRef.current, filterCosRef.current) * 180) /
          Math.PI +
          360) %
        360;

      setSensorSupported(true);
      setSensorSource(source);
      setSmoothedSensorHeading(filteredDeg);
      if (beta !== null && !Number.isNaN(beta)) setTiltBeta(beta);
      if (gamma !== null && !Number.isNaN(gamma)) setTiltGamma(gamma);
      if (accuracy !== null && !Number.isNaN(accuracy)) {
        setCompassAccuracyDeg(accuracy);
      }
    };

    const onAbsoluteOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || Number.isNaN(e.alpha)) return;
      hasAbsoluteEvent = true;
      const heading = (360 - e.alpha) % 360;
      processHeading(heading, e.beta, e.gamma, 'absolute', null);
    };

    const onStandardOrientation = (e: DeviceOrientationEvent) => {
      if (hasAbsoluteEvent) return;
      const webkitEvt = e as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
        webkitCompassAccuracy?: number;
      };
      if (
        typeof webkitEvt.webkitCompassHeading === 'number' &&
        !Number.isNaN(webkitEvt.webkitCompassHeading)
      ) {
        processHeading(
          webkitEvt.webkitCompassHeading,
          e.beta,
          e.gamma,
          'webkit',
          typeof webkitEvt.webkitCompassAccuracy === 'number'
            ? webkitEvt.webkitCompassAccuracy
            : null
        );
        return;
      }
      if (e.alpha !== null && !Number.isNaN(e.alpha)) {
        const heading = (360 - e.alpha) % 360;
        processHeading(
          heading,
          e.beta,
          e.gamma,
          e.absolute ? 'absolute' : 'relative',
          null
        );
      }
    };

    const win = window as Window;
    win.addEventListener(
      'deviceorientationabsolute',
      onAbsoluteOrientation as EventListener,
      true
    );
    win.addEventListener(
      'deviceorientation',
      onStandardOrientation as EventListener,
      true
    );

    return () => {
      win.removeEventListener(
        'deviceorientationabsolute',
        onAbsoluteOrientation as EventListener,
        true
      );
      win.removeEventListener(
        'deviceorientation',
        onStandardOrientation as EventListener,
        true
      );
    };
  }, [isManualCompassMode]);

  const handleRequestIosSensorPermission = async () => {
    try {
      const doe = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (doe && typeof doe.requestPermission === 'function') {
        const res = await doe.requestPermission();
        if (res === 'granted') {
          setNeedsIosPermission(false);
          setIsManualCompassMode(false);
        }
      }
    } catch {
      // fallback to manual
    }
  };

  // Effective Device Heading (True North)
  const currentDeviceHeading = useMemo(() => {
    if (!sensorSupported || isManualCompassMode) {
      return manualHeadingDeg;
    }
    const declOffset = applyDeclinationOffset ? magneticDeclination : 0;
    return (smoothedSensorHeading + declOffset + 360) % 360;
  }, [
    sensorSupported,
    isManualCompassMode,
    manualHeadingDeg,
    smoothedSensorHeading,
    applyDeclinationOffset,
    magneticDeclination,
  ]);

  // Shortest signed angular error in [-180, 180] between device heading and Qibla azimuth
  const angularDeltaToQibla = useMemo(() => {
    return ((qiblaAzimuth - currentDeviceHeading + 540) % 360) - 180;
  }, [qiblaAzimuth, currentDeviceHeading]);

  const isAlignedWithQibla = Math.abs(angularDeltaToQibla) <= 3.0;
  const totalTiltDeg = Math.hypot(tiltBeta, tiltGamma);
  const isTiltedTooSteep =
    sensorSupported && !isManualCompassMode && totalTiltDeg > 35;

  // Trigger subtle haptic vibration when aligned within ±3°
  useEffect(() => {
    if (isAlignedWithQibla && typeof navigator !== 'undefined' && navigator.vibrate) {
      const nowMs = Date.now();
      if (nowMs - lastVibrateTimeRef.current > 2500) {
        lastVibrateTimeRef.current = nowMs;
        try {
          navigator.vibrate(40);
        } catch {
          // ignore
        }
      }
    }
  }, [isAlignedWithQibla]);

  // Select Preset City
  const handleSelectCityPreset = (cityId: string) => {
    const found = BASHKORTOSTAN_AND_RUSSIA_LOCATIONS.find((c) => c.id === cityId);
    if (!found) return;
    const nextLoc: StoredQiblaLocation = {
      id: found.id,
      nameRu: found.nameRu,
      lat: found.lat,
      lon: found.lon,
    };
    setLocation(nextLoc);
    setMapCenter({ lat: found.lat, lon: found.lon });
    setGpsStatusMessage(null);
  };

  // GPS Location Handler
  const handleDetectGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatusMessage('Геолокация не поддерживается на этом устройстве. Выберите город или адрес.');
      return;
    }
    setIsLocatingGps(true);
    setGpsStatusMessage('Определение точных координат по GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        const lat = Math.round(pos.coords.latitude * 100000) / 100000;
        const lon = Math.round(pos.coords.longitude * 100000) / 100000;
        setLocation({
          id: 'custom_gps',
          nameRu: 'Моё местоположение (GPS)',
          lat,
          lon,
          addressLabel: `${lat.toFixed(5)}°, ${lon.toFixed(5)}° (±${Math.round(pos.coords.accuracy || 10)} м)`,
        });
        setMapCenter({ lat, lon });
        setMapZoom(18);
        setGpsStatusMessage(
          `Координаты GPS получены (точность ±${Math.round(pos.coords.accuracy || 10)} м)`
        );
      },
      (err) => {
        setIsLocatingGps(false);
        if (err.code === 1) {
          setGpsStatusMessage(
            'Доступ к геолокации отклонён. Разрешите GPS в настройках или найдите свой дом по адресу ниже.'
          );
        } else {
          setGpsStatusMessage(
            'Не удалось поймать сигнал спутников внутри помещения. Найдите свой дом по улице и номеру ниже или выберите город.'
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  // Address Search via OpenStreetMap Nominatim
  const handleSearchAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = addressQuery.trim();
    if (!q) return;
    setIsSearchingAddress(true);
    setAddressError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ru&q=${encodeURIComponent(
        q
      )}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('Network error');
      const data = (await res.json()) as NominatimSearchResult[];
      setAddressResults(data);
      if (data.length === 0) {
        setAddressError('Адрес не найден. Уточните город, улицу и номер дома (например: Уфа, Ленина 20).');
      } else {
        // Automatically select the first match and zoom map to house level
        const first = data[0];
        const lat = parseFloat(first.lat);
        const lon = parseFloat(first.lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
          const shortTitle = first.display_name.split(',').slice(0, 3).join(', ');
          setLocation({
            id: 'custom_address',
            nameRu: shortTitle,
            lat,
            lon,
            addressLabel: first.display_name,
          });
          setMapCenter({ lat, lon });
          setMapZoom(18);
        }
      }
    } catch {
      setAddressError(
        'Поиск по адресу требует подключения к интернету. В офлайн-режиме выберите ваш город или райцентр из списка.'
      );
    } finally {
      setIsSearchingAddress(false);
    }
  };

  // Observe map viewport size for accurate Web Mercator tile & SVG rendering
  useEffect(() => {
    if (activeTab !== 'map') return;
    const el = mapViewportRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) {
        setViewportSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [activeTab]);

  // Project any (lat, lon) to pixel (x, y) inside the map viewport (EPSG:3395 Yandex projection)
  const latLonToScreenPx = useCallback(
    (lat: number, lon: number) => {
      const centerWorldX = lonToWorldX(mapCenter.lon, mapZoom);
      const centerWorldY = latToWorldY(mapCenter.lat, mapZoom);
      const ptWorldX = lonToWorldX(lon, mapZoom);
      const ptWorldY = latToWorldY(lat, mapZoom);
      return {
        x: viewportSize.width / 2 + (ptWorldX - centerWorldX),
        y: viewportSize.height / 2 + (ptWorldY - centerWorldY),
      };
    },
    [mapCenter.lat, mapCenter.lon, mapZoom, viewportSize.width, viewportSize.height]
  );

  // Compute visible Yandex Maps tiles (EPSG:3395) for current mapCenter, mapZoom & mapLayer
  const visibleMapTiles = useMemo(() => {
    const maxTileIdx = Math.pow(2, mapZoom);
    const centerWorldX = lonToWorldX(mapCenter.lon, mapZoom);
    const centerWorldY = latToWorldY(mapCenter.lat, mapZoom);
    const topLeftWorldX = centerWorldX - viewportSize.width / 2;
    const topLeftWorldY = centerWorldY - viewportSize.height / 2;

    const minTileX = Math.floor(topLeftWorldX / 256);
    const maxTileX = Math.floor((topLeftWorldX + viewportSize.width) / 256);
    const minTileY = Math.floor(topLeftWorldY / 256);
    const maxTileY = Math.floor((topLeftWorldY + viewportSize.height) / 256);

    const tiles: Array<{
      key: string;
      url: string;
      hybridOverlayUrl?: string;
      left: number;
      top: number;
    }> = [];

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      if (ty < 0 || ty >= maxTileIdx) continue;
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        const wrappedTx = ((tx % maxTileIdx) + maxTileIdx) % maxTileIdx;
        let url: string;
        let hybridOverlayUrl: string | undefined;

        if (mapLayer === 'yandex_hybrid') {
          url = `https://core-sat.maps.yandex.net/tiles?l=sat&x=${wrappedTx}&y=${ty}&z=${mapZoom}&scale=1&lang=ru_RU`;
          hybridOverlayUrl = `https://core-renderer-tiles.maps.yandex.net/tiles?l=skl&x=${wrappedTx}&y=${ty}&z=${mapZoom}&scale=1&lang=ru_RU`;
        } else {
          url = `https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x=${wrappedTx}&y=${ty}&z=${mapZoom}&scale=1&lang=ru_RU`;
        }

        tiles.push({
          key: `${mapLayer}-${mapZoom}-${tx}-${ty}`,
          url,
          hybridOverlayUrl,
          left: Math.round(tx * 256 - topLeftWorldX),
          top: Math.round(ty * 256 - topLeftWorldY),
        });
      }
    }
    return tiles;
  }, [
    mapCenter.lat,
    mapCenter.lon,
    mapZoom,
    mapLayer,
    viewportSize.width,
    viewportSize.height,
  ]);

  // Helper to zoom/pan around a specific viewport screen point (used by 2-finger pinch & mouse wheel)
  const applyPinchOrZoomStep = useCallback(
    (
      nextZoomRaw: number,
      fromScreenX: number,
      fromScreenY: number,
      toScreenX: number,
      toScreenY: number
    ) => {
      const curZoom = mapStateRef.current.zoom;
      const curCenter = mapStateRef.current.center;
      const nextZoom = Math.max(3, Math.min(19, nextZoomRaw));

      const centerWorldX = lonToWorldX(curCenter.lon, curZoom);
      const centerWorldY = latToWorldY(curCenter.lat, curZoom);
      const anchorWorldX = centerWorldX + (fromScreenX - viewportSize.width / 2);
      const anchorWorldY = centerWorldY + (fromScreenY - viewportSize.height / 2);

      const anchorLat = Math.max(-85, Math.min(85, worldYToLat(anchorWorldY, curZoom)));
      const anchorLon = (((worldXToLon(anchorWorldX, curZoom) + 540) % 360) - 180);

      const nextAnchorWorldX = lonToWorldX(anchorLon, nextZoom);
      const nextAnchorWorldY = latToWorldY(anchorLat, nextZoom);
      const nextCenterWorldX = nextAnchorWorldX - (toScreenX - viewportSize.width / 2);
      const nextCenterWorldY = nextAnchorWorldY - (toScreenY - viewportSize.height / 2);

      const nextCenter = {
        lat: Math.max(-85, Math.min(85, worldYToLat(nextCenterWorldY, nextZoom))),
        lon: (((worldXToLon(nextCenterWorldX, nextZoom) + 540) % 360) - 180),
      };

      mapStateRef.current = { zoom: nextZoom, center: nextCenter };
      if (nextZoom !== curZoom) {
        setMapZoom(nextZoom);
      }
      setMapCenter(nextCenter);
    },
    [lonToWorldX, latToWorldY, worldXToLon, worldYToLat, viewportSize.width, viewportSize.height]
  );

  const startTwoFingerPinch = (
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ) => {
    if (!mapViewportRef.current) return;
    const rect = mapViewportRef.current.getBoundingClientRect();
    const dist = Math.max(10, Math.hypot(p2.x - p1.x, p2.y - p1.y));
    const midX = (p1.x + p2.x) / 2 - rect.left;
    const midY = (p1.y + p2.y) / 2 - rect.top;

    dragRef.current.wasMultiTouch = true;
    dragRef.current.moved = true;
    pinchRef.current = {
      isPinching: true,
      lastStepDist: dist,
      lastMidX: midX,
      lastMidY: midY,
    };
  };

  const updateTwoFingerPinch = (
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ) => {
    if (!mapViewportRef.current) return;
    const rect = mapViewportRef.current.getBoundingClientRect();
    const dist = Math.max(10, Math.hypot(p2.x - p1.x, p2.y - p1.y));
    const midX = (p1.x + p2.x) / 2 - rect.left;
    const midY = (p1.y + p2.y) / 2 - rect.top;

    if (!pinchRef.current.isPinching || pinchRef.current.lastStepDist <= 0) {
      startTwoFingerPinch(p1, p2);
      return;
    }

    const curZoom = mapStateRef.current.zoom;
    const logRatio = Math.log2(dist / pinchRef.current.lastStepDist);
    let nextZoom = curZoom;

    // Step zoom level smoothly when fingers spread/pinch by ~19% (log2 ratio >= 0.25)
    if (Math.abs(logRatio) >= 0.25) {
      const steps =
        logRatio > 0 ? Math.floor(logRatio / 0.25) : Math.ceil(logRatio / 0.25);
      nextZoom = Math.max(3, Math.min(19, curZoom + steps));
      pinchRef.current.lastStepDist = dist;
    }

    applyPinchOrZoomStep(
      nextZoom,
      pinchRef.current.lastMidX,
      pinchRef.current.lastMidY,
      midX,
      midY
    );

    pinchRef.current.lastMidX = midX;
    pinchRef.current.lastMidY = midY;
  };

  // Map pointer drag, 2-finger pinch-to-zoom & tap-to-set-house-pin handlers
  const handleMapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      const curZoom = mapStateRef.current.zoom;
      const curCenter = mapStateRef.current.center;
      dragRef.current = {
        isDragging: true,
        moved: false,
        wasMultiTouch: false,
        startX: e.clientX,
        startY: e.clientY,
        startCenterWorldX: lonToWorldX(curCenter.lon, curZoom),
        startCenterWorldY: latToWorldY(curCenter.lat, curZoom),
      };
    } else if (activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      startTwoFingerPinch(pts[0], pts[1]);
    }
  };

  const handleMapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      updateTwoFingerPinch(pts[0], pts[1]);
      return;
    }

    if (!dragRef.current.isDragging || dragRef.current.wasMultiTouch) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 5) {
      dragRef.current.moved = true;
    }
    if (dragRef.current.moved) {
      const curZoom = mapStateRef.current.zoom;
      const nextWorldX = dragRef.current.startCenterWorldX - dx;
      const nextWorldY = dragRef.current.startCenterWorldY - dy;
      const nextCenter = {
        lat: Math.max(-85, Math.min(85, worldYToLat(nextWorldY, curZoom))),
        lon: (((worldXToLon(nextWorldX, curZoom) + 540) % 360) - 180),
      };
      mapStateRef.current.center = nextCenter;
      setMapCenter(nextCenter);
    }
  };

  const handleMapPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    activePointersRef.current.delete(e.pointerId);

    if (activePointersRef.current.size < 2) {
      pinchRef.current.isPinching = false;
    }

    if (activePointersRef.current.size === 1) {
      // Re-anchor remaining finger for smooth continued pan without triggering tap
      const remaining = Array.from(activePointersRef.current.values())[0];
      const curZoom = mapStateRef.current.zoom;
      const curCenter = mapStateRef.current.center;
      dragRef.current = {
        isDragging: true,
        moved: true,
        wasMultiTouch: false,
        startX: remaining.x,
        startY: remaining.y,
        startCenterWorldX: lonToWorldX(curCenter.lon, curZoom),
        startCenterWorldY: latToWorldY(curCenter.lat, curZoom),
      };
      return;
    }

    if (!dragRef.current.isDragging) return;
    const wasMoved = dragRef.current.moved;
    const wasMultiTouch = dragRef.current.wasMultiTouch;
    dragRef.current.isDragging = false;
    dragRef.current.wasMultiTouch = false;

    if (!wasMoved && !wasMultiTouch && mapViewportRef.current) {
      // User clicked/tapped a specific building/window on the map -> move the house pin there!
      const rect = mapViewportRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const curZoom = mapStateRef.current.zoom;
      const curCenter = mapStateRef.current.center;
      const centerWorldX = lonToWorldX(curCenter.lon, curZoom);
      const centerWorldY = latToWorldY(curCenter.lat, curZoom);
      const clickWorldX = centerWorldX + (clickX - viewportSize.width / 2);
      const clickWorldY = centerWorldY + (clickY - viewportSize.height / 2);

      const clickedLat =
        Math.round(worldYToLat(clickWorldY, curZoom) * 1000000) / 1000000;
      const clickedLon =
        Math.round(
          (((worldXToLon(clickWorldX, curZoom) + 540) % 360) - 180) * 1000000
        ) / 1000000;

      setLocation((prev) => ({
        ...prev,
        id: 'custom_pin',
        nameRu:
          prev.id === 'custom_pin'
            ? prev.nameRu
            : `${prev.nameRu} (точка на доме)`,
        lat: clickedLat,
        lon: clickedLon,
      }));
    }
  };

  const handleMapPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchRef.current.isPinching = false;
    }
    if (activePointersRef.current.size === 0) {
      dragRef.current.isDragging = false;
      dragRef.current.wasMultiTouch = false;
    }
  };

  // Fallback native TouchEvent handlers for Android tablets/WebViews where PointerEvents may coalesce multi-touch
  const handleMapTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length >= 2 && activePointersRef.current.size < 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      startTwoFingerPinch(
        { x: t0.clientX, y: t0.clientY },
        { x: t1.clientX, y: t1.clientY }
      );
    }
  };

  const handleMapTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length >= 2 && activePointersRef.current.size < 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      updateTwoFingerPinch(
        { x: t0.clientX, y: t0.clientY },
        { x: t1.clientX, y: t1.clientY }
      );
    }
  };

  const handleMapTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2 && activePointersRef.current.size < 2) {
      pinchRef.current.isPinching = false;
    }
  };

  // Mouse wheel / trackpad pinch zoom handler
  const handleMapWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!mapViewportRef.current) return;
    const rect = mapViewportRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const curZoom = mapStateRef.current.zoom;
    const delta = e.deltaY < 0 ? 1 : -1;
    const nextZoom = Math.max(3, Math.min(19, curZoom + delta));
    if (nextZoom !== curZoom) {
      applyPinchOrZoomStep(nextZoom, cursorX, cursorY, cursorX, cursorY);
    }
  };

  // Compute screen coordinates for the House Pin, Kaaba Pin, and unified Geodesic Great Circle
  const housePinScreen = useMemo(
    () => latLonToScreenPx(location.lat, location.lon),
    [latLonToScreenPx, location.lat, location.lon]
  );

  const kaabaScreen = useMemo(
    () => latLonToScreenPx(KAABA_COORDS.lat, KAABA_COORDS.lon),
    [latLonToScreenPx]
  );

  // Project local point 3 km along true initial Great-Circle azimuth θ for the legend
  const localRayTargetCoords = useMemo(
    () => projectGeodesicPoint(location.lat, location.lon, qiblaAzimuth, 3.0),
    [location.lat, location.lon, qiblaAzimuth]
  );

  // Unified single line: starts with ultra-fine local geodesic steps (0.1km, 0.5km, 2km, 10km)
  // for razor-sharp building/window alignment at zoom 15..19, and continues seamlessly
  // along the Great Circle (orthodrome) right to the Kaaba in Mecca at zoom 3..14.
  const orthodromePolylinePoints = useMemo(() => {
    const nearPoints = [0.1, 0.5, 2.0, 10.0]
      .filter((d) => d < distanceKm * 0.2)
      .map((d) => projectGeodesicPoint(location.lat, location.lon, qiblaAzimuth, d));
    const allPoints = [
      greatCircleWaypoints[0],
      ...nearPoints,
      ...greatCircleWaypoints.slice(1),
    ];
    return allPoints
      .map((pt) => {
        const sc = latLonToScreenPx(pt.lat, pt.lon);
        return `${sc.x.toFixed(1)},${sc.y.toFixed(1)}`;
      })
      .join(' ');
  }, [greatCircleWaypoints, distanceKm, location.lat, location.lon, qiblaAzimuth, latLonToScreenPx]);

  // Bubble level offset in pixels (clamped within ±26px circle)
  const bubbleOffset = useMemo(() => {
    const maxTilt = 45;
    const clampedGamma = Math.max(-maxTilt, Math.min(maxTilt, tiltGamma));
    const clampedBeta = Math.max(-maxTilt, Math.min(maxTilt, tiltBeta));
    return {
      x: (clampedGamma / maxTilt) * 24,
      y: (clampedBeta / maxTilt) * 24,
    };
  }, [tiltBeta, tiltGamma]);

  return (
    <section aria-label="Определение направления Киблы" className="space-y-4">
      {/* Top Emerald Summary & Location Selector Header */}
      <div className="bg-[#06372C] text-[#FEF3C7] rounded-3xl p-4 sm:p-6 shadow-sm border border-[#052e24] space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#EAB308]">
              <Compass className="w-4 h-4 shrink-0" />
              <span>НАПРАВЛЕНИЕ НА КААБУ (МЕККА) · ОРТОДРОМИЯ</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#FEF3C7] font-display tracking-tight">
              Кибла (Кыйбла) — {location.nameRu}
            </h2>
            <p className="text-xs sm:text-sm text-[#A7F3D0]/95">
              Координаты точки: <span className="font-mono-tabular font-semibold text-[#FEF3C7]">{location.lat.toFixed(4)}° с.ш., {location.lon.toFixed(4)}° в.д.</span> · Кааба: <span className="font-mono-tabular">{KAABA_COORDS.lat.toFixed(4)}° с.ш., {KAABA_COORDS.lon.toFixed(4)}° в.д.</span>
            </p>
          </div>

          {/* Key Geodesic Metrics Strip */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className="rounded-2xl bg-[#042B22] border border-[#3E6B58]/60 px-4 py-2.5 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A7F3D0]/80">
                Азимут Киблы
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono-tabular text-[#EAB308]">
                {qiblaAzimuth.toFixed(1)}°
              </div>
            </div>

            <div className="rounded-2xl bg-[#042B22] border border-[#3E6B58]/60 px-4 py-2.5 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A7F3D0]/80">
                Направление
              </div>
              <div className="text-base sm:text-lg font-bold text-[#FEF3C7]">
                {cardinalInfo.shortRu} ({cardinalInfo.fullRu})
              </div>
            </div>

            <div className="rounded-2xl bg-[#042B22] border border-[#3E6B58]/60 px-4 py-2.5 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A7F3D0]/80">
                До Каабы
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono-tabular text-[#FEF3C7]">
                {distanceKm.toLocaleString('ru-RU')} км
              </div>
            </div>
          </div>
        </div>

        {/* Location Selection Controls: Offline City List + GPS + Address Search */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-2 border-t border-white/10">
          {/* 1. Offline Database of Bashkortostan & Russia Cities */}
          <div className="lg:col-span-5 space-y-1">
            <label className="block text-xs font-semibold text-[#A7F3D0]">
              Город или райцентр (работает 100% офлайн):
            </label>
            <div className="flex items-center gap-2">
              <select
                aria-label="Выбрать город или райцентр"
                value={
                  BASHKORTOSTAN_AND_RUSSIA_LOCATIONS.some((c) => c.id === location.id)
                    ? location.id
                    : 'ufa'
                }
                onChange={(e) => handleSelectCityPreset(e.target.value)}
                className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-[#164A3B] border border-[#3E6B58] text-xs sm:text-sm font-bold text-[#FEF3C7] [&>optgroup]:text-slate-900 [&>option]:text-slate-900 focus:outline-none"
              >
                <optgroup label="Республика Башкортостан (города и райцентры)">
                  {BASHKORTOSTAN_AND_RUSSIA_LOCATIONS.filter(
                    (c) => c.region === 'bashkortostan'
                  ).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameRu} {c.nameTatar ? `(${c.nameTatar})` : ''} —{' '}
                      {calculateQiblaAzimuth(c.lat, c.lon).toFixed(1)}°
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Крупные города России">
                  {BASHKORTOSTAN_AND_RUSSIA_LOCATIONS.filter(
                    (c) => c.region === 'russia'
                  ).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameRu} ({c.districtRu}) —{' '}
                      {calculateQiblaAzimuth(c.lat, c.lon).toFixed(1)}°
                    </option>
                  ))}
                </optgroup>
              </select>

              <button
                type="button"
                onClick={handleDetectGps}
                disabled={isLocatingGps}
                className="h-10 px-3.5 rounded-xl bg-[#EAB308] hover:bg-[#FACC15] text-[#06372C] text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-60"
                title="Определить точные координаты по GPS"
              >
                <LocateFixed className="w-4 h-4 shrink-0" />
                <span>{isLocatingGps ? 'Поиск...' : 'По GPS'}</span>
              </button>
            </div>
          </div>

          {/* 2. Exact Street & House Search (Nominatim) */}
          <div className="lg:col-span-7 space-y-1">
            <label className="block text-xs font-semibold text-[#A7F3D0]">
              Поиск по улице и номеру дома (для ориентации по окнам без GPS):
            </label>
            <form onSubmit={handleSearchAddress} className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-[#A7F3D0]/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={addressQuery}
                  onChange={(e) => setAddressQuery(e.target.value)}
                  placeholder="Например: Уфа, проспект Октября 45"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#164A3B] border border-[#3E6B58] text-xs sm:text-sm text-[#FEF3C7] placeholder:text-[#A7F3D0]/50 focus:outline-none focus:border-[#EAB308]"
                />
              </div>
              <button
                type="submit"
                disabled={isSearchingAddress}
                className="h-10 px-4 rounded-xl bg-[#185243] hover:bg-[#1E6351] border border-[#3E6B58] text-[#FEF3C7] text-xs font-bold shrink-0 transition-colors cursor-pointer disabled:opacity-60"
              >
                {isSearchingAddress ? 'Поиск...' : 'Найти дом'}
              </button>
            </form>
          </div>
        </div>

        {/* Optional Address Search Results or GPS Status */}
        {(gpsStatusMessage || addressError || addressResults.length > 1) && (
          <div className="rounded-2xl bg-[#042B22]/90 border border-[#3E6B58]/50 p-3 text-xs space-y-2">
            {gpsStatusMessage && (
              <div className="text-[#A7F3D0] flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#EAB308] shrink-0" />
                <span>{gpsStatusMessage}</span>
              </div>
            )}
            {addressError && <div className="text-amber-300">{addressError}</div>}
            {addressResults.length > 1 && (
              <div className="space-y-1">
                <div className="text-[11px] text-[#A7F3D0]/80 font-semibold">
                  Найденные адреса (нажмите для выбора вашего дома):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {addressResults.map((item) => (
                    <button
                      key={item.place_id}
                      type="button"
                      onClick={() => {
                        const lat = parseFloat(item.lat);
                        const lon = parseFloat(item.lon);
                        const shortTitle = item.display_name
                          .split(',')
                          .slice(0, 3)
                          .join(', ');
                        setLocation({
                          id: 'custom_address',
                          nameRu: shortTitle,
                          lat,
                          lon,
                          addressLabel: item.display_name,
                        });
                        setMapCenter({ lat, lon });
                        setMapZoom(18);
                        setAddressResults([]);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#164A3B] hover:bg-[#1E5C4A] border border-[#3E6B58] text-[#FEF3C7] text-[11px] text-left truncate max-w-md cursor-pointer"
                    >
                      {item.display_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode Switcher Tabs: 1. Живой компас | 2. Кибла на карте (по дому и окнам) */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('compass')}
            className={`py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'compass'
                ? 'bg-[#FEF3C7] text-[#06372C] shadow-xs'
                : 'bg-[#124235] hover:bg-[#185243] text-[#FEF3C7] border border-white/10'
            }`}
          >
            <Compass className="w-4 h-4 shrink-0" />
            <span>1. Живой компас Киблы</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMapCenter({ lat: location.lat, lon: location.lon });
              setActiveTab('map');
            }}
            className={`py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'map'
                ? 'bg-[#FEF3C7] text-[#06372C] shadow-xs'
                : 'bg-[#124235] hover:bg-[#185243] text-[#FEF3C7] border border-white/10'
            }`}
          >
            <MapIcon className="w-4 h-4 shrink-0" />
            <span>2. На карте (по дому и окнам)</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          MODE 1: LIVE QIBLA COMPASS (Sensors + Bubble Level + Manual Dial)
         ===================================================================== */}
      {activeTab === 'compass' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left / Center: Interactive Compass Dial */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 shadow-xs flex flex-col items-center space-y-5">
            {/* Alignment Status Banner */}
            <div
              className={`w-full rounded-2xl px-4 py-3 border text-center transition-colors ${
                isAlignedWithQibla
                  ? 'bg-emerald-900 border-amber-400 text-[#FEF3C7]'
                  : 'bg-[#F8F6F1] border-stone-200 text-slate-800'
              }`}
            >
              <div className="text-xs font-bold uppercase tracking-wider">
                {isAlignedWithQibla ? (
                  <span className="text-[#EAB308]">
                    ★ Вы направлены точно на Киблу ({qiblaAzimuth.toFixed(1)}°)
                  </span>
                ) : (
                  <span>
                    Повернитесь{' '}
                    {angularDeltaToQibla > 0
                      ? `вправо на ${Math.abs(Math.round(angularDeltaToQibla))}°`
                      : `влево на ${Math.abs(Math.round(angularDeltaToQibla))}°`}{' '}
                    до совпадения со значком Каабы
                  </span>
                )}
              </div>
              <div className="text-[11px] opacity-80 mt-0.5 font-mono-tabular">
                Ваш курс: {Math.round(currentDeviceHeading)}° · Азимут Киблы:{' '}
                {qiblaAzimuth.toFixed(1)}° ({cardinalInfo.shortRu})
              </div>
            </div>

            {/* iOS Sensor Permission Button if needed */}
            {needsIosPermission && !sensorSupported && (
              <button
                type="button"
                onClick={handleRequestIosSensorPermission}
                className="px-4 py-2.5 rounded-xl bg-[#06372C] text-[#FEF3C7] text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-[#EAB308]" />
                <span>Включить датчик компаса iPhone / iPad</span>
              </button>
            )}

            {/* SVG High-Precision Compass Rose & Kaaba Pointer */}
            <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center select-none">
              {/* Top Fixed Lubber Line (Forward Direction of Phone) */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
                <div
                  className={`w-0 h-0 border-l-[9px] border-r-[9px] border-b-[14px] border-l-transparent border-r-transparent ${
                    isAlignedWithQibla ? 'border-b-amber-500' : 'border-b-[#06372C]'
                  }`}
                />
              </div>

              <svg
                viewBox="0 0 320 320"
                className="w-full h-full overflow-visible"
              >
                {/* Outer Stationary Bezel */}
                <circle
                  cx="160"
                  cy="160"
                  r="148"
                  fill={isAlignedWithQibla ? '#042f2e' : '#06372C'}
                  stroke={isAlignedWithQibla ? '#eab308' : '#0f5248'}
                  strokeWidth={isAlignedWithQibla ? '5' : '3'}
                />

                {/* Rotating Compass Card (rotates by -currentDeviceHeading) */}
                <g
                  transform={`rotate(${-currentDeviceHeading}, 160, 160)`}
                  className="transition-transform duration-100 ease-out"
                >
                  {/* Degree Ticks every 5° */}
                  {Array.from({ length: 72 }).map((_, idx) => {
                    const deg = idx * 5;
                    const isMajor = deg % 30 === 0;
                    const isCardinal = deg % 90 === 0;
                    return (
                      <g key={deg} transform={`rotate(${deg}, 160, 160)`}>
                        <line
                          x1="160"
                          y1={isCardinal ? '20' : isMajor ? '22' : '25'}
                          x2="160"
                          y2={isCardinal ? '34' : isMajor ? '32' : '29'}
                          stroke={
                            deg === 0
                              ? '#ef4444'
                              : isMajor
                              ? '#fef3c7'
                              : 'rgba(254, 243, 199, 0.38)'
                          }
                          strokeWidth={isCardinal ? '2.5' : isMajor ? '1.6' : '1'}
                        />
                        {isMajor && !isCardinal && (
                          <text
                            x="160"
                            y="45"
                            textAnchor="middle"
                            fill="#a7f3d0"
                            fontSize="9"
                            fontWeight="600"
                          >
                            {deg}°
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Cardinal Labels (С, В, Ю, З) */}
                  <text
                    x="160"
                    y="48"
                    textAnchor="middle"
                    fill="#f87171"
                    fontSize="14"
                    fontWeight="800"
                  >
                    С (N)
                  </text>
                  <text
                    x="276"
                    y="165"
                    textAnchor="middle"
                    fill="#fef3c7"
                    fontSize="13"
                    fontWeight="700"
                  >
                    В (E)
                  </text>
                  <text
                    x="160"
                    y="282"
                    textAnchor="middle"
                    fill="#fef3c7"
                    fontSize="13"
                    fontWeight="700"
                  >
                    Ю (S)
                  </text>
                  <text
                    x="44"
                    y="165"
                    textAnchor="middle"
                    fill="#fef3c7"
                    fontSize="13"
                    fontWeight="700"
                  >
                    З (W)
                  </text>

                  {/* Golden Qibla Ray & Kaaba Icon at exact qiblaAzimuth */}
                  <g transform={`rotate(${qiblaAzimuth}, 160, 160)`}>
                    {/* Golden Ray from center to Kaaba perimeter */}
                    <line
                      x1="160"
                      y1="160"
                      x2="160"
                      y2="34"
                      stroke="#eab308"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    {/* Arrowhead pointing to Kaaba */}
                    <polygon
                      points="160,16 151,36 169,36"
                      fill="#eab308"
                    />
                    {/* Kaaba Cube Emblem */}
                    <rect
                      x="148"
                      y="52"
                      width="24"
                      height="24"
                      rx="4"
                      fill="#0f172a"
                      stroke="#eab308"
                      strokeWidth="2"
                    />
                    {/* Golden Kiswah Band on Kaaba */}
                    <line
                      x1="149"
                      y1="59"
                      x2="171"
                      y2="59"
                      stroke="#eab308"
                      strokeWidth="3"
                    />
                  </g>
                </g>

                {/* Center Horizontal Bubble Level (Пузырьковый уровень наклона) */}
                <circle
                  cx="160"
                  cy="160"
                  r="34"
                  fill="#042B22"
                  stroke="rgba(167, 243, 208, 0.35)"
                  strokeWidth="1.5"
                />
                <line
                  x1="132"
                  y1="160"
                  x2="188"
                  y2="160"
                  stroke="rgba(167, 243, 208, 0.25)"
                  strokeWidth="1"
                />
                <line
                  x1="160"
                  y1="132"
                  x2="160"
                  y2="188"
                  stroke="rgba(167, 243, 208, 0.25)"
                  strokeWidth="1"
                />
                {/* Moving Level Bubble */}
                <circle
                  cx={160 + bubbleOffset.x}
                  cy={160 + bubbleOffset.y}
                  r="8"
                  fill={isTiltedTooSteep ? '#f59e0b' : '#10b981'}
                  fillOpacity="0.85"
                  stroke="#fef3c7"
                  strokeWidth="1.5"
                />
              </svg>
            </div>

            {/* Tilt Warning if phone is held vertically */}
            {isTiltedTooSteep && (
              <div className="w-full rounded-xl bg-amber-50 border border-amber-300 px-3.5 py-2.5 text-xs text-amber-950 flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Наклон устройства <strong>{Math.round(totalTiltDeg)}°</strong>. Положите телефон горизонтально на ладонь или стол для точной работы магнитного компаса.
                </span>
              </div>
            )}

            {/* Manual Compass Rotation Slider (for tablets, PCs, or indoor magnetic interference) */}
            <div className="w-full bg-[#F8F6F1] rounded-2xl p-3.5 border border-stone-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  {sensorSupported && !isManualCompassMode
                    ? `Датчик активен (${
                        sensorSource === 'absolute'
                          ? 'Абсолютный геомагнитный'
                          : sensorSource === 'webkit'
                          ? 'Компас iOS'
                          : 'Гироскоп'
                      })`
                    : 'Ручной поворот шкалы (для планшетов без датчика)'}
                </span>
                {sensorSupported && (
                  <button
                    type="button"
                    onClick={() => setIsManualCompassMode((prev) => !prev)}
                    className="text-xs font-semibold text-[#06372C] hover:underline cursor-pointer"
                  >
                    {isManualCompassMode ? 'Вернуть авто-датчик' : 'Вращать вручную'}
                  </button>
                )}
              </div>

              {(!sensorSupported || isManualCompassMode) && (
                <div className="space-y-1.5">
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={Math.round(manualHeadingDeg)}
                    onChange={(e) => setManualHeadingDeg(Number(e.target.value))}
                    className="w-full accent-[#06372C] cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-stone-600">
                    <span>
                      Поверните Север «С (N)» на шкале по сторонам света в комнате — золотой луч покажет Киблу ({qiblaAzimuth.toFixed(1)}°)
                    </span>
                    <button
                      type="button"
                      onClick={() => setManualHeadingDeg(qiblaAzimuth)}
                      className="text-[#06372C] font-bold hover:underline shrink-0 ml-2 cursor-pointer"
                    >
                      Совместить с Киблой
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Declination Settings, Sensor Calibration & Guidance */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#06372C]" />
                <span>Настройки точности и магнитного склонения</span>
              </h3>

              <div className="p-3.5 rounded-2xl bg-[#F8F6F1] border border-stone-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900">
                      Магнитное склонение ({magneticDeclination > 0 ? `+${magneticDeclination}° В` : `${magneticDeclination}° З`})
                    </div>
                    <div className="text-[11px] text-stone-600 mt-0.5">
                      Разница между магнитным и истинным географическим севером в точке «{location.nameRu}».
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setApplyDeclinationOffset((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition-colors cursor-pointer ${
                      applyDeclinationOffset
                        ? 'bg-[#06372C] text-[#FEF3C7]'
                        : 'bg-stone-200 text-slate-700 hover:bg-stone-300'
                    }`}
                  >
                    {applyDeclinationOffset ? 'Включено' : 'Авто (ОС)'}
                  </button>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  На большинстве современных Android-смартфонов датчик <code className="font-mono">deviceorientationabsolute</code> уже учитывает геомагнитную модель. Если ваш компас показывает магнитный север без поправки, включите добавление <strong>+{magneticDeclination}°</strong>.
                </p>
              </div>

              {/* Calibration & Interference Help */}
              <div className="p-3.5 rounded-2xl bg-[#F8F6F1] border border-stone-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    Калибровка датчика движением «восьмёркой» (∞)
                  </span>
                  {compassAccuracyDeg !== null && (
                    <span className="font-mono-tabular text-[11px] text-stone-600">
                      Точность: ±{Math.round(compassAccuracyDeg)}°
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Магнитные застёжки чехлов, металлические столы и железобетонные стены могут смещать стрелку магнитного компаса на 15–30°.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCalibrationHelp((prev) => !prev)}
                  className="text-xs font-bold text-[#06372C] hover:underline cursor-pointer"
                >
                  {showCalibrationHelp ? 'Скрыть памятку калибровки' : 'Как откалибровать компас?'}
                </button>
                {showCalibrationHelp && (
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 pt-1">
                    <li>Снимите чехол с магнитной застёжкой и отойдите на 1 метр от бытовой техники и батарей отопления.</li>
                    <li>Плавно проведите телефоном в воздухе по траектории знака бесконечности (<strong>∞</strong>) 3–4 раза, поворачивая кисть.</li>
                    <li>Для 100% проверки в помещении без зависимости от магнита откройте вкладку <strong>«2. На карте (по дому и окнам)»</strong>.</li>
                  </ol>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setMapCenter({ lat: location.lat, lon: location.lon });
                  setActiveTab('map');
                }}
                className="w-full py-3 px-4 rounded-2xl bg-[#06372C] hover:bg-[#084739] text-[#FEF3C7] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <MapIcon className="w-4 h-4 text-[#EAB308]" />
                <span>Проверить Киблу по крыше дома и окнам на карте</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODE 2: QIBLA ON INTERACTIVE MAP (House Roof Ray + 360° Protractor)
         ===================================================================== */}
      {activeTab === 'map' && (
        <div className="bg-white rounded-3xl border border-stone-200 p-4 sm:p-5 shadow-xs space-y-4">
          {/* Map Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 font-display">
                Ориентир Киблы по вашему дому, окнам и соседним зданиям
              </h3>
              <p className="text-xs text-stone-600">
                Нажмите прямо на свой дом или окно на карте — золотой луч покажет точное геодезическое направление на Каабу (<strong>{qiblaAzimuth.toFixed(1)}° {cardinalInfo.shortRu}</strong>) без ошибки проекции Меркатора.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Layer Switcher: Яндекс Схема | Яндекс Гибрид */}
              <div className="inline-flex flex-wrap items-center bg-[#F8F6F1] border border-stone-200 rounded-xl p-1 text-xs font-semibold gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setTileLoadErrorCount(0);
                    setMapLayer('yandex_map');
                  }}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer ${
                    mapLayer === 'yandex_map'
                      ? 'bg-[#06372C] text-[#FEF3C7]'
                      : 'text-slate-700 hover:bg-stone-200/70'
                  }`}
                  title="Яндекс.Карты — подробная схема домов, корпусов и подъездов (проекция EPSG:3395)"
                >
                  <Layers className="w-3.5 h-3.5 text-[#EAB308]" />
                  <span>Яндекс Схема</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTileLoadErrorCount(0);
                    setMapLayer('yandex_hybrid');
                  }}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer ${
                    mapLayer === 'yandex_hybrid'
                      ? 'bg-[#06372C] text-[#FEF3C7]'
                      : 'text-slate-700 hover:bg-stone-200/70'
                  }`}
                  title="Яндекс Спутник + названия улиц и номера домов"
                >
                  <span>Яндекс Гибрид</span>
                </button>
              </div>

              {/* Center on Current Pin */}
              <button
                type="button"
                onClick={() => {
                  setMapCenter({ lat: location.lat, lon: location.lon });
                  setMapZoom(18);
                }}
                className="px-3 py-2 rounded-xl bg-[#06372C] text-[#FEF3C7] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title="Центрировать карту на выбранном доме"
              >
                <Navigation className="w-3.5 h-3.5 text-[#EAB308]" />
                <span>К моему дому</span>
              </button>
            </div>
          </div>

          {/* Interactive Slippy Map Viewport + Geodesic SVG Overlay */}
          <div
            ref={mapViewportRef}
            onPointerDown={handleMapPointerDown}
            onPointerMove={handleMapPointerMove}
            onPointerUp={handleMapPointerUp}
            onPointerCancel={handleMapPointerCancel}
            onTouchStart={handleMapTouchStart}
            onTouchMove={handleMapTouchMove}
            onTouchEnd={handleMapTouchEnd}
            onTouchCancel={handleMapTouchEnd}
            onWheel={handleMapWheel}
            className="relative w-full h-[440px] sm:h-[520px] rounded-2xl overflow-hidden border border-stone-300 bg-[#042B22] select-none touch-none cursor-grab active:cursor-grabbing"
          >
            {/* 1. Raster Tiles (Yandex EPSG:3395 or OSM/Esri EPSG:3857) + Hybrid Labels Overlay */}
            {tileLoadErrorCount < 6 &&
              visibleMapTiles.map((tile) => (
                <React.Fragment key={tile.key}>
                  <img
                    src={tile.url}
                    alt=""
                    draggable={false}
                    referrerPolicy="no-referrer"
                    onError={() => setTileLoadErrorCount((c) => c + 1)}
                    style={{
                      left: `${tile.left}px`,
                      top: `${tile.top}px`,
                      width: '256px',
                      height: '256px',
                    }}
                    className="absolute pointer-events-none select-none max-w-none"
                  />
                  {tile.hybridOverlayUrl && (
                    <img
                      src={tile.hybridOverlayUrl}
                      alt=""
                      draggable={false}
                      referrerPolicy="no-referrer"
                      style={{
                        left: `${tile.left}px`,
                        top: `${tile.top}px`,
                        width: '256px',
                        height: '256px',
                      }}
                      className="absolute pointer-events-none select-none max-w-none"
                    />
                  )}
                </React.Fragment>
              ))}

            {/* 2. Autonomous Offline Grid Background if tiles cannot load (offline mode) */}
            {tileLoadErrorCount >= 6 && (
              <div className="absolute inset-0 bg-[#042B22] flex flex-col items-center justify-between p-4 text-[#A7F3D0]/80 text-xs pointer-events-none">
                <div className="px-3 py-1 rounded-full bg-black/35 text-[#FEF3C7] font-semibold">
                  Автономная векторная схема азимута Киблы (офлайн-режим без подгрузки карт)
                </div>
              </div>
            )}

            {/* 3. High-Precision Geodesic SVG Overlay (Single Unified Qibla Line from House to Kaaba) */}
            <svg
              viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              <g>
                {/* Dark Halo for high contrast on both street and satellite imagery */}
                <polyline
                  points={orthodromePolylinePoints}
                  fill="none"
                  stroke="#042f2e"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
                {/* Single Continuous Golden Qibla Line (exact initial azimuth at house + Great Circle to Mecca) */}
                <polyline
                  points={orthodromePolylinePoints}
                  fill="none"
                  stroke="#facc15"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Kaaba Marker in Mecca (visible when zoomed out) */}
                <g transform={`translate(${kaabaScreen.x}, ${kaabaScreen.y})`}>
                  <rect
                    x="-10"
                    y="-10"
                    width="20"
                    height="20"
                    rx="4"
                    fill="#0f172a"
                    stroke="#facc15"
                    strokeWidth="2.5"
                  />
                  <line
                    x1="-9"
                    y1="-4"
                    x2="9"
                    y2="-4"
                    stroke="#facc15"
                    strokeWidth="2.5"
                  />
                </g>

                {/* Directional Arrow Badge at 92px along the Qibla Ray from House Pin */}
                <g
                  transform={`translate(${housePinScreen.x}, ${housePinScreen.y}) rotate(${qiblaAzimuth}) translate(0, -92)`}
                >
                  <polygon
                    points="0,-14 -10,8 10,8"
                    fill="#facc15"
                    stroke="#042f2e"
                    strokeWidth="2"
                  />
                </g>

                {/* House Pin Marker */}
                <circle
                  cx={housePinScreen.x}
                  cy={housePinScreen.y}
                  r="9"
                  fill="#06372C"
                  stroke="#facc15"
                  strokeWidth="3"
                />
                <circle
                  cx={housePinScreen.x}
                  cy={housePinScreen.y}
                  r="3"
                  fill="#facc15"
                />
              </g>
            </svg>

            {/* Floating Zoom Controls (Right Side) */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-3 top-3 z-20 flex flex-col gap-1.5"
            >
              <button
                type="button"
                onClick={() => setMapZoom((z) => Math.min(19, z + 1))}
                className="w-10 h-10 rounded-xl bg-white/95 hover:bg-white text-slate-900 shadow-md border border-stone-200 flex items-center justify-center cursor-pointer"
                title="Приблизить (вплоть до дома)"
              >
                <Plus className="w-4 h-4" />
              </button>
              <div className="w-10 py-1 rounded-lg bg-slate-900/85 text-white text-[10px] font-mono-tabular font-bold text-center">
                z{mapZoom}
              </div>
              <button
                type="button"
                onClick={() => setMapZoom((z) => Math.max(3, z - 1))}
                className="w-10 h-10 rounded-xl bg-white/95 hover:bg-white text-slate-900 shadow-md border border-stone-200 flex items-center justify-center cursor-pointer"
                title="Отдалить"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setMapZoom(4)}
                className="w-10 h-10 rounded-xl bg-white/95 hover:bg-white text-slate-900 shadow-md border border-stone-200 flex items-center justify-center cursor-pointer text-[10px] font-bold"
                title="Показать всю траекторию до Мекки"
              >
                Мир
              </button>
            </div>

            {/* Bottom Floating Legend inside Map */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute left-3 right-3 bottom-3 z-20 rounded-xl bg-slate-950/85 backdrop-blur-xs text-white px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 border border-white/15"
            >
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-[#facc15] border border-emerald-900 shrink-0" />
                <span>
                  Луч Киблы: <strong>{qiblaAzimuth.toFixed(1)}° ({cardinalInfo.shortRu})</strong> · Ориентир в 3 км по лучу:{' '}
                  <span className="font-mono-tabular opacity-85">
                    {localRayTargetCoords.lat.toFixed(4)}°, {localRayTargetCoords.lon.toFixed(4)}°
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setLocation((prev) => ({
                    ...prev,
                    id: 'custom_pin',
                    nameRu: `${prev.nameRu.split(' (')[0]} (центр карты)`,
                    lat: Math.round(mapCenter.lat * 1000000) / 1000000,
                    lon: Math.round(mapCenter.lon * 1000000) / 1000000,
                  }))
                }
                className="px-2.5 py-1 rounded-lg bg-[#EAB308] text-slate-950 font-bold text-[11px] cursor-pointer shrink-0"
              >
                Перенести метку в центр экрана
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
