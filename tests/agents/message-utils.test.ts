import { describe, expect, it } from "vitest";
import { countMessages, extractLastAssistantText } from "@/agents/message-utils.js";

describe("countMessages", () => {
  it("returns the message array length as a string", () => {
    expect(countMessages({ messages: [{ type: "human" }, { type: "ai" }] })).toBe("2");
  });

  it("returns '?' when result has no messages array", () => {
    expect(countMessages({})).toBe("?");
    expect(countMessages(null)).toBe("?");
    expect(countMessages("not an object")).toBe("?");
    expect(countMessages({ messages: "not an array" })).toBe("?");
  });
});

describe("extractLastAssistantText", () => {
  it("returns the trimmed content of the last ai message", () => {
    const result = {
      messages: [
        { type: "human", content: "hi" },
        { type: "ai", content: "  first reply  " },
        { type: "tool", content: "tool output" },
        { type: "ai", content: "second reply" },
      ],
    };
    expect(extractLastAssistantText(result)).toBe("second reply");
  });

  it("accepts the AIMessage type alias", () => {
    const result = { messages: [{ type: "AIMessage", content: "reply" }] };
    expect(extractLastAssistantText(result)).toBe("reply");
  });

  it("skips non-ai messages and empty/whitespace-only ai content", () => {
    const result = {
      messages: [
        { type: "ai", content: "   " },
        { type: "tool", content: "irrelevant" },
      ],
    };
    expect(extractLastAssistantText(result)).toBeNull();
  });

  it("returns null when there are no ai messages", () => {
    expect(extractLastAssistantText({ messages: [{ type: "human", content: "hi" }] })).toBeNull();
  });

  it("returns null for malformed or non-object input", () => {
    expect(extractLastAssistantText(null)).toBeNull();
    expect(extractLastAssistantText("nope")).toBeNull();
    expect(extractLastAssistantText({})).toBeNull();
  });
});
