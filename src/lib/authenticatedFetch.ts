import { supabase } from "@/lib/supabase";

export const authenticatedFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error || !accessToken) {
    throw new Error("登入狀態已失效，請重新登入");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(input, { ...init, headers });
};
