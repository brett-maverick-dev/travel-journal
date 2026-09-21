"use client";

import { useTransition } from "react";
import {
  sendBuddyRequest, acceptBuddyRequest, declineBuddyRequest,
  removeBuddy, blockUser, unblockUser
} from "@/app/actions";

export default function BuddyActions({ targetId, status, isRequester, rowId }) {
  const [pending, start] = useTransition();
  const run = (fn, ...args) => start(async () => {
    const res = await fn(...args);
    if (res?.error) alert(res.error);
  });

  if (status === "BLOCKED" && !isRequester) {
    return <span className="tag tag-neutral">Not available</span>;
  }

  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      {!status && (
        <button className="btn btn-secondary" disabled={pending} onClick={() => run(sendBuddyRequest, targetId)}>
          <i className="ph ph-user-plus" />Add
        </button>
      )}
      {status === "PENDING" && !isRequester && (
        <>
          <button className="btn btn-primary" disabled={pending} onClick={() => run(acceptBuddyRequest, rowId)}>
            <i className="ph ph-check" />Accept
          </button>
          <button className="btn btn-secondary" disabled={pending} onClick={() => run(declineBuddyRequest, rowId)}>
            Decline
          </button>
        </>
      )}
      {status === "PENDING" && isRequester && (
        <button className="btn btn-secondary" disabled={pending} onClick={() => run(declineBuddyRequest, rowId)}>
          Cancel request
        </button>
      )}
      {status === "ACCEPTED" && (
        <button className="btn btn-secondary" disabled={pending} onClick={() => run(removeBuddy, rowId)}>
          <i className="ph ph-user-minus" />Remove
        </button>
      )}
      {status === "BLOCKED" && isRequester && (
        <button className="btn btn-secondary" disabled={pending} onClick={() => run(unblockUser, rowId)}>
          Unblock
        </button>
      )}
      {status !== "BLOCKED" && (
        <button className="btn btn-ghost btn-icon" title="Block" disabled={pending}
          onClick={() => {
            if (confirm("Block this user? They won't be able to send you a travel buddy request.")) run(blockUser, targetId);
          }}>
          <i className="ph ph-prohibit" />
        </button>
      )}
    </div>
  );
}
