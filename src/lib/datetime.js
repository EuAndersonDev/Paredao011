// Event date/time handling in the America/Sao_Paulo time zone (pure, no DOM).
(function (root) {
    "use strict";

    const saoPauloFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    });

    function getTodayInSaoPaulo(now = new Date()) {
        const parts = Object.fromEntries(
            saoPauloFormatter.formatToParts(now)
                .filter((part) => part.type !== "literal")
                .map((part) => [part.type, part.value])
        );
        return `${parts.year}-${parts.month}-${parts.day}`;
    }

    function isValidDateValue(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) return false;

        const [, yearText, monthText, dayText] = match;
        const year = Number(yearText);
        const month = Number(monthText);
        const day = Number(dayText);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 &&
            date.getUTCDate() === day;
    }

    // Converts a São Paulo wall-clock date ("YYYY-MM-DD") and time ("HH:mm") into a UTC timestamp.
    // With isEnd = true, "24:00" means midnight at the end of that day.
    // Returns { timestamp, date, time } or null when the input is invalid.
    function wallTimeToTimestamp(dateValue, timeValue, isEnd = false) {
        const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
        const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
        if (!dateMatch || !timeMatch) return null;

        const [, yearText, monthText, dayText] = dateMatch;
        const [, hourText, minuteText] = timeMatch;
        const [year, month, day, hour, minute] = [yearText, monthText, dayText, hourText, minuteText].map(Number);
        const isEndOfDay = isEnd && hour === 24 && minute === 0;
        if ((hour > 23 && !isEndOfDay) || minute > 59) return null;

        let normalizedDate = dateValue;
        let normalizedTime = timeValue;
        let normalizedYear = year;
        let normalizedMonth = month;
        let normalizedDay = day;
        let normalizedHour = hour;

        if (isEndOfDay) {
            const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
            normalizedDate = [
                String(nextDay.getUTCFullYear()).padStart(4, "0"),
                String(nextDay.getUTCMonth() + 1).padStart(2, "0"),
                String(nextDay.getUTCDate()).padStart(2, "0")
            ].join("-");
            normalizedTime = "00:00";
            normalizedYear = nextDay.getUTCFullYear();
            normalizedMonth = nextDay.getUTCMonth() + 1;
            normalizedDay = nextDay.getUTCDate();
            normalizedHour = 0;
        }

        const originalDateCheck = new Date(Date.UTC(year, month - 1, day));
        if (
            originalDateCheck.getUTCFullYear() !== year ||
            originalDateCheck.getUTCMonth() !== month - 1 ||
            originalDateCheck.getUTCDate() !== day
        ) {
            return null;
        }

        const localAsUtc = Date.UTC(
            normalizedYear,
            normalizedMonth - 1,
            normalizedDay,
            normalizedHour,
            minute
        );
        const validationDate = new Date(localAsUtc);

        if (
            validationDate.getUTCFullYear() !== normalizedYear ||
            validationDate.getUTCMonth() !== normalizedMonth - 1 ||
            validationDate.getUTCDate() !== normalizedDay ||
            validationDate.getUTCHours() !== normalizedHour ||
            validationDate.getUTCMinutes() !== minute
        ) {
            return null;
        }

        let timestamp = localAsUtc;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const formattedParts = Object.fromEntries(
                saoPauloFormatter.formatToParts(new Date(timestamp))
                .filter((part) => part.type !== "literal")
                .map((part) => [part.type, Number(part.value)])
            );
            const representedAsUtc = Date.UTC(
                formattedParts.year,
                formattedParts.month - 1,
                formattedParts.day,
                formattedParts.hour,
                formattedParts.minute,
                formattedParts.second
            );
            const adjustment = localAsUtc - representedAsUtc;
            timestamp += adjustment;
            if (adjustment === 0) break;
        }

        return { timestamp, date: normalizedDate, time: normalizedTime };
    }

    function durationHours(start, end) {
        return (end.timestamp - start.timestamp) / 3600000;
    }

    const api = { getTodayInSaoPaulo, isValidDateValue, wallTimeToTimestamp, durationHours };
    if (typeof module === "object" && module.exports) module.exports = api;
    else (root.Paredao = root.Paredao || {}).datetime = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
