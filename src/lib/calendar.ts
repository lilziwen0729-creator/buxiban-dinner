type CalendarTask = {
  id: string;
  task_date: string;
  task_time: string;
  title: string;
  student_name?: string | null;
  grade?: string | null;
  note?: string | null;
};

const escapeIcsText = (value: string) => value
  .replace(/\\/g, "\\\\")
  .replace(/\n/g, "\\n")
  .replace(/,/g, "\\,")
  .replace(/;/g, "\\;");

const utcStamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export const downloadTaskCalendar = (task: CalendarTask, reminderMinutes = 30) => {
  const compactDate = task.task_date.replace(/-/g, "");
  const compactTime = task.task_time.slice(0, 5).replace(":", "") + "00";
  const student = task.student_name
    ? `${task.grade || "未分級"} · ${task.student_name}`
    : "未指定學生";
  const summary = `方華待辦：${task.title}`;
  const description = [
    `學生：${student}`,
    `事項：${task.title}`,
    task.note ? `備註：${task.note}` : "",
  ].filter(Boolean).join("\n");

  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Funwa Tuition Center//Admin Task//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${task.id}@funwa.tw`,
    `DTSTAMP:${utcStamp()}`,
    `DTSTART;TZID=Asia/Taipei:${compactDate}T${compactTime}`,
    "DURATION:PT30M",
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "BEGIN:VALARM",
    `TRIGGER:-PT${reminderMinutes}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `方華待辦_${task.task_date}_${task.task_time.slice(0, 5).replace(":", "")}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
