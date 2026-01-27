/**
 * Google Apps Script — выдача свободных транспортных единиц по типу (moto/auto)
 * По запросу:
 *   ?car=moto&month=February&day=25&count=14&year=2026
 *   ?car=auto&month=February&day=25&count=14&year=2026
 *
 * Логика:
 * - Тип транспорта задаётся фиксированным диапазоном строк:
 *    moto: 1–79
 *    auto: 80–121
 * - Название конкретной единицы транспорта лежит в колонке C
 * - Дни месяца идут по колонкам начиная с D (D=1 день, E=2 день, ...)
 * - Свободно = ВСЕ проверяемые дни имеют белый фон #ffffff
 *
 * ВАЖНО:
 * - Структура листов по месяцам должна быть одинаковой (те же строки = те же единицы).
 * - Название листа месяца может быть "February", "February 2026" и т.п. (см. resolveMonthSheet_()).
 */

// ====== НАСТРОЙКИ ======
const TYPE_RANGES = {
  moto: { startRow: 1, endRow: 79 },
  auto: { startRow: 80, endRow: 121 }
};

const ID_COL = 3;          // C
const DAY_COL_START = 4;   // D = day 1
const FREE_COLOR = "#ffffff";

// ====== ENTRYPOINT ======
function doGet(request) {
  try {
    const { car, month, day, count, year } = request.parameter;

    if (!car) return jsonError_("Не указан параметр 'car' (ожидается тип: moto/auto)");
    if (!month) return jsonError_("Не указан параметр 'month'");
    if (!year) return jsonError_("Не указан параметр 'year'");
    if (!day || !count) return jsonError_("Не заданы 'day' (день начала) и 'count' (количество дней)");

    const type = String(car).trim().toLowerCase();
    if (!TYPE_RANGES[type]) {
      return jsonError_(`Неизвестный тип car='${car}'. Разрешено: moto, auto`);
    }

    const startDay = parseInt(day, 10);
    const daysCount = parseInt(count, 10);
    const startYear = parseInt(year, 10);

    if (!Number.isFinite(startDay) || !Number.isFinite(daysCount) || !Number.isFinite(startYear)) {
      return jsonError_("Некорректные параметры day/count/year (ожидались числа)");
    }
    if (startDay < 1 || startDay > 31 || daysCount < 1) {
      return jsonError_(`Некорректный диапазон: day=${startDay}, count=${daysCount}`);
    }

    // Проверка "не в прошлом" (как у тебя)
    const inputMonthIndex = getMonthIndex(month); // 0..11
    const now = new Date();
    const currentMonthIndex = now.getMonth();
    const currentYear = now.getFullYear();

    if (startYear < currentYear || (startYear === currentYear && inputMonthIndex < currentMonthIndex)) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: "Некорректная дата"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const { startRow, endRow } = TYPE_RANGES[type];

    const results = getAvailabilityByRowRangeMultiMonth_(
      month,
      startDay,
      daysCount,
      startYear,
      startRow,
      endRow
    );

    if (Object.keys(results).length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        message: "На эти даты нет ни одного свободного транспорта"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify(results))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (e) {
    return jsonError_(String(e && e.message ? e.message : e));
  }
}

// ====== ОСНОВНАЯ ЛОГИКА ======

/**
 * Проверяет свободные единицы транспорта по фиксированному диапазону строк
 * по периоду day..day+count-1 с учетом перехода на следующий месяц.
 */
function getAvailabilityByRowRangeMultiMonth_(month, startDay, daysCount, startYear, startRow, endRow) {
  const ss = SpreadsheetApp.getActive();

  const segments = buildDateSegments_(month, startYear, startDay, daysCount);
  const firstSheet = resolveMonthSheet_(ss, segments[0].monthIndex, segments[0].year, month);

  if (!firstSheet) {
    throw new Error(`Не найден лист для месяца '${month}' и года '${startYear}'`);
  }

  const numRows = endRow - startRow + 1;
  if (numRows <= 0) throw new Error(`Некорректный диапазон строк: ${startRow}–${endRow}`);

  // Имена единиц берём из первого месяца (колонка C)
  const unitNames = firstSheet
    .getRange(startRow, ID_COL, numRows, 1)
    .getValues()
    .map(r => String(r[0] || "").trim());

  // occupied[i] = true если строка занята хотя бы в одном дне проверяемого периода
  const occupied = new Array(numRows).fill(false);

  for (const seg of segments) {
    const sheet = resolveMonthSheet_(ss, seg.monthIndex, seg.year, seg.monthName);
    if (!sheet) {
      throw new Error(`Не найден лист для '${seg.monthName}' ${seg.year}`);
    }

    const startCol = DAY_COL_START + (seg.startDay - 1);
    const bgs = sheet.getRange(startRow, startCol, numRows, seg.len).getBackgrounds();

    for (let r = 0; r < numRows; r++) {
      if (occupied[r]) continue;

      const name = unitNames[r];
      if (!name) continue; // пустая строка — пропускаем полностью

      const rowColors = bgs[r];
      for (let c = 0; c < rowColors.length; c++) {
        if (String(rowColors[c] || "").toLowerCase() !== FREE_COLOR) {
          occupied[r] = true;
          break;
        }
      }
    }
  }

  const result = {};
  for (let i = 0; i < unitNames.length; i++) {
    const name = unitNames[i];
    if (!name) continue;
    if (!occupied[i]) result[name] = "свободен";
  }

  return result;
}

/**
 * Разбивает период на сегменты по месяцам, если count выходит за пределы месяца.
 */
function buildDateSegments_(month, year, startDay, count) {
  const monthIndex = getMonthIndex(month); // 0..11
  let y = year;
  let m = monthIndex;
  let d = startDay;
  let remaining = count;

  const segments = [];

  while (remaining > 0) {
    const dim = getDaysInMonth_(y, m);
    if (d > dim) {
      throw new Error(`Стартовый день ${d} больше количества дней в месяце (${dim})`);
    }

    const canTake = Math.min(remaining, dim - d + 1);

    segments.push({
      year: y,
      monthIndex: m,
      monthName: getMonthNameEn_(m),
      startDay: d,
      len: canTake
    });

    remaining -= canTake;
    m += 1;
    d = 1;
    if (m > 11) { m = 0; y += 1; }
  }

  return segments;
}

/**
 * Поиск листа месяца:
 * 1) точное имя monthParam
 * 2) английское имя месяца (February)
 * 3) варианты "February 2026", "February-2026", "February_2026"
 * 4) мягкий поиск: contains(month) + contains(year)
 */
function resolveMonthSheet_(ss, monthIndex, year, monthParam) {
  const monthEn = getMonthNameEn_(monthIndex);
  const mp = String(monthParam || "").trim();

  const candidates = [
    mp,
    monthEn,
    `${monthEn} ${year}`,
    `${monthEn}-${year}`,
    `${monthEn}_${year}`
  ].filter(Boolean);

  for (const name of candidates) {
    const sh = ss.getSheetByName(name);
    if (sh) return sh;
  }

  const all = ss.getSheets();
  const targetMonth = monthEn.toLowerCase();
  const targetYear = String(year);

  for (const sh of all) {
    const n = sh.getName().toLowerCase();
    if (n.includes(targetMonth) && n.includes(targetYear)) return sh;
  }

  return null;
}

// ====== HELPERS ======

function jsonError_(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getDaysInMonth_(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getMonthNameEn_(monthIndex) {
  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  return months[monthIndex];
}

/**
 * Возвращает индекс месяца 0..11
 * Поддерживает:
 * - English: February / feb
 * - RU: февраль / фев
 * - Числом: 2 / 02
 */
function getMonthIndex(month) {
  const m = String(month || "").trim().toLowerCase();

  // число "2" или "02"
  if (/^\d{1,2}$/.test(m)) {
    const n = parseInt(m, 10);
    if (n >= 1 && n <= 12) return n - 1;
  }

  const map = {
    // English
    "january": 0, "jan": 0,
    "february": 1, "feb": 1,
    "march": 2, "mar": 2,
    "april": 3, "apr": 3,
    "may": 4,
    "june": 5, "jun": 5,
    "july": 6, "jul": 6,
    "august": 7, "aug": 7,
    "september": 8, "sep": 8, "sept": 8,
    "october": 9, "oct": 9,
    "november": 10, "nov": 10,
    "december": 11, "dec": 11,

    // Russian
    "январь": 0, "янв": 0,
    "февраль": 1, "фев": 1,
    "март": 2, "мар": 2,
    "апрель": 3, "апр": 3,
    "май": 4,
    "июнь": 5, "июн": 5,
    "июль": 6, "июл": 6,
    "август": 7, "авг": 7,
    "сентябрь": 8, "сен": 8, "сент": 8,
    "октябрь": 9, "окт": 9,
    "ноябрь": 10, "ноя": 10,
    "декабрь": 11, "дек": 11
  };

  if (map[m] === undefined) {
    throw new Error(`Некорректный месяц: '${month}'`);
  }
  return map[m];
}
