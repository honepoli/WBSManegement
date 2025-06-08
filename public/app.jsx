const { useEffect } = React;

function App() {
  const formRef = React.useRef(null);

  const loadTasks = async () => {
    const res = await fetch('/tasks');
    const tasks = await res.json();
    const data = tasks.map(t => ({
      id: t.task_id,
      text: t.task_name,
      start_date: t.planned_start_date,
      end_date: t.planned_end_date,
      progress: (t.progress_percent || 0) / 100,
      parent: t.parent_task_id || 0,
      assignee: t.assignee
    }));
    gantt.clearAll();
    gantt.parse({ data });
  };

  useEffect(() => {
    gantt.config.xml_date = '%Y-%m-%d';
    gantt.config.columns = [
      { name: 'text', label: 'Task', tree: true, width: '*' },
      { name: 'assignee', label: 'Assignee', align: 'center' }
    ];
    gantt.init('gantt');
    loadTasks();

    const es = new EventSource('/events');
    es.addEventListener('taskCreated', loadTasks);
    es.addEventListener('taskUpdated', loadTasks);
    es.addEventListener('taskDeleted', loadTasks);
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

ReactDOM.render(<App />, document.getElementById('root'));
