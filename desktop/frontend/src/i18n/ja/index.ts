import type { Translations } from '../i18n-types';

const ja: Translations = {
  nav: {
    dashboard: 'ダッシュボード',
    map: '地図',
    users: 'ユーザー管理',
    activities: '訪問活動',
    coverage: '網羅管理',
    requests: '申請管理',
  },
  dashboard: {
    title: 'ダッシュボード',
    notifications: '通知',
    noNotifications: '通知はありません',
    assignedAreas: '割り当て区域',
    noAssignedAreas: '割り当てられた区域はありません',
  },
  map: {
    title: '地図',
    loading: '地図を読み込み中...',
  },
  users: {
    title: 'ユーザー管理',
    members: 'メンバー',
    noMembers: 'メンバーはいません',
    groups: 'グループ',
    noGroups: 'グループはありません',
    roles: {
      admin: '管理者',
      editor: '編集スタッフ',
      member: '活動スタッフ',
    },
  },
  activities: {
    title: '訪問活動',
    active: '活動中',
    noActive: '活動中の訪問はありません',
    completed: '完了済み',
    noCompleted: '完了済みの訪問はありません',
    status: {
      pending: '開始前',
      active: '活動中',
      returned: '返却済み',
      complete: '完了',
    },
  },
  coverage: {
    title: '網羅管理',
    progress: '進捗',
    noData: '網羅データはありません',
    plans: '網羅予定',
    noPlans: '網羅予定はありません',
  },
  requests: {
    title: '申請管理',
    pending: '未処理',
    noPending: '未処理の申請はありません',
    resolved: '処理済み',
    noResolved: '処理済みの申請はありません',
    types: {
      placeAdd: '場所追加',
      mapUpdate: '地図情報更新',
      doNotVisit: '訪問不可',
    },
  },
  common: {
    save: '保存',
    cancel: 'キャンセル',
    delete: '削除',
    edit: '編集',
    confirm: '確認',
    approve: '承認',
    reject: '却下',
    search: '検索',
    loading: '読み込み中...',
    noData: 'データがありません',
  },
};

export default ja;
