alter table public.exam_scores
  add column if not exists score_1_subject text,
  add column if not exists score_1_scope text,
  add column if not exists score_2_subject text,
  add column if not exists score_2_scope text;
