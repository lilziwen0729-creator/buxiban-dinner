export type SpecialOrder = { id: string; meal_id: string | null; cancelled: boolean; received: boolean; charged: boolean; special_meal: boolean };
export type SpecialStudent = { id: string; name: string; grade: string; active: boolean; absent: boolean; order: SpecialOrder | null };
export type SpecialDay = { meal_date: string; title: string; version: number };
export type SpecialRoster = { day: SpecialDay | null; students: SpecialStudent[] };
export type SpecialView = 'available' | 'ordered' | 'cancelled';
export type SpecialAction = 'save' | 'add' | 'cancel' | 'restore' | 'menu';
export const specialView = (student: SpecialStudent): SpecialView => !student.order ? 'available' : student.order.cancelled ? 'cancelled' : 'ordered';
export const canSelectSpecialStudent = (student: SpecialStudent, view: SpecialView) =>
  specialView(student) === view && !student.order?.charged && !student.order?.received && (view === 'ordered' || (student.active && !student.absent));
export const addMealDays = (date: string, count: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0,10);
};
export const nextMealSaturday = (date: string) => addMealDays(date,(6-new Date(`${date}T12:00:00Z`).getUTCDay()+7)%7);
