const test = require("node:test");
const assert = require("node:assert/strict");
const datetime = require("../src/lib/datetime.js");

const hoursBetween = (a, b, c, d) =>
    datetime.durationHours(datetime.wallTimeToTimestamp(a, b), datetime.wallTimeToTimestamp(c, d, true));

test("short event: 2 hours", () => assert.equal(hoursBetween("2027-03-20", "20:00", "2027-03-20", "22:00"), 2));
test("long event: 13.5 hours", () => assert.equal(hoursBetween("2027-03-20", "10:00", "2027-03-20", "23:30"), 13.5));
test("event crossing midnight: 22:00 -> 03:30", () => assert.equal(hoursBetween("2027-03-20", "22:00", "2027-03-21", "03:30"), 5.5));
test("24:00 is accepted as the end of the day", () => {
    const end = datetime.wallTimeToTimestamp("2027-03-20", "24:00", true);
    assert.equal(end.date, "2027-03-21");
    assert.equal(end.time, "00:00");
    assert.equal(hoursBetween("2027-03-20", "20:00", "2027-03-20", "24:00"), 4);
});
test("end before start gives a negative duration", () => {
    assert.ok(hoursBetween("2027-03-20", "22:00", "2027-03-20", "21:00") < 0);
});
test("São Paulo time is UTC-3", () => {
    assert.equal(datetime.wallTimeToTimestamp("2027-03-20", "21:00").timestamp, Date.UTC(2027, 2, 21, 0, 0));
});
test("invalid input returns null", () => {
    assert.equal(datetime.wallTimeToTimestamp("2027-02-30", "10:00"), null);
    assert.equal(datetime.wallTimeToTimestamp("2027-03-20", "25:00"), null);
    assert.equal(datetime.wallTimeToTimestamp("2027-03-20", "24:00"), null); // only valid as an end time
    assert.equal(datetime.wallTimeToTimestamp("2027-03-20", "9:00"), null);
    assert.equal(datetime.isValidDateValue("2027-13-01"), false);
});
test("today in São Paulo", () => {
    assert.equal(datetime.getTodayInSaoPaulo(new Date("2027-03-21T02:59:00Z")), "2027-03-20");
    assert.equal(datetime.getTodayInSaoPaulo(new Date("2027-03-21T03:00:00Z")), "2027-03-21");
});
