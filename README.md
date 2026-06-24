# Study Planner Agent

An AI-powered weekly planner automation built with **n8n**, **LLM**, **Google Calendar**, and **Google Tasks**. Converts a natural-language weekly study plan into structured calendar events, tasks, and milestones.

**Status**: Local-first automation workflow for Computer Science students. Not a hosted SaaS product.

## Table of Contents

- [What It Does](#what-it-does)
- [Workflow Architecture](#workflow-architecture)
- [Local Execution Model](#local-execution-model)
- [Installation & Setup](#installation--setup)
- [Usage](#usage)
- [Input & Output Formats](#input--output-formats)
- [Debugging History](#debugging-history)
- [Project Structure](#project-structure)
- [Security Notes](#security-notes)
- [Future Improvements](#future-improvements)

## What It Does

This project automates weekly study planning for a Computer Science student:

1. **Accept**: Natural-language weekly study plan (text input)
2. **Parse**: Extract events, tasks, and milestones using LLM + JavaScript cleanup
3. **Route**: 
   - Events → Google Calendar (with timezone support)
   - Tasks → Google Tasks (daily task list)
   - Milestones → Google Tasks (separate milestone list)

**Input example** (plain text):
```
Thursday 7:45 AM - 9:15 AM: Java Arrays for DSA
Tasks:
- revise arrays in Java
- write array sum program

WEEKLY MILESTONES
- Finish DSA Arrays by Thursday
```

**Output** (Google Calendar events + Tasks created automatically)

## Workflow Architecture

```
Webhook (POST) 
  ↓
Basic LLM Chain (Groq model)
  ↓
Code in JavaScript (parse + cleanup)
  ↓ (splits into 3 branches)
  ├→ Split Events → Google Calendar Create Event
  ├→ Split Tasks → Google Tasks Create Task
  └→ Split Milestones → Google Tasks Create Task (milestone list)
```

## Local Execution Model

This workflow runs **locally** on your machine:

- **n8n** runs at `http://localhost:5678`
- Workflow is triggered via **HTTP POST webhook**
- Your laptop must be powered on for webhooks to work
- No cloud hosting required (currently)

## Installation & Setup

### Prerequisites

- Node.js 18+ (for n8n)
- PowerShell 5.1+ (Windows) or bash/zsh (macOS/Linux)
- Active Groq API account (free tier available at [groq.com](https://groq.com))
- Google account with Calendar and Tasks access

### Step 1: Install and Start n8n

```bash
npm install -g n8n
n8n
```

Access the UI at `http://localhost:5678`

### Step 2: Configure LLM Credentials

1. Go to **Settings** → **Credentials**
2. Create a new **Groq API** credential
3. Paste your Groq API key
4. Name it "Groq account"

### Step 3: Configure Google Services

1. Create **Google Calendar OAuth2** credential
   - Authorize your Google account
   - Select a calendar (or use primary)
   
2. Create **Google Tasks OAuth2** credential
   - Authorize the same Google account
   - Grant Google Tasks access

3. In Google Tasks, create or identify:
   - A task list for **daily tasks** (get its ID)
   - A task list for **milestones** (get its ID)
   - You can use the same list for both if preferred

### Step 4: Import Workflow

1. In n8n UI, go to **Workflows**
2. Click **Import from File**
3. Upload `workflow/study-planner-agent.json`
4. Update the workflow:
   - Edit "Create a task" node: paste your **tasks list ID**
   - Edit "Create a task1" node: paste your **milestones list ID**
5. Save and activate the workflow

### Step 5: Get Webhook URL

After importing:
1. Open the "Webhook" node
2. Copy the webhook URL (something like `http://localhost:5678/webhook-test/calendar-agent`)
3. Keep this URL handy for testing

## Usage

### Option 1: PowerShell Script (Windows)

```powershell
cd scripts
.\send_week_plan.ps1
```

This script:
- Reads `examples/sample-week-plan.txt`
- Sends it to the local webhook
- Creates calendar events and tasks

### Option 2: Manual POST Request

**Using PowerShell:**
```powershell
$plan = Get-Content -Raw "examples\sample-week-plan.txt"
$body = @{ plan_text = $plan } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5678/webhook-test/calendar-agent" `
    -Method Post -ContentType "application/json" -Body $body
```

**Using curl:**
```bash
curl -X POST http://localhost:5678/webhook-test/calendar-agent \
  -H "Content-Type: application/json" \
  -d '{"plan_text":"your plan here"}'
```

**Using n8n UI:**
1. Open the workflow
2. Click the Webhook node
3. Click "Test Trigger" or "Execute Webhook"
4. Paste test data in the request body

### Example: Verify in Google Calendar

After running, check:
- **Google Calendar**: New events should appear (with Asia/Kolkata timezone)
- **Google Tasks**: New tasks and milestones should appear in respective lists

## Input & Output Formats

### Input Format

Send a **POST request** with JSON body:

```json
{
  "plan_text": "WEEK TAG: WEEK-2026-06-25\n\nThursday 7:45 AM - 9:15 AM: Java Arrays\nTasks:\n- revise arrays\n- write programs\n\nWEEKLY MILESTONES\n- Complete arrays"
}
```

**Text format rules:**
- Date/time: Natural language ("Thursday 7:45 AM - 9:15 AM")
- Sessions: "HH:MM AM/PM - HH:MM AM/PM: [Title]"
- Tasks: Bullet list starting with "-"
- Milestones: Section marked "WEEKLY MILESTONES"

See `examples/sample-week-plan.txt` for a full example.

### LLM Output Format (Internal)

The LLM returns structured JSON:

```json
{
  "events": [
    {
      "title": "Java Arrays for DSA",
      "start": "2026-06-27T07:45:00+05:30",
      "end": "2026-06-27T09:15:00+05:30",
      "description": "Revise arrays in Java and core programs.",
      "category": "Java",
      "location": "",
      "reminder_minutes": 15
    }
  ],
  "tasks": [
    "revise arrays in Java",
    "write array sum program"
  ],
  "milestones": [
    "Finish DSA Arrays by Thursday"
  ]
}
```

**Important**: 
- `start` and `end` are ISO 8601 datetime strings with timezone
- Timezone is **Asia/Kolkata** (hardcoded in workflow and prompt)
- Category examples: Java, DSA, SQL, React, Project, Exam Prep, etc.

### Google Calendar Event

Each event is created with:
- Title
- Start/End time (with timezone)
- Description
- Location (optional)
- Reminder (15 minutes before)

### Google Tasks

- **Daily tasks**: Individual checklist items created in tasks list
- **Milestones**: Same structure but stored in separate milestone list

## Debugging History

### Issue 1: Timezone Mismatch

**Problem**: Calendar events were created in UTC instead of the student's timezone, causing 5.5-hour time shift.

**Fix**: 
- Hardcoded timezone to **Asia/Kolkata** in:
  - LLM system prompt
  - Event structure (ISO datetime with `+05:30`)
  - Google Calendar node configuration

**Lesson**: Always explicitly set timezone; don't rely on defaults.

### Issue 2: LLM Output Formatting

**Problem**: The Groq model sometimes returned:
- `\`\`\`json` markdown fences
- Extra text before or after JSON
- Trailing comments or explanations
- Invalid JSON syntax

**Fix**: Added `code/parse_llm_output.js` that:
- Removes markdown fences (`\`\`\`json`, `\`\`\``)
- Locates the first `{` and last `}` in the response
- Extracts only the JSON object
- Safely parses it
- Returns `events`, `tasks`, `milestones` arrays

**Lesson**: Always validate and clean LLM output; don't assume perfect JSON.

### Issue 3: Google Tasks Field Errors

**Problem**: Task creation failed with "Invalid Argument" errors due to:
- Incorrect date formatting for `due` field
- Missing required task list ID
- Confusion between task lists and task items

**Fix**:
- Use RFC3339 format for due dates: `2026-06-27T23:59:00.000Z`
- Created separate task lists for tasks and milestones
- Reference by ID in workflow nodes

**Lesson**: Read Google API docs carefully; date formats matter.

### Issue 4: Output Splitting

**Problem**: All events, tasks, and milestones were routed to the same Google Calendar node, causing errors.

**Fix**: Added three **Split** nodes that:
- Route `events` array → Google Calendar
- Route `tasks` array → Google Tasks (tasks list)
- Route `milestones` array → Google Tasks (milestones list)

**Lesson**: Separate your data flows; don't mix APIs.

## Project Structure

```
study-planner-agent/
├─ README.md                          # This file
├─ .gitignore                         # Git ignore rules
│
├─ workflow/
│  └─ study-planner-agent.json       # n8n workflow export (sanitized)
│
├─ prompts/
│  └─ planner_prompt.txt             # LLM system prompt
│
├─ code/
│  └─ parse_llm_output.js            # JavaScript parser node logic
│
├─ scripts/
│  └─ send_week_plan.ps1             # PowerShell test script
│
├─ examples/
│  ├─ sample-week-plan.txt           # Example input
│  └─ sample-output.json             # Expected LLM output format
│
├─ screenshots/
│  └─ workflow.png                   # Workflow diagram (manual)
│
└─ docs/
   └─ build-notes.md                 # Build and architecture notes
```

## Security Notes

### Credentials

- **Never commit** `.env`, API keys, or n8n credentials to GitHub
- Use n8n's built-in **Credentials Manager** to store secrets
- Credentials are stored locally in `.n8n/` directory (in `.gitignore`)

### Workflow Export

The committed `workflow/study-planner-agent.json` is **sanitized**:
- Personal email addresses removed
- Google Task list IDs replaced with placeholders or anonymized
- Pinned test data removed
- Credential IDs are n8n-local references (safe in open source)

**If you fork this project**, you must:
1. Export your own workflow from n8n
2. Replace the workflow JSON in this repo
3. Ensure personal data is removed
4. Set up your own Google credentials

### Groq API

- Free tier available at [groq.com](https://groq.com)
- API key stored in n8n (not in repo)
- No cost for this project under free tier

### Google OAuth

- Requires only Calendar and Tasks scopes
- Your stored Google credentials are local to your n8n instance
- Not accessible from this public repository

## Current Limitations

- **Local-only**: Requires n8n to be running on your machine
- **Timezone fixed**: Currently hardcoded to Asia/Kolkata (can be modified in prompt)
- **Groq LLM**: Uses free Groq API; could be changed to other providers
- **Weekly scope**: Optimized for one-week plans; monthly/semester planning possible with prompt changes

## Future Improvements

- [ ] Deploy to cloud server (Railway, Render, etc.) for 24/7 webhook availability
- [ ] Add Telegram bot for remote plan submission
- [ ] Support multi-week and semester-wide plans
- [ ] Add plan history and revision tracking
- [ ] Integrate with GitHub Issues for project management
- [ ] Support multiple students / shared calendars
- [ ] Add AI-powered weekly recap and insights
- [ ] Support multiple LLM providers (GPT-4, Claude, etc.)

---

**Questions?** See [docs/build-notes.md](docs/build-notes.md) for architecture and troubleshooting details.#   s t u d y - p l a n n e r - a g e n t  
 