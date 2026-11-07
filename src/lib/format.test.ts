import { describe, expect, it } from "vitest";
import { orderKey, orderPath, sameOrder } from "./format";

describe("order urls", () => {
  it("uses the numeric Shopify id so the gid slashes stay out of the path", () => {
    expect(orderKey("gid://shopify/Order/1042")).toBe("1042");
    expect(orderPath("gid://shopify/Order/1042")).toBe("/orders/1042");
    expect(sameOrder("gid://shopify/Order/1042", "1042")).toBe(true);
    expect(sameOrder("gid://shopify/Order/1042", "42")).toBe(false);
  });
});
