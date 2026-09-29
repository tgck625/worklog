// 260705_CBC長久手 プロジェクトのタスク診断
(function() {
  const KEY = 'kodawarin_tasks';
  const data = JSON.parse(localStorage.getItem(KEY));
  if (!data) { console.error('データなし'); return; }

  const myId = localStorage.getItem('wf_myMemberId');
  console.log('自分のID:', myId);

  // 260705 プロジェクトを探す
  const project = data.projects.find(p => p.name && p.name.includes('260705'));
  if (!project) { console.error('260705 プロジェクトが見つかりません'); return; }
  console.log('プロジェクト:', project.name, '(id:', project.id + ')');

  const tasks = data.tasks.filter(t => t.projectId === project.id);
  console.log('タスク総数:', tasks.length);

  // タスクを分類
  const showing = [], notAssigned = [], statusDone = [], otherHidden = [];
  tasks.forEach(t => {
    const isActive = t.status === 'todo' || t.status === 'doing';
    const isAssigned = (t.assigneeIds || []).includes(myId);
    if (isActive && isAssigned) {
      showing.push(t);
    } else if (!isAssigned) {
      notAssigned.push(t);
    } else if (!isActive) {
      statusDone.push(t);
    } else {
      otherHidden.push(t);
    }
  });

  console.log('\n✅ 表示されているタスク (' + showing.length + '件):');
  showing.forEach(t => console.log(' -', t.title, '| status:', t.status));

  console.log('\n❌ 担当者未設定 (' + notAssigned.length + '件):');
  notAssigned.forEach(t => console.log(' -', t.title, '| status:', t.status, '| assigneeIds:', JSON.stringify(t.assigneeIds)));

  console.log('\n⏸ ステータスがdone (' + statusDone.length + '件):');
  statusDone.forEach(t => console.log(' -', t.title));

  if (otherHidden.length > 0) {
    console.log('\n？ その他非表示 (' + otherHidden.length + '件):');
    otherHidden.forEach(t => console.log(' -', t.title, '| status:', t.status));
  }

  // 「概要決め」を特定
  console.log('\n🔍 「概要」を含むタスク:');
  tasks.filter(t => t.title && t.title.includes('概要')).forEach(t => {
    console.log(' -', t.title, '| status:', t.status, '| assigneeIds:', JSON.stringify(t.assigneeIds));
  });
})();
