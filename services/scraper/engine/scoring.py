"""NLP & TF-IDF similarity calculation, role domain classification, and job match evaluation."""

from __future__ import annotations

import hashlib
import math
import re
import threading
from collections import Counter
from typing import Any

from config.loader import load_profile
from config.rules import DEFAULT_SCORING_RULES
from engine.salary import extract_salary_from_context


def compile_terms_to_regex(terms: list[str]) -> list[str]:
    """Convert user-friendly terms/words into word-boundary regex patterns safely without ReDoS risk."""
    patterns = []
    for term in terms:
        clean = term.strip()
        if not clean:
            continue
        # If term already looks like a custom regex pattern, validate it before adopting
        if clean.startswith(r"\b") or "(?:" in clean or "[" in clean:
            try:
                re.compile(clean, re.IGNORECASE)
                patterns.append(clean)
                continue
            except re.error:
                # Malformed regex - fall back to safe word-boundary escaping
                pass

        words = clean.split()
        escaped_words = [re.escape(w.lower()) for w in words]
        pattern_body = r"\s+".join(escaped_words)
        patterns.append(rf"\b{pattern_body}\b")
    return patterns


def get_scoring_rules(profile: dict[str, Any]) -> dict[str, Any]:
    """
    Resolve the domain/seniority/disqualifier/weight rules to use for a profile.
    All rules, dealbreakers, and weights live on the Supabase user_profiles row.
    """
    rules = profile.get("scoring_rules")
    if isinstance(rules, dict) and rules:
        return {
            "negative_domains": rules.get("negative_domains") or DEFAULT_SCORING_RULES["negative_domains"],
            "positive_domains": rules.get("positive_domains") or DEFAULT_SCORING_RULES["positive_domains"],
            "seniority_tiers": rules.get("seniority_tiers") or DEFAULT_SCORING_RULES["seniority_tiers"],
            "disqualifiers": rules.get("disqualifiers")
            or rules.get("irish_language_patterns")
            or DEFAULT_SCORING_RULES.get("disqualifiers", []),
            "weights": rules.get("weights") or DEFAULT_SCORING_RULES.get("weights", {}),
        }
    return DEFAULT_SCORING_RULES


_EMBEDDING_MODEL: Any = None
_PROFILE_EMB_CACHE: dict[str, Any] = {}
_model_lock = threading.RLock()


def get_semantic_model() -> Any:
    """Lazy load SentenceTransformer singleton on Apple Silicon MPS (Metal) or CPU."""
    global _EMBEDDING_MODEL
    with _model_lock:
        if _EMBEDDING_MODEL is None:
            try:
                import torch
                from sentence_transformers import SentenceTransformer

                device = "mps" if torch.backends.mps.is_available() else "cpu"
                _EMBEDDING_MODEL = SentenceTransformer("all-MiniLM-L6-v2", device=device)
            except Exception as exc:
                print(f"  [AI ENGINE] Notice: Local SentenceTransformer unavailable ({exc}). Using TF-IDF fallback.")
                _EMBEDDING_MODEL = False
    return _EMBEDDING_MODEL


def tokenize_text(text: str) -> list[str]:
    """Extract alphanumeric words of length > 2."""
    return [w for w in re.findall(r"[a-z0-9]{2,}", text.lower()) if len(w) > 2]


def compute_tf_idf_similarity(text_a: str, text_b: str) -> float:
    """Compute cosine similarity between token frequencies of two documents."""
    tokens_a = tokenize_text(text_a)
    tokens_b = tokenize_text(text_b)
    if not tokens_a or not tokens_b:
        return 0.0

    counts_a = Counter(tokens_a)
    counts_b = Counter(tokens_b)

    all_tokens = set(counts_a.keys()) | set(counts_b.keys())
    dot_product = sum(counts_a.get(t, 0) * counts_b.get(t, 0) for t in all_tokens)
    mag_a = math.sqrt(sum(c * c for c in counts_a.values()))
    mag_b = math.sqrt(sum(c * c for c in counts_b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return min(1.0, dot_product / (mag_a * mag_b))


def compute_dense_semantic_similarity(text_a: str, text_b: str, text_a_key: str | None = None) -> float:
    """
    Compute dense vector cosine similarity using SentenceTransformers accelerated on Apple Metal (MPS).
    Caches candidate profile embeddings across jobs to ensure high-throughput local inference.
    """
    if not text_a or not text_b:
        return 0.0

    model = get_semantic_model()
    if not model:
        return compute_tf_idf_similarity(text_a, text_b)

    try:
        import torch

        with _model_lock:
            if text_a_key and text_a_key in _PROFILE_EMB_CACHE:
                emb_a = _PROFILE_EMB_CACHE[text_a_key]
            else:
                emb_a = model.encode(text_a, convert_to_tensor=True, show_progress_bar=False)
                if text_a_key:
                    _PROFILE_EMB_CACHE[text_a_key] = emb_a

            # Keep access to the shared model serialized across crawler threads.
            clean_target = text_b[:2500].strip()
            emb_b = model.encode(clean_target, convert_to_tensor=True, show_progress_bar=False)

        sim = float(torch.nn.functional.cosine_similarity(emb_a.unsqueeze(0), emb_b.unsqueeze(0)).item())
        return max(0.0, min(1.0, sim))
    except Exception:
        return compute_tf_idf_similarity(text_a, text_b)


def build_profile_document(profile: dict[str, Any]) -> str:
    """Construct dynamic NLP text corpus from candidate's profile fields."""
    parts = [
        profile.get("headline", ""),
        profile.get("current_role", ""),
        profile.get("title", ""),
        profile.get("summary", ""),
        " ".join(profile.get("keywords", []) or []),
        " ".join(profile.get("soft_skills", []) or []),
        " ".join(profile.get("tools_software", []) or []),
        " ".join(profile.get("languages", []) or []),
        profile.get("certifications", "") or "",
        profile.get("education", ""),
    ]
    doc = " ".join(p for p in parts if p).strip()
    return doc if doc else "Professional career experience"


def evaluate_job_ai(
    title: str,
    description: str = "",
    company: str = "",
    location: str = "",
    salary_text: str | None = None,
    employment_type: str = "",
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Score a job posting against a specific candidate profile based on:
    - User-defined weights and points from profile
    - Apple Metal (MPS) dense semantic vector similarity
    - Profile-defined disqualifiers / dealbreakers (no hardcoded language exclusion)
    - Work authorization alignment
    - User's preferred work mode (Remote / Hybrid / On-site)
    - Certifications, tools, and competencies
    - Seniority alignment and domain fit
    - Salary expectations (without imputed pay scales)
    """
    active_profile = profile if profile is not None else load_profile()
    min_salary = int(active_profile.get("minimum_salary", 50000))
    keywords = list(active_profile.get("keywords", []) or [])
    rules = get_scoring_rules(active_profile)

    # Dynamic Scoring Weights from Candidate Profile
    weights = rules.get("weights") or {}
    domain_max = float(weights.get("domain", 25))
    semantic_max = float(weights.get("semantic", 25))
    competency_max = float(weights.get("competency", 20))
    seniority_max = float(weights.get("seniority", 15))
    salary_max = float(weights.get("salary", 15))
    contract_max = float(weights.get("contract", 10))
    target_role_bonus = float(weights.get("target_role_bonus", 6))
    location_bonus = float(weights.get("location_bonus", 4))
    work_mode_bonus = float(weights.get("work_mode_bonus", 2))
    fixed_term_penalty = float(weights.get("fixed_term_penalty", 8))
    disqualification_cap = int(weights.get("disqualification_cap", 10))

    negative_domains = rules["negative_domains"]
    positive_domains = rules["positive_domains"]
    seniority_tiers = rules["seniority_tiers"]
    disqualifiers = rules.get("disqualifiers") or rules.get("irish_language_patterns") or []

    full_text = f"{title} {description}".lower()
    title_l = title.lower()

    alignments: list[str] = []
    mismatch_flags: list[str] = []

    # 1. Profile-defined Disqualifiers / Dealbreakers
    disqualifier_patterns = compile_terms_to_regex(disqualifiers)
    disqualification_detected = None
    for pat in disqualifier_patterns:
        m = re.search(pat, full_text, re.IGNORECASE)
        if m:
            disqualification_detected = m.group(0)
            mismatch_flags.append(
                f"Disqualification Dealbreaker: Role mentions '{disqualification_detected}', which is excluded in your profile preferences."
            )
            break

    # 2. Dynamic Dense Semantic Profile Similarity (Apple Silicon M4 Pro Metal GPU)
    candidate_doc = build_profile_document(active_profile)
    profile_key = hashlib.sha256(candidate_doc.encode("utf-8")).hexdigest()
    semantic_sim = compute_dense_semantic_similarity(candidate_doc, f"{title}\n{description}", text_a_key=profile_key)

    # 3. Check Negative Domains (skip penalizing if domain matches candidate's own background)
    candidate_profile_text = candidate_doc.lower()
    negative_domain_detected = None
    positive_title_patterns = [
        pos_pat
        for pos in positive_domains
        for pos_pat in compile_terms_to_regex(pos.get("keywords") or pos.get("patterns") or [])
    ]
    for domain in negative_domains:
        domain_name, reason = domain["name"], domain.get("reason", "Domain mismatch")
        raw_terms = domain.get("keywords") or domain.get("patterns") or []
        patterns = compile_terms_to_regex(raw_terms)

        if any(re.search(pat, candidate_profile_text) for pat in patterns):
            continue

        for pat in patterns:
            if re.search(pat, title_l) or (
                re.search(pat, full_text)
                and not any(re.search(pos_pat, title_l) for pos_pat in positive_title_patterns)
            ):
                negative_domain_detected = domain_name
                mismatch_flags.append(f"{domain_name}: {reason}")
                break
        if negative_domain_detected:
            break

    # 4. Check Positive Domains
    detected_domain = active_profile.get("headline") or active_profile.get("current_role") or "General"
    domain_score = 0.4
    if negative_domain_detected:
        detected_domain = negative_domain_detected
        domain_score = 0.05
    else:
        for domain in positive_domains:
            domain_name = domain.get("name") or "Target Domain"
            note = (domain.get("note") or "").strip() or f"Domain alignment: {domain_name}"
            raw_terms = domain.get("keywords") or domain.get("patterns") or []
            patterns = compile_terms_to_regex(raw_terms)
            match_found = False
            for pat in patterns:
                if re.search(pat, title_l):
                    detected_domain = domain_name
                    domain_score = 1.0
                    if note:
                        alignments.append(note)
                    match_found = True
                    break
                elif re.search(pat, full_text):
                    if domain_score < 0.8:
                        detected_domain = domain_name
                        domain_score = 0.8
                        if note:
                            alignments.append(note)
                    match_found = True
            if match_found and domain_score >= 1.0:
                break

    # 5. Seniority Evaluation
    seniority_tier = "Professional / Mid-Level"
    seniority_score = 0.75
    for tier in seniority_tiers:
        tier_name = (tier.get("name") or "").strip()
        score_weight = tier.get("score_weight", 1.0)
        tier_note = (tier.get("note") or "").strip()
        if not tier_note:
            if tier_name and tier_name != "Seniority Match":
                tier_note = f"Seniority alignment: title aligns with '{tier_name}'."
            else:
                tier_note = "Seniority alignment: title aligns with target experience tier."
        raw_terms = tier.get("keywords") or tier.get("patterns") or []
        patterns = compile_terms_to_regex(raw_terms)
        if any(re.search(pat, title_l) for pat in patterns):
            seniority_tier = tier_name or "Seniority Match"
            seniority_score = float(score_weight)
            if seniority_score >= 0.9 and not negative_domain_detected and not disqualification_detected:
                if tier_note:
                    alignments.append(tier_note)
            elif seniority_score <= 0.3:
                if tier_note:
                    mismatch_flags.append(f"Seniority notice: {tier_note}")
            break

    # 6. Salary & Compensation Evaluation (Advertised Only, No Imputation)
    effective_salary = salary_text or extract_salary_from_context(description, title)
    salary_fit = "Unadvertised / Market Competitive"
    salary_score = 0.75

    if effective_salary:
        digits = re.findall(r"\d[\d,]*", effective_salary)
        nums = []
        for d in digits:
            clean_num = int(d.replace(",", ""))
            if clean_num < 1000:
                clean_num *= 1000
            nums.append(clean_num)

        if nums:
            max_num = max(nums)
            min_num = min(nums)
            if min_num >= min_salary or max_num >= min_salary:
                salary_score = 1.0
                salary_fit = f"{effective_salary} (Meets €{min_salary // 1000}k+ Target)"
                if not negative_domain_detected and not disqualification_detected:
                    alignments.append(
                        f"Salary alignment: {effective_salary} satisfies your €{min_salary:,}+ benchmark."
                    )
            elif max_num < (min_salary * 0.8):
                salary_score = 0.3
                salary_fit = f"{effective_salary} (Below €{min_salary // 1000}k Target)"
                mismatch_flags.append(f"Compensation below target threshold: {effective_salary}")
            else:
                salary_score = 0.6
                salary_fit = f"{effective_salary} (Marginal Target)"

    # 7. Competency, Tools & Certifications Matching
    tools_software = list(active_profile.get("tools_software", []) or [])
    target_roles = list(active_profile.get("target_roles", []) or [])
    certifications_val = (active_profile.get("certifications") or "").strip()
    cert_terms = [c.strip() for c in re.split(r"[,;\n]+", certifications_val) if c.strip()]

    competency_terms = list(dict.fromkeys([*keywords, *tools_software, *cert_terms]))
    matched_skills = [term for term in competency_terms if re.search(rf"\b{re.escape(term.lower())}\b", full_text)]
    matched_target_roles = [role for role in target_roles if role.lower() in title_l]

    competency_ratio = (len(matched_skills) / len(competency_terms)) if competency_terms else 0.0
    competency_score = min(1.0, competency_ratio * 1.5)

    if not negative_domain_detected and not disqualification_detected:
        if matched_target_roles:
            alignments.append(f"Target role match: title aligns with '{matched_target_roles[0]}'.")
        if matched_skills:
            alignments.append(f"Core competencies & certifications identified: {', '.join(matched_skills[:4])}")

    # 8. Contract / Employment Type Evaluation
    comb_emp = f"{employment_type} {title} {description}".lower()
    is_permanent = any(kw in comb_emp for kw in ["permanent", "wholetime", "indefinite", "continuing", "tenured"])
    is_fixed_term = any(
        kw in comb_emp
        for kw in [
            "fixed term",
            "fixed-term",
            "temporary",
            "contract role",
            "maternity cover",
            "specified purpose",
            "internship",
            "intern",
            "casual",
        ]
    )

    contract_score = 0.85
    if is_permanent and not is_fixed_term:
        contract_score = 1.0
        if not negative_domain_detected and not disqualification_detected:
            alignments.append("Contract alignment: Permanent / Indefinite position matches candidate preference.")
    elif is_fixed_term:
        contract_score = 0.55
        mismatch_flags.append("Contract notice: Fixed-term / temporary appointment (Permanent preferred).")

    # 9. Location Preference Evaluation
    full_loc_text = f"{location} {title} {company} {description}".lower()
    user_locations = [loc.lower() for loc in (active_profile.get("target_locations") or []) if loc]
    primary_loc = (active_profile.get("location") or "").lower()
    if primary_loc:
        user_locations.append(primary_loc)

    # target_locations is priority-ordered: earlier entries score a larger share
    # of location_bonus (1.0, 0.8, 0.6, ... floor 0.4) so a candidate can express
    # "prefer Kildare over Dublin" rather than a flat match/no-match bonus.
    matched_loc_index = next((i for i, loc in enumerate(user_locations) if loc in full_loc_text), None)
    matched_user_loc = user_locations[matched_loc_index] if matched_loc_index is not None else None
    location_weight_factor = max(0.4, 1.0 - matched_loc_index * 0.2) if matched_loc_index is not None else 0.0

    # 10. Work Mode Preference Evaluation (Dynamic from Profile)
    user_work_mode = (active_profile.get("work_mode") or "").strip()
    user_modes = [m.strip().lower() for m in user_work_mode.split(",") if m.strip()]
    if not user_modes:
        user_modes = ["hybrid", "remote"]

    job_is_remote = any(k in full_loc_text for k in ["remote", "work from home", "wfh", "anywhere in ireland"])
    job_is_hybrid = any(k in full_loc_text for k in ["hybrid", "blended working", "flexible working", "days from home"])
    job_is_onsite = any(k in full_loc_text for k in ["on-site", "onsite", "office-based", "100% on site", "in-person"])

    matched_mode = None
    if job_is_remote and any("remote" in m for m in user_modes):
        matched_mode = "Remote"
    elif job_is_hybrid and any("hybrid" in m for m in user_modes):
        matched_mode = "Hybrid"
    elif job_is_onsite and any("on-site" in m or "onsite" in m for m in user_modes):
        matched_mode = "On-site"

    # 11. Work Authorization Evaluation (Dynamic from Profile)
    work_auth = (active_profile.get("work_authorization") or "").strip()
    auth_deduction = 0.0
    if work_auth:
        work_auth_l = work_auth.lower()
        has_right_to_work = any(
            k in work_auth_l for k in ["eu", "stamp 4", "stamp4", "uk", "citizen", "permanent resident", "eea"]
        )
        needs_sponsorship = any(k in work_auth_l for k in ["sponsor", "permit", "visa", "require"])

        job_blocks_sponsorship = any(
            kw in full_text
            for kw in [
                "no visa sponsorship",
                "sponsorship is not provided",
                "sponsorship not available",
                "cannot sponsor",
                "not eligible for visa sponsorship",
                "must hold stamp 4 or eu citizenship",
                "valid work permit required at time of application",
            ]
        )
        job_offers_sponsorship = any(
            kw in full_text
            for kw in [
                "visa sponsorship available",
                "sponsorship provided",
                "critical skills permit support",
                "willing to sponsor",
                "relocation and visa support",
            ]
        )

        if has_right_to_work:
            if job_blocks_sponsorship or "eligible to work in ireland" in full_text or "right to work" in full_text:
                if not negative_domain_detected and not disqualification_detected:
                    alignments.append(
                        f"Work authorization: Candidate's {work_auth} status satisfies employer right-to-work requirement."
                    )
        elif needs_sponsorship:
            if job_blocks_sponsorship:
                mismatch_flags.append(
                    "Visa Sponsorship Mismatch: Role specifies no sponsorship; candidate requires work authorization."
                )
                auth_deduction = 12.0
            elif job_offers_sponsorship:
                alignments.append("Work authorization: Employer offers visa sponsorship support.")

    if not negative_domain_detected and not disqualification_detected:
        if matched_user_loc:
            alignments.append(
                f"Location alignment: Matches candidate location preference ({matched_user_loc.title()})."
            )
        if matched_mode:
            alignments.append(f"Work mode alignment: {matched_mode} matches candidate preference ({user_work_mode}).")
        elif job_is_onsite and not any("on-site" in m or "onsite" in m for m in user_modes):
            mismatch_flags.append(f"Work mode notice: Role appears on-site; candidate prefers {user_work_mode}.")
        if semantic_sim >= 0.65:
            alignments.append(
                f"Dense AI semantic match ({round(semantic_sim * 100)}%): Role scope closely fits candidate background."
            )
        elif semantic_sim <= 0.22 and not matched_target_roles and not matched_skills:
            mismatch_flags.append(
                f"Low semantic relevance ({round(semantic_sim * 100)}%): Job focus diverges from candidate target profile."
            )

    # 12. Overall Composite Calculation with Custom User Profile Weights
    if negative_domain_detected:
        fit_score = int(max(0, min(15, round((semantic_sim * 20) + (domain_score * 10)))))
    else:
        raw_composite = (
            (domain_score * domain_max)
            + (semantic_sim * semantic_max)
            + (competency_score * competency_max)
            + (seniority_score * seniority_max)
            + (salary_score * salary_max)
            + (contract_score * contract_max)
        )
        if matched_target_roles:
            raw_composite += target_role_bonus
        if matched_user_loc:
            raw_composite += location_bonus * location_weight_factor
        if matched_mode:
            raw_composite += work_mode_bonus
        elif job_is_onsite and not any("on-site" in m or "onsite" in m for m in user_modes):
            raw_composite -= 4.0

        if is_fixed_term:
            raw_composite -= fixed_term_penalty

        raw_composite -= auth_deduction

        fit_score = int(max(0, min(100, round(raw_composite))))

    # Enforce profile dealbreaker / disqualifier cap
    if disqualification_detected:
        fit_score = min(fit_score, disqualification_cap)

    # Determine Fit Tier & AI Indicator
    score_emoji = "✨"
    if fit_score >= 75:
        fit_tier = "Strong Match"
    elif fit_score >= 55:
        fit_tier = "Good Match"
    elif fit_score >= 35:
        fit_tier = "Moderate Match"
    elif fit_score >= 15:
        fit_tier = "Low Match"
    else:
        fit_tier = "Mismatch"

    # Dynamic explanatory reasoning for the AI evaluation
    candidate_headline = active_profile.get("headline") or active_profile.get("current_role") or "candidate profile"
    if disqualification_detected:
        reasoning = (
            f"Score capped to {fit_score}% (Disqualified Dealbreaker): The role specifies '{disqualification_detected}', "
            f"which matches an excluded requirement in your candidate profile."
        )

    elif negative_domain_detected:
        reasoning = (
            f"Score penalized to {fit_score}% due to domain mismatch ({detected_domain}). "
            f"The opportunity requires specialized technical/field qualifications that diverge from "
            f"the candidate's {candidate_headline} expertise."
        )
    elif fit_score >= 75:
        reasoning = (
            f"High alignment ({fit_score}%): Strongly matches the target domain ({detected_domain}) and "
            f"seniority profile ({seniority_tier}). Evaluated against candidate's {candidate_headline} background, "
            f"competencies, and compensation target ({salary_fit})."
        )
    elif fit_score >= 55:
        reasoning = (
            f"Good alignment ({fit_score}%): Compatible role in {detected_domain} at "
            f"{seniority_tier} level with relevant overlap for {candidate_headline}."
        )
    else:
        reasoning = (
            f"Moderate/Low alignment ({fit_score}%): Role falls within {detected_domain} with limited "
            f"direct synergy with candidate's target profile."
        )

    sub_scores = {
        "domain": round(float(domain_score), 3),
        "semantic": round(float(semantic_sim), 3),
        "competency": round(float(competency_score), 3),
        "seniority": round(float(seniority_score), 3),
        "salary": round(float(salary_score), 3),
        "contract": round(float(contract_score), 3),
        "target_role": 1.0 if bool(matched_target_roles) else 0.0,
        "location": 1.0 if bool(matched_user_loc) else 0.0,
        "work_mode": 1.0 if bool(matched_mode) else 0.0,
        "onsite_penalty": 1.0
        if bool(job_is_onsite and not any("on-site" in m or "onsite" in m for m in user_modes))
        else 0.0,
        "fixed_term": 1.0 if bool(is_fixed_term) else 0.0,
        "auth_deduction": round(float(auth_deduction), 2),
        "negative_domain": 1.0 if bool(negative_domain_detected) else 0.0,
        "disqualified": 1.0 if bool(disqualification_detected) else 0.0,
    }

    clean_alignments = [a.strip() for a in alignments if isinstance(a, str) and a.strip()]
    clean_mismatch = [m.strip() for m in mismatch_flags if isinstance(m, str) and m.strip()]

    return {
        "fit_score": fit_score,
        "fit_tier": fit_tier,
        "score_emoji": score_emoji,
        "reasoning": reasoning,
        "role_domain": detected_domain,
        "seniority_level": seniority_tier,
        "salary_fit": salary_fit,
        "alignments": clean_alignments,
        "mismatch_flags": clean_mismatch,
        "matched_skills": matched_skills,
        "semantic_similarity": round(semantic_sim, 3),
        "sub_scores": sub_scores,
    }


def evaluate_match(title: str, description: str = "") -> tuple[int, list[str]]:
    """Legacy helper returning (fit_score, matched_skills)."""
    res = evaluate_job_ai(title=title, description=description)
    return res["fit_score"], res["matched_skills"]
