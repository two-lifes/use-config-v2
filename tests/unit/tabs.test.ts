import { expect, test } from "@playwright/test";
import { countOpen, isOpen, tabOrigin } from "../../src/lib/tabs";

test.describe("tabOrigin", () => {
  test("returns the origin of an http(s) URL", () => {
    expect(tabOrigin("https://example.com/a/b?c=1#d")).toBe(
      "https://example.com",
    );
    expect(tabOrigin("http://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080");
  });

  test("drops the default port", () => {
    expect(tabOrigin("https://example.com:443/")).toBe("https://example.com");
    expect(tabOrigin("http://example.com:80/")).toBe("http://example.com");
  });

  test("ignores other schemes, unparsable and missing URLs", () => {
    for (const url of [
      "chrome-extension://eicjdlcomdndfepnpfpgpjloecpnkkpj/index.html",
      "chrome://newtab/",
      "about:blank",
      "file:///tmp/a.html",
      "not a url",
      "",
      undefined,
    ]) {
      expect(tabOrigin(url)).toBeUndefined();
    }
  });
});

test.describe("isOpen", () => {
  const open = new Set(["https://example.com", "http://127.0.0.1:8080"]);

  test("matches the same origin with any path", () => {
    expect(isOpen("https://example.com/login", open)).toBe(true);
    expect(isOpen("https://example.com:443", open)).toBe(true);
    expect(isOpen("http://127.0.0.1:8080/admin", open)).toBe(true);
  });

  test("does not match another scheme, host or port", () => {
    expect(isOpen("http://example.com/", open)).toBe(false);
    expect(isOpen("https://www.example.com/", open)).toBe(false);
    expect(isOpen("https://example.com:8443/", open)).toBe(false);
    expect(isOpen("http://127.0.0.1:8081/", open)).toBe(false);
  });

  test("is false with no open tabs", () => {
    expect(isOpen("https://example.com/", new Set())).toBe(false);
  });
});

test.describe("countOpen", () => {
  const open = new Set(["https://example.com"]);

  test("counts the entries whose origin has a tab", () => {
    const entries = [
      { url: "https://example.com/a" },
      { url: "https://example.com/b" },
      { url: "https://www.example.com/" },
      { url: "http://example.com/" },
    ].map((fields, index) => ({
      id: String(index),
      topicId: "t",
      name: `Entry ${index}`,
      description: "",
      username: "",
      password: "",
      extraUrl: "",
      twoFactorNote: "",
      createdAt: "2026-10-28T00:00:00.000Z",
      updatedAt: "2026-10-28T00:00:00.000Z",
      ...fields,
    }));
    expect(countOpen(entries, open)).toBe(2);
    expect(countOpen(entries, new Set())).toBe(0);
    expect(countOpen([], open)).toBe(0);
  });
});
