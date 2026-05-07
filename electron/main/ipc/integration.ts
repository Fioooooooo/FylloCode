import { ipcMain } from "electron";
import { IntegrationChannels } from "@shared/types/channels";
import {
  connectInputSchema,
  createCustomInputSchema,
  listProjectConfigsInputSchema,
  removeCustomInputSchema,
  setProjectConfigInputSchema,
  toolIdInputSchema,
  yunxiaoSetOrganizationInputSchema,
  yunxiaoSetTokenInputSchema,
} from "@shared/schemas/ipc/integration";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import {
  setYunxiaoToken,
  setYunxiaoOrganization,
  disconnectYunxiao,
} from "@main/services/integration/yunxiao-service";
import {
  getConnections,
  getConnection,
  removeConnection,
} from "@main/infra/storage/connections-store";

export function registerIntegrationHandlers(): void {
  ipcMain.handle(IntegrationChannels.listTools, () =>
    wrapHandler(async () => {
      return [];
    })
  );

  ipcMain.handle(IntegrationChannels.getConnections, () => wrapHandler(() => getConnections()));

  ipcMain.handle(IntegrationChannels.getConnection, (_event, input: unknown) =>
    wrapHandler(() => {
      const { toolId } = validate(toolIdInputSchema, input);
      return getConnection(toolId);
    })
  );

  ipcMain.handle(IntegrationChannels.connect, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { toolId, credentials } = validate(connectInputSchema, input);
      if (toolId.startsWith("yunxiao-")) {
        return setYunxiaoToken(credentials["x-yunxiao-token"] ?? "");
      }
      return null;
    })
  );

  ipcMain.handle(IntegrationChannels.disconnect, (_event, input: unknown) =>
    wrapHandler(() => {
      const { toolId } = validate(toolIdInputSchema, input);
      if (toolId.startsWith("yunxiao-")) {
        disconnectYunxiao();
      } else {
        removeConnection(toolId);
      }
    })
  );

  ipcMain.handle(IntegrationChannels.listProjectConfigs, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId } = validate(listProjectConfigsInputSchema, input);
      void projectId;
      return [];
    })
  );

  ipcMain.handle(IntegrationChannels.setProjectConfig, (_event, input: unknown) =>
    wrapHandler(async () => {
      validate(setProjectConfigInputSchema, input);
      return null;
    })
  );

  ipcMain.handle(IntegrationChannels.listCustom, () =>
    wrapHandler(async () => {
      return [];
    })
  );

  ipcMain.handle(IntegrationChannels.createCustom, (_event, input: unknown) =>
    wrapHandler(async () => {
      validate(createCustomInputSchema, input);
      return null;
    })
  );

  ipcMain.handle(IntegrationChannels.removeCustom, (_event, input: unknown) =>
    wrapHandler(async () => {
      validate(removeCustomInputSchema, input);
    })
  );

  ipcMain.handle(IntegrationChannels.yunxiaoSetToken, (_event, input: unknown) =>
    wrapHandler(() => {
      const { token } = validate(yunxiaoSetTokenInputSchema, input);
      return setYunxiaoToken(token);
    })
  );

  ipcMain.handle(IntegrationChannels.yunxiaoSetOrganization, (_event, input: unknown) =>
    wrapHandler(() => {
      const { organizationId } = validate(yunxiaoSetOrganizationInputSchema, input);
      return setYunxiaoOrganization(organizationId);
    })
  );
}
