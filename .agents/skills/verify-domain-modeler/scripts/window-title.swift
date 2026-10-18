// Prints the title of the first on-screen window owned by one of the given pids.
// Usage: swift window-title.swift <pid>[,<pid>...]
import CoreGraphics

let pids = Set(CommandLine.arguments.dropFirst().first?.split(separator: ",").compactMap { Int($0) } ?? [])
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []
for window in windows {
  if let pid = window[kCGWindowOwnerPID as String] as? Int, pids.contains(pid),
     let name = window[kCGWindowName as String] as? String, !name.isEmpty {
    print(name)
    break
  }
}
