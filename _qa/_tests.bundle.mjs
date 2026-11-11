// _qa/vitest-shim.mjs
import assert from "node:assert/strict";
var suites = globalThis.__PD_TEST_SUITES__ ||= [];
var current = null;
function ensureSuite() {
  if (!current) {
    current = { name: "(root)", tests: [] };
    suites.push(current);
  }
  return current;
}
function describe(name, fn) {
  const parent = current;
  const suite = { name, tests: [] };
  suites.push(suite);
  current = suite;
  try {
    fn();
  } finally {
    current = parent;
  }
}
function it(name, fn) {
  ensureSuite().tests.push({ name, fn });
}
var fmt = (v) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
function expect(actual) {
  return {
    toBe: (expected) => assert.strictEqual(actual, expected),
    toEqual: (expected) => assert.deepStrictEqual(actual, expected),
    toHaveLength: (n) => assert.strictEqual(actual?.length, n, `\u671F\u671B\u957F\u5EA6 ${n}\uFF0C\u5B9E\u9645 ${fmt(actual)}`),
    toBeGreaterThan: (n) => assert.ok(actual > n, `\u671F\u671B ${fmt(actual)} > ${n}`),
    toBeGreaterThanOrEqual: (n) => assert.ok(actual >= n, `\u671F\u671B ${fmt(actual)} >= ${n}`),
    toBeLessThan: (n) => assert.ok(actual < n, `\u671F\u671B ${fmt(actual)} < ${n}`),
    toBeLessThanOrEqual: (n) => assert.ok(actual <= n, `\u671F\u671B ${fmt(actual)} <= ${n}`),
    toContain: (v) => assert.ok(actual?.includes?.(v), `\u671F\u671B ${fmt(actual)} \u542B ${fmt(v)}`),
    toBeTruthy: () => assert.ok(actual, `\u671F\u671B\u771F\u503C\uFF0C\u5B9E\u9645 ${fmt(actual)}`),
    toBeFalsy: () => assert.ok(!actual, `\u671F\u671B\u5047\u503C\uFF0C\u5B9E\u9645 ${fmt(actual)}`),
    toBeNull: () => assert.strictEqual(actual, null),
    toBeUndefined: () => assert.strictEqual(actual, void 0),
    toThrow: () => assert.throws(actual)
  };
}

// src/lib/dates.ts
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  getDay,
  parseISO,
  startOfWeek
} from "date-fns";
var toKey = (d) => format(d, "yyyy-MM-dd");
var fromKey = (k) => parseISO(k);
var shift = (k, n) => toKey(addDays(fromKey(k), n));
var weekStart = (k) => toKey(startOfWeek(fromKey(k), { weekStartsOn: 1 }));
var monthKey = (k) => k.slice(0, 7);
var monthFirst = (m) => `${m}-01`;
var shiftMonth = (m, n) => format(addMonths(parseISO(monthFirst(m)), n), "yyyy-MM");
var daysInMonth = (m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
var weekdayIndex = (k) => getDay(fromKey(k));
var mondayOffset = (k) => (weekdayIndex(k) + 6) % 7;
var md = (k) => {
  const d = fromKey(k);
  return `${d.getMonth() + 1}\u6708${d.getDate()}\u65E5`;
};
var rangeDays = (start, count) => Array.from({ length: count }, (_, i) => shift(start, i));
var monthDays = (m) => rangeDays(monthFirst(m), daysInMonth(m));
var dayKeyFromTimestamp = (ts) => toKey(new Date(ts));

// src/lib/dates.test.ts
describe("P2/P3 \xB7 \u65E5\u671F\u8FB9\u754C", () => {
  it("10a. \u5468\u8D77\u59CB\u4E3A\u5468\u4E00\uFF0C\u8DE8\u6708\u4E0E\u8DE8\u5E74\u6B63\u786E", () => {
    expect(weekStart("2026-11-10")).toBe("2026-11-09");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
    expect(rangeDays(weekStart("2026-11-10"), 7)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15"
    ]);
  });
  it("10b. \u6708\u89C6\u56FE\u5929\u6570\u4E0E\u81EA\u7136\u6708\u8FB9\u754C\uFF08\u542B\u95F0\u5E74\uFF09", () => {
    expect(daysInMonth("2026-11")).toBe(30);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-12")).toBe(31);
    const nov = monthDays("2026-11");
    expect(nov).toHaveLength(30);
    expect(nov[0]).toBe("2026-11-01");
    expect(nov[29]).toBe("2026-11-30");
    expect(monthFirst(monthKey("2026-11-30"))).toBe("2026-11-01");
  });
  it("10c. \u65E5/\u6708\u4F4D\u79FB\u8DE8\u6708\u8DE8\u5E74\u4E0D\u51FA\u9519", () => {
    expect(shift("2026-11-30", 1)).toBe("2026-12-01");
    expect(shift("2026-12-31", 1)).toBe("2027-01-01");
    expect(shift("2027-01-01", -1)).toBe("2026-12-31");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("10d. \u5B8C\u6210\u65F6\u95F4\u6309\u672C\u5730\u65E5\u5386\u65E5\u5F52\u5C5E\uFF0C\u4E0D\u4F2A\u9020\u5386\u53F2\u5B8C\u6210\u65E5", () => {
    expect(dayKeyFromTimestamp("2026-11-10T23:30:00.000Z")).toBe("2026-11-11");
    expect(dayKeyFromTimestamp("2026-11-10T01:00:00.000Z")).toBe("2026-11-10");
    expect(doneDateOf("2026-11-10T09:00:00+08:00")).toBe("2026-11-10");
  });
  it("\u5468\u4E00\u504F\u79FB\u4E0E\u4E2D\u6587\u65E5\u671F\u683C\u5F0F", () => {
    expect(mondayOffset("2026-11-09")).toBe(0);
    expect(mondayOffset("2026-11-15")).toBe(6);
    expect(md("2026-11-09")).toBe("11\u67089\u65E5");
  });
});
function doneDateOf(ts) {
  return dayKeyFromTimestamp(ts);
}

// src/lib/selectors.ts
var isDone = (t) => t.completedAt !== null;
var doneDate = (t) => t.completedAt ? dayKeyFromTimestamp(t.completedAt) : null;
var taskById = (snap, id) => id ? snap.tasks.find((t) => t.id === id) : void 0;
var carryoverTasks = (snap, today) => snap.tasks.filter(
  (t) => t.status === "open" && !isDone(t) && t.currentPlannedDate < today
);
var previousDatesOf = (snap, taskId) => new Set(
  snap.planHistory.filter((h) => h.taskId === taskId).map((h) => h.previousDate)
);
var planTasks = (snap, d) => snap.tasks.filter(
  (t) => t.currentPlannedDate === d || previousDatesOf(snap, t.id).has(d)
);
var planDone = (snap, d) => planTasks(snap, d).filter((t) => {
  const dd = doneDate(t);
  return dd !== null && dd <= d;
});
var plannedTasks = (snap, d) => snap.tasks.filter(
  (t) => t.currentPlannedDate === d || previousDatesOf(snap, t.id).has(d) || doneDate(t) === d
);
var doneOn = (snap, d) => snap.tasks.filter((t) => doneDate(t) === d);
var hasNote = (snap, d) => Boolean((snap.journals[d] || "").trim());
var hasRecord = (snap, d) => plannedTasks(snap, d).length > 0 || snap.activities.some((a) => a.date === d) || hasNote(snap, d);
var focusStatus = (snap, d, today) => {
  const t = taskById(snap, snap.focus[d]);
  if (!t) return "none";
  const dd = doneDate(t);
  if (dd !== null && dd <= d) return "done";
  if (dd !== null) return "late";
  return d >= today ? "now" : "open";
};
var reviewStats = (snap, days, today) => {
  const focusDays = days.filter((d) => Boolean(taskById(snap, snap.focus[d])));
  const denominator = focusDays.filter((d) => d <= today);
  const numerator = denominator.filter((d) => {
    const t = taskById(snap, snap.focus[d]);
    return Boolean(t) && doneDate(t) === d;
  });
  const past = days.filter((d) => d <= today);
  const cutoff = past[past.length - 1];
  const pastSet = new Set(past);
  const plannedSet = cutoff ? snap.tasks.filter(
    (t) => pastSet.has(t.currentPlannedDate) || snap.planHistory.some((h) => h.taskId === t.id && pastSet.has(h.previousDate))
  ) : [];
  const plannedCompleted = plannedSet.filter((t) => {
    const dd = doneDate(t);
    return dd !== null && cutoff !== void 0 && dd <= cutoff;
  });
  const actuallyCompleted = new Set(
    days.flatMap((d) => doneOn(snap, d).map((t) => t.id))
  ).size;
  return {
    focusDone: numerator.length,
    focusSet: denominator.length,
    plannedCompleted: plannedCompleted.length,
    plannedTotal: plannedSet.length,
    actuallyCompleted,
    cutoff,
    journalDays: days.filter((d) => hasNote(snap, d)).length,
    activityCount: snap.activities.filter((a) => days.includes(a.date)).length,
    recordDays: days.filter((d) => hasRecord(snap, d)).length
  };
};

// src/lib/types.ts
var emptySnapshot = () => ({
  tasks: [],
  planHistory: [],
  focus: {},
  activities: [],
  journals: {},
  weeklyPlans: {},
  weeklyReflections: {},
  monthlyGoals: [],
  monthlyReflections: {},
  quoteOffsets: {},
  quoteHidden: false
});

// src/lib/selectors.test.ts
var T = "2026-11-10";
var Y = "2026-11-09";
var OLD = "2026-11-03";
var FUT = "2026-11-20";
var STAMP_T = "2026-11-10T09:30:00.000Z";
var STAMP_Y = "2026-11-09T09:30:00.000Z";
function task(id, patch = {}) {
  return {
    id,
    title: `\u4EFB\u52A1 ${id}`,
    originalPlannedDate: Y,
    currentPlannedDate: Y,
    completedAt: null,
    status: "open",
    nextStep: "",
    createdAt: STAMP_Y,
    updatedAt: STAMP_Y,
    ...patch
  };
}
function withTasks(tasks, patch = {}) {
  return { ...emptySnapshot(), tasks, ...patch };
}
var focus = (d, taskId) => ({ focus: { [d]: taskId } });
describe("P2 \xB7 \u81EA\u52A8\u7ED3\u8F6C", () => {
  it("1. \u6628\u5929\u672A\u5B8C\u6210\u7684\u4EFB\u52A1\u4ECA\u5929\u81EA\u52A8\u7ED3\u8F6C\uFF0C\u4E14\u4E0D\u751F\u6210\u526F\u672C", () => {
    const snap = withTasks([task("t1")]);
    const car = carryoverTasks(snap, T);
    expect(car.map((t) => t.id)).toEqual(["t1"]);
    expect(snap.tasks).toHaveLength(1);
    expect(snap.tasks[0].id).toBe("t1");
  });
  it("2. \u8FDE\u7EED\u591A\u5929\u672A\u6253\u5F00\uFF0C\u4ECD\u7ED3\u8F6C\u4E14\u9996\u6B21\u8BA1\u5212\u65E5\u671F\u4FDD\u7559", () => {
    const snap = withTasks([task("t1", { originalPlannedDate: OLD, currentPlannedDate: OLD })]);
    expect(carryoverTasks(snap, T).map((t) => t.id)).toEqual(["t1"]);
    expect(snap.tasks[0].originalPlannedDate).toBe(OLD);
  });
  it("3. \u4E3B\u52A8\u6539\u671F\u5230\u672A\u6765\u4E0D\u63D0\u524D\u7ED3\u8F6C", () => {
    const snap = withTasks([task("t1", { currentPlannedDate: FUT })]);
    expect(carryoverTasks(snap, T)).toEqual([]);
  });
  it("4. \u5DF2\u5B8C\u6210\u4EFB\u52A1\u4E0D\u518D\u7ED3\u8F6C", () => {
    const snap = withTasks([task("t1", { completedAt: STAMP_Y })]);
    expect(carryoverTasks(snap, T)).toEqual([]);
  });
  it("5. \u6401\u7F6E\u4E0E\u53D6\u6D88\u7684\u4EFB\u52A1\u4E0D\u7ED3\u8F6C", () => {
    const snap = withTasks([
      task("parked", { status: "parked" }),
      task("cancelled", { status: "cancelled" })
    ]);
    expect(carryoverTasks(snap, T)).toEqual([]);
  });
  it("6/7. \u591A\u6B21\u6539\u671F\u53EA\u7559\u4E00\u4E2A ID\u3001\u9996\u6B21\u8BA1\u5212\u65E5\u671F\u4E0D\u53D8\uFF0C\u5386\u53F2\u5B89\u6392\u5168\u90E8\u4FDD\u7559", () => {
    const snap = withTasks(
      [task("t1", { originalPlannedDate: OLD, currentPlannedDate: FUT })],
      {
        planHistory: [
          { id: "h1", taskId: "t1", previousDate: OLD, newDate: Y, changedAt: STAMP_Y },
          { id: "h2", taskId: "t1", previousDate: Y, newDate: T, changedAt: STAMP_T },
          { id: "h3", taskId: "t1", previousDate: T, newDate: FUT, changedAt: STAMP_T }
        ]
      }
    );
    expect(snap.tasks).toHaveLength(1);
    expect(snap.tasks[0].originalPlannedDate).toBe(OLD);
    expect([...previousDatesOf(snap, "t1")].sort()).toEqual([OLD, T, Y].sort());
    expect(planTasks(snap, OLD).map((t) => t.id)).toEqual(["t1"]);
    expect(planTasks(snap, Y).map((t) => t.id)).toEqual(["t1"]);
    expect(carryoverTasks(snap, T)).toEqual([]);
  });
  it("8. \u5386\u53F2\u9996\u8981\u4EFB\u52A1\u5173\u7CFB\u4E0D\u56E0\u6539\u671F\u3001\u6401\u7F6E\u3001\u53D6\u6D88\u800C\u4E22\u5931", () => {
    const cancelled = task("t1", { status: "cancelled", currentPlannedDate: FUT });
    const snap = withTasks([cancelled], focus(Y, "t1"));
    expect(taskById(snap, snap.focus[Y])?.id).toBe("t1");
    expect(snap.focus[Y]).toBe("t1");
    expect(focusStatus(snap, Y, T)).toBe("open");
  });
  it("9. \u5728\u5386\u53F2\u65E5\u671F\u67E5\u770B\uFF1A\u4ECA\u5929\u5B8C\u6210\u4E0D\u4F1A\u5192\u5145\u5386\u53F2\u5F53\u5929\u5B8C\u6210", () => {
    const snap = withTasks([task("t1", { completedAt: STAMP_T })], focus(Y, "t1"));
    expect(doneDate(snap.tasks[0])).toBe(T);
    expect(focusStatus(snap, Y, T)).toBe("late");
    expect(planTasks(snap, Y).map((t) => t.id)).toEqual(["t1"]);
    expect(planDone(snap, Y)).toEqual([]);
  });
});
describe("P3 \xB7 \u56DE\u987E\u7EDF\u8BA1\u53E3\u5F84", () => {
  const days = ["2026-11-09", T, "2026-11-11"];
  it("\u4ECA\u5929\u5DF2\u8BBE\u7F6E\u4F46\u672A\u5B8C\u6210\u7684\u9996\u8981\u4EFB\u52A1\u8BA1\u5165\u5206\u6BCD\uFF0C\u4E0D\u8BA1\u5165\u5206\u5B50", () => {
    const snap = withTasks(
      [task("t1", { currentPlannedDate: T, originalPlannedDate: T })],
      focus(T, "t1")
    );
    const s = reviewStats(snap, days, T);
    expect(s.focusSet).toBe(1);
    expect(s.focusDone).toBe(0);
  });
  it("\u672A\u6765\u65E5\u671F\u7684\u9996\u8981\u4EFB\u52A1\u4E0D\u8FDB\u5165\u5DF2\u53D1\u751F\u7684\u5B8C\u6210\u7EDF\u8BA1", () => {
    const snap = withTasks(
      [task("t1", { currentPlannedDate: "2026-11-11" })],
      focus("2026-11-11", "t1")
    );
    const s = reviewStats(snap, days, T);
    expect(s.focusSet).toBe(0);
    expect(s.focusDone).toBe(0);
  });
  it("\u540E\u6765\u5B8C\u6210\u4E0D\u5192\u5145\u5F53\u5929\u5B8C\u6210\uFF1B\u5F53\u5929\u5B8C\u6210\u624D\u7B97\u5206\u5B50", () => {
    const late = withTasks(
      [task("late", { completedAt: STAMP_T })],
      focus(Y, "late")
    );
    expect(reviewStats(late, days, T).focusDone).toBe(0);
    const onTime = withTasks(
      [task("ok", { currentPlannedDate: T, completedAt: STAMP_T })],
      focus(T, "ok")
    );
    expect(reviewStats(onTime, days, T).focusDone).toBe(1);
  });
  it("\u66F4\u65E9\u5B8C\u6210\u4E5F\u4E0D\u5192\u5145\u300C\u5F53\u5929\u5B8C\u6210\u300D\uFF08\u6309\u771F\u5B9E\u5B8C\u6210\u65E5\u5F52\u5C5E\uFF09", () => {
    const early = withTasks(
      [task("early", { completedAt: STAMP_Y })],
      focus(T, "early")
    );
    expect(reviewStats(early, days, T).focusDone).toBe(0);
  });
  it("\u8BA1\u5212\u4EFB\u52A1\u6570\u4E0E\u5B9E\u9645\u5B8C\u6210\u6570\u5206\u522B\u8BA1\u7B97\uFF0C\u7ED3\u8F6C\u4EFB\u52A1\u4E0D\u91CD\u590D\u8BA1\u6570", () => {
    const snap = withTasks(
      [task("carry", { originalPlannedDate: OLD, currentPlannedDate: Y, completedAt: STAMP_T })],
      {
        planHistory: [
          { id: "h1", taskId: "carry", previousDate: OLD, newDate: Y, changedAt: STAMP_Y },
          { id: "h2", taskId: "carry", previousDate: Y, newDate: T, changedAt: STAMP_T }
        ]
      }
    );
    const s = reviewStats(snap, days, T);
    expect(s.plannedTotal).toBe(1);
    expect(s.actuallyCompleted).toBe(1);
    expect(s.plannedCompleted).toBe(1);
  });
  it("\u53D6\u6D88\u4EFB\u52A1\u4ECD\u4FDD\u7559\u5728\u5386\u53F2\u8BA1\u5212\u4E8B\u5B9E\u4E2D\uFF08\u4E0D\u62B9\u9664\uFF09", () => {
    const snap = withTasks([task("t1", { status: "cancelled" })]);
    expect(plannedTasks(snap, Y).map((t) => t.id)).toEqual(["t1"]);
  });
  it("\u611F\u60F3\u4E0E\u6D3B\u52A8\u6309\u539F\u6587\u65E5\u671F\u7EDF\u8BA1", () => {
    const snap = withTasks([], {
      journals: { [Y]: "\u6628\u5929\u7684\u611F\u60F3", [T]: "\u4ECA\u5929\u7684\u611F\u60F3" },
      activities: [
        { id: "a1", date: Y, content: "\u6D3B\u52A8", createdAt: STAMP_Y, updatedAt: STAMP_Y }
      ]
    });
    const s = reviewStats(snap, days, T);
    expect(s.journalDays).toBe(2);
    expect(s.activityCount).toBe(1);
    expect(s.recordDays).toBeGreaterThanOrEqual(2);
  });
});
