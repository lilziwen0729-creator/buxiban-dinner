import { supabase } from "@/lib/supabase";

type TemplateVariables = Record<string, unknown>;

const stringifyValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

export const renderNotificationTemplate = async (
  notificationType: string,
  fallbackMessage: string,
  variables: TemplateVariables = {}
) => {
  try {
    const { data, error } = await supabase
      .from("notification_templates")
      .select("body, is_active")
      .eq("notification_type", notificationType)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data?.body) return fallbackMessage;

    return data.body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match: string, key: string) => {
      const value = key.split(".").reduce<unknown>((current, part) => {
        if (current && typeof current === "object" && part in current) {
          return (current as Record<string, unknown>)[part];
        }
        return undefined;
      }, variables);

      return stringifyValue(value);
    });
  } catch {
    return fallbackMessage;
  }
};

export const isNotificationEnabled = async (notificationType: string) => {
  try {
    const { data, error } = await supabase
      .from("notification_templates")
      .select("is_active")
      .eq("notification_type", notificationType)
      .maybeSingle();

    if (error) return true;
    if (!data) return true;
    return data.is_active !== false;
  } catch {
    return true;
  }
};
