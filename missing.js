export function calculateMissingBands(comics, knownHighestBandBySeries = {}) {
  const seriesMap = new Map();

  comics.forEach((comic) => {
    const series = typeof comic.series === "string" ? comic.series.trim() : "";
    const bandNumber = getPositiveInteger(comic.numericBandNumber ?? comic.volumeNumber);

    if (!series || bandNumber === null) {
      return;
    }

    if (!seriesMap.has(series)) {
      seriesMap.set(series, new Set());
    }

    seriesMap.get(series).add(bandNumber);
  });

  Object.entries(knownHighestBandBySeries || {}).forEach(([series, value]) => {
    if (typeof series !== "string" || !series.trim() || getPositiveInteger(value) === null) {
      return;
    }

    if (!seriesMap.has(series.trim())) {
      seriesMap.set(series.trim(), new Set());
    }
  });

  const result = [];

  seriesMap.forEach((presentBands, series) => {
    const highestPresent = presentBands.size > 0 ? Math.max(...presentBands) : 0;
    const configuredHighest = getPositiveInteger(knownHighestBandBySeries?.[series]) ?? 0;
    const upperLimit = Math.max(highestPresent, configuredHighest);

    if (upperLimit < 1) {
      return;
    }

    const missingBands = [];
    for (let bandNumber = 1; bandNumber <= upperLimit; bandNumber += 1) {
      if (!presentBands.has(bandNumber)) {
        missingBands.push(bandNumber);
      }
    }

    result.push({
      series,
      highestChecked: upperLimit,
      presentCount: presentBands.size,
      missingBands
    });
  });

  return result.sort((first, second) => first.series.localeCompare(second.series, "de"));
}

export function countMissingBands(missingGroups) {
  return missingGroups.reduce((sum, group) => sum + group.missingBands.length, 0);
}

function getPositiveInteger(value) {
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isSafeInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 99999
    ? parsedValue
    : null;
}
