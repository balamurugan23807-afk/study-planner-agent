# Build Notes – Study Planner Agent

Technical documentation of the workflow architecture, implementation decisions, and lessons learned.

## Table of Contents

- [Workflow Architecture](#workflow-architecture)
- [Node Configuration](#node-configuration)
- [Issues Encountered and Fixes](#issues-encountered-and-fixes)
- [Local Webhook Model](#local-webhook-model)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Workflow Architecture

### Component Overview

The n8n workflow consists of 9 nodes:

1. **Webhook** – HTTP POST trigger
2. **Groq Chat Model** – Language model provider
3. **Basic LLM Chain** – LLM orchestration
4. **Code in JavaScript** – Output parsing and cleanup
5. **Split Events** – Route events to Google Calendar
6. **Split Tasks** – Route tasks to Google Tasks
7. **Split Milestones** – Route milestones to Google Tasks
8. **Create an event** – Google Calendar integration
9. **Create a task** + **Create a task1** – Google Tasks integration (2 lists)

### Data Flow

```
HTTP POST webhook
  ↓
  { "plan_text": "..." }
  ↓
LLM: Groq llama-3.1-8b-instant
  ↓ returns raw JSON (possibly with formatting issues)
  ↓
JavaScript parser: Clean and extract JSON
  ↓ returns { events: [], tasks: [], milestones: [] }
  ↓ (splits into 3 parallel paths)
  ├─→ Split Events → iterates array → Create event (Google Calendar)
  ├─→ Split Tasks → iterates array → Create task (Google Tasks list 1)
  └─→ Split Milestones → iterates array → Create task (Google Tasks list 2)
```

### Design Rationale

**Why separate split nodes?**
- Each data type (events, tasks, milestones) has different target services
- Events → Google Calendar API
- Tasks and milestones → Google Tasks API (but separate lists)
- Splitting allows independent iteration and error handling

**Why a parser node?**
- LLM output is unpredictable; may include markdown, explanations, or malformed JSON
- JavaScript parser is deterministic and fast; executes in-workflow without external calls

**Why three separate "Create" nodes?**
- Google Tasks requires different list IDs for tasks vs. milestones
- Can be disabled/enabled independently for testing

## Node Configuration

### 1. Webhook Node

**Type**: n8n-nodes-base.webhook  
**Method**: POST  
**Path**: `calendar-agent` (full URL: `http://localhost:5678/webhook-test/calendar-agent`)  
**Output**: Raw body as `$json`

**Input body example:**
```json
{
  "plan_text": "WEEK TAG: WEEK-2026-06-25\n\nThursday 7:45 AM - 9:15 AM: Java Arrays\n..."
}
```

### 2. Groq Chat Model

**Type**: @n8n/n8n-nodes-langchain.lmChatGroq  
**Model**: llama-3.1-8b-instant (free tier, fast)  
**Credentials**: Groq API key (stored in n8n)  

**Alternative models** (can be swapped):
- llama-2-70b-chat: Larger, slower, more capable
- mixtral-8x7b-32768: Good balance

### 3. Basic LLM Chain

**Type**: @n8n/n8n-nodes-langchain.chainLlm  

**System Prompt** (from `prompts/planner_prompt.txt`):
- Instructs LLM to convert natural-language plans to JSON
- Specifies output format and timezone (Asia/Kolkata)
- Provides rules for events, tasks, milestones
- No markdown or extra text in output

**Why LangChain chain?**
- Provides structured prompt management
- Integrates LLM and prompt handling in one node
- Flexible for swapping LLM providers

### 4. Code in JavaScript

**Purpose**: Parse, clean, and validate LLM output

**Logic**:
1. Extract text from possible LLM output fields (text, output, response, completion)
2. Remove markdown code fences (```json, ```)
3. Locate first `{` and last `}` to isolate JSON
4. Parse JSON with fallback cleanup (remove trailing commas)
5. Validate arrays: events, tasks, milestones
6. Return cleaned JSON or throw error

**Output**:
```json
{
  "events": [...],
  "tasks": [...],
  "milestones": [...]
}
```

See `code/parse_llm_output.js` for full implementation.

### 5-7. Split Nodes

**Type**: n8n-nodes-base.splitOut (Split In Batches with batch size 1)  

**Split Events**: fieldToSplitOut = "events"  
**Split Tasks**: fieldToSplitOut = "tasks"  
**Split Milestones**: fieldToSplitOut = "milestones"  

Each splits the array and iterates, passing one item per iteration to the next node.

### 8. Create an event (Google Calendar)

**Type**: n8n-nodes-base.googleCalendar  
**Action**: Create event  
**Calendar**: User's primary calendar (bb738261@gmail.com – replace with your email)  

**Field Mapping**:
- `summary` = `$json.title`
- `start` = `$json.start` (ISO datetime with timezone)
- `end` = `$json.end` (ISO datetime with timezone)
- `description` = `$json.description`
- `location` = `$json.location`

**Reminder**: Set in event creation (15 minutes before)

**Timezone**: Implicit in ISO datetime string (+05:30)

### 9. Create a task (Google Tasks - Tasks List)

**Type**: n8n-nodes-base.googleTasks  
**Action**: Create task  
**Task List**: Daily tasks list ID (e.g., `MDMzNTcwMTM0Njc1ODg4MTAxMjQ6MDow` – replace with yours)  

**Field Mapping**:
- `title` = `$json.title`
- `dueDate` = `$json.due` (formatted as RFC3339 if provided)
- `notes` = `$json.notes` (optional)

### 10. Create a task1 (Google Tasks - Milestones List)

**Type**: n8n-nodes-base.googleTasks  
**Action**: Create task  
**Task List**: Milestones list ID (e.g., `NnI3dWR1R3N5QVlMNktCRg` – replace with yours)  

**Same field mapping as "Create a task"**

## Issues Encountered and Fixes

### Issue 1: Timezone Mismatch

**Symptom**: Calendar events created with 5.5-hour offset (UTC instead of Asia/Kolkata)

**Root cause**: 
- LLM was not explicitly told to use Asia/Kolkata timezone
- Google Calendar uses server timezone by default (UTC)
- Event start/end times missing timezone info

**Fix**:
1. Added explicit timezone instruction to LLM prompt
2. Modified event structure to use ISO 8601 with timezone: `2026-06-27T07:45:00+05:30`
3. Ensured Google Calendar node receives timezone-aware datetime

**Lesson**: Timezones must be explicit at multiple levels:
- Prompt/LLM instructions
- Data format (ISO 8601 with offset)
- Calendar API configuration

**Current state**: Hardcoded to Asia/Kolkata; can be made dynamic in future versions.

### Issue 2: LLM Output Formatting Problems

**Symptom**: JavaScript parser threw errors; LLM output was not valid JSON

**Examples of issues**:
```
// Issue 1: Markdown fences
\`\`\`json
{
  "events": [...]
}
\`\`\`

// Issue 2: Extra commentary
Here's your calendar plan:
{
  "events": [...]
}

// Issue 3: Trailing commas
{
  "events": [...],
  "tasks": [...],
}
```

**Root cause**: 
- LLM sometimes treated instructions as suggestions
- Model behavior varies with temperature, model version, and input
- No strict enforcement of JSON-only output

**Fix**: 
- Added JavaScript parser node (`code/parse_llm_output.js`)
- Parser removes markdown fences, extracts JSON object, cleans syntax errors
- Gracefully handles common formatting issues

**Lesson**: 
- Don't trust LLM output format; always validate and clean
- Dedicate a node to parsing/cleanup; don't rely on prompt discipline alone

### Issue 3: Google Tasks Field/Format Errors

**Symptom**: Task creation failed with "Invalid Argument" errors

**Root causes**:
1. `due` date field required RFC3339 format, not ISO 8601 date-only
2. Missing or wrong `task` parameter (task list ID)
3. Confusion between task list IDs and task IDs
4. Initial attempt to use one list for both tasks and milestones

**Examples**:
```
// Wrong:
"due": "2026-06-27"

// Correct:
"due": "2026-06-27T23:59:00.000Z"  (RFC3339)
```

**Fix**:
1. Created or identified two separate Google Tasks lists:
   - List 1 for daily tasks
   - List 2 for milestones
2. Stored list IDs separately
3. Updated "Create a task" node to use correct list ID for tasks
4. Updated "Create a task1" node to use separate list ID for milestones
5. Formatted due dates as RFC3339 in event data

**Lesson**: 
- Read API documentation carefully; Google Tasks and Google Calendar have different date requirements
- Separate your data stores when semantically different (tasks vs. milestones)

### Issue 4: Output Routing & Splitting

**Symptom**: Task creation failed or only events were created, not tasks/milestones

**Root cause**: 
- Initial workflow routed all outputs (events, tasks, milestones) to the same node
- Single branch could not handle different data types
- Google Calendar node errored on task objects; Google Tasks node errored on event objects

**Fix**: 
- Added three separate Split nodes that branch the data
- Each branch handles one data type
- Each branch calls appropriate service (Calendar or Tasks)

**Lesson**: 
- Different data types require different processing
- Use explicit splitting/routing for clarity and error isolation

## Local Webhook Model

### Execution Model

```
Your Laptop (Windows/Mac/Linux)
  ↓
n8n running locally (npm i -g n8n && n8n)
  ↓
Access: http://localhost:5678
  ↓
Webhook: http://localhost:5678/webhook-test/calendar-agent
  ↓
POST JSON → LLM processing → Google APIs → Calendar & Tasks
```

### Limitations

- **Always-on**: Laptop must stay powered on for webhooks to work
- **No cloud**: Not accessible from outside your machine
- **Local network**: Can't share webhook URL with others (unless port-forwarding)

### Testing Locally

**Using PowerShell:**
```powershell
$plan = "Thursday 7:45 AM - 9:15 AM: Java Study"
$body = @{ plan_text = $plan } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5678/webhook-test/calendar-agent" `
    -Method Post -ContentType "application/json" -Body $body
```

**Using n8n UI:**
1. Open workflow
2. Click Webhook node → "Test Trigger"
3. Paste request body → Execute

### Future: Cloud Deployment

To deploy to cloud (Railway, Render, etc.):
1. Export workflow JSON
2. Create n8n account on cloud platform
3. Import workflow
4. Set up environment variables for credentials
5. Access webhook from anywhere

## Security Considerations

### Credentials Management

All credentials stored locally in n8n, never in code:

- **Groq API Key**: n8n Credentials Manager
- **Google OAuth**: n8n OAuth2 nodes (automatic refresh)
- **No .env files committed**

### Workflow Export

The `workflow/study-planner-agent.json` committed to GitHub is **sanitized**:

- Personal email addresses removed or anonymized
- Google Task list IDs replaced with placeholders or generic IDs
- Pinned test data and execution history removed
- n8n credential IDs are safe (local references, not actual keys)

### Personal Data

The workflow is local and processes sensitive data (study plans, schedules):

- Never uploaded to cloud unless you explicitly deploy
- Stored in `.n8n/` (git-ignored)
- Consider before sharing workflow with others

## Troubleshooting

### Webhook Not Responding

**Symptom**: `curl` or PowerShell returns "Connection refused"

**Fix**:
1. Verify n8n is running: `http://localhost:5678` in browser
2. Check firewall allows localhost:5678
3. Verify workflow is activated (blue toggle in UI)
4. Check webhook path: should be `/webhook-test/calendar-agent`

### LLM Errors

**Symptom**: "Model output is not valid JSON" error

**Possible causes**:
1. Groq API key invalid or rate-limited
2. LLM model output malformed (rare with current parser)
3. Input text too long (model context limit)

**Fix**:
1. Check Groq API status and key in n8n Credentials Manager
2. Reduce input size (simplify weekly plan)
3. Try with shorter plan text

### Google Calendar / Tasks Errors

**Symptom**: Event creation fails or tasks not appearing

**Possible causes**:
1. Google OAuth token expired
2. Wrong calendar/task list ID
3. Date format incorrect
4. Missing required fields

**Fix**:
1. Re-authorize Google OAuth in n8n (Credentials Manager → Google → "Test connection")
2. Verify task list IDs in workflow nodes (match actual Google Tasks lists)
3. Check date format: `2026-06-27T07:45:00+05:30`
4. Check all required fields populated in event/task data

### Timezone Issues

**Symptom**: Events appear at wrong time in Google Calendar

**Possible causes**:
1. Timezone offset incorrect in ISO datetime
2. LLM generated wrong date/time
3. Browser/device timezone settings different

**Fix**:
1. Verify event `start`/`end` includes `+05:30` offset
2. Check LLM prompt includes "Asia/Kolkata" instruction
3. Manually verify one event in Google Calendar to confirm offset

### Parser Errors

**Symptom**: "Could not find a valid JSON object in LLM output"

**Cause**: LLM returned something that doesn't contain `{...}` JSON

**Fix**:
1. Check LLM prompt is being used correctly
2. Try shortening the input plan text
3. Use n8n UI to manually test LLM output (add a preview node)

---

## Future Directions

- [ ] Support custom timezones (detect from user location or config)
- [ ] Add plan validation and feedback loop (ask LLM to refine if issues detected)
- [ ] Support recurring weekly plans (same structure each week)
- [ ] Add Telegram bot for mobile plan submission
- [ ] Integrate with GitHub Issues / project boards for projects
- [ ] Support multi-week and semester-long plans
- [ ] Add plan history and comparison
- [ ] Generate weekly recap based on calendar/tasks completion
- [ ] Swap LLM providers (GPT-4, Claude, local Ollama)

---

For questions or issues, consult the README or check n8n logs at:
- n8n UI: Settings → Logs
- Terminal: n8n start --log-level debug

## Workflow Assembly (ORIGINAL)
1. Created a **Webhook** node (`/webhook-test/calendar-agent`).  
2. Added a **ChatGPT** (Basic LLM) node with the prompt from `prompts/planner_prompt.txt`.  
3. Connected the LLM node to a **JavaScript Code** node (`code/parse_llm_output.js`) to clean and safely parse the LLM response.  
4. Used three **SplitInBatches**‑style nodes to route the parsed `events`, `tasks`, and `milestones` to separate branches.  
5. Each branch ends with the appropriate Google node:
   - **Google Calendar Create Event** (timezone set to `Asia/Kolkata`)
   - **Google Tasks Create Task** (default task list)
   - **Google Tasks Create Task** (milestone list)

## Localhost Usage Model
- Start n8n: `n8n`  
- Access UI at `http://localhost:5678`  
- Keep the machine powered on; the webhook only works while n8n is running.

## Webhook Trigger
POST a JSON body containing `plan_text` to `http://localhost:5678/webhook-test/calendar-agent`.  
The PowerShell script in `scripts/send_week_plan.ps1` demonstrates the call.

## JSON Parsing Issue & Fix
The LLM occasionally wrapped the output in markdown fences or added commentary.  
Solution: `code/parse_llm_output.js` strips fences, extracts the first `{…}` block, and attempts a robust `JSON.parse` with a fallback cleanup.

## Timezone Issue & Fix
Events defaulted to UTC, causing mismatched times.  
Fixed by explicitly setting the Calendar node’s **Timezone** field to `Asia/Kolkata` and ensuring the `date` strings follow `YYYY‑MM‑DD`.

## Google Tasks Setup Issue & Fix
Initial task creation failed due to missing `due` field formatting.  
Resolution: Use RFC3339 (`2026-06-27T23:59:00.000Z`) for due dates; milestones are placed in a separate task list identified by its ID.

## Split‑Node Routing Structure
The parsed JSON is passed to three **Set** nodes that isolate `events`, `tasks`, and `milestones`.  
Each set outputs an array which is then fed into its respective Google node via a **Loop** (Iterate) construct.

## Future Directions
- Host the webhook on a cloud server (e.g., Railway, Render).  
- Add a Telegram bot for remote triggering.  
- Expand prompts to handle multiple weeks or semester‑wide plans.  

---