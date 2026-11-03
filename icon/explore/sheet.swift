import AppKit
// usage: sheet spec.json  - grid of icon PNGs on a light and a mid-gray strip is unnecessary: one light bg, row/col labels
let spec = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [String: Any]
let rows = spec["rows"] as! [String], cols = spec["cols"] as! [String], cells = spec["cells"] as! [[String]]
let S: CGFloat = 230, M: CGFloat = 90, T: CGFloat = 30
let W = Int(M + CGFloat(cols.count) * S + 10), Hh = Int(T + CGFloat(rows.count) * S + 10)
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: W, pixelsHigh: Hh, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor(white: 0.94, alpha: 1).setFill(); NSRect(x: 0, y: 0, width: W, height: Hh).fill()
let at: [NSAttributedString.Key: Any] = [.foregroundColor: NSColor.darkGray, .font: NSFont.systemFont(ofSize: 14, weight: .medium)]
for (c, n) in cols.enumerated() { (n as NSString).draw(at: NSPoint(x: M + CGFloat(c) * S + 80, y: CGFloat(Hh) - 22), withAttributes: at) }
for (r, n) in rows.enumerated() {
  let y = CGFloat(Hh) - T - CGFloat(r + 1) * S
  (n as NSString).draw(at: NSPoint(x: 8, y: y + S / 2 - 8), withAttributes: at)
  for c in 0..<cols.count { NSImage(contentsOfFile: cells[r][c])!.draw(in: NSRect(x: M + CGFloat(c) * S, y: y + 5, width: S - 10, height: S - 10)) }
}
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: spec["out"] as! String))
