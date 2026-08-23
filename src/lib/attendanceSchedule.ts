export type AttendanceScheduleMode = "all" | "attend" | "absent";

export type AttendanceScheduleStudent = {
  attendance_schedule_mode?: AttendanceScheduleMode | string | null;
  attendance_schedule_days?: Array<number | string> | null;
};

export const attendanceWeekdays = [
  { value: 1, label: "週一", shortLabel: "一" },
  { value: 2, label: "週二", shortLabel: "二" },
  { value: 3, label: "週三", shortLabel: "三" },
  { value: 4, label: "週四", shortLabel: "四" },
  { value: 5, label: "週五", shortLabel: "五" },
  { value: 6, label: "週六", shortLabel: "六" },
  { value: 7, label: "週日", shortLabel: "日" },
] as const;

export const normalizeAttendanceDays = (days?: Array<number | string> | null) =>
  Array.from(new Set((days || [])
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)))
    .sort((a, b) => a - b);

export const normalizeAttendanceScheduleMode = (mode?: string | null): AttendanceScheduleMode =>
  mode === "attend" || mode === "absent" ? mode : "all";

export const isStudentExpectedOnWeekday = (student: AttendanceScheduleStudent, weekday: number) => {
  const mode = normalizeAttendanceScheduleMode(student.attendance_schedule_mode);
  const days = normalizeAttendanceDays(student.attendance_schedule_days);

  // An incomplete rule should never silently remove a student from attendance.
  if (mode === "all" || days.length === 0) return true;
  if (mode === "attend") return days.includes(weekday);
  return !days.includes(weekday);
};

export const getWeekdayFromDateString = (date: string) => {
  const day = new Date(`${date.slice(0, 10)}T00:00:00+08:00`).getDay();
  return day === 0 ? 7 : day;
};

export const isStudentExpectedOnDate = (student: AttendanceScheduleStudent, date: string) =>
  isStudentExpectedOnWeekday(student, getWeekdayFromDateString(date));

export const getAttendanceScheduleLabel = (student: AttendanceScheduleStudent) => {
  const mode = normalizeAttendanceScheduleMode(student.attendance_schedule_mode);
  const days = normalizeAttendanceDays(student.attendance_schedule_days);
  if (mode === "all" || days.length === 0) return null;

  const labels = attendanceWeekdays
    .filter((weekday) => days.includes(weekday.value))
    .map((weekday) => weekday.label)
    .join("、");

  return `${mode === "attend" ? "固定到" : "固定不到"}：${labels}`;
};
