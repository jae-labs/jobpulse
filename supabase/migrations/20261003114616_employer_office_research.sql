-- Public company places are separate from vacancy workplace evidence.
CREATE TABLE public.employer_offices (
 employer_id bigint NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
 place_id text NOT NULL,
 name text NOT NULL,
 address text NOT NULL,
 city text,
 country_code text,
 latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
 website text,
 website_domain text,
 categories jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(categories)='array'),
 source text NOT NULL DEFAULT 'Geoapify / OpenStreetMap contributors',
 checked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (employer_id,place_id)
);
COMMENT ON TABLE public.employer_offices IS 'Named company-place discovery, not proof that a vacancy is at this office. Categories are classification evidence, not a verified employer sector.';
ALTER TABLE public.employer_offices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employer_offices FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.employer_offices TO authenticated;
GRANT ALL ON public.employer_offices TO service_role;
CREATE POLICY authorized_office_read ON public.employer_offices FOR SELECT TO authenticated
 USING ((SELECT public.is_authorized_user()));

CREATE TABLE public.employer_office_lookups (
 employer_id bigint NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
 employer_name text NOT NULL,
 location text NOT NULL CHECK (length(location) BETWEEN 1 AND 500),
 status text NOT NULL CHECK (status IN ('found','unresolved','ambiguous','remote','provider_failed')),
 checked_at timestamptz NOT NULL DEFAULT now(),
 retry_after timestamptz NOT NULL,
 PRIMARY KEY (employer_id,location)
);
ALTER TABLE public.employer_office_lookups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employer_office_lookups FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.employer_office_lookups TO service_role;

CREATE FUNCTION public.pending_employer_office_lookups(p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid lookup limit' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
  SELECT e.id AS employer_id,e.name,e.website,j.location
  FROM public.jobs j JOIN public.employers e ON e.id=j.employer_id
  LEFT JOIN public.employer_office_lookups l ON l.employer_id=e.id AND l.location=j.location
  WHERE length(trim(j.location)) BETWEEN 1 AND 500
   AND (l.employer_id IS NULL OR l.employer_name IS DISTINCT FROM e.name OR l.retry_after<=now())
  GROUP BY e.id,e.name,e.website,j.location
  ORDER BY min(l.retry_after) NULLS FIRST,e.id,j.location LIMIT p_limit
 ) r),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.pending_employer_office_lookups(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pending_employer_office_lookups(integer) TO service_role;

CREATE FUNCTION public.save_employer_office_lookup(p_record jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jsonb; eid bigint; outcome text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 eid:=(p_record->>'employer_id')::bigint; outcome:=p_record->>'status';
 IF jsonb_typeof(p_record) IS DISTINCT FROM 'object' OR outcome IS NULL
  OR outcome NOT IN ('found','unresolved','ambiguous','remote','provider_failed')
  OR jsonb_typeof(p_record->'offices') IS DISTINCT FROM 'array' OR jsonb_array_length(p_record->'offices')>20
  OR length(coalesce(p_record->>'location','')) NOT BETWEEN 1 AND 500
  OR (outcome<>'found' AND jsonb_array_length(p_record->'offices')<>0)
  OR (outcome='found' AND jsonb_array_length(p_record->'offices')=0)
 THEN RAISE EXCEPTION 'Invalid office lookup' USING ERRCODE='22023'; END IF;
 -- Lock identity while saving: a renamed or unlinked company cannot inherit a stale result.
 PERFORM 1 FROM public.employers e WHERE e.id=eid AND e.name=p_record->>'name' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.jobs WHERE employer_id=eid AND location=p_record->>'location') THEN RETURN false; END IF;
 FOR o IN SELECT value FROM jsonb_array_elements(p_record->'offices') LOOP
  IF length(coalesce(o->>'place_id','')) NOT BETWEEN 1 AND 500 OR length(coalesce(o->>'address','')) NOT BETWEEN 1 AND 1000
   OR length(coalesce(o->>'name','')) NOT BETWEEN 1 AND 500
   OR jsonb_typeof(o->'latitude') IS DISTINCT FROM 'number' OR jsonb_typeof(o->'longitude') IS DISTINCT FROM 'number'
   OR NOT ((o->>'latitude')::numeric BETWEEN -90 AND 90) OR NOT ((o->>'longitude')::numeric BETWEEN -180 AND 180)
   OR jsonb_typeof(o->'categories') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'Invalid company place' USING ERRCODE='22023'; END IF;
  INSERT INTO public.employer_offices(employer_id,place_id,name,address,city,country_code,latitude,longitude,website,website_domain,categories)
  VALUES(eid,o->>'place_id',o->>'name',o->>'address',o->>'city',o->>'country_code',(o->>'latitude')::float8,(o->>'longitude')::float8,o->>'website',o->>'website_domain',o->'categories')
  ON CONFLICT (employer_id,place_id) DO UPDATE SET
   address=excluded.address,city=excluded.city,country_code=excluded.country_code,
   latitude=excluded.latitude,longitude=excluded.longitude,
   website=coalesce(excluded.website,public.employer_offices.website),
   website_domain=coalesce(excluded.website_domain,public.employer_offices.website_domain),
   categories=excluded.categories,checked_at=now();
 END LOOP;
 INSERT INTO public.employer_office_lookups(employer_id,employer_name,location,status,retry_after)
 VALUES(eid,p_record->>'name',p_record->>'location',outcome,
  now()+CASE outcome WHEN 'found' THEN interval '180 days' WHEN 'provider_failed' THEN interval '1 day' ELSE interval '30 days' END)
 ON CONFLICT (employer_id,location) DO UPDATE SET employer_name=excluded.employer_name,status=excluded.status,checked_at=now(),retry_after=excluded.retry_after;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.save_employer_office_lookup(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_employer_office_lookup(jsonb) TO service_role;
