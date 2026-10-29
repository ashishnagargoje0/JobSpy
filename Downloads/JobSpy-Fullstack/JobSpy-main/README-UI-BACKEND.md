# JobSpy full-stack local app (React + FastAPI)

This project adds a React UI and a FastAPI bridge to the original Python JobSpy library. The UI calls the local API; Python performs the scraping. No database is required.

## Requirements

- Python 3.10+
- Node.js and npm
- Internet access for installing packages and reaching job-board sites

## Run on Kali Linux

Open **two terminals**. Run both from the extracted `JobSpy-main` root.

### Terminal 1 — backend API

```bash
cd ~/Downloads/JobSpy-UI/JobSpy-main
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Confirm the API is running by opening `http://127.0.0.1:8000/api/health` or `http://127.0.0.1:8000/docs`.

If you already have a virtual environment for this project, activate it instead of creating another one. The editable install (`pip install -e .`) makes this checkout's local `jobspy` package available to the API.

### Terminal 2 — frontend UI

```bash
cd ~/Downloads/JobSpy-UI/JobSpy-main/ui
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

## How it works

- Press **Search jobs** in the UI. It sends a `POST /api/jobs/search` request.
- The API calls `jobspy.scrape_jobs()` for LinkedIn, Indeed, Naukri, and Glassdoor and returns normalized JSON.
- Results can be filtered by source/remote, saved in the current UI session, and exported to CSV.
- The backend requests up to 10 results per selected source. Search duration and results vary by source; some boards can rate-limit or block requests.
- Indeed/Glassdoor country is set to India by default. Naukri expects an Indian city for the location field.
- No database is used. Saved jobs remain in UI memory only and are cleared on page reload.

## API

- `GET /api/health`
- `POST /api/jobs/search`

Example request:

```json
{
  "search_term": "Golang Developer",
  "location": "Pune",
  "sites": ["linkedin", "indeed", "naukri", "glassdoor"],
  "results_wanted": 10,
  "is_remote": false,
  "country_indeed": "india"
}
```

Do not expose this unauthenticated local scraping API directly to the public internet. Job boards may change their sites or terms; follow the applicable rules and use reasonable request volumes.
