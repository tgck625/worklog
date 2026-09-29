// 260705_CBC長久手 プロジェクトのタスクを全て自分に割り当て
(function() {
  const KEY = 'kodawarin_tasks';
  const data = JSON.parse(localStorage.getItem(KEY));
  if (!data) { console.error('データなし'); return; }

  const myId = localStorage.getItem('wf_myMemberId');
  if (!myId) { console.error('自分のIDが設定されていません'); return; }
  console.log('自分のID:', myId);

  // 260705 プロジェクトを探す
  const project = data.projects.find(p => p.name && p.name.includes('260705'));
  if (!project) { console.error('260705 プロジェクトが見つかりません'); return; }
  console.log('プロジェクト:', project.name);

  // そのプロジェクトのタスクに自分を割り当て（既存の担当者は上書き）
  let count = 0;
  data.tasks = data.tasks.map(t => {
    if (t.projectId !== project.id) return t;
    if ((t.assigneeIds || []).includes(myId)) return t; // 既に割り当て済みはスキップ
    count++;
    return { ...t, assigneeIds: [...(t.assigneeIds || []), myId] };
  });

  localStorage.setItem(KEY, JSON.stringify(data));
  console.log(`✅ ${count}件のタスクを自分に追加割り当てしました`);
  console.log('ページを再読み込みして確認してください');
})();
