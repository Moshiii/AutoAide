import { FEISHU_CARD_STATE } from "../feishu/cards.mjs";
import { signPermissionRequestForCallback } from "./permission-broker.mjs";

export class FeishuPermissionBroker {
  constructor({
    broker,
    cardController,
    signingSecret,
    title = "CodexBridge",
    sessionLabel,
    onError = () => {},
  } = {}) {
    if (!broker || typeof broker.requestPermission !== "function") {
      throw new Error("FeishuPermissionBroker requires a PermissionBroker.");
    }
    if (!cardController || typeof cardController.publish !== "function") {
      throw new Error("FeishuPermissionBroker requires a cardController.");
    }
    if (!signingSecret) {
      throw new Error("FeishuPermissionBroker requires signingSecret.");
    }
    this.broker = broker;
    this.cardController = cardController;
    this.signingSecret = signingSecret;
    this.title = title;
    this.sessionLabel = sessionLabel;
    this.onError = onError;
  }

  async waitForPermission(request = {}) {
    const { request: pendingRequest, result } = this.broker.requestPermission(request);
    const signedPermission = {
      ...pendingRequest,
      ...signPermissionRequestForCallback(pendingRequest, this.signingSecret),
    };

    try {
      await this.cardController.publish({
        state: FEISHU_CARD_STATE.WAITING_PERMISSION,
        title: this.title,
        sessionLabel: this.sessionLabel,
        summary: pendingRequest.summary,
        permission: signedPermission,
      }, {
        fallbackText: `Approval required: ${pendingRequest.summary}`,
      });
    } catch (error) {
      this.onError(error);
    }

    return await result;
  }

  resolvePermission(payload) {
    return this.broker.resolvePermission(payload);
  }

  getPending(runId, actionId) {
    return this.broker.getPending(runId, actionId);
  }
}
