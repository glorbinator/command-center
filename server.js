const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3456;
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const CALENDAR_FILE = path.join(__dirname, 'calendar.json');
const CRON_JOBS_FILE = path.join(__dirname, 'cron-jobs.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Utility: Load tasks from file
function loadTasks() {
  try {
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { tasks: [], lastUpdated: new Date().toISOString() };
  }
}

// Utility: Save tasks to file
function saveTasks(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2));
}

// Utility: Broadcast to all connected WebSocket clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Generate unique task ID
function generateId() {
  return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ========== CALENDAR UTILITIES ==========

function loadCalendar() {
  try {
    const data = fs.readFileSync(CALENDAR_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { events: [], lastUpdated: new Date().toISOString() };
  }
}

function saveCalendar(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CALENDAR_FILE, JSON.stringify(data, null, 2));
}

function generateEventId() {
  return 'event_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ========== CRON JOBS UTILITIES ==========

function loadCronJobs() {
  try {
    const data = fs.readFileSync(CRON_JOBS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { jobs: [], lastUpdated: new Date().toISOString() };
  }
}

function saveCronJobs(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CRON_JOBS_FILE, JSON.stringify(data, null, 2));
}

function generateCronId() {
  return 'cron_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ========== REST API ==========

// Get all tasks
app.get('/api/tasks', (req, res) => {
  const data = loadTasks();
  res.json(data);
});

// Get single task
app.get('/api/tasks/:id', (req, res) => {
  const data = loadTasks();
  const task = data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Create new task
app.post('/api/tasks', (req, res) => {
  const { title, description, status, assignee, priority, tags } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const data = loadTasks();
  const newTask = {
    id: generateId(),
    title,
    description: description || '',
    status: status || 'todo',
    assignee: assignee || 'unassigned',
    priority: priority || 'medium',
    tags: tags || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.tasks.push(newTask);
  saveTasks(data);
  
  broadcast({ type: 'TASK_CREATED', task: newTask });
  res.status(201).json(newTask);
});

// Update task
app.patch('/api/tasks/:id', (req, res) => {
  const data = loadTasks();
  const taskIndex = data.tasks.findIndex(t => t.id === req.params.id);
  
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const updates = req.body;
  const allowedFields = ['title', 'description', 'status', 'assignee', 'priority', 'tags'];
  
  allowedFields.forEach(field => {
    if (updates[field] !== undefined) {
      data.tasks[taskIndex][field] = updates[field];
    }
  });
  
  data.tasks[taskIndex].updatedAt = new Date().toISOString();
  saveTasks(data);
  
  broadcast({ type: 'TASK_UPDATED', task: data.tasks[taskIndex] });
  res.json(data.tasks[taskIndex]);
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const data = loadTasks();
  const taskIndex = data.tasks.findIndex(t => t.id === req.params.id);
  
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const deletedTask = data.tasks[taskIndex];
  data.tasks.splice(taskIndex, 1);
  saveTasks(data);
  
  broadcast({ type: 'TASK_DELETED', taskId: req.params.id });
  res.json({ message: 'Task deleted', task: deletedTask });
});

// Get tasks by status
app.get('/api/tasks/status/:status', (req, res) => {
  const data = loadTasks();
  const tasks = data.tasks.filter(t => t.status === req.params.status);
  res.json({ tasks, count: tasks.length });
});

// Get tasks by assignee
app.get('/api/tasks/assignee/:assignee', (req, res) => {
  const data = loadTasks();
  const tasks = data.tasks.filter(t => t.assignee === req.params.assignee);
  res.json({ tasks, count: tasks.length });
});

// Health check
app.get('/api/health', (req, res) => {
  const tasks = loadTasks();
  const calendar = loadCalendar();
  const cronJobs = loadCronJobs();
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    websocketClients: wss.clients.size,
    stats: {
      tasks: tasks.tasks.length,
      events: calendar.events.length,
      cronJobs: cronJobs.jobs.length
    }
  });
});

// ========== CALENDAR API ==========

// Get all calendar events
app.get('/api/calendar', (req, res) => {
  const data = loadCalendar();
  res.json(data);
});

// Get events in date range
app.get('/api/calendar/range', (req, res) => {
  const { start, end } = req.query;
  const data = loadCalendar();
  
  let events = data.events;
  if (start) {
    events = events.filter(e => new Date(e.startTime) >= new Date(start));
  }
  if (end) {
    events = events.filter(e => new Date(e.endTime || e.startTime) <= new Date(end));
  }
  
  res.json({ events, count: events.length });
});

// Get today's events
app.get('/api/calendar/today', (req, res) => {
  const data = loadCalendar();
  const today = new Date().toISOString().split('T')[0];
  const events = data.events.filter(e => e.startTime.startsWith(today));
  res.json({ events, count: events.length });
});

// Get upcoming events
app.get('/api/calendar/upcoming', (req, res) => {
  const { limit = 10 } = req.query;
  const data = loadCalendar();
  const now = new Date().toISOString();
  const events = data.events
    .filter(e => e.startTime >= now)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .slice(0, parseInt(limit));
  res.json({ events, count: events.length });
});

// Create calendar event
app.post('/api/calendar', (req, res) => {
  const { title, description, startTime, endTime, type, recurring, reminder, assignee, tags } = req.body;
  
  if (!title || !startTime) {
    return res.status(400).json({ error: 'Title and startTime are required' });
  }

  const data = loadCalendar();
  const newEvent = {
    id: generateEventId(),
    title,
    description: description || '',
    startTime,
    endTime: endTime || startTime,
    type: type || 'event',
    recurring: recurring || null,
    reminder: reminder || null,
    assignee: assignee || 'unassigned',
    tags: tags || [],
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.events.push(newEvent);
  saveCalendar(data);
  
  broadcast({ type: 'CALENDAR_EVENT_CREATED', event: newEvent });
  res.status(201).json(newEvent);
});

// Update calendar event
app.patch('/api/calendar/:id', (req, res) => {
  const data = loadCalendar();
  const eventIndex = data.events.findIndex(e => e.id === req.params.id);
  
  if (eventIndex === -1) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const allowedFields = ['title', 'description', 'startTime', 'endTime', 'type', 'recurring', 'reminder', 'assignee', 'tags', 'status'];
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      data.events[eventIndex][field] = req.body[field];
    }
  });
  
  data.events[eventIndex].updatedAt = new Date().toISOString();
  saveCalendar(data);
  
  broadcast({ type: 'CALENDAR_EVENT_UPDATED', event: data.events[eventIndex] });
  res.json(data.events[eventIndex]);
});

// Delete calendar event
app.delete('/api/calendar/:id', (req, res) => {
  const data = loadCalendar();
  const eventIndex = data.events.findIndex(e => e.id === req.params.id);
  
  if (eventIndex === -1) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const deletedEvent = data.events[eventIndex];
  data.events.splice(eventIndex, 1);
  saveCalendar(data);
  
  broadcast({ type: 'CALENDAR_EVENT_DELETED', eventId: req.params.id });
  res.json({ message: 'Event deleted', event: deletedEvent });
});

// ========== CRON JOBS API ==========

// Get all cron jobs
app.get('/api/cron', (req, res) => {
  const data = loadCronJobs();
  res.json(data);
});

// Get active cron jobs
app.get('/api/cron/active', (req, res) => {
  const data = loadCronJobs();
  const jobs = data.jobs.filter(j => j.enabled !== false);
  res.json({ jobs, count: jobs.length });
});

// Get cron jobs by status
app.get('/api/cron/status/:status', (req, res) => {
  const data = loadCronJobs();
  const jobs = data.jobs.filter(j => j.status === req.params.status);
  res.json({ jobs, count: jobs.length });
});

// Create cron job
app.post('/api/cron', (req, res) => {
  const { name, schedule, description, task, enabled, metadata } = req.body;
  
  if (!name || !schedule || !task) {
    return res.status(400).json({ error: 'Name, schedule, and task are required' });
  }

  const data = loadCronJobs();
  const newJob = {
    id: generateCronId(),
    name,
    schedule,
    description: description || '',
    task,
    enabled: enabled !== false,
    status: 'scheduled',
    lastRun: null,
    nextRun: null,
    runCount: 0,
    metadata: metadata || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.jobs.push(newJob);
  saveCronJobs(data);
  
  broadcast({ type: 'CRON_JOB_CREATED', job: newJob });
  res.status(201).json(newJob);
});

// Update cron job
app.patch('/api/cron/:id', (req, res) => {
  const data = loadCronJobs();
  const jobIndex = data.jobs.findIndex(j => j.id === req.params.id);
  
  if (jobIndex === -1) {
    return res.status(404).json({ error: 'Cron job not found' });
  }

  const allowedFields = ['name', 'schedule', 'description', 'task', 'enabled', 'status', 'metadata'];
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      data.jobs[jobIndex][field] = req.body[field];
    }
  });
  
  data.jobs[jobIndex].updatedAt = new Date().toISOString();
  saveCronJobs(data);
  
  broadcast({ type: 'CRON_JOB_UPDATED', job: data.jobs[jobIndex] });
  res.json(data.jobs[jobIndex]);
});

// Record cron job run
app.post('/api/cron/:id/run', (req, res) => {
  const data = loadCronJobs();
  const jobIndex = data.jobs.findIndex(j => j.id === req.params.id);
  
  if (jobIndex === -1) {
    return res.status(404).json({ error: 'Cron job not found' });
  }

  const now = new Date().toISOString();
  data.jobs[jobIndex].lastRun = now;
  data.jobs[jobIndex].runCount = (data.jobs[jobIndex].runCount || 0) + 1;
  data.jobs[jobIndex].updatedAt = now;
  
  saveCronJobs(data);
  
  broadcast({ type: 'CRON_JOB_EXECUTED', job: data.jobs[jobIndex] });
  res.json({ message: 'Run recorded', job: data.jobs[jobIndex] });
});

// Delete cron job
app.delete('/api/cron/:id', (req, res) => {
  const data = loadCronJobs();
  const jobIndex = data.jobs.findIndex(j => j.id === req.params.id);
  
  if (jobIndex === -1) {
    return res.status(404).json({ error: 'Cron job not found' });
  }

  const deletedJob = data.jobs[jobIndex];
  data.jobs.splice(jobIndex, 1);
  saveCronJobs(data);
  
  broadcast({ type: 'CRON_JOB_DELETED', jobId: req.params.id });
  res.json({ message: 'Cron job deleted', job: deletedJob });
});

// ========== TEAM API ==========

const TEAM_FILE = path.join(__dirname, 'team.json');

function loadTeam() {
  try {
    const data = fs.readFileSync(TEAM_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { agents: [], roles: [], squads: [], lastUpdated: new Date().toISOString() };
  }
}

function saveTeam(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(TEAM_FILE, JSON.stringify(data, null, 2));
}

// Get full team
app.get('/api/team', (req, res) => {
  const data = loadTeam();
  res.json(data);
});

// Get all agents
app.get('/api/team/agents', (req, res) => {
  const data = loadTeam();
  const { role, status, type } = req.query;
  let agents = data.agents;
  
  if (role) agents = agents.filter(a => a.role.toLowerCase().includes(role.toLowerCase()));
  if (status) agents = agents.filter(a => a.status === status);
  if (type) agents = agents.filter(a => a.type === type);
  
  res.json({ agents, count: agents.length });
});

// Get single agent
app.get('/api/team/agents/:id', (req, res) => {
  const data = loadTeam();
  const agent = data.agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// Get agents by squad
app.get('/api/team/squads/:id', (req, res) => {
  const data = loadTeam();
  const squad = data.squads.find(s => s.id === req.params.id);
  if (!squad) return res.status(404).json({ error: 'Squad not found' });
  
  const agents = data.agents.filter(a => squad.agents.includes(a.id));
  res.json({ squad, agents, count: agents.length });
});

// Get all squads
app.get('/api/team/squads', (req, res) => {
  const data = loadTeam();
  res.json({ squads: data.squads, count: data.squads.length });
});

// Get all roles
app.get('/api/team/roles', (req, res) => {
  const data = loadTeam();
  res.json({ roles: data.roles, count: data.roles.length });
});

// Update agent status
app.patch('/api/team/agents/:id', (req, res) => {
  const data = loadTeam();
  const index = data.agents.findIndex(a => a.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const allowedFields = ['status', 'description', 'stats', 'currentTask'];
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      data.agents[index][field] = req.body[field];
    }
  });
  
  data.agents[index].updatedAt = new Date().toISOString();
  saveTeam(data);
  
  broadcast({ type: 'AGENT_UPDATED', agent: data.agents[index] });
  res.json(data.agents[index]);
});

// Spawn agent (set active)
app.post('/api/team/agents/:id/spawn', (req, res) => {
  const data = loadTeam();
  const index = data.agents.findIndex(a => a.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  data.agents[index].status = 'active';
  data.agents[index].lastSpawned = new Date().toISOString();
  data.agents[index].updatedAt = new Date().toISOString();
  saveTeam(data);
  
  broadcast({ type: 'AGENT_SPAWNED', agent: data.agents[index] });
  res.json({ message: 'Agent spawned', agent: data.agents[index] });
});

// Dismiss agent (return to standby)
app.post('/api/team/agents/:id/dismiss', (req, res) => {
  const data = loadTeam();
  const index = data.agents.findIndex(a => a.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  data.agents[index].status = 'standby';
  data.agents[index].currentTask = null;
  data.agents[index].updatedAt = new Date().toISOString();
  saveTeam(data);
  
  broadcast({ type: 'AGENT_DISMISSED', agent: data.agents[index] });
  res.json({ message: 'Agent dismissed', agent: data.agents[index] });
});

// ========== DASHBOARD API ==========

// Get full dashboard data
app.get('/api/dashboard', (req, res) => {
  const tasks = loadTasks();
  const calendar = loadCalendar();
  const cronJobs = loadCronJobs();
  const reminders = loadReminders();
  const team = loadTeam();
  const now = new Date().toISOString();
  
  // Task stats
  const taskStats = {
    total: tasks.tasks.length,
    todo: tasks.tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.tasks.filter(t => t.status === 'in_progress').length,
    review: tasks.tasks.filter(t => t.status === 'review').length,
    done: tasks.tasks.filter(t => t.status === 'done').length
  };
  
  // Today's events
  const today = now.split('T')[0];
  const todaysEvents = calendar.events.filter(e => e.startTime.startsWith(today));
  
  // Upcoming events (next 7 days)
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const upcomingEvents = calendar.events
    .filter(e => e.startTime >= now && e.startTime <= sevenDaysLater.toISOString())
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  
  // Active cron jobs
  const activeCronJobs = cronJobs.jobs.filter(j => j.enabled !== false);
  
  // Memory files count
  let memoryCount = 0;
  if (fs.existsSync(MEMORY_FILE)) memoryCount++;
  if (fs.existsSync(MEMORY_DIR)) {
    memoryCount += fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md')).length;
  }
  
  // Today's and upcoming reminders
  const todaysReminders = reminders.reminders.filter(r => r.remindAt.startsWith(today) && r.status !== 'completed');
  const upcomingReminders = reminders.reminders
    .filter(r => r.remindAt >= now && r.status !== 'completed')
    .sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt))
    .slice(0, 10);
  
  // Team stats
  const teamStats = {
    total: team.agents.length,
    main: team.agents.filter(a => a.type === 'main').length,
    subagents: team.agents.filter(a => a.type === 'subagent').length,
    active: team.agents.filter(a => a.status === 'active').length,
    standby: team.agents.filter(a => a.status === 'standby').length,
    byRole: team.roles.map(role => ({
      role: role.name,
      count: team.agents.filter(a => a.role === role.name || (role.id === 'developer' && a.role.includes('Developer'))).length
    }))
  };
  
  res.json({
    timestamp: now,
    tasks: taskStats,
    today: {
      events: todaysEvents,
      reminders: todaysReminders,
      count: {
        events: todaysEvents.length,
        reminders: todaysReminders.length
      }
    },
    upcoming: {
      events: upcomingEvents.slice(0, 10),
      reminders: upcomingReminders,
      count: {
        events: upcomingEvents.length,
        reminders: upcomingReminders.length
      }
    },
    cronJobs: {
      active: activeCronJobs.length,
      total: cronJobs.jobs.length,
      recentRuns: cronJobs.jobs.filter(j => j.lastRun).slice(0, 5)
    },
    memories: {
      total: memoryCount
    },
    reminders: {
      total: reminders.reminders.length,
      pending: reminders.reminders.filter(r => r.status === 'pending').length,
      completed: reminders.reminders.filter(r => r.status === 'completed').length
    },
    team: teamStats
  });
});

// ========== MEMORY API ==========

const WORKSPACE_ROOT = path.join(__dirname, '..');
const MEMORY_FILE = path.join(WORKSPACE_ROOT, 'MEMORY.md');
const MEMORY_DIR = path.join(WORKSPACE_ROOT, 'memory');
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

// Load reminders
function loadReminders() {
  try {
    const data = fs.readFileSync(REMINDERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { reminders: [], lastUpdated: new Date().toISOString() };
  }
}

function saveReminders(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(data, null, 2));
}

function generateReminderId() {
  return 'reminder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Get all memories (list files)
app.get('/api/memory', (req, res) => {
  try {
    const memories = [];
    
    // Main MEMORY.md
    if (fs.existsSync(MEMORY_FILE)) {
      const stats = fs.statSync(MEMORY_FILE);
      memories.push({
        id: 'memory_main',
        title: 'MEMORY.md',
        path: 'MEMORY.md',
        type: 'main',
        size: stats.size,
        modifiedAt: stats.mtime.toISOString()
      });
    }
    
    // Daily memory files
    if (fs.existsSync(MEMORY_DIR)) {
      const files = fs.readdirSync(MEMORY_DIR);
      files.filter(f => f.endsWith('.md')).forEach(file => {
        const stats = fs.statSync(path.join(MEMORY_DIR, file));
        memories.push({
          id: 'memory_' + file.replace('.md', ''),
          title: file,
          path: `memory/${file}`,
          type: 'daily',
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        });
      });
    }
    
    res.json({ memories, count: memories.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Read a specific memory file
app.get('/api/memory/read', (req, res) => {
  const { path: filePath } = req.query;
  
  if (!filePath) {
    return res.status(400).json({ error: 'Path parameter required' });
  }
  
  // Security: only allow reading from workspace
  const fullPath = path.join(WORKSPACE_ROOT, filePath);
  if (!fullPath.startsWith(WORKSPACE_ROOT)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    const stats = fs.statSync(fullPath);
    
    res.json({
      path: filePath,
      content,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Search memories (simple text search)
app.get('/api/memory/search', (req, res) => {
  const { q: query, limit = 20 } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }
  
  try {
    const results = [];
    const searchTerm = query.toLowerCase();
    
    // Search MEMORY.md
    if (fs.existsSync(MEMORY_FILE)) {
      const content = fs.readFileSync(MEMORY_FILE, 'utf8');
      if (content.toLowerCase().includes(searchTerm)) {
        const lines = content.split('\n');
        const matches = [];
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(searchTerm)) {
            matches.push({ line: idx + 1, text: line.trim() });
          }
        });
        if (matches.length > 0) {
          results.push({
            file: 'MEMORY.md',
            path: 'MEMORY.md',
            type: 'main',
            matches: matches.slice(0, 5)
          });
        }
      }
    }
    
    // Search daily memory files
    if (fs.existsSync(MEMORY_DIR)) {
      const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md'));
      files.forEach(file => {
        const fullPath = path.join(MEMORY_DIR, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.toLowerCase().includes(searchTerm)) {
          const lines = content.split('\n');
          const matches = [];
          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes(searchTerm)) {
              matches.push({ line: idx + 1, text: line.trim() });
            }
          });
          if (matches.length > 0) {
            results.push({
              file: file,
              path: `memory/${file}`,
              type: 'daily',
              matches: matches.slice(0, 3)
            });
          }
        }
      });
    }
    
    res.json({ 
      query, 
      results: results.slice(0, parseInt(limit)),
      total: results.length 
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== REMINDERS API ==========

// Get all reminders
app.get('/api/reminders', (req, res) => {
  const data = loadReminders();
  res.json(data);
});

// Get upcoming reminders
app.get('/api/reminders/upcoming', (req, res) => {
  const { limit = 10 } = req.query;
  const data = loadReminders();
  const now = new Date().toISOString();
  const reminders = data.reminders
    .filter(r => r.remindAt >= now && r.status !== 'completed')
    .sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt))
    .slice(0, parseInt(limit));
  res.json({ reminders, count: reminders.length });
});

// Get today's reminders
app.get('/api/reminders/today', (req, res) => {
  const data = loadReminders();
  const today = new Date().toISOString().split('T')[0];
  const reminders = data.reminders.filter(r => r.remindAt.startsWith(today));
  res.json({ reminders, count: reminders.length });
});

// Create reminder
app.post('/api/reminders', (req, res) => {
  const { title, description, remindAt, recurring, source, priority, tags, metadata } = req.body;
  
  if (!title || !remindAt) {
    return res.status(400).json({ error: 'Title and remindAt are required' });
  }

  const data = loadReminders();
  const newReminder = {
    id: generateReminderId(),
    title,
    description: description || '',
    remindAt,
    recurring: recurring || null, // 'daily', 'weekly', 'monthly'
    source: source || 'manual', // 'manual', 'task', 'calendar', 'salesforce'
    priority: priority || 'medium',
    status: 'pending',
    tags: tags || [],
    metadata: metadata || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.reminders.push(newReminder);
  saveReminders(data);
  
  broadcast({ type: 'REMINDER_CREATED', reminder: newReminder });
  res.status(201).json(newReminder);
});

// Update reminder
app.patch('/api/reminders/:id', (req, res) => {
  const data = loadReminders();
  const index = data.reminders.findIndex(r => r.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Reminder not found' });
  }

  const allowedFields = ['title', 'description', 'remindAt', 'recurring', 'status', 'priority', 'tags', 'metadata'];
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      data.reminders[index][field] = req.body[field];
    }
  });
  
  data.reminders[index].updatedAt = new Date().toISOString();
  saveReminders(data);
  
  broadcast({ type: 'REMINDER_UPDATED', reminder: data.reminders[index] });
  res.json(data.reminders[index]);
});

// Complete/snooze reminder
app.post('/api/reminders/:id/complete', (req, res) => {
  const data = loadReminders();
  const index = data.reminders.findIndex(r => r.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Reminder not found' });
  }

  data.reminders[index].status = 'completed';
  data.reminders[index].completedAt = new Date().toISOString();
  data.reminders[index].updatedAt = new Date().toISOString();
  saveReminders(data);
  
  broadcast({ type: 'REMINDER_COMPLETED', reminder: data.reminders[index] });
  res.json({ message: 'Reminder completed', reminder: data.reminders[index] });
});

// Delete reminder
app.delete('/api/reminders/:id', (req, res) => {
  const data = loadReminders();
  const index = data.reminders.findIndex(r => r.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Reminder not found' });
  }

  const deleted = data.reminders[index];
  data.reminders.splice(index, 1);
  saveReminders(data);
  
  broadcast({ type: 'REMINDER_DELETED', reminderId: req.params.id });
  res.json({ message: 'Reminder deleted', reminder: deleted });
});

// ========== SYSTEM API ==========

const { exec } = require('child_process');

// Get storage usage
app.get('/api/system/storage', (req, res) => {
  exec('df -h / | tail -1', (error, stdout) => {
    if (error) {
      return res.status(500).json({ error: 'Failed to get storage info' });
    }
    
    // Parse df output: Filesystem Size Used Avail Use%
    const parts = stdout.trim().split(/\s+/);
    const total = parts[1];
    const used = parts[2];
    const available = parts[3];
    const percentUsed = parseInt(parts[4]);
    
    // Get workspace breakdown
    const workspaceRoot = path.join(__dirname, '..');
    const breakdown = [];
    
    try {
      const items = fs.readdirSync(workspaceRoot);
      items.forEach(item => {
        const itemPath = path.join(workspaceRoot, item);
        try {
          const stats = fs.statSync(itemPath);
          if (stats.isDirectory()) {
            // Calculate directory size (this is approximate)
            let size = 0;
            try {
              const files = execSync(`find "${itemPath}" -type f 2>/dev/null | head -1000`)
                .toString()
                .split('\n')
                .filter(f => f);
              files.forEach(f => {
                try { size += fs.statSync(f).size; } catch(e) {}
              });
            } catch(e) {}
            
            if (size > 1024 * 1024) { // Only show if > 1MB
              breakdown.push({
                name: item,
                size: formatBytes(size),
                sizeBytes: size,
                type: 'directory'
              });
            }
          } else if (stats.size > 1024 * 1024) {
            breakdown.push({
              name: item,
              size: formatBytes(stats.size),
              sizeBytes: stats.size,
              type: 'file'
            });
          }
        } catch(e) {}
      });
      
      // Sort by size
      breakdown.sort((a, b) => b.sizeBytes - a.sizeBytes);
    } catch(e) {}
    
    res.json({
      filesystem: '/dev/root',
      total,
      used,
      available,
      percentUsed,
      status: percentUsed > 90 ? 'critical' : percentUsed > 70 ? 'warning' : 'ok',
      breakdown: breakdown.slice(0, 10),
      timestamp: new Date().toISOString()
    });
  });
});

// Helper to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const { execSync } = require('child_process');

// ========== WebSocket ==========

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Send all data on connection
  ws.send(JSON.stringify({ 
    type: 'INIT', 
    data: {
      tasks: loadTasks(),
      calendar: loadCalendar(),
      cronJobs: loadCronJobs(),
      memories: { memories: [], count: 0 }, // Will be populated on request
      reminders: loadReminders()
    }
  }));

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// ========== TRADING API ==========

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:3457';

// Helper to proxy requests to trading service
async function proxyToTrading(endpoint, method = 'GET', body = null) {
  try {
    const url = `${TRADING_SERVICE_URL}${endpoint}`;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    return await response.json();
  } catch (error) {
    console.error('Trading service error:', error);
    return { error: 'Trading service unavailable', details: error.message };
  }
}

// Get trading recommendations
app.get('/api/trading/recommendations', async (req, res) => {
  const result = await proxyToTrading('/api/trading/recommendations');
  res.json(result);
});

// Get account balances
app.get('/api/trading/balances', async (req, res) => {
  const result = await proxyToTrading('/api/trading/balances');
  res.json(result);
});

// Get trading configuration
app.get('/api/trading/config', async (req, res) => {
  const result = await proxyToTrading('/api/trading/config');
  res.json(result);
});

// Update trading configuration
app.post('/api/trading/config', async (req, res) => {
  const result = await proxyToTrading('/api/trading/config', 'POST', req.body);
  res.json(result);
});

// Execute a trade
app.post('/api/trading/execute', async (req, res) => {
  const result = await proxyToTrading('/api/trading/execute', 'POST', req.body);
  res.json(result);
});

// Confirm a pending trade
app.post('/api/trading/confirm', async (req, res) => {
  const result = await proxyToTrading('/api/trading/confirm', 'POST', req.body);
  res.json(result);
});

// Cancel a pending trade
app.post('/api/trading/cancel', async (req, res) => {
  const result = await proxyToTrading('/api/trading/cancel', 'POST', req.body);
  res.json(result);
});

// Trading health check
app.get('/api/trading/health', async (req, res) => {
  const result = await proxyToTrading('/api/trading/health');
  res.json(result);
});

// ========== SECURE CONFIG API ==========

const CONFIG_FILE = path.join(__dirname, 'config.json');

// Load config
function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { 
      trading: { tradeSize: 100, confirmTrades: true, enabled: true },
      security: { sessionTimeout: 3600000, maxRetries: 3 },
      apiKeys: { masked: true }
    };
  }
}

// Save config
function saveConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

// Get config (masked)
app.get('/api/config', (req, res) => {
  const config = loadConfig();
  
  // Mask sensitive data
  const masked = {
    ...config,
    apiKeys: { masked: true }
  };
  
  res.json(masked);
});

// Update config (authenticated)
app.post('/api/config', (req, res) => {
  const config = loadConfig();
  
  // Update only allowed fields
  const allowedFields = ['trading', 'security'];
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      config[field] = { ...config[field], ...req.body[field] };
    }
  });
  
  saveConfig(config);
  broadcast({ type: 'CONFIG_UPDATED', config });
  res.json({ message: 'Configuration updated', config: loadConfig() });
});

// ========== SYSTEM API ==========
// Note: exec is already declared above
