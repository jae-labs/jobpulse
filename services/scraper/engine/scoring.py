"""Batch semantic embeddings, token-frequency fallback, and deterministic candidate scoring."""

from __future__ import annotations

import math
import re
import threading
from collections import Counter, OrderedDict
from dataclasses import dataclass
from typing import Any

from config.rules import DEFAULT_SCORING_RULES


def compile_terms_to_regex(terms: list[str]) -> list[str]:
    """Escape plain matching terms; validate explicitly supplied regex patterns."""
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
    raw = profile.get("scoring_rules")
    rules = raw if isinstance(raw, dict) else {}
    resolved = {}
    for key in ("positive_domains", "negative_domains", "seniority_tiers", "disqualifiers"):
        value = rules.get(key)
        resolved[key] = value if isinstance(value, list) else DEFAULT_SCORING_RULES[key]
    weights = rules.get("weights")
    resolved["weights"] = {
        **DEFAULT_SCORING_RULES["weights"],
        **(weights if isinstance(weights, dict) else {}),
    }
    return resolved


_EMBEDDING_MODEL: Any = None
_DOCUMENT_EMB_CACHE: OrderedDict[str, list[float]] = OrderedDict()
_DOCUMENT_CACHE_LIMIT = 4096
_model_lock = threading.RLock()
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
# Bump when changing the model or the text preprocessing/encoding contract.
EMBEDDING_MODEL_VERSION = "all-MiniLM-L6-v2:384:v1"


def get_semantic_model() -> Any:
    """Lazy load SentenceTransformer singleton on Apple Silicon MPS (Metal) or CPU."""
    global _EMBEDDING_MODEL
    with _model_lock:
        if _EMBEDDING_MODEL is None:
            try:
                import torch
                from sentence_transformers import SentenceTransformer

                device = "mps" if torch.backends.mps.is_available() else "cpu"
                _EMBEDDING_MODEL = SentenceTransformer(EMBEDDING_MODEL_NAME, device=device)
            except Exception as exc:
                print(
                    f"  [AI ENGINE] Notice: Local SentenceTransformer unavailable ({exc}). Using token-frequency fallback."
                )
                _EMBEDDING_MODEL = False
    return _EMBEDDING_MODEL


def tokenize_text(text: str) -> list[str]:
    """Extract alphanumeric words of length > 2."""
    return [w for w in re.findall(r"[a-z0-9]{2,}", text.lower()) if len(w) > 2]


def compute_token_frequency_similarity(text_a: str, text_b: str) -> float:
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


def build_profile_document(profile: dict[str, Any]) -> str:
    """Construct dynamic NLP text corpus from candidate's profile fields."""
    parts = [
        profile.get("headline", ""),
        profile.get("current_role", ""),
        profile.get("summary", ""),
        " ".join(profile.get("keywords", []) or []),
        " ".join(profile.get("tools_software", []) or []),
        " ".join(profile.get("languages", []) or []),
        profile.get("certifications", "") or "",
        profile.get("education", ""),
    ]
    doc = " ".join(p for p in parts if p).strip()
    return doc if doc else "Professional career experience"


def build_job_document(job: dict[str, Any]) -> str:
    """Preserve the existing semantic scorer's title/description preprocessing."""
    return f"{job.get('title', '')}\n{job.get('description', '')}"[:2500].strip()


def encode_documents(documents: list[str]) -> list[list[float]] | None:
    """Encode each distinct document once in batches; never persist fallback vectors."""
    if not documents:
        return []
    with _model_lock:
        missing = list(dict.fromkeys(document for document in documents if document not in _DOCUMENT_EMB_CACHE))
        generated = {}
        if missing:
            model = get_semantic_model()
            if not model:
                return None
            try:
                vectors = model.encode(
                    missing,
                    batch_size=32,
                    normalize_embeddings=True,
                    convert_to_numpy=True,
                    show_progress_bar=False,
                )
                result = vectors.tolist()
                if len(result) != len(missing) or any(
                    len(vector) != 384
                    or not all(math.isfinite(value) for value in vector)
                    or not any(value != 0 for value in vector)
                    for vector in result
                ):
                    raise ValueError("Invalid embedding output")
                generated = dict(zip(missing, result, strict=True))
            except Exception:
                print("  [AI ENGINE] Batch encoding unavailable. Using token-frequency fallback for missing vectors.")
                return None
        output = [
            generated[document] if document in generated else _DOCUMENT_EMB_CACHE[document] for document in documents
        ]
        for document, vector in zip(documents, output, strict=True):
            _DOCUMENT_EMB_CACHE[document] = vector
            _DOCUMENT_EMB_CACHE.move_to_end(document)
        while len(_DOCUMENT_EMB_CACHE) > _DOCUMENT_CACHE_LIMIT:
            _DOCUMENT_EMB_CACHE.popitem(last=False)
        return output


@dataclass(frozen=True)
class PreparedScoringProfile:
    """Candidate inputs compiled once and reused across a catalog scoring run."""

    profile: dict[str, Any]
    document: str
    rules: dict[str, Any]
    disqualifiers: tuple[re.Pattern[str], ...]
    positive_domains: tuple[tuple[dict[str, Any], tuple[re.Pattern[str], ...]], ...]
    negative_domains: tuple[tuple[dict[str, Any], tuple[re.Pattern[str], ...]], ...]
    seniority_tiers: tuple[tuple[dict[str, Any], tuple[re.Pattern[str], ...]], ...]
    competencies: tuple[tuple[str, re.Pattern[str]], ...]
    target_roles: tuple[str, ...]
    locations: tuple[str, ...]
    work_modes: tuple[str, ...]


def prepare_scoring_profile(profile: dict[str, Any]) -> PreparedScoringProfile:
    """Preserve matching order and regex flags while preparing reusable candidate rules."""
    rules = get_scoring_rules(profile)

    def domains(key: str) -> tuple[tuple[dict[str, Any], tuple[re.Pattern[str], ...]], ...]:
        return tuple(
            (domain, tuple(re.compile(pattern) for pattern in compile_terms_to_regex(domain.get("keywords") or [])))
            for domain in rules[key]
        )

    certifications = (profile.get("certifications") or "").strip()
    certificate_terms = [term.strip() for term in re.split(r"[,;\n]+", certifications) if term.strip()]
    competencies = dict.fromkeys(
        [*(profile.get("keywords") or []), *(profile.get("tools_software") or []), *certificate_terms]
    )
    locations = [loc.lower() for loc in (profile.get("target_locations") or []) if loc]
    if profile.get("location"):
        locations.append(profile["location"].lower())
    work_modes = [mode.strip().lower() for mode in (profile.get("work_mode") or "").strip().split(",") if mode.strip()]
    return PreparedScoringProfile(
        profile=profile,
        document=build_profile_document(profile),
        rules=rules,
        disqualifiers=tuple(
            re.compile(pattern, re.IGNORECASE) for pattern in compile_terms_to_regex(rules["disqualifiers"])
        ),
        positive_domains=domains("positive_domains"),
        negative_domains=domains("negative_domains"),
        seniority_tiers=domains("seniority_tiers"),
        competencies=tuple((term, re.compile(rf"\b{re.escape(term.lower())}\b")) for term in competencies),
        target_roles=tuple(profile.get("target_roles") or []),
        locations=tuple(locations),
        work_modes=tuple(work_modes or ["hybrid", "remote"]),
    )


def evaluate_job(
    title: str,
    description: str = "",
    company: str = "",
    location: str = "",
    salary_text: str | None = None,
    employment_type: str = "",
    *,
    salary_min_amount: float | None = None,
    salary_max_amount: float | None = None,
    salary_currency: str | None = None,
    salary_period: str | None = None,
    profile: dict[str, Any] | PreparedScoringProfile,
    semantic_similarity: float,
) -> dict[str, Any]:
    """
    Score a job posting against a specific candidate profile based on:
    - User-defined weights and points from profile
    - Precomputed exact semantic similarity (pgvector or token-frequency fallback)
    - Profile-defined disqualifiers / dealbreakers (no hardcoded language exclusion)
    - Work authorization alignment
    - User's preferred work mode (Remote / Hybrid / On-site)
    - Certifications, tools, and competencies
    - Seniority alignment and domain fit
    - Salary expectations (without imputed pay scales)
    """
    prepared = profile if isinstance(profile, PreparedScoringProfile) else prepare_scoring_profile(profile)
    active_profile = prepared.profile
    min_salary = int(active_profile.get("salary_min") if active_profile.get("salary_min") is not None else 50000)
    rules = prepared.rules

    # Dynamic Scoring Weights from Candidate Profile
    weights = rules["weights"]
    domain_max = float(weights["domain"])
    semantic_max = float(weights["semantic"])
    competency_max = float(weights["competency"])
    seniority_max = float(weights["seniority"])
    salary_max = float(weights["salary"])
    contract_max = float(weights["contract"])
    target_role_bonus = float(weights["target_role_bonus"])
    location_bonus = float(weights["location_bonus"])
    work_mode_bonus = float(weights["work_mode_bonus"])
    fixed_term_penalty = float(weights["fixed_term_penalty"])
    disqualification_cap = int(weights["disqualification_cap"])

    negative_domains = prepared.negative_domains
    positive_domains = prepared.positive_domains
    seniority_tiers = prepared.seniority_tiers

    full_text = f"{title} {description}".lower()
    title_l = title.lower()

    alignments: list[str] = []
    mismatch_flags: list[str] = []

    # 1. Profile-defined Disqualifiers / Dealbreakers
    disqualifier_patterns = prepared.disqualifiers
    disqualification_detected = None
    for pat in disqualifier_patterns:
        m = pat.search(full_text)
        if m:
            disqualification_detected = m.group(0)
            mismatch_flags.append(
                f"Disqualification Dealbreaker: Role mentions '{disqualification_detected}', which is excluded in your profile preferences."
            )
            break

    # 2. Precomputed exact semantic similarity
    candidate_doc = prepared.document
    semantic_sim = max(0.0, min(1.0, semantic_similarity))

    # 3. Check Negative Domains (skip penalizing if domain matches candidate's own background)
    candidate_profile_text = candidate_doc.lower()
    negative_domain_detected = None
    positive_title_patterns = [pos_pat for _, patterns in positive_domains for pos_pat in patterns]
    for domain, patterns in negative_domains:
        domain_name, reason = domain["name"], domain.get("reason", "Domain mismatch")

        if any(pat.search(candidate_profile_text) for pat in patterns):
            continue

        for pat in patterns:
            if pat.search(title_l) or (
                pat.search(full_text) and not any(pos_pat.search(title_l) for pos_pat in positive_title_patterns)
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
        for domain, patterns in positive_domains:
            domain_name = domain.get("name") or "Target Domain"
            note = (domain.get("note") or "").strip() or f"Domain alignment: {domain_name}"
            match_found = False
            for pat in patterns:
                if pat.search(title_l):
                    detected_domain = domain_name
                    domain_score = 1.0
                    if note:
                        alignments.append(note)
                    match_found = True
                    break
                elif pat.search(full_text):
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
    for tier, patterns in seniority_tiers:
        tier_name = (tier.get("name") or "").strip()
        score_weight = tier.get("score_weight", 1.0)
        tier_note = (tier.get("note") or "").strip()
        if not tier_note:
            if tier_name and tier_name != "Seniority Match":
                tier_note = f"Seniority alignment: title aligns with '{tier_name}'."
            else:
                tier_note = "Seniority alignment: title aligns with target experience tier."
        if any(pat.search(title_l) for pat in patterns):
            seniority_tier = tier_name or "Seniority Match"
            seniority_score = float(score_weight)
            if seniority_score >= 0.9 and not negative_domain_detected and not disqualification_detected:
                if tier_note:
                    alignments.append(tier_note)
            elif seniority_score <= 0.3:
                if tier_note:
                    mismatch_flags.append(f"Seniority notice: {tier_note}")
            break

    # 6. Use the same normalized advertised salary facts as catalog filters.
    salary_fit = "Unadvertised / Neutral baseline"
    salary_score = 0.75
    maximum_salary = salary_max_amount if salary_max_amount is not None else salary_min_amount
    if maximum_salary is not None and salary_currency == "EUR" and salary_period == "annual":
        effective_salary = salary_text or f"€{maximum_salary:,.0f} annually"
        if maximum_salary >= min_salary:
            salary_score = 1.0
            salary_fit = f"{effective_salary} (Meets €{min_salary:,} Target)"
            if not negative_domain_detected and not disqualification_detected:
                alignments.append(f"Salary alignment: {effective_salary} satisfies your €{min_salary:,}+ benchmark.")
        elif maximum_salary < min_salary * 0.8:
            salary_score = 0.3
            salary_fit = f"{effective_salary} (Below €{min_salary:,} Target)"
            mismatch_flags.append(f"Compensation below target threshold: {effective_salary}")
        else:
            salary_score = 0.6
            salary_fit = f"{effective_salary} (Marginal Target)"
    elif salary_text:
        salary_fit = "Advertised pay not comparable to an annual EUR target / Neutral baseline"

    # 7. Competency, Tools & Certifications Matching
    competency_terms = prepared.competencies
    target_roles = prepared.target_roles
    matched_skills = [term for term, pattern in competency_terms if pattern.search(full_text)]
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

    employment_preference = active_profile.get("employment") or "Permanent only"
    prefers_permanent = employment_preference == "Permanent only"
    prefers_contract = employment_preference == "Contract / Specified Purpose"
    penalize_fixed_term = is_fixed_term and prefers_permanent
    contract_score = 0.85
    if employment_preference == "Open to all":
        contract_score = 1.0
    elif is_fixed_term:
        contract_score = 0.55 if prefers_permanent else 1.0
        if prefers_permanent:
            mismatch_flags.append("Contract mismatch: Fixed-term / temporary appointment; permanent roles preferred.")
        elif not negative_domain_detected and not disqualification_detected:
            alignments.append("Contract alignment: Fixed-term / contract role matches candidate preference.")
    elif is_permanent:
        contract_score = 0.55 if prefers_contract else 1.0
        if prefers_contract:
            mismatch_flags.append("Contract mismatch: Permanent appointment; contract roles preferred.")
        elif not negative_domain_detected and not disqualification_detected:
            alignments.append("Contract alignment: Permanent / indefinite role matches candidate preference.")

    # 9. Location Preference Evaluation
    full_loc_text = f"{location} {title} {company} {description}".lower()
    user_locations = prepared.locations

    # target_locations is priority-ordered: earlier entries score a larger share
    # of location_bonus (1.0, 0.8, 0.6, ... floor 0.4) so a candidate can express
    # "prefer Kildare over Dublin" rather than a flat match/no-match bonus.
    matched_loc_index = next((i for i, loc in enumerate(user_locations) if loc in full_loc_text), None)
    matched_user_loc = user_locations[matched_loc_index] if matched_loc_index is not None else None
    location_weight_factor = max(0.4, 1.0 - matched_loc_index * 0.2) if matched_loc_index is not None else 0.0

    # 10. Work Mode Preference Evaluation (Dynamic from Profile)
    user_work_mode = (active_profile.get("work_mode") or "").strip()
    user_modes = prepared.work_modes

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
                f"Semantic match ({round(semantic_sim * 100)}%): Role scope closely fits candidate background."
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

        if penalize_fixed_term:
            raw_composite -= fixed_term_penalty

        raw_composite -= auth_deduction

        fit_score = int(max(0, min(100, round(raw_composite))))

    # Enforce profile dealbreaker / disqualifier cap
    if disqualification_detected:
        fit_score = min(fit_score, disqualification_cap)

    # Determine fit tier
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

    # Explain the candidate evaluation
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
        "location": location_weight_factor,
        "work_mode": 1.0 if bool(matched_mode) else 0.0,
        "onsite_penalty": 1.0
        if bool(job_is_onsite and not any("on-site" in m or "onsite" in m for m in user_modes))
        else 0.0,
        "fixed_term": 1.0 if penalize_fixed_term else 0.0,
        "auth_deduction": round(float(auth_deduction), 2),
        "negative_domain": 1.0 if bool(negative_domain_detected) else 0.0,
        "disqualified": 1.0 if bool(disqualification_detected) else 0.0,
    }

    clean_alignments = [a.strip() for a in alignments if isinstance(a, str) and a.strip()]
    clean_mismatch = [m.strip() for m in mismatch_flags if isinstance(m, str) and m.strip()]

    return {
        "fit_score": fit_score,
        "fit_tier": fit_tier,
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
