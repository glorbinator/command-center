# 🎯 Command Center

Real-time task board, calendar, cron job tracker, memory browser, and reminders for Glorb.

## Public URL

**🔗 Live API:** `https://whole-dryers-fail.loca.lt`

*Note: This tunnel URL may change on restart. Check with Glorb for the current URL.*

## Quick Start

```bash
cd command-center
npm install
npm start

# In another terminal, expose publicly:
lt --port 3456
```

## Full API Reference

### Tasks API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | Get all tasks |
| GET | `/api/tasks/:id` | Get single task |
| POST | `/api/tasks` | Create task |
| PATCH | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| GET | `/api/tasks/status/:status` | Filter by status |
| GET | `/api/tasks/assignee/:assignee` | Filter by assignee |

**Task Schema:**
```json
{
  "id": "task_123",
  "title": "Task title",
  "description": "Details",
  "status": "todo" | "in_progress" | "review" | "done",
  "assignee": "SeñorCucumber" | "Glorb",
  "priority": "low" | "medium" | "high" | "urgent",
  "tags": ["api", "frontend"],
  "createdAt": "2026-02-18T22:00:00Z",
  "updatedAt": "2026-02-18T22:30:00Z"
}
```

### Calendar API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/calendar` | Get all events |
| GET | `/api/calendar/range?start=...&end=...` | Events in date range |
| GET | `/api/calendar/today` | Today's events |
| GET | `/api/calendar/upcoming?limit=10` | Upcoming events |
| POST | `/api/calendar` | Create event |
| PATCH | `/api/calendar/:id` | Update event |
| DELETE | `/api/calendar/:id` | Delete event |

**Event Schema:**
```json
{
  "id": "event_123",
  "title": "Meeting",
  "description": "Details",
  "startTime": "2026-02-19T14:00:00Z",
  "endTime": "2026-02-19T15:00:00Z",
  "type": "meeting" | "task" | "reminder",
  "recurring": "daily" | "weekly" | "monthly" | null,
  "reminder": "15min" | "1hour" | null,
  "assignee": "SeñorCucumber" | "Glorb",
  "tags": ["planning"],
  "status": "scheduled"
}
```

### Cron Jobs API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron` | Get all jobs |
| GET | `/api/cron/active` | Active jobs only |
| GET | `/api/cron/status/:status` | Jobs by status |
| POST | `/api/cron` | Create job |
| PATCH | `/api/cron/:id` | Update job |
| POST | `/api/cron/:id/run` | Record a run |
| DELETE | `/api/cron/:id` | Delete job |

**Cron Job Schema:**
```json
{
  "id": "cron_123",
  "name": "Daily Sync",
  "schedule": "0 9 * * *",
  "description": "What it does",
  "task": "sync-tasks",
  "enabled": true,
  "status": "scheduled",
  "lastRun": "2026-02-18T09:00:00Z",
  "nextRun": "2026-02-19T09:00:00Z",
  "runCount": 42,
  "metadata": {}
}
```

### Dashboard API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Full dashboard stats |
| GET | `/api/health` | Health check |

**Dashboard Response:**
```json
{
  "timestamp": "2026-02-18T22:00:00Z",
  "tasks": { "total": 5, "todo": 2, "inProgress": 1, "review": 0, "done": 2 },
  "today": { "events": [], "count": 0 },
  "upcoming": { "events": [...], "count": 5 },
  "cronJobs": { "active": 3, "total": 5, "recentRuns": [...] }
}
```

## WebSocket Real-Time Updates

Connect for live updates:
```javascript
const ws = new WebSocket('wss://whole-dryers-fail.loca.lt');

ws.onmessage = (event) => {
  const { type, data, task, event: calEvent, job, reminder } = JSON.parse(event.data);
  // type: 'INIT' | 'TASK_CREATED' | 'TASK_UPDATED' | 'TASK_DELETED'
  //      | 'CALENDAR_EVENT_CREATED' | 'CALENDAR_EVENT_UPDATED' | 'CALENDAR_EVENT_DELETED'
  //      | 'CRON_JOB_CREATED' | 'CRON_JOB_UPDATED' | 'CRON_JOB_DELETED' | 'CRON_JOB_EXECUTED'
  //      | 'REMINDER_CREATED' | 'REMINDER_UPDATED' | 'REMINDER_COMPLETED' | 'REMINDER_DELETED'
};
```

## For Lovable Integration

**Base URL:** `https://whole-dryers-fail.loca.lt/api`

Example fetch:
```javascript
// Get full dashboard
const dashboard = await fetch('https://whole-dryers-fail.loca.lt/api/dashboard').then(r => r.json());

// Get all data
const tasks = await fetch('https://whole-dryers-fail.loca.lt/api/tasks').then(r => r.json());
const calendar = await fetch('https://whole-dryers-fail.loca.lt/api/calendar').then(r => r.json());
const memories = await fetch('https://whole-dryers-fail.loca.lt/api/memory').then(r => r.json());
const reminders = await fetch('https://whole-dryers-fail.loca.lt/api/reminders/upcoming').then(r => r.json());

// Create task
const newTask = await fetch('https://whole-dryers-fail.loca.lt/api/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'New Task',
    assignee: 'Glorb',
    status: 'todo',
    priority: 'high'
  })
}).then(r => r.json());

// Search memories
const search = await fetch('https://whole-dryers-fail.loca.lt/api/memory/search?q=project').then(r => r.json());
```

## Examples

### Create a Task
```bash
curl -X POST https://whole-dryers-fail.loca.lt/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Build UI","assignee":"SeñorCucumber","priority":"high"}'
```

### Schedule a Meeting
```bash
curl -X POST https://whole-dryers-fail.loca.lt/api/calendar \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Sprint Planning",
    "startTime":"2026-02-20T15:00:00Z",
    "endTime":"2026-02-20T16:00:00Z",
    "type":"meeting",
    "recurring":"weekly"
  }'
```

### Create a Cron Job
```bash
curl -X POST https://whole-dryers-fail.loca.lt/api/cron \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Daily Report",
    "schedule":"0 9 * * *",
    "task":"generate-report",
    "enabled":true
  }'
```

### Create a Reminder
```bash
curl -X POST https://whole-dryers-fail.loca.lt/api/reminders \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Set up Salesforce",
    "remindAt":"2026-02-20T10:00:00Z",
    "priority":"high",
    "source":"manual"
  }'
```

### Search Memories
```bash
curl "https://whole-dryers-fail.loca.lt/api/memory/search?q=project"
```

### Read a Memory File
```bash
curl "https://whole-dryers-fail.loca.lt/api/memory/read?path=MEMORY.md"
```

### Record a Job Run
```bash
curl -X POST https://smooth-wombats-show.loca.lt/api/cron/cron_123/run
```

### Memory API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/memory` | List all memory files |
| GET | `/api/memory/read?path=MEMORY.md` | Read specific file |
| GET | `/api/memory/search?q=query` | Search memories |

**Memory File Schema:**
```json
{
  "id": "memory_main",
  "title": "MEMORY.md",
  "path": "MEMORY.md",
  "type": "main" | "daily",
  "size": 1234,
  "modifiedAt": "2026-02-18T22:00:00Z"
}
```

**Search Response:**
```json
{
  "query": "project",
  "results": [
    {
      "file": "MEMORY.md",
      "path": "MEMORY.md",
      "type": "main",
      "matches": [
        { "line": 42, "text": "Project Alpha launched..." }
      ]
    }
  ],
  "total": 1
}
```

### Reminders API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reminders` | All reminders |
| GET | `/api/reminders/upcoming` | Upcoming reminders |
| GET | `/api/reminders/today` | Today's reminders |
| POST | `/api/reminders` | Create reminder |
| PATCH | `/api/reminders/:id` | Update reminder |
| POST | `/api/reminders/:id/complete` | Mark complete |
| DELETE | `/api/reminders/:id` | Delete reminder |

**Reminder Schema:**
```json
{
  "id": "reminder_123",
  "title": "Review salesforce setup",
  "description": "Check integration",
  "remindAt": "2026-02-20T10:00:00Z",
  "recurring": "weekly" | null,
  "source": "manual" | "salesforce" | "calendar",
  "priority": "low" | "medium" | "high" | "urgent",
  "status": "pending" | "completed",
  "tags": ["salesforce", "integration"],
  "metadata": { "tool": "salesforce" }
}
```

## Current Status

**✅ Running:** Tasks, Calendar, Cron Jobs, Memories, Reminders  
**🌐 Public:** Yes (via localtunnel)  
**📊 Live Data:** All systems populated  
**🔌 WebSocket:** Ready for real-time updates

## Glorb's Commitment

Every task I work on will be:
1. **Created** in the task board when started
2. **Added to calendar** if scheduled
3. **Tracked as cron job** if recurring
4. **Added to reminders** if you ask me to remind you
5. **Logged to memory** if significant
6. **Updated in real-time** as I progress

You'll have full visibility into what I'm doing, when, and what I remember.

---

# 📱 iPhone App Recommendation

## Best Choice: Lovable

**Why Lovable is perfect for this:**

1. **Web → iPhone Native Feel**
   - Builds responsive web apps that feel like native iPhone apps
   - Touch-optimized, smooth animations, iOS-style components
   - Add to Home Screen = looks/feels like a real app

2. **Fast Development**
   - Describe what you want, it generates the code
   - Live preview, instant updates
   - Clean React output you own

3. **Connects to Your API**
   - Easy fetch() to your Command Center API
   - WebSocket support for real-time updates
   - Can handle auth if needed later

4. **iPhone Optimization**
   - Responsive design adapts to screen size
   - Swipe gestures, pull-to-refresh
   - Works offline with service workers

## Tool Comparison

| Tool | Best For | iPhone App? | Recommendation |
|------|----------|-------------|----------------|
| **Lovable** | Web apps, rapid prototyping | ✅ Yes (PWA) | **USE THIS** |
| Replit | Coding, hosting | ⚠️ Web only | Overkill for UI |
| Canva | Design, graphics | ❌ No | Not for apps |
| Salesforce | CRM, enterprise | ⚠️ Complex | Overkill for personal use |

## Salesforce Integration

For the **Salesforce admin access** reminder I created:

**Recommendation:** API access via Connected App

1. **Create Connected App** in Salesforce
2. **OAuth 2.0** flow for secure access
3. **REST API** to create/read records
4. **Add to Command Center** as a data source

Alternative: **Salesforce MCP Server** (if available)
- More direct integration
- Natural language queries
- Glorb can query Salesforce directly

## The Dream iPhone App

Build this in Lovable:

**Screens:**
- 📊 Dashboard (tasks, calendar, reminders)
- ✅ Tasks (kanban board)
- 📅 Calendar (upcoming events)
- 🧠 Memories (search + browse)
- 🔔 Reminders (create, complete)
- ⚙️ Settings (API URL, refresh)

**Features:**
- Real-time updates via WebSocket
- Swipe to complete tasks
- Push notifications for reminders
- Search memories with live results
- Dark mode (obviously)

**iPhone Workflow:**
1. Open Lovable
2. Import from GitHub or start new
3. Connect to `https://whole-dryers-fail.loca.lt/api`
4. Build screens
5. Deploy → Add to Home Screen
6. Done! You have a personal Glorb app.

Want me to help you set up the Lovable project? I can give you the exact API calls and component structure.
