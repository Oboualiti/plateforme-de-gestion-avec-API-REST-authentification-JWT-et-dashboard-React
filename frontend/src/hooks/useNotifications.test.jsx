import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotifications } from "./useNotifications";
import { api } from "../lib/api";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      effective_permission_keys: [],
    },
  }),
}));

vi.mock("../lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters request discussion notifications when permission is missing", async () => {
    api.get.mockResolvedValueOnce({
      data: [
        { id: 1, event_type: "REQUEST_MESSAGE", metadata: { message_id: 99 }, is_read: false },
        { id: 2, event_type: "REQUEST_STATUS", metadata: {}, is_read: false },
        { id: 3, event_type: "REQUEST_STATUS", metadata: {}, is_read: true },
      ],
    });

    const { result } = renderHook(() => useNotifications());
    await act(async () => {
      await result.current.loadNotifications(false);
    });

    expect(api.get).toHaveBeenCalledWith("/notifications/", {
      params: { unread_only: undefined },
    });
    expect(result.current.notifications.map((item) => item.id)).toEqual([2, 3]);
    expect(result.current.totalCount).toBe(2);
    expect(result.current.unreadCount).toBe(1);
  });

  it("marks one notification as read and reloads", async () => {
    api.post.mockResolvedValueOnce({});
    api.get.mockResolvedValueOnce({
      data: [{ id: 4, event_type: "REQUEST_STATUS", metadata: {}, is_read: false }],
    });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const { result } = renderHook(() => useNotifications());
    await act(async () => {
      await result.current.markAsRead(4);
    });

    expect(api.post).toHaveBeenCalledWith("/notifications/4/read/");
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    dispatchSpy.mockRestore();
  });
});
