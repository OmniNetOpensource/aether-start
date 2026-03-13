import { describe, expect, it, vi } from "vitest";
import {
  createConversationArtifact,
  getConversationById,
  listConversationArtifacts,
} from "./conversations-db";

const createMockD1 = () => {
  const mockRun = vi.fn();
  const mockFirst = vi.fn();
  const mockAll = vi.fn();
  const bind = vi.fn(() => ({
    run: mockRun,
    first: mockFirst,
    all: mockAll,
  }));
  const prepare = vi.fn(() => ({ bind }));

  return {
    prepare,
    bind,
    mockRun,
    mockFirst,
    mockAll,
  } as unknown as D1Database & {
    prepare: ReturnType<typeof vi.fn>;
    bind: ReturnType<typeof vi.fn>;
    mockRun: ReturnType<typeof vi.fn>;
    mockFirst: ReturnType<typeof vi.fn>;
    mockAll: ReturnType<typeof vi.fn>;
  };
};

describe("conversation artifacts db helpers", () => {
  it("lists artifacts newest-first", async () => {
    const db = createMockD1();
    db.mockAll.mockResolvedValueOnce({
      results: [
        {
          id: "a-2",
          conversation_id: "conv-1",
          title: "Latest",
          language: "react",
          code: "export default function App(){return <div /> }",
          created_at: "2024-01-03T00:00:00.000Z",
          updated_at: "2024-01-03T00:00:00.000Z",
        },
        {
          id: "a-1",
          conversation_id: "conv-1",
          title: "First",
          language: "html",
          code: "<main />",
          created_at: "2024-01-02T00:00:00.000Z",
          updated_at: "2024-01-02T00:00:00.000Z",
        },
      ],
    });

    const artifacts = await listConversationArtifacts(db, {
      userId: "u1",
      conversationId: "conv-1",
    });

    expect(artifacts.map((artifact) => artifact.id)).toEqual(["a-2", "a-1"]);
    expect(db.bind).toHaveBeenCalledWith("u1", "conv-1");
  });

  it("includes artifacts when loading a conversation detail", async () => {
    const db = createMockD1();
    db.mockFirst.mockResolvedValueOnce({
      user_id: "u1",
      id: "conv-1",
      title: "Conversation",
      role: "aether",
      is_pinned: 0,
      pinned_at: null,
      current_path_json: "[1]",
      messages_json: "[]",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    });
    db.mockAll.mockResolvedValueOnce({
      results: [
        {
          id: "artifact-1",
          conversation_id: "conv-1",
          title: "Preview",
          language: "html",
          code: "<main>Hello</main>",
          created_at: "2024-01-02T00:00:00.000Z",
          updated_at: "2024-01-02T00:00:00.000Z",
        },
      ],
    });

    const result = await getConversationById(db, "conv-1", "u1");

    expect(result?.artifacts).toEqual([
      {
        id: "artifact-1",
        conversation_id: "conv-1",
        title: "Preview",
        language: "html",
        code: "<main>Hello</main>",
        created_at: "2024-01-02T00:00:00.000Z",
        updated_at: "2024-01-02T00:00:00.000Z",
      },
    ]);
  });

  it("creates an artifact row", async () => {
    const db = createMockD1();
    db.mockRun.mockResolvedValueOnce({ meta: { changes: 1 } });

    const result = await createConversationArtifact(db, {
      user_id: "u1",
      id: "artifact-1",
      conversation_id: "conv-1",
      title: "Preview",
      language: "html",
      code: "<main>Hello</main>",
      created_at: "2024-01-02T00:00:00.000Z",
      updated_at: "2024-01-02T00:00:00.000Z",
    });

    expect(result).toEqual({ ok: true });
    expect(String(db.prepare.mock.calls[0][0])).toContain(
      "INSERT INTO conversation_artifacts",
    );
    expect(db.bind.mock.calls[0]).toEqual([
      "u1",
      "artifact-1",
      "conv-1",
      "Preview",
      "html",
      "<main>Hello</main>",
      "2024-01-02T00:00:00.000Z",
      "2024-01-02T00:00:00.000Z",
    ]);
  });
});
