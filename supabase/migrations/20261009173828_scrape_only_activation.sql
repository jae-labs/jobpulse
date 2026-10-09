-- Only fenced source publication confirms active availability.
UPDATE public.jobs SET availability_status='unverified',availability_checked_at=NULL,availability_evidence=NULL
 WHERE availability_status='active' AND availability_evidence IS DISTINCT FROM 'published_listing';
ALTER TABLE public.jobs ADD CONSTRAINT jobs_scraped_activation_check CHECK(
 availability_status<>'active' OR availability_evidence IS NOT DISTINCT FROM 'published_listing');

CREATE OR REPLACE FUNCTION public.record_job_availability(p_job_id bigint,p_expected_url text,p_expected_title text,
 p_status text,p_evidence text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_job public.jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF NOT ((p_status='closed' AND p_evidence IN ('explicit_closure','published_expiry'))
  OR (p_status='unverified' AND p_evidence IN ('acquisition_failed','identity_unconfirmed','no_posting_evidence','redirected','deadline_exceeded')))
  OR p_status IS NULL OR p_evidence IS NULL THEN
  RAISE EXCEPTION 'Invalid availability evidence' USING ERRCODE='22023';
 END IF;
 SELECT * INTO current_job FROM public.jobs WHERE id=p_job_id AND url=p_expected_url
  AND title=p_expected_title FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 -- A failed request cannot erase explicit closure evidence.
 IF current_job.availability_status='closed' AND p_status='unverified' THEN RETURN false; END IF;
 UPDATE public.jobs SET availability_status=p_status,availability_checked_at=now(),availability_evidence=p_evidence,
  closed_at=CASE WHEN p_status='closed' THEN coalesce(closed_at,now())
   ELSE closed_at END WHERE id=p_job_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_job_availability(bigint,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_job_availability(bigint,text,text,text,text) TO service_role;

