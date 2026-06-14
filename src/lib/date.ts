const TAIPEI_TIME_ZONE = "Asia/Taipei";

export const getTaipeiNow = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: TAIPEI_TIME_ZONE }));

export const getTaipeiHour = () => {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone: TAIPEI_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date()).find((part) => part.type === "hour");

  return Number(hourPart?.value || 0);
};

export const getToday = () => {
  const taipeiNow = getTaipeiNow();
  const year = taipeiNow.getFullYear();
  const month = String(taipeiNow.getMonth() + 1).padStart(2, "0");
  const day = String(taipeiNow.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const getTaipeiWeekday = () => {
  const days = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return days[getTaipeiNow().getDay()];
};

export const getTaipeiShortWeekday = () => {
  const days = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  return days[getTaipeiNow().getDay()];
};
