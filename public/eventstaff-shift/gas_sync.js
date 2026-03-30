/**
 * eventstaff-shift 同期用 Google Apps Script
 *
 * 【デプロイ手順】
 * 1. https://script.google.com/ を開く
 * 2. 「新しいプロジェクト」を作成
 * 3. このファイルの内容を貼り付けて保存
 * 4. 「デプロイ」→「新しいデプロイ」→種類:ウェブアプリ
 * 5. 実行者: 自分、アクセス: 全員 にして「デプロイ」
 * 6. 表示されたURLを /eventstaff-shift/ の設定画面に貼り付ける
 *
 * ※ コードを変更した場合は「デプロイを管理」→「新バージョン」で再デプロイ
 */

function doGet(e) {
  try {
    const action = e.parameter.action;
    const props = PropertiesService.getScriptProperties();

    if (action === 'getStaffData') {
      const dataStr = props.getProperty('eventstaff_data');
      const version = parseInt(props.getProperty('eventstaff_version') || '0');
      return output({ ok: true, data: dataStr ? JSON.parse(dataStr) : null, version });
    }

    if (action === 'getBackups') {
      const list = [];
      for (let i = 0; i < 5; i++) {
        const meta = props.getProperty('eventstaff_backup_meta_' + i);
        if (meta) list.push({ index: i, ...JSON.parse(meta) });
      }
      return output({ ok: true, backups: list });
    }

    if (action === 'getScheduleResponses') {
      const resp = props.getProperty('schedule_responses') || '[]';
      return output({ ok: true, responses: JSON.parse(resp) });
    }

    if (action === 'getFormData') {
      const key = e.parameter.key;
      if (!key) return output({ ok: false, error: 'key required' });
      const dataStr = props.getProperty('form_data_' + key);
      if (!dataStr) return output({ ok: false, error: 'not found' });
      return output({ ok: true, data: JSON.parse(dataStr) });
    }

    return output({ ok: false, error: 'unknown action' });
  } catch(err) {
    return output({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();

    if (body.action === 'saveStaffData') {
      const version = Date.now();
      const dataStr = JSON.stringify(body.data);

      // 現在データを保存
      props.setProperty('eventstaff_data', dataStr);
      props.setProperty('eventstaff_version', version.toString());

      // バックアップ履歴（直近5件、ローテーション）
      const slotIdx = version % 5; // 0〜4でローテーション
      try {
        props.setProperty('eventstaff_backup_' + slotIdx, dataStr);
        props.setProperty('eventstaff_backup_meta_' + slotIdx, JSON.stringify({
          version,
          savedAt: new Date().toISOString(),
          label: body.label || new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
        }));
      } catch(backupErr) {
        // バックアップ失敗しても本体保存は成功扱い
      }

      return output({ ok: true, version });
    }

    if (body.action === 'restoreBackup') {
      const idx = body.index;
      const dataStr = props.getProperty('eventstaff_backup_' + idx);
      if (!dataStr) return output({ ok: false, error: 'backup not found' });
      const version = Date.now();
      props.setProperty('eventstaff_data', dataStr);
      props.setProperty('eventstaff_version', version.toString());
      return output({ ok: true, version, data: JSON.parse(dataStr) });
    }

    if (body.action === 'saveFormData') {
      const key = Math.random().toString(36).slice(2, 10);
      props.setProperty('form_data_' + key, JSON.stringify(body.data));
      return output({ ok: true, key });
    }

    if (body.action === 'submitSchedule') {
      const existing = JSON.parse(props.getProperty('schedule_responses') || '[]');
      (body.responses || []).forEach(r => {
        const idx = existing.findIndex(x => x.staffId === r.staffId && x.eventId === r.eventId);
        if (idx >= 0) existing[idx] = r; else existing.push(r);
      });
      props.setProperty('schedule_responses', JSON.stringify(existing));
      return output({ ok: true });
    }

    return output({ ok: false, error: 'unknown action' });
  } catch(err) {
    return output({ ok: false, error: err.toString() });
  }
}

function output(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
