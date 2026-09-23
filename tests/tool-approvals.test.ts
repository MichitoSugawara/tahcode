import { describe, expect, it, vi } from "vitest";

import type {
  GatedToolInvokeResult,
  ToolApprovalStatus,
} from "../shared/toolApprovals.ts";
import {
  HITL_PENDING_RESULT,
  HITL_REJECTED_RESULT,
  approvalArgsHash,
  approvalArgsPreview,
  approvalSummary,
  hitlPendingResultJson,
  hitlRejectedResultJson,
  hitlToolLabel,
  isPendingApprovalResult,
  settleGatedToolInvoke,
  toolNeedsApproval,
} from "../shared/toolApprovals.ts";

describe("tool approval contract", () => {
  it("gates write tools and leaves reads open", () => {
    expect({
      create: toolNeedsApproval("create_linear_issue"),
      list: toolNeedsApproval("list_orgs"),
      send: toolNeedsApproval("send_message"),
      update: toolNeedsApproval("update_github_issue"),
    }).toStrictEqual({
      create: true,
      list: false,
      send: true,
      update: true,
    });
  });

  it("hashes args stably and hides secret keys from the preview", () => {
    expect(approvalArgsHash('{"title":"b","teamId":"a"}')).toBe(
      approvalArgsHash('{"teamId":"a","title":"b"}')
    );
    expect(
      approvalArgsPreview('{"title":"公開","token":"th_secret","teamId":"eng"}')
    ).toBe("title=公開 · teamId=eng");
    expect(
      approvalSummary("create_linear_issue", '{"title":"公開"}')
    ).toContain("Linear の課題を作成");
    expect(hitlToolLabel("create_session")).toBe("チャットを作成");
  });

  it("keeps pending and rejected payloads honest about not having run", () => {
    expect({
      cancelled: HITL_REJECTED_RESULT.cancelled,
      pendingOk: HITL_PENDING_RESULT.ok,
      pendingStatus: HITL_PENDING_RESULT.status,
      rejectedLooksPending: isPendingApprovalResult(hitlRejectedResultJson()),
      seesPending: isPendingApprovalResult(hitlPendingResultJson()),
    }).toStrictEqual({
      cancelled: true,
      pendingOk: false,
      pendingStatus: "pending_approval",
      rejectedLooksPending: false,
      seesPending: true,
    });
    expect(JSON.stringify(HITL_PENDING_RESULT)).not.toMatch(
      /openconnector|workers\.dev|gateway/i
    );
  });

  it("waits for approve then retries invoke", async () => {
    const invoke = vi
      .fn<() => Promise<GatedToolInvokeResult>>()
      .mockResolvedValueOnce({
        approval: { id: "appr1", status: "pending" },
        name: "create_session",
        resultJson: hitlPendingResultJson(),
      })
      .mockResolvedValueOnce({
        name: "create_session",
        resultJson: '{"ok":true}',
      });
    const poll = vi
      .fn<(approvalId: string) => Promise<ToolApprovalStatus>>()
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("approved");
    const result = await settleGatedToolInvoke({
      invoke,
      maxWaitMs: 5000,
      poll,
      pollMs: 0,
      sleep: async () => {},
    });
    expect(result.resultJson).toBe('{"ok":true}');
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("returns a cancelled payload when the user rejects", async () => {
    const result = await settleGatedToolInvoke({
      invoke: async () => ({
        approval: { id: "appr2", status: "pending" },
        name: "send_message",
        resultJson: hitlPendingResultJson(),
      }),
      poll: async () => "rejected",
      pollMs: 0,
      sleep: async () => {},
    });
    expect(JSON.parse(result.resultJson)).toMatchObject({
      cancelled: true,
      ok: false,
    });
  });
});
