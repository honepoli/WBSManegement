async function loadTasks() {
  const res = await fetch('/tasks');
  const tasks = await res.json();
  const tbody = document.querySelector('#tasks tbody');
  tbody.innerHTML = '';
  tasks.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.task_id}</td>
      <td>${t.task_name}</td>
      <td>${t.assignee}</td>
      <td>${t.status}</td>
      <td><button data-id="${t.task_id}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function addTask(e) {
  e.preventDefault();
  const data = {
    task_name: document.getElementById('task_name').value,
    major_category: document.getElementById('major_category').value,
    sub_category: document.getElementById('sub_category').value,
    assignee: document.getElementById('assignee').value,
    planned_start_date: document.getElementById('planned_start_date').value,
    planned_end_date: document.getElementById('planned_end_date').value,
    status: document.getElementById('status').value
  };
  await fetch('/tasks', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  e.target.reset();
  loadTasks();
}

document.getElementById('task-form').addEventListener('submit', addTask);

document.querySelector('#tasks tbody').addEventListener('click', async e => {
  if (e.target.tagName === 'BUTTON') {
    const id = e.target.dataset.id;
    await fetch('/tasks/' + id, {method: 'DELETE'});
    loadTasks();
  }
});

loadTasks();
