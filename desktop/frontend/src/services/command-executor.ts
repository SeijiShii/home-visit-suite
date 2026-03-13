import type { Command } from "./command-history";
import type { RegionBindingAPI } from "./region-service";

export class CommandExecutor {
  constructor(private readonly api: RegionBindingAPI) {}

  async undo(cmd: Command): Promise<void> {
    switch (cmd.type) {
      case "delete":
        for (const entry of [...cmd.entries].reverse()) {
          switch (entry.entityType) {
            case "region":
              await this.api.RestoreRegion(entry.id);
              break;
            case "parentArea":
              await this.api.RestoreParentArea(entry.id);
              break;
            case "area":
              await this.api.RestoreArea(entry.id);
              break;
          }
        }
        break;
    }
  }

  async redo(cmd: Command): Promise<void> {
    switch (cmd.type) {
      case "delete":
        for (const entry of cmd.entries) {
          switch (entry.entityType) {
            case "region":
              await this.api.DeleteRegion(entry.id);
              break;
            case "parentArea":
              await this.api.DeleteParentArea(entry.id);
              break;
            case "area":
              await this.api.DeleteArea(entry.id);
              break;
          }
        }
        break;
    }
  }
}
