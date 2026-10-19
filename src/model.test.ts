import { describe, expect, test } from "vitest";

import { fileNameOf } from "./model";

describe("fileNameOf", () => {
  test("derives the file name from POSIX and Windows paths", () => {
    expect(fileNameOf("/Users/me/models/blog.domain.json")).toBe("blog.domain.json");
    expect(fileNameOf("C:\\Users\\me\\blog.domain.json")).toBe("blog.domain.json");
  });
});
