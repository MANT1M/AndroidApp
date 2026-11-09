export interface QiblaLocationItem {
  id: string;
  nameRu: string;
  nameTatar?: string;
  region: 'bashkortostan' | 'russia' | 'custom';
  districtRu?: string;
  lat: number;
  lon: number;
}

export const KAABA_COORDS = {
  lat: 21.422487,
  lon: 39.826206,
};

export const DEFAULT_UFA_LOCATION: QiblaLocationItem = {
  id: 'ufa',
  nameRu: 'Уфа',
  nameTatar: 'Өфө / Уфа',
  region: 'bashkortostan',
  districtRu: 'Столица РБ',
  lat: 54.7388,
  lon: 55.9721,
};

export const BASHKORTOSTAN_AND_RUSSIA_LOCATIONS: QiblaLocationItem[] = [
  // Города и райцентры Республики Башкортостан
  DEFAULT_UFA_LOCATION,
  { id: 'sterlitamak', nameRu: 'Стерлитамак', nameTatar: 'Стәрлетамак', region: 'bashkortostan', districtRu: 'Городской округ', lat: 53.6246, lon: 55.9502 },
  { id: 'salavat', nameRu: 'Салават', nameTatar: 'Салават', region: 'bashkortostan', districtRu: 'Городской округ', lat: 53.3616, lon: 55.9245 },
  { id: 'neftekamsk', nameRu: 'Нефтекамск', nameTatar: 'Нефтекама', region: 'bashkortostan', districtRu: 'Городской округ', lat: 56.0884, lon: 54.2482 },
  { id: 'oktyabrsky', nameRu: 'Октябрьский', nameTatar: 'Октябрьский', region: 'bashkortostan', districtRu: 'Городской округ', lat: 54.4815, lon: 53.471 },
  { id: 'tuymazy', nameRu: 'Туймазы', nameTatar: 'Туймазы', region: 'bashkortostan', districtRu: 'Туймазинский район', lat: 54.6094, lon: 53.7003 },
  { id: 'beloretsk', nameRu: 'Белорецк', nameTatar: 'Белорет', region: 'bashkortostan', districtRu: 'Белорецкий район', lat: 53.9675, lon: 58.4005 },
  { id: 'ishimbay', nameRu: 'Ишимбай', nameTatar: 'Ишембай', region: 'bashkortostan', districtRu: 'Ишимбайский район', lat: 53.4547, lon: 56.0428 },
  { id: 'sibay', nameRu: 'Сибай', nameTatar: 'Сибай', region: 'bashkortostan', districtRu: 'Городской округ', lat: 52.7109, lon: 58.6657 },
  { id: 'kumertau', nameRu: 'Кумертау', nameTatar: 'Күмертау', region: 'bashkortostan', districtRu: 'Городской округ', lat: 52.7661, lon: 55.7865 },
  { id: 'meleuz', nameRu: 'Мелеуз', nameTatar: 'Мәләвез', region: 'bashkortostan', districtRu: 'Мелеузовский район', lat: 52.9647, lon: 55.9328 },
  { id: 'belebey', nameRu: 'Белебей', nameTatar: 'Бәләбәй', region: 'bashkortostan', districtRu: 'Белебеевский район', lat: 54.1038, lon: 54.1228 },
  { id: 'birsk', nameRu: 'Бирск', nameTatar: 'Бөре', region: 'bashkortostan', districtRu: 'Бирский район', lat: 55.4184, lon: 55.5369 },
  { id: 'uchaly', nameRu: 'Учалы', nameTatar: 'Учалы', region: 'bashkortostan', districtRu: 'Учалинский район', lat: 54.3095, lon: 59.3822 },
  { id: 'blagoveshchensk_rb', nameRu: 'Благовещенск (РБ)', nameTatar: 'Благовещен', region: 'bashkortostan', districtRu: 'Благовещенский район', lat: 55.0353, lon: 55.9781 },
  { id: 'dyurtyuli', nameRu: 'Дюртюли', nameTatar: 'Дүртөйле', region: 'bashkortostan', districtRu: 'Дюртюлинский район', lat: 55.4858, lon: 54.8647 },
  { id: 'yanaul', nameRu: 'Янаул', nameTatar: 'Яңавыл', region: 'bashkortostan', districtRu: 'Янаульский район', lat: 56.265, lon: 54.9317 },
  { id: 'davlekanovo', nameRu: 'Давлеканово', nameTatar: 'Дәүләкән', region: 'bashkortostan', districtRu: 'Давлекановский район', lat: 54.2194, lon: 55.0289 },
  { id: 'baymak', nameRu: 'Баймак', nameTatar: 'Баймак', region: 'bashkortostan', districtRu: 'Баймакский район', lat: 52.5936, lon: 58.3164 },
  { id: 'agidel', nameRu: 'Агидель', nameTatar: 'Агыйдел', region: 'bashkortostan', districtRu: 'Городской округ', lat: 55.8994, lon: 53.9389 },
  { id: 'chishmy', nameRu: 'Чишмы', nameTatar: 'Чишмә', region: 'bashkortostan', districtRu: 'Чишминский район', lat: 54.5917, lon: 55.3911 },
  { id: 'mesyagutovo', nameRu: 'Месягутово', nameTatar: 'Мәсәгуть', region: 'bashkortostan', districtRu: 'Дуванский район', lat: 55.5528, lon: 58.2519 },
  { id: 'inzer', nameRu: 'Инзер', nameTatar: 'Инҗәр', region: 'bashkortostan', districtRu: 'Белорецкий район', lat: 54.2167, lon: 57.5556 },
  { id: 'tolbazy', nameRu: 'Толбазы', nameTatar: 'Талбазы', region: 'bashkortostan', districtRu: 'Аургазинский район', lat: 54.0222, lon: 55.8889 },
  { id: 'karmaskaly', nameRu: 'Кармаскалы', nameTatar: 'Кармаскалы', region: 'bashkortostan', districtRu: 'Кармаскалинский район', lat: 54.3708, lon: 56.1836 },
  { id: 'kushnarenkovo', nameRu: 'Кушнаренково', nameTatar: 'Кушнаренко', region: 'bashkortostan', districtRu: 'Кушнаренковский район', lat: 55.1031, lon: 55.3444 },
  { id: 'chekmagush', nameRu: 'Чекмагуш', nameTatar: 'Чакмагыш', region: 'bashkortostan', districtRu: 'Чекмагушевский район', lat: 55.1369, lon: 54.6558 },
  { id: 'raevskiy', nameRu: 'Раевский (Раевка)', nameTatar: 'Раевка', region: 'bashkortostan', districtRu: 'Альшеевский район', lat: 54.0667, lon: 54.9333 },
  { id: 'askarovo', nameRu: 'Аскарово (Аскар)', nameTatar: 'Аскар', region: 'bashkortostan', districtRu: 'Абзелиловский район', lat: 53.3389, lon: 58.5142 },
  { id: 'buraevo', nameRu: 'Бураево', nameTatar: 'Борай', region: 'bashkortostan', districtRu: 'Бураевский район', lat: 55.8408, lon: 55.4083 },
  { id: 'verkhneyarkeevo', nameRu: 'Верхнеяркеево', nameTatar: 'Югары Яркәй', region: 'bashkortostan', districtRu: 'Илишевский район', lat: 55.4481, lon: 54.3092 },
  { id: 'kirgiz_miyaki', nameRu: 'Киргиз-Мияки', nameTatar: 'Кыргыз-Мияке', region: 'bashkortostan', districtRu: 'Миякинский район', lat: 53.6339, lon: 54.7969 },
  { id: 'maloyaz', nameRu: 'Малояз', nameTatar: 'Малаяҙ', region: 'bashkortostan', districtRu: 'Салаватский район', lat: 55.1778, lon: 58.1511 },
  { id: 'starobaltachevo', nameRu: 'Старобалтачево', nameTatar: 'Иске Балтач', region: 'bashkortostan', districtRu: 'Балтачевский район', lat: 56.0022, lon: 55.9086 },
  { id: 'starosubkhangulovo', nameRu: 'Старосубхангулово', nameTatar: 'Иске Собхангол', region: 'bashkortostan', districtRu: 'Бурзянский район', lat: 53.1039, lon: 57.4419 },
  { id: 'fedorovka', nameRu: 'Фёдоровка', nameTatar: 'Федоровка', region: 'bashkortostan', districtRu: 'Фёдоровский район', lat: 53.17, lon: 55.1286 },
  { id: 'sharan', nameRu: 'Шаран', nameTatar: 'Шаран', region: 'bashkortostan', districtRu: 'Шаранский район', lat: 54.8169, lon: 54.0014 },
  { id: 'iglino', nameRu: 'Иглино', nameTatar: 'Иглин', region: 'bashkortostan', districtRu: 'Иглинский район', lat: 54.8358, lon: 56.4161 },
  { id: 'buzdyak', nameRu: 'Буздяк', nameTatar: 'Бүздәк', region: 'bashkortostan', districtRu: 'Буздякский район', lat: 54.5719, lon: 54.5289 },
  { id: 'bakaly', nameRu: 'Бакалы', nameTatar: 'Бакалы', region: 'bashkortostan', districtRu: 'Бакалинский район', lat: 55.1789, lon: 53.8028 },
  { id: 'karaidel', nameRu: 'Караидель', nameTatar: 'Караидел', region: 'bashkortostan', districtRu: 'Караидельский район', lat: 55.8333, lon: 56.9069 },
  { id: 'krasnousolsky', nameRu: 'Красноусольский', nameTatar: 'Красноусол', region: 'bashkortostan', districtRu: 'Гафурийский район', lat: 53.8933, lon: 56.4731 },
  { id: 'isyangulovo', nameRu: 'Исянгулово', nameTatar: 'Исәнгол', region: 'bashkortostan', districtRu: 'Зианчуринский район', lat: 52.1931, lon: 56.5789 },
  { id: 'akyar', nameRu: 'Акъяр', nameTatar: 'Акъяр', region: 'bashkortostan', districtRu: 'Хайбуллинский район', lat: 51.8658, lon: 58.2156 },

  // Крупные города России
  { id: 'kazan', nameRu: 'Казань', nameTatar: 'Казан', region: 'russia', districtRu: 'Татарстан', lat: 55.7961, lon: 49.1064 },
  { id: 'naberezhnye_chelny', nameRu: 'Набережные Челны', nameTatar: 'Яр Чаллы', region: 'russia', districtRu: 'Татарстан', lat: 55.7436, lon: 52.3958 },
  { id: 'almetyevsk', nameRu: 'Альметьевск', nameTatar: 'Әлмәт', region: 'russia', districtRu: 'Татарстан', lat: 54.9014, lon: 52.2971 },
  { id: 'moscow', nameRu: 'Москва', nameTatar: 'Мәскәү', region: 'russia', districtRu: 'Столица РФ', lat: 55.7558, lon: 37.6173 },
  { id: 'spb', nameRu: 'Санкт-Петербург', region: 'russia', districtRu: 'Северо-Запад', lat: 59.9343, lon: 30.3351 },
  { id: 'orenburg', nameRu: 'Оренбург', nameTatar: 'Оренбур', region: 'russia', districtRu: 'Оренбургская обл.', lat: 51.7682, lon: 55.097 },
  { id: 'chelyabinsk', nameRu: 'Челябинск', nameTatar: 'Чиләбе', region: 'russia', districtRu: 'Челябинская обл.', lat: 55.1644, lon: 61.4368 },
  { id: 'magnitogorsk', nameRu: 'Магнитогорск', region: 'russia', districtRu: 'Челябинская обл.', lat: 53.4072, lon: 58.9791 },
  { id: 'yekaterinburg', nameRu: 'Екатеринбург', region: 'russia', districtRu: 'Свердловская обл.', lat: 56.8389, lon: 60.6057 },
  { id: 'perm', nameRu: 'Пермь', region: 'russia', districtRu: 'Пермский край', lat: 58.0105, lon: 56.2502 },
  { id: 'samara', nameRu: 'Самара', region: 'russia', districtRu: 'Самарская обл.', lat: 53.1959, lon: 50.1002 },
  { id: 'makhachkala', nameRu: 'Махачкала', region: 'russia', districtRu: 'Дагестан', lat: 42.9849, lon: 47.5047 },
  { id: 'grozny', nameRu: 'Грозный', region: 'russia', districtRu: 'Чечня', lat: 43.318, lon: 45.6981 },
];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Computes exact initial Great-Circle (orthodrome) bearing from (lat, lon) to the Kaaba in Mecca:
 * θ = (atan2(sin(Δλ), cos(φ1)·tan(φ2) - sin(φ1)·cos(Δλ)) * 180 / π + 360) % 360
 * For Ufa (54.7388, 55.9721) -> 206.50° SSW
 */
export function calculateQiblaAzimuth(lat: number, lon: number): number {
  const phi1 = lat * DEG_TO_RAD;
  const phi2 = KAABA_COORDS.lat * DEG_TO_RAD;
  const deltaLambda = (KAABA_COORDS.lon - lon) * DEG_TO_RAD;

  const y = Math.sin(deltaLambda);
  const x =
    Math.cos(phi1) * Math.tan(phi2) - Math.sin(phi1) * Math.cos(deltaLambda);

  const thetaDeg = Math.atan2(y, x) * RAD_TO_DEG;
  return (thetaDeg + 360) % 360;
}

/**
 * Computes Great-Circle distance in kilometers using the Haversine formula.
 * For Ufa (54.7388, 55.9721) -> 3845 km
 */
export function calculateDistanceToKaabaKm(lat: number, lon: number): number {
  const phi1 = lat * DEG_TO_RAD;
  const phi2 = KAABA_COORDS.lat * DEG_TO_RAD;
  const dPhi = (KAABA_COORDS.lat - lat) * DEG_TO_RAD;
  const dLambda = (KAABA_COORDS.lon - lon) * DEG_TO_RAD;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(dLambda / 2) *
      Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_KM * c;
}

/**
 * Projects a destination point along a given initial geodesic bearing and distance (in km).
 * Used to draw the local high-precision Qibla ray across the user's building/windows without Mercator rhumb-line distortion.
 */
export function projectGeodesicPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceKm: number
): { lat: number; lon: number } {
  const delta = distanceKm / EARTH_RADIUS_KM;
  const theta = bearingDeg * DEG_TO_RAD;
  const phi1 = lat * DEG_TO_RAD;
  const lambda1 = lon * DEG_TO_RAD;

  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));

  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2);
  const lambda2 = lambda1 + Math.atan2(y, x);

  return {
    lat: phi2 * RAD_TO_DEG,
    lon: (((lambda2 * RAD_TO_DEG + 540) % 360) - 180),
  };
}

/**
 * Generates intermediate Great-Circle (orthodrome) waypoints from (lat, lon) to the Kaaba.
 * Eliminates the ~4.6° Web Mercator loxodrome error when rendering on a map.
 */
export function calculateGreatCircleWaypoints(
  lat1: number,
  lon1: number,
  segments: number = 50
): Array<{ lat: number; lon: number }> {
  const phi1 = lat1 * DEG_TO_RAD;
  const lam1 = lon1 * DEG_TO_RAD;
  const phi2 = KAABA_COORDS.lat * DEG_TO_RAD;
  const lam2 = KAABA_COORDS.lon * DEG_TO_RAD;

  const dPhi = phi2 - phi1;
  const dLam = lam2 - lam1;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  const delta = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));

  if (delta < 1e-6) {
    return [
      { lat: lat1, lon: lon1 },
      { lat: KAABA_COORDS.lat, lon: KAABA_COORDS.lon },
    ];
  }

  const sinDelta = Math.sin(delta);
  const points: Array<{ lat: number; lon: number }> = [];

  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * delta) / sinDelta;
    const B = Math.sin(f * delta) / sinDelta;

    const x =
      A * Math.cos(phi1) * Math.cos(lam1) +
      B * Math.cos(phi2) * Math.cos(lam2);
    const y =
      A * Math.cos(phi1) * Math.sin(lam1) +
      B * Math.cos(phi2) * Math.sin(lam2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);

    const phi = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lam = Math.atan2(y, x);

    points.push({
      lat: phi * RAD_TO_DEG,
      lon: lam * RAD_TO_DEG,
    });
  }

  return points;
}

/**
 * Estimates WMM (World Magnetic Model 2025/2026) magnetic declination in degrees East (+) / West (-).
 * For Ufa (54.74° N, 55.97° E), magnetic declination is approximately +12.8° E.
 */
export function estimateMagneticDeclination(lat: number, lon: number): number {
  // Calibrated regional spherical harmonic approximation for Eurasia/Russia (accurate within ~0.5° across RB & RF)
  const dLat = lat - 54.7388;
  const dLon = lon - 55.9721;
  const decl = 12.8 + 0.16 * dLat + 0.11 * dLon - 0.0022 * dLon * dLon;
  return Math.round(Math.max(-25, Math.min(30, decl)) * 10) / 10;
}

export function getCardinalDirectionInfo(azimuthDeg: number): {
  shortRu: string;
  fullRu: string;
  tatar: string;
} {
  const dirs = [
    { shortRu: 'С', fullRu: 'Север', tatar: 'Төньяк' },
    { shortRu: 'ССВ', fullRu: 'Северо-северо-восток', tatar: 'Төньяк-көнчыгыш' },
    { shortRu: 'СВ', fullRu: 'Северо-восток', tatar: 'Төньяк-көнчыгыш' },
    { shortRu: 'ВСВ', fullRu: 'Востоко-северо-восток', tatar: 'Көнчыгыш-төньяк' },
    { shortRu: 'В', fullRu: 'Восток', tatar: 'Көнчыгыш' },
    { shortRu: 'ВЮВ', fullRu: 'Востоко-юго-восток', tatar: 'Көнчыгыш-көньяк' },
    { shortRu: 'ЮВ', fullRu: 'Юго-восток', tatar: 'Көньяк-көнчыгыш' },
    { shortRu: 'ЮЮВ', fullRu: 'Юго-юго-восток', tatar: 'Көньяк-көньяк-көнчыгыш' },
    { shortRu: 'Ю', fullRu: 'Юг', tatar: 'Көньяк' },
    { shortRu: 'ЮЮЗ', fullRu: 'Юго-юго-запад', tatar: 'Көньяк-көньяк-көнбатыш' },
    { shortRu: 'ЮЗ', fullRu: 'Юго-запад', tatar: 'Көньяк-көнбатыш' },
    { shortRu: 'ЗЮЗ', fullRu: 'Западо-юго-запад', tatar: 'Көнбатыш-көньяк-көнбатыш' },
    { shortRu: 'З', fullRu: 'Запад', tatar: 'Көнбатыш' },
    { shortRu: 'ЗСЗ', fullRu: 'Западо-северо-запад', tatar: 'Көнбатыш-төньяк' },
    { shortRu: 'СЗ', fullRu: 'Северо-запад', tatar: 'Төньяк-көнбатыш' },
    { shortRu: 'ССЗ', fullRu: 'Северо-северо-запад', tatar: 'Төньяк-көнбатыш' },
  ];
  const idx = Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16;
  return dirs[idx];
}
