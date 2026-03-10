import type { Translations } from "../i18n-types";

const en: Translations = {
  nav: {
    dashboard: "Dashboard",
    map: "Map",
    users: "User Management",
    activities: "Visit Activities",
    coverage: "Coverage",
    requests: "Requests",
  },
  dashboard: {
    title: "Dashboard",
    notifications: "Notifications",
    noNotifications: "No notifications",
    assignedAreas: "Assigned Areas",
    noAssignedAreas: "No areas assigned",
  },
  map: {
    title: "Map",
    loading: "Loading map...",
    draw: "Draw Polygon",
    cancelDraw: "Cancel Drawing",
    closeDraft: "Close",
  },
  users: {
    title: "User Management",
    members: "Members",
    noMembers: "No members",
    groups: "Groups",
    noGroups: "No groups",
    roles: {
      admin: "Admin",
      editor: "Editor",
      member: "Field Staff",
    },
  },
  activities: {
    title: "Visit Activities",
    active: "Active",
    noActive: "No active visits",
    completed: "Completed",
    noCompleted: "No completed visits",
    status: {
      pending: "Pending",
      active: "Active",
      returned: "Returned",
      complete: "Complete",
    },
  },
  coverage: {
    title: "Coverage",
    progress: "Progress",
    noData: "No coverage data",
    plans: "Coverage Plans",
    noPlans: "No coverage plans",
  },
  requests: {
    title: "Requests",
    pending: "Pending",
    noPending: "No pending requests",
    resolved: "Resolved",
    noResolved: "No resolved requests",
    types: {
      placeAdd: "Add Place",
      mapUpdate: "Map Update",
      doNotVisit: "Do Not Visit",
    },
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    confirm: "Confirm",
    approve: "Approve",
    reject: "Reject",
    search: "Search",
    loading: "Loading...",
    noData: "No data",
  },
};

export default en;
