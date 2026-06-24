# Study Planner Agent

An AI-powered weekly study planner built with **n8n**, **LLM**, **Google Calendar**, and **Google Tasks**.

It converts a natural-language weekly study plan into:

* **Google Calendar events** for scheduled study / work sessions
* **Google Tasks tasks** for actionable checklist items
* **Google Tasks milestones** for weekly goals and deadline-based targets

**Status:** Local-first automation workflow for a Computer Science student.
This is a real workflow automation project, not a hosted SaaS product.

---

# Table of Contents

* [What It Does](#what-it-does)
* [Workflow Architecture](#workflow-architecture)
* [Local Execution Model](#local-execution-model)
* [Tech Stack](#tech-stack)
* [Installation and Setup](#installation-and-setup)
* [Usage](#usage)
* [Input and Output Formats](#input-and-output-formats)
* [Debugging History](#debugging-history)
* [Project Structure](#project-structure)
* [Security Notes](#security-notes)
* [Current Limitations](#current-limitations)
* [Future Improvements](#future-improvements)

---

# What It Does

This project automates weekly study planning for a Computer Science student.

## Workflow purpose

Instead of manually creating calendar events, tasks, and milestone reminders every week, the workflow accepts a **planner-style weekly study plan** in natural language and turns it into structured execution items.

## It performs three jobs

1. **Accept weekly plan text**

   * Example: study sessions, task bullets, weekly targets, certification blocks

2. **Parse the plan into structured outputs**

   * `events` → scheduled time blocks
   * `tasks` → actionable work items
   * `milestones` → weekly goals / deadline-based targets

3. **Send the results to Google tools**

   * Events → **Google Calendar**
   * Tasks → **Google Tasks**
   * Milestones → **Google Tasks** (usually a separate milestone-oriented task list)

---

# Workflow Architecture

The workflow is built in **n8n** and follows this flow:

```text
Webhook (POST)
  ↓
Basic LLM Chain
  ↓
Code in JavaScript (parse + cleanup)
  ↓
Split into 3 branches
  ├─ Events branch      → Google Calendar Create Event
  ├─ Tasks branch       → Google Tasks Create Task
  └─ Milestones branch  → Google Tasks Create Task
```

## Why the JavaScript parser node exists

The LLM output was not always clean JSON. During development, the model sometimes returned:

* ```json markdown wrappers
  ```
* extra text before or after the JSON
* formatting noise

Because of that, a **JavaScript cleanup / parse node** was added to:

* strip markdown fences
* locate the first JSON object
* parse it safely
* return clean `events`, `tasks`, and `milestones` arrays for downstream nodes

---

# Local Execution Model

This project currently runs **locally** on the laptop using **n8n**.

## Current local workflow model

* n8n is started manually from terminal / VS Code
* local n8n UI runs at:

```text
http://localhost:5678
```

* the planner workflow is triggered through a **webhook**
* a typical test webhook URL looks like:

```text
http://localhost:5678/webhook-test/calendar-agent
```

## Important note

Because the workflow is local-first:

* your laptop must be **powered on**
* **n8n must be running**
* the workflow must be available locally for the webhook to work

This repo documents the **local version** of the system. A hosted / Telegram-triggered version can be added later.

---

# Tech Stack

* **n8n** — workflow automation
* **Groq / LLM** — converts planner text into structured JSON
* **JavaScript (n8n Code node)** — cleans and parses LLM output
* **Google Calendar** — stores scheduled study sessions as events
* **Google Tasks** — stores tasks and milestones
* **PowerShell** — used to send weekly planner text to the local webhook

---

# Installation and Setup

## Prerequisites

Before running the workflow, you need:

* **Node.js 18+**
* **n8n**
* **Google account** with Calendar + Tasks access
* **Groq API key** or equivalent LLM provider credential
* **PowerShell** (Windows) or another way to send HTTP POST requests

---

## Step 1 — Install and start n8n

Install n8n globally:

```bash
npm install -g n8n
```

Start n8n:

```bash
n8n
```

Open the local UI at:

```text
http://localhost:5678
```

---

## Step 2 — Import the workflow

1. Open n8n
2. Go to **Workflows**
3. Import the workflow file from:

```text
workflow/study-planner-agent.json
```

4. Save the workflow

> **Important:** The workflow JSON in this repository should be a **sanitized export** of the real workflow.
> Remove personal test data, pinned example payloads, personal email references, and any credential-specific details before publishing.

---

## Step 3 — Configure credentials in n8n

### A) LLM credential

Create your LLM credential (for example Groq) inside n8n.

Typical flow:

1. Open **Credentials**
2. Create a new LLM / Groq credential
3. paste your API key
4. attach it to the LLM node in the workflow

### B) Google Calendar credential

Create a **Google Calendar OAuth2** credential and authorize the Google account where you want events to be created.

### C) Google Tasks credential

Create a **Google Tasks OAuth2** credential and authorize the same account (or whichever account you want to use for tasks).

---

## Step 4 — Set your Google Task list IDs

The workflow uses **Google Tasks** for:

* normal study tasks
* milestones

You can use:

* **one task list for tasks**
* **another task list for milestones**

After importing the workflow:

1. open the **Create Task** node used for tasks
2. set the correct **task list ID / task list selection**
3. open the **Create Task** node used for milestones
4. set the milestone task list there as well

---

## Step 5 — Check the webhook URL

Open the **Webhook** node in n8n and copy the local test webhook URL.
It will look similar to:

```text
http://localhost:5678/webhook-test/calendar-agent
```

This is the endpoint that receives your weekly plan text.

---

# Usage

The basic usage flow is:

1. start n8n locally
2. open the Study Planner Agent workflow
3. make sure the webhook is ready to receive a request
4. send a weekly planner text to the webhook
5. let the workflow create:

   * Google Calendar events
   * Google Tasks tasks
   * Google Tasks milestones

---

## Option 1 — Use the included PowerShell script

The repository includes:

```text
scripts/send_week_plan.ps1
```

Use that script to send a weekly plan to the local webhook.

You can either:

* keep the weekly plan text directly inside the script, **or**
* modify the script to read from a text file such as `examples/sample-week-plan.txt`

Run it from PowerShell after updating the plan and webhook URL if needed.

---

## Option 2 — Manual PowerShell request

Example:

```powershell
$plan = @"
WEEK TAG: WEEK-2026-06-25

Thursday 7:45 AM - 9:15 AM: Java Arrays for DSA
Tasks:
- revise arrays in Java
- write array sum program

WEEKLY MILESTONES
- Finish DSA Arrays by Thursday
"@

$body = @{
  plan_text = $plan
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5678/webhook-test/calendar-agent" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

---

## Option 3 — Use your own HTTP client

You can also trigger the workflow using:

* Postman
* curl
* another script
* a future Telegram bot / hosted trigger

As long as the request body contains:

```json
{
  "plan_text": "your weekly planner text here"
}
```

---

# Input and Output Formats

# Input Format

The workflow expects a **POST request** with a JSON body containing:

```json
{
  "plan_text": "weekly planner text here"
}
```

The `plan_text` should be a planner-style weekly plan written in natural language.

## Example planner input

```text
WEEK TAG: WEEK-2026-06-25

Thursday 7:45 AM - 9:15 AM: Java Arrays for DSA
Tasks:
- revise arrays in Java
- write array sum program
- write max/min in array

Thursday 9:45 AM - 11:45 AM: DSA Arrays Foundation
Tasks:
- solve 3 array problems
- write mistake notes

WEEKLY MILESTONES
- Finish DSA Arrays by Thursday
- Solve at least 20 DSA problems this week
```

See:

* `examples/sample-week-plan.txt`

for a fuller example.

---

# Internal LLM Output Format

The LLM is instructed to return a JSON object containing:

* `events`
* `tasks`
* `milestones`

## Event format

Each event is expected to look like this:

```json
{
  "title": "Java Arrays for DSA",
  "start": "2026-06-27T07:45:00+05:30",
  "end": "2026-06-27T09:15:00+05:30",
  "description": "Revise arrays in Java and practice core programs.",
  "category": "Java",
  "location": "",
  "reminder_minutes": 15
}
```

Important:

* `start` and `end` are **ISO 8601 datetime strings**
* timezone is aligned to **Asia/Kolkata** in the current planner setup

## Task format

Tasks represent actionable work items. Depending on the exact workflow version, tasks may be represented either as:

* simple task strings, or
* richer task objects before being mapped into Google Tasks fields

In the planner design, tasks semantically represent:

* exercises
* coding tasks
* revision items
* certificate work
* implementation work
* small action items tied to the week plan

## Milestone format

Milestones represent:

* weekly goals
* deadline-based targets
* completion targets
* “finish X by Sunday” type outcomes

They are stored in **Google Tasks** rather than Google Calendar.

---

# Debugging History

This project was not built in one shot. A few important issues had to be fixed during setup.

## 1) Timezone mismatch

### Problem

Calendar events initially used the wrong timezone behavior, which caused scheduling confusion.

### Fix

The workflow and planning format were aligned to **Asia/Kolkata**:

* planner prompt
* event examples
* calendar event expectations

### Lesson

Always make timezone assumptions explicit when generating calendar events.

---

## 2) LLM JSON formatting issues

### Problem

The model sometimes returned:

* markdown-wrapped JSON
* extra text after the JSON
* formatting noise

### Fix

A dedicated **JavaScript cleanup / parse node** was added:

* remove markdown fences
* isolate the JSON object
* parse it safely
* return clean arrays for downstream nodes

### Lesson

Never assume LLM output will always be perfect JSON.

---

## 3) Google Tasks invalid argument issues

### Problem

Google Tasks setup initially caused request / field issues during task creation.

### Fix

The workflow was adjusted so that:

* tasks go through their own Google Tasks branch
* milestones go through their own Google Tasks branch
* task list configuration is handled explicitly in the relevant nodes

### Lesson

Tasks and milestones should be treated as separate workflow outputs even if they both end up in Google Tasks.

---

## 4) Split routing was necessary

### Problem

The planner produces three different kinds of outputs:

* events
* tasks
* milestones

Those cannot all be pushed to the same destination node.

### Fix

The workflow was split into three branches:

* **events** → Google Calendar
* **tasks** → Google Tasks
* **milestones** → Google Tasks

### Lesson

Separate data flows make the workflow more reliable and easier to debug.

---

# Project Structure

```text
study-planner-agent/
├─ README.md
├─ .gitignore
│
├─ workflow/
│  └─ study-planner-agent.json       # Sanitized n8n workflow export
│
├─ prompts/
│  └─ planner_prompt.txt             # LLM system prompt used for plan parsing
│
├─ code/
│  └─ parse_llm_output.js            # Cleanup / parsing logic for LLM output
│
├─ scripts/
│  └─ send_week_plan.ps1             # PowerShell script for local webhook testing
│
├─ examples/
│  ├─ sample-week-plan.txt           # Example planner input
│  └─ sample-output.json             # Example structured output
│
├─ screenshots/
│  └─ workflow.png                   # Screenshot of the n8n workflow canvas
│
└─ docs/
   └─ build-notes.md                 # Build notes, debugging notes, and architecture notes
```

---

# Security Notes

## 1) Do not commit secrets

Never commit:

* API keys
* OAuth client secrets
* tokens
* `.env` files with secrets
* raw n8n credential exports

## 2) n8n credentials should stay local

Use n8n’s credential system to store:

* Groq / LLM API keys
* Google Calendar OAuth credentials
* Google Tasks OAuth credentials

These should remain local to your n8n instance.

## 3) Workflow export should be sanitized before GitHub push

Before pushing `workflow/study-planner-agent.json`, remove or sanitize:

* personal email addresses
* pinned test payloads
* personal study data that should not be public
* any unnecessary credential-specific metadata if present

## 4) Credential references in exported workflow

Credential references in the exported workflow are workflow metadata only.
Actual secrets remain in the local n8n credential store and should never be committed.

---

# Current Limitations

* **Local-first only** — workflow works only when the laptop is on and n8n is running
* **Webhook is local** — not yet deployed to a public server
* **Planner setup is currently tuned to Asia/Kolkata**
* **No Telegram / chat interface yet**
* **Workflow is optimized for weekly study planning**, not full long-term academic scheduling

---

# Future Improvements

* host the workflow so it works without keeping the laptop on
* add a Telegram bot for sending weekly plans remotely
* support multi-week / monthly planning
* add weekly review summaries and analytics
* add better duplicate detection for repeated weekly syncs
* support richer milestone logic and progress tracking
* support multiple LLM providers
* build a cleaner UI around the planner input flow

---

# Screenshot

The repository includes a screenshot of the workflow in:

```text
screenshots/workflow.png
```

This helps show the actual n8n canvas and overall node structure of the Study Planner Agent workflow.

---

# Final Note

This project is best understood as a **practical AI workflow automation system** for weekly execution, not just a calendar script.

It combines:

* planner design
* LLM-based structuring
* workflow automation
* Google productivity integrations

to reduce the friction of turning a study plan into a real execution system.
