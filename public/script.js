async function loadTasks() {
  const res = await fetch('/tasks');
  const tasks = await res.json();
  const tbody = document.querySelector('#tasks tbody');
  tbody.innerHTML = '';
  tasks.forEach(t => {
    const tr = document.createElement('tr');

    const idCell = document.createElement('td');
    idCell.textContent = t.task_id;
    tr.appendChild(idCell);

    const nameCell = document.createElement('td');
    nameCell.textContent = t.task_name;
    tr.appendChild(nameCell);

    const assigneeCell = document.createElement('td');
    assigneeCell.textContent = t.assignee;
    tr.appendChild(assigneeCell);

    const statusCell = document.createElement('td');
    statusCell.textContent = t.status;
    tr.appendChild(statusCell);

    const actionCell = document.createElement('td');
    const delButton = document.createElement('button');
    delButton.textContent = 'Delete';
    delButton.dataset.id = t.task_id;
    actionCell.appendChild(delButton);
    tr.appendChild(actionCell);

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
