import { describe, expect, test } from "vitest";

import * as Ids from "./domain/ids";
import { init } from "./main";
import { fileNameOf, isDirty } from "./model";

describe("fileNameOf", () => {
  test("derives the file name from POSIX and Windows paths", () => {
    expect(fileNameOf("/Users/me/models/blog.domain.json")).toBe("blog.domain.json");
    expect(fileNameOf("C:\\Users\\me\\blog.domain.json")).toBe("blog.domain.json");
  });
});

describe("init", () => {
  test("the built-in sample starts out with no unsaved changes", () => {
    const { model } = init({
      screen: { width: 1400, height: 900 },
      idState: Ids.seed([1, 2, 3, 4]),
      recentCommandIds: [],
    });
    expect(isDirty(model)).toBe(false);
  });
});
