from __future__ import annotations

import logging
import re
from typing import Literal

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from jobspy import scrape_jobs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("jobspy-api")

SUPPORTED_SITES = {
    "linkedin", "indeed", "glassdoor", "zip_recruiter", "naukri",
    "google", "bayt", "bdjobs", "hellowork",
}

app = FastAPI(title="JobSpy API", version="1.0.0", description="Local API for the JobSpy React UI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:4173", "http://127.0.0.1:4173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class SearchRequest(BaseModel):
    search_term: str = Field(min_length=1, max_length=200)
    location: str = Field(default="", max_length=150)
    sites: list[str] = Field(default_factory=lambda: ["linkedin", "indeed", "naukri", "glassdoor"], min_length=1, max_length=9)
    results_wanted: int = Field(default=500, ge=1)
    is_remote: bool = False
    hours_old: int | None = Field(default=None, ge=1, le=8760)
    country_indeed: str = "india"

    @field_validator("search_term", "location", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("sites")
    @classmethod
    def validate_sites(cls, values):
        normalized = list(dict.fromkeys(v.strip().lower() for v in values))
        invalid = [v for v in normalized if v not in SUPPORTED_SITES]
        if invalid:
            raise ValueError(f"Unsupported job source(s): {', '.join(invalid)}")
        if not normalized:
            raise ValueError("Choose at least one job source")
        return normalized


def clean(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (list, tuple, set)):
        return [clean(v) for v in value]
    return value


def format_salary(row: dict) -> str:
    low, high = clean(row.get("min_amount")), clean(row.get("max_amount"))
    currency = clean(row.get("currency")) or ""
    interval = clean(row.get("interval")) or ""
    if low is None and high is None:
        return "Not listed"
    def amount(v):
        try:
            return f"{float(v):,.0f}"
        except (TypeError, ValueError):
            return str(v)
    if low is not None and high is not None:
        result = f"{amount(low)}–{amount(high)}"
    else:
        result = amount(low if low is not None else high)
    suffix = f" {currency}" if currency else ""
    if interval:
        suffix += f" / {interval.replace('_', ' ')}"
    return result + suffix


def extract_contacts(row: dict, description: str):
    # Prefer contact information supplied directly by the job source.
    raw_emails = clean(row.get("emails")) or []
    if isinstance(raw_emails, str):
        raw_emails = [raw_emails]
    if not isinstance(raw_emails, list):
        raw_emails = []

    text = str(description or "")
    emails = []
    for value in raw_emails:
        emails.extend(re.findall(r"[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}", str(value)))
    emails.extend(re.findall(r"[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}", text))
    emails = list(dict.fromkeys(emails))

    raw_phone = clean(row.get("phone")) or clean(row.get("contact_number")) or ""
    phone_text = f"{raw_phone} {text}"
    phones = re.findall(r"(?<!\\w)(?:\\+?\\d[\\d ().\\-]{7,}\\d)(?!\\w)", phone_text)
    phones = list(dict.fromkeys(" ".join(p.split()) for p in phones))

    return {
        "email": ", ".join(emails),
        "contact_number": ", ".join(phones),
    }


def normalize_job(row: dict, index: int) -> dict:
    raw_url = clean(row.get("job_url")) or clean(row.get("job_url_direct")) or ""
    source = (clean(row.get("site")) or "Unknown").replace("_", " ").title()
    location = clean(row.get("location")) or "Location not listed"
    if not isinstance(location, str):
        location = str(location)
    raw_type = clean(row.get("job_type"))
    if isinstance(raw_type, list):
        job_type = ", ".join(str(x).replace("_", " ").title() for x in raw_type) or "Not listed"
    else:
        job_type = str(raw_type).replace("_", " ").title() if raw_type else "Not listed"
    skills = clean(row.get("skills")) or []
    if not isinstance(skills, list):
        skills = [str(skills)]
    description = clean(row.get("description")) or "No description was provided by the job board."
    return {
        "id": str(clean(row.get("id")) or raw_url or f"{source}-{index}"),
        "title": clean(row.get("title")) or "Untitled role",
        "company": clean(row.get("company")) or "Company not listed",
        "location": location,
        "source": source,
        "type": job_type,
        "level": clean(row.get("job_level")) or "Not listed",
        "salary": format_salary(row),
        "posted": clean(row.get("date_posted")) or "Date not listed",
        "remote": bool(clean(row.get("is_remote")) or False),
        "description": str(description),
        "tags": [str(s) for s in skills if s][:8],
        "url": raw_url,
        "salary_min": clean(row.get("min_amount")),
        "salary_max": clean(row.get("max_amount")),
        "currency": clean(row.get("currency")),
    }


@app.get("/api/health")
def health():
    return {"ok": True, "service": "JobSpy API"}


@app.post("/api/jobs/search")
def search_jobs(payload: SearchRequest):
    try:
        logger.info("Searching JobSpy: term=%r location=%r sites=%s", payload.search_term, payload.location, payload.sites)
        frame = scrape_jobs(
            site_name=payload.sites,
            search_term=payload.search_term,
            location=payload.location or None,
            results_wanted=payload.results_wanted,
            is_remote=payload.is_remote,
            hours_old=payload.hours_old,
            country_indeed=payload.country_indeed.lower(),
            verbose=0,
        )
        records = frame.to_dict(orient="records")
        jobs = [normalize_job(row, i) for i, row in enumerate(records)]
        errors = clean(frame.attrs.get("errors", {})) or {}
        warnings = clean(frame.attrs.get("warnings", {})) or {}
        return {"jobs": jobs, "count": len(jobs), "sources": payload.sites, "errors": errors, "warnings": warnings}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("JobSpy scraping failed")
        raise HTTPException(status_code=502, detail=f"Job search failed: {type(exc).__name__}: {exc}") from exc
