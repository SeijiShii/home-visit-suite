export type Locales = "ja" | "en";

export interface Translations {
  nav: {
    dashboard: string;
    map: string;
    users: string;
    activities: string;
    coverage: string;
    requests: string;
    regions: string;
  };
  dashboard: {
    title: string;
    notifications: string;
    noNotifications: string;
    assignedAreas: string;
    noAssignedAreas: string;
  };
  map: {
    title: string;
    loading: string;
    tabAreas: string;
    tabPolygons: string;
    drawPolygon: string;
    closePolygon: string;
    savePolygon: string;
    cancelDrawing: string;
    undoPoint: string;
    drawingHint: string;
    drawingClosed: string;
    noArea: string;
    startDrawing: string;
  };
  areaTree: {
    title: string;
    region: string;
    areaParent: string;
    area: string;
    add: string;
    addChild: string;
    remove: string;
    confirmDelete: string;
    deleted: string;
    undo: string;
    redo: string;
    addRegion: string;
    regionName: string;
    regionSymbol: string;
    defaultParentAreaName: string;
  };
  users: {
    title: string;
    members: string;
    noMembers: string;
    groups: string;
    noGroups: string;
    roles: {
      admin: string;
      editor: string;
      member: string;
    };
  };
  activities: {
    title: string;
    active: string;
    noActive: string;
    completed: string;
    noCompleted: string;
    status: {
      pending: string;
      active: string;
      returned: string;
      complete: string;
    };
  };
  coverage: {
    title: string;
    progress: string;
    noData: string;
    plans: string;
    noPlans: string;
  };
  requests: {
    title: string;
    pending: string;
    noPending: string;
    resolved: string;
    noResolved: string;
    types: {
      placeAdd: string;
      mapUpdate: string;
      doNotVisit: string;
    };
  };
  regionManagement: {
    title: string;
    addRegion: string;
    editRegion: string;
    deleteRegion: string;
    regionName: string;
    regionSymbol: string;
    moveUp: string;
    moveDown: string;
    confirmDeleteTitle: string;
    confirmDeleteMessage: string;
    enterNameToConfirm: string;
    enterSymbolToConfirm: string;
    symbolChangeWarning: string;
    parentAreaCount: string;
  };
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    confirm: string;
    approve: string;
    reject: string;
    search: string;
    loading: string;
    noData: string;
  };
}
