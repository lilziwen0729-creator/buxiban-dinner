import { supabase } from "@/lib/supabase";

type AutomationRunInput = {
  jobName: "generate_orders" | "settle_orders";
  runDate: string;
  status: "success" | "skipped" | "failed" | "partial";
  total?: number;
  successCount?: number;
  skippedCount?: number;
  failedCount?: number;
  message?: string;
  metadata?: Record<string, unknown>;
};

export const logAutomationRun = async ({
  jobName,
  runDate,
  status,
  total = 0,
  successCount = 0,
  skippedCount = 0,
  failedCount = 0,
  message,
  metadata = {},
}: AutomationRunInput) => {
  try {
    const { error } = await supabase.from("automation_runs").insert([{
      job_name: jobName,
      run_date: runDate,
      status,
      total,
      success_count: successCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      message: message || null,
      metadata,
    }]);

    if (error) {
      console.warn("排程紀錄寫入失敗:", error.message);
    }
  } catch (err) {
    console.warn("排程紀錄寫入失敗:", err);
  }
};
