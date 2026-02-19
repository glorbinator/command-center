const API = window.location.origin.includes('localhost') ? 'http://localhost:3456/api' : `${window.location.origin}/api`;
let cache = {};

function toast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : 'exclamation'}"></i> ${msg}`;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

async function api(endpoint, method = 'GET', body = null) {
    try {
        const opts = { method, headers: {} };
        if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
        const res = await fetch(`${API}${endpoint}`, opts);
        return method === 'DELETE' ? res.ok : await res.json();
    } catch (e) { toast('Error: ' + e.message, 'error'); return null; }
}

function showTab(name, el) {
    document.querySelectorAll('.section, .tab').forEach(e => e.classList.remove('active'));
    document.getElementById(name).classList.add('active');
    el.classList.add('active');
    render[name]();
}

function toggle(id) { document.getElementById(id).classList.toggle('open'); }

function modal(title, html) {
    document.getElementById('form-title').textContent = title;
    document.getElementById('form-content').innerHTML = html;
    document.getElementById('form-overlay').classList.add('active');
}

function closeModal() { document.getElementById('form-overlay').classList.remove('active'); }

const render = {
    async dashboard() {
        const d = await api('/dashboard');
        if (!d) return;
        cache.dashboard = d;
        document.getElementById('status').textContent = `Sync: ${new Date(d.timestamp).toLocaleTimeString()}`;
        const cards = [
            ['Tasks', 'tasks', 1, [['Total', d.tasks.total], ['To Do', d.tasks.todo, '#fbbf24'], ['In Progress', d.tasks.inProgress, 'var(--accent)'], ['Done', d.tasks.done, '#34d399']]],
            ['Today', 'calendar', 2, [['Events', d.today.count.events], ['Reminders', d.today.count.reminders]]],
            ['Automation', null, null, [['Active Jobs', d.cronJobs.active], ['Total', d.cronJobs.total]]],
            ['Personnel', 'team', 3, [['Total Agents', d.team.total], ['Active', d.team.active, '#34d399']]],
            ['Knowledge', 'memories', 4, [['Files', d.memories.total]]],
            ['Alerts', null, null, [['Pending', d.reminders.pending, '#fbbf24'], ['Done', d.reminders.completed, 'var(--muted)']]]
        ];
        document.getElementById('dashboard').innerHTML = '<div class="grid">' + cards.map(([title, tab, idx, stats]) => `
            <div class="card" ${tab ? `onclick="showTab('${tab}', document.querySelectorAll('.tab')[${idx}])"` : ''}>
                <div class="card-header"><h2>${title}</h2>${tab ? '<span class="card-action">View →</span>' : ''}</div>
                ${stats.map(([l, v, c]) => `<div class="stat-row"><span class="stat-label">${l}</span><span class="stat-value"${c ? ` style="color:${c}"` : ''}>${v}</span></div>`).join('')}
            </div>`).join('') + '</div>';
    },

    async tasks() {
        const d = await api('/tasks');
        if (!d?.tasks) return;
        cache.tasks = d.tasks;
        const by = { todo: [], in_progress: [], review: [], done: [] };
        d.tasks.forEach(t => by[t.status]?.push(t));
        document.getElementById('tasks').innerHTML = `<div class="card" style="margin-bottom:20px"><button class="btn btn-primary" onclick="forms.task()"><i class="fas fa-plus"></i> Add</button></div>` +
            Object.entries(by).map(([s, ts]) => `<div class="collapsible ${ts.length ? 'open' : ''}" id="t-${s}"><div class="collapsible-header" onclick="toggle('t-${s}')"><h3>${s.replace('_', ' ').toUpperCase()} <span class="count">${ts.length}</span></h3><i class="fas fa-chevron-down"></i></div><div class="collapsible-content"><div class="collapsible-inner">${ts.map(t => `<div class="item"><div class="item-title">${t.title}<div class="item-actions"><button onclick="forms.task('${t.id}')"><i class="fas fa-edit"></i></button><button onclick="del('tasks', '${t.id}')"><i class="fas fa-trash"></i></button></div></div><div class="item-meta"><span class="badge badge-${t.status}">${t.status}</span><span class="badge badge-${t.priority}">${t.priority}</span><span>${t.assignee}</span></div></div>`).join('') || '<div style="color:var(--muted)">None</div>'}</div></div></div>`).join('');
    },

    async calendar() {
        const d = await api('/calendar/upcoming');
        if (!d?.events) return;
        cache.calendar = d.events;
        document.getElementById('calendar').innerHTML = `<div class="card" style="margin-bottom:20px"><button class="btn btn-primary" onclick="forms.event()"><i class="fas fa-plus"></i> Add Event</button></div>` +
            d.events.map(e => `<div class="item"><div class="item-title">${e.title}<div class="item-actions"><button onclick="forms.event('${e.id}')"><i class="fas fa-edit"></i></button><button onclick="del('calendar', '${e.id}')"><i class="fas fa-trash"></i></button></div></div><div class="item-meta"><span class="badge badge-${e.type}">${e.type}</span><span>${new Date(e.startTime).toLocaleDateString()}</span><span>${e.assignee}</span>${e.recurring ? '<span style="color:var(--accent)">Recurring</span>' : ''}</div></div>`).join('') || '<div style="color:var(--muted);padding:40px;text-align:center">No events</div>';
    },

    async team() {
        const d = await api('/team');
        if (!d?.agents) return;
        const g = d.agents.find(a => a.id === 'glorb_main');
        const o = d.agents.filter(a => a.type === 'subagent');
        const icon = r => r.includes('Developer') || r.includes('Engineer') ? 'code' : r.includes('Writer') ? 'pen' : r.includes('Designer') ? 'paint-brush' : 'search';
        document.getElementById('team').innerHTML = `<div class="org-tree"><div class="org-level"><div class="org-node"><div class="icon"><i class="fas fa-robot"></i></div><div class="name">${g.name}</div><div class="role">${g.role}</div><span class="badge badge-${g.status}">${g.status}</span></div></div><div class="org-children">${o.map(a => `<div class="org-node"><div class="icon"><i class="fas fa-${icon(a.role)}"></i></div><div class="name">${a.name}</div><div class="role">${a.role}</div><span class="badge badge-${a.status}">${a.status}</span></div>`).join('')}</div></div><div class="squad-section"><h3>Squads</h3><div class="squad-grid">${d.squads.map(s => `<div class="squad-card"><h4>${s.name}</h4><p>${s.description}</p><div class="squad-members">${d.agents.filter(a => s.agents.includes(a.id)).map(a => `<span class="squad-member">${a.name}</span>`).join('')}</div></div>`).join('')}</div></div>`;
    },

    async memories() {
        const d = await api('/memory');
        if (!d?.memories) return;
        cache.memories = d.memories;
        document.getElementById('memories').innerHTML = `<div class="card"><h2>Search</h2><input type="text" class="search-box" placeholder="Search..." onkeyup="searchMem(this.value)"><div id="mem-list">${d.memories.map(m => `<div class="item" onclick="viewMem('${m.path}')" style="cursor:pointer"><div class="item-title">${m.title}</div><div class="item-meta"><span class="badge badge-${m.type}">${m.type}</span><span>${new Date(m.modifiedAt).toLocaleDateString()}</span></div></div>`).join('')}</div></div>`;
    }
};

const forms = {
    task(id = null) {
        const t = id ? cache.tasks.find(x => x.id === id) : null;
        modal(id ? 'Edit Task' : 'Add Task', `<div class="form-group"><label>Title</label><input type="text" id="t-title" value="${t?.title || ''}"></div><div class="form-group"><label>Description</label><textarea id="t-desc">${t?.description || ''}</textarea></div><div class="form-group"><label>Status</label><select id="t-status"><option value="todo">To Do</option><option value="in_progress" ${t?.status === 'in_progress' ? 'selected' : ''}>In Progress</option><option value="review" ${t?.status === 'review' ? 'selected' : ''}>Review</option><option value="done" ${t?.status === 'done' ? 'selected' : ''}>Done</option></select></div><div class="form-group"><label>Assignee</label><select id="t-asn"><option>SeñorCucumber</option><option ${t?.assignee === 'Glorb' ? 'selected' : ''}>Glorb</option></select></div><div class="form-group"><label>Priority</label><select id="t-pri"><option value="low">Low</option><option value="medium" ${t?.priority === 'medium' ? 'selected' : ''}>Medium</option><option value="high" ${t?.priority === 'high' ? 'selected' : ''}>High</option></select></div><div class="form-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="save.task('${id || ''}')">Save</button></div>`);
    },
    event(id = null) {
        const e = id ? cache.calendar.find(x => x.id === id) : null;
        modal(id ? 'Edit Event' : 'Add Event', `<div class="form-group"><label>Title</label><input type="text" id="e-title" value="${e?.title || ''}"></div><div class="form-group"><label>Description</label><textarea id="e-desc">${e?.description || ''}</textarea></div><div class="form-group"><label>Start</label><input type="datetime-local" id="e-start" value="${e?.startTime?.slice(0, 16) || ''}"></div><div class="form-group"><label>Type</label><select id="e-type"><option value="event">Event</option><option value="meeting" ${e?.type === 'meeting' ? 'selected' : ''}>Meeting</option><option value="task" ${e?.type === 'task' ? 'selected' : ''}>Task</option></select></div><div class="form-group"><label>Assignee</label><select id="e-asn"><option>SeñorCucumber</option><option ${e?.assignee === 'Glorb' ? 'selected' : ''}>Glorb</option></select></div><div class="form-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="save.event('${id || ''}')">Save</button></div>`);
    }
};

const save = {
    async task(id) {
        const body = { title: document.getElementById('t-title').value, description: document.getElementById('t-desc').value, status: document.getElementById('t-status').value, assignee: document.getElementById('t-asn').value, priority: document.getElementById('t-pri').value };
        if (await api(id ? `/tasks/${id}` : '/tasks', id ? 'PATCH' : 'POST', body)) { toast('Saved'); closeModal(); render.tasks(); }
    },
    async event(id) {
        const body = { title: document.getElementById('e-title').value, description: document.getElementById('e-desc').value, startTime: document.getElementById('e-start').value, type: document.getElementById('e-type').value, assignee: document.getElementById('e-asn').value };
        if (await api(id ? `/calendar/${id}` : '/calendar', id ? 'PATCH' : 'POST', body)) { toast('Saved'); closeModal(); render.calendar(); }
    }
};

async function del(type, id) {
    if (!confirm('Delete?')) return;
    if (await api(`/${type}/${id}`, 'DELETE')) { toast('Deleted'); render[type](); }
}

async function viewMem(path) {
    const d = await api(`/memory/read?path=${encodeURIComponent(path)}`);
    if (d?.content) document.getElementById('mem-list').innerHTML = `<button class="btn" onclick="render.memories()" style="margin-bottom:16px">← Back</button><div class="memory-content">${d.content.replace(/</g, '&lt;')}</div>`;
}

async function searchMem(q) {
    if (q.length < 2) { render.memories(); return; }
    const d = await api(`/memory/search?q=${encodeURIComponent(q)}`);
    if (d?.results) document.getElementById('mem-list').innerHTML = d.results.map(r => `<div class="item"><div class="item-title">${r.file}</div><div class="item-meta">${r.matches.length} matches</div>${r.matches.map(m => `<div style="margin-top:8px;padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;font-size:0.8rem">${m.text}</div>`).join('')}</div>`).join('') || '<div style="color:var(--muted)">No matches</div>';
}

// Init
render.dashboard();
setInterval(render.dashboard, 30000);

// System/Storage
render.system = async function() {
    const d = await api('/system/storage');
    if (!d) return;
    
    const percent = d.percentUsed;
    const color = percent > 90 ? 'var(--danger)' : percent > 70 ? 'var(--warn)' : 'var(--success)';
    
    document.getElementById('system').innerHTML = `
        <div class="grid">
            <div class="card" style="grid-column: 1 / -1;">
                <div class="card-header"><h2>Storage Overview</h2></div>
                <div style="padding: 20px 0;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span style="color: var(--muted);">Used: ${d.used}</span>
                        <span style="color: var(--muted);">Total: ${d.total}</span>
                    </div>
                    <div style="height: 30px; background: rgba(56,189,248,0.1); border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${percent}%; background: ${color}; transition: width 0.5s;"></div>
                    </div>
                    <div style="text-align: center; margin-top: 10px; font-size: 1.2rem; color: ${color};">
                        ${percent}% Used (${d.available} available)
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <div class="card-header"><h2>Workspace Breakdown</h2></div>
            <div class="item-list">
                ${d.breakdown.map(item => `
                    <div class="item">
                        <div class="item-title">${item.name}</div>
                        <div class="item-meta">
                            <span class="badge badge-${item.type === 'directory' ? 'progress' : 'todo'}">${item.type}</span>
                            <span style="color: var(--accent); font-weight: 500;">${item.size}</span>
                        </div>
                    </div>
                `).join('') || '<div style="color: var(--muted); padding: 20px;">No large files detected</div>'}
            </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
            <div class="card-header"><h2>System Info</h2></div>
            <div class="stat-row"><span class="stat-label">Filesystem</span><span class="stat-value">${d.filesystem}</span></div>
            <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value" style="color: ${color}">${d.status.toUpperCase()}</span></div>
            <div class="stat-row"><span class="stat-label">Last Updated</span><span class="stat-value">${new Date(d.timestamp).toLocaleTimeString()}</span></div>
        </div>
    `;
};
