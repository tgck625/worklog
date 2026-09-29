// 260517_CBC蟹江 プロジェクトのタスクを全て柘植に割り当て
(function() {
  const KEY = 'kodawarin_tasks';
  const data = JSON.parse(localStorage.getItem(KEY));
  if (!data) { console.error('データなし'); return; }

  // 柘植メンバーを探す
  const tsuge = data.members.find(m =>
    m.name && (m.name.includes('柘植') || m.name.includes('つげ') || m.name.includes('Tsuge'))
  );
  if (!tsuge) {
    console.error('柘植メンバーが見つかりません。メンバー一覧:');
    console.table(data.members.map(m => ({ id: m.id, name: m.name })));
    return;
  }
  console.log('✅ メンバー確認:', tsuge.name, '(id:', tsuge.id + ')');

  // 260517 CBC プロジェクトを探す
  const project = data.projects.find(p => p.name && (
    (p.name.includes('260517') && p.name.includes('CBC')) ||
    (p.name.includes('260517') && p.name.includes('蟹江'))
  ));
  if (!project) { console.error('プロジェクトが見つかりません'); return; }
  console.log('✅ プロジェクト確認:', project.name);

  // そのプロジェクトのタスクに柘植を割り当て
  let count = 0;
  data.tasks = data.tasks.map(t => {
    if (t.projectId !== project.id) return t;
    count++;
    return { ...t, assigneeIds: [tsuge.id] };
  });

  localStorage.setItem(KEY, JSON.stringify(data));
  console.log(`✅ ${count}件のタスクを「${tsuge.name}」に割り当てました`);
  console.log('ページを再読み込みして確認してください');
})();
