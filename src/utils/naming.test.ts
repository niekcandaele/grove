import { describe, it, expect } from "vitest";
import { sanitizeName } from "./naming.js";

describe("sanitizeName", () => {
  it("converts spaces to hyphens", () => {
    expect(sanitizeName("my feature")).toBe("my-feature");
  });

  it("converts to lowercase", () => {
    expect(sanitizeName("My Feature")).toBe("my-feature");
  });

  it("removes git-invalid characters", () => {
    expect(sanitizeName("feature~name")).toBe("featurename");
    expect(sanitizeName("feature^name")).toBe("featurename");
    expect(sanitizeName("feature:name")).toBe("featurename");
    expect(sanitizeName("feature?name")).toBe("featurename");
    expect(sanitizeName("feature*name")).toBe("featurename");
    expect(sanitizeName("feature[name]")).toBe("featurename");
    expect(sanitizeName("feature\\name")).toBe("featurename");
  });

  it("removes filesystem-invalid characters", () => {
    expect(sanitizeName("feature/name")).toBe("featurename");
    expect(sanitizeName('feature"name')).toBe("featurename");
    expect(sanitizeName("feature<name>")).toBe("featurename");
    expect(sanitizeName("feature|name")).toBe("featurename");
  });

  it("collapses multiple hyphens", () => {
    expect(sanitizeName("my--feature")).toBe("my-feature");
    expect(sanitizeName("my---feature")).toBe("my-feature");
    expect(sanitizeName("my  feature")).toBe("my-feature");
  });

  it("trims leading and trailing hyphens", () => {
    expect(sanitizeName("-feature-")).toBe("feature");
    expect(sanitizeName("--feature--")).toBe("feature");
    expect(sanitizeName(" feature ")).toBe("feature");
  });

  it("handles complex inputs", () => {
    expect(sanitizeName("My Feature!")).toBe("my-feature");
    expect(sanitizeName("feature/add-auth")).toBe("featureadd-auth");
    expect(sanitizeName("fix: bug #123")).toBe("fix-bug-123");
  });

  it("throws on empty result", () => {
    expect(() => sanitizeName("")).toThrow("Invalid name");
    expect(() => sanitizeName("***")).toThrow("Invalid name");
    expect(() => sanitizeName("---")).toThrow("Invalid name");
  });

  it("preserves valid characters", () => {
    expect(sanitizeName("feature-123")).toBe("feature-123");
    expect(sanitizeName("my-feature")).toBe("my-feature");
    expect(sanitizeName("abc123")).toBe("abc123");
  });
});
