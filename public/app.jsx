const { useEffect, useState, useRef } = React;

function Start() {
  return (
    <div>
      <h1>Welcome to WBS Management</h1>
      <p><a href="#signup">Sign Up</a> | <a href="#signin">Sign In</a></p>
    </div>
  );
}

function SignUp() {
  const formRef = useRef(null);

  const onSubmit = async e => {
    e.preventDefault();
    const f = formRef.current;
    const res = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: f.username.value,
        password: f.password.value
      })
    });
    if (res.ok) {
      alert('Registration successful. Please sign in.');
      window.location.hash = '#signin';
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Registration failed');
    }
  };

  return (
    <div>
      <h1>Sign Up</h1>
      <form ref={formRef} onSubmit={onSubmit}>
        <input name="username" placeholder="Username" required />
        <input name="password" type="password" placeholder="Password" required />
        <button type="submit">Register</button>
      </form>
    </div>
  );
}

function SignIn() {
  const formRef = useRef(null);

  useEffect(() => {
    if (localStorage.getItem('accessToken')) {
      window.location.hash = '#app';
    }
  }, []);

  const onSubmit = async e => {
    e.preventDefault();
    const f = formRef.current;
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: f.username.value,
        password: f.password.value
      })
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      window.location.hash = '#app';
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Login failed');
    }
  };

  return (
    <div>
      <h1>Sign In</h1>
      <form ref={formRef} onSubmit={onSubmit}>
        <input name="username" placeholder="Username" required />
        <input name="password" type="password" placeholder="Password" required />
        <button type="submit">Login</button>
      </form>
    </div>
  );
}

function WBSPage() {
  const formRef = useRef(null);
  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      window.location.hash = '#';
    }
  }, []);

  const signOut = async () => {
    const token = localStorage.getItem('refreshToken');
    if (token) {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.hash = '#';
  };


  const loadTasks = async () => {
    const [taskRes, linkRes] = await Promise.all([
      fetch('/tasks'),
      fetch('/links')
    ]);
    const tasks = await taskRes.json();
    const links = await linkRes.json();
    const data = tasks.map(t => ({
      id: t.task_id,
      text: t.task_name,
      start_date: t.planned_start_date,
      end_date: t.planned_end_date,
      progress: (t.progress_percent || 0) / 100,
      parent: t.parent_task_id || 0,
      assignee: t.assignee,
      planned_start_date: t.planned_start_date,
      planned_end_date: t.planned_end_date,
      actual_start_date: t.actual_start_date ? new Date(t.actual_start_date) : null,
      actual_end_date: t.actual_end_date ? new Date(t.actual_end_date) : null
    }));
    const linkData = links.map(l => ({
      id: l.link_id,
      source: l.source_task_id,
      target: l.target_task_id,
      type: l.type
    }));
    gantt.clearAll();
    gantt.parse({ data, links: linkData });
  };

  useEffect(() => {
    gantt.config.xml_date = '%Y-%m-%d';

    gantt.config.drag_move = true;
    gantt.config.drag_resize = true;
    gantt.config.details_on_dblclick = true;
    gantt.config.edit_on_dblclick = true;
    gantt.config.grid_resize = true;

    gantt.config.lightbox.sections = [
      { name: 'description', height: 38, map_to: 'text', type: 'textarea', focus: true },
      { name: 'time', type: 'duration', map_to: 'auto' }
    ];

    gantt.config.columns = [
      { name: 'text', label: 'Task', tree: true, width: '*' },
      { name: 'assignee', label: 'Assignee', align: 'center' },
      { name: 'planned_start_date', label: 'Planned Start', align: 'center', editor: { type: 'date', map_to: 'start_date' } },
      { name: 'planned_end_date', label: 'Planned End', align: 'center', editor: { type: 'date', map_to: 'end_date' } },
      { name: 'actual_start_date', label: 'Actual Start', align: 'center', editor: { type: 'date', map_to: 'actual_start_date' } },
      { name: 'actual_end_date', label: 'Actual End', align: 'center', editor: { type: 'date', map_to: 'actual_end_date' } }
    ];
    gantt.init('gantt');
    loadTasks();

    const fmt = gantt.date.date_to_str('%Y-%m-%d');
    const syncTaskDates = id => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;
      const t = gantt.getTask(id);
      const payload = {
        planned_start_date: fmt(t.start_date),
        planned_end_date: fmt(t.end_date),
        actual_start_date: t.actual_start_date ? fmt(t.actual_start_date) : null,
        actual_end_date: t.actual_end_date ? fmt(t.actual_end_date) : null
      };
      fetch(`/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
    };

    gantt.attachEvent('onAfterTaskUpdate', syncTaskDates);
    gantt.attachEvent('onAfterTaskDrag', syncTaskDates);
    gantt.attachEvent('onAfterTaskResize', syncTaskDates);

    gantt.attachEvent('onAfterLinkAdd', (id, item) => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;
      fetch('/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          source_task_id: item.source,
          target_task_id: item.target,
          type: item.type
        })
      });
    });

    gantt.attachEvent('onAfterLinkDelete', id => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;
      fetch(`/links/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    });

    const es = new EventSource('/events');
    es.addEventListener('taskCreated', loadTasks);
    es.addEventListener('taskUpdated', loadTasks);
    es.addEventListener('taskDeleted', loadTasks);
    es.addEventListener('linkCreated', loadTasks);
    es.addEventListener('linkDeleted', loadTasks);
    return () => es.close();
  }, []);

  const onSubmit = async e => {
    e.preventDefault();
    const f = formRef.current;
    const payload = {
      task_name: f.task_name.value,
      major_category: f.major_category.value,
      sub_category: f.sub_category.value,
      assignee: f.assignee.value,
      planned_start_date: f.planned_start_date.value,
      planned_end_date: f.planned_end_date.value,
      status: f.status.value
    };
    const token = localStorage.getItem('accessToken');
    if (!token) {
      alert('Please log in first');
      return;
    }
    const res = await fetch('/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      try {
        const err = await res.json();
        alert(err.error || 'Failed to add task');
      } catch (e) {
        alert('Failed to add task');
      }
      return;
    }
    f.reset();
  };

  return (
    <div>
      <h1>WBS Management</h1>
      <p><button onClick={signOut}>Sign Out</button></p>
      <form ref={formRef} onSubmit={onSubmit} id="task-form">
        <input name="task_name" placeholder="Task Name" required />
        <input name="major_category" placeholder="Major Category" required />
        <input name="sub_category" placeholder="Sub Category" required />
        <input name="assignee" placeholder="Assignee" required />
        <input type="date" name="planned_start_date" required />
        <input type="date" name="planned_end_date" required />
        <select name="status">
          <option value="未着手">未着手</option>
          <option value="進行中">進行中</option>
          <option value="遅延">遅延</option>
          <option value="完了">完了</option>
          <option value="保留">保留</option>
        </select>
        <button type="submit">Add Task</button>
      </form>
      <div id="gantt" style={{ width: '100%', height: '400px' }}></div>
    </div>
  );
}

function Router() {
  const [route, setRoute] = useState(window.location.hash || '#');

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route === '#signup') return <SignUp />;
  if (route === '#signin') return <SignIn />;
  if (route === '#app') return <WBSPage />;
  return <Start />;
}

ReactDOM.render(<Router />, document.getElementById('root'));
