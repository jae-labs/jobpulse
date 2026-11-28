-- Synthetic literals, punctuation, repeated occurrences and score calibration.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE r record; subs jsonb := '{"sector":0.9,"semantic":0.9,"competency":0.9,"seniority":0.9,"salary":0.9,"contract":0.9}';
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('Google','Go',false),('maintain','AI',false),('build','UI',false),
  ('Go developer','Go',true),('Use AI and UI.','AI',true),('Use AI and UI.','UI',true),
  ('C++ developer','C++',true),('C# developer','C#',true),('.NET engineer','.NET',true),
  ('Node.js engineer','Node.js',true),('NodeXjs engineer','Node.js',false),
  ('C++Builder','C++',false),('ASP.NET engineer','.NET',false),('x_C#','C#',false),
  ('Google uses Go.','Go',true),('go_GO GO','Go',true),('déGo','Go',false),
  ('Machine Learning engineer','Machine Learning',true),('UI/UX engineer','UI/UX',true),
  ('[SQL] required','[SQL]',true),('a.*b required','a.*b',true),('anything','.*',false),
  (' Go ',' Go ',true),('anything',' ',false)
 ) AS cases(body,skill,expected)
 LOOP
  IF public.jobpulse_has_literal_skill(r.body,r.skill) IS DISTINCT FROM r.expected THEN
   RAISE EXCEPTION 'Literal skill regression: % / %',r.body,r.skill;
  END IF;
 END LOOP;
 IF public.score_from_subscores(subs,'{}')<>90 THEN RAISE EXCEPTION 'Default base weights do not total 100'; END IF;
 IF public.score_from_subscores(subs,'{"sector":25,"salary":15}')<>99 THEN RAISE EXCEPTION 'Custom weights were silently normalized'; END IF;
 IF public.score_from_subscores(subs || '{"target_role":1,"location":1,"work_mode":1}','{}')<>100 THEN RAISE EXCEPTION 'Bonuses exceeded score cap'; END IF;
 IF public.score_from_subscores(subs || '{"disqualified":1}','{}')<>10 THEN RAISE EXCEPTION 'Dealbreaker cap changed'; END IF;
END $$;
ROLLBACK;
