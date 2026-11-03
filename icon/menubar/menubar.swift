// Menu bar (status item) icon variants for Glimpse: template glyphs distilled from the app icon (lens ring + three bars, text pills).
// usage: swift menubar.swift -> variants/<name>.png (@2x template) + sheet.png (8x preview, light + dark mock menu bars)
import AppKit
let H: CGFloat = 18, LW: CGFloat = 1.6
struct V { let name: String; let w: CGFloat; let draw: (CGFloat) -> Void }   // draw in pt, origin bottom-left, height 18
func cap(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat = LW) { NSBezierPath(roundedRect: NSRect(x: x, y: y - h/2, width: w, height: h), xRadius: h/2, yRadius: h/2).fill() }
func ring(_ cx: CGFloat, _ r: CGFloat, _ lw: CGFloat = LW) { let p = NSBezierPath(ovalIn: NSRect(x: cx - r, y: 9 - r, width: 2*r, height: 2*r)); p.lineWidth = lw; p.stroke() }
func bars(_ cx: CGFloat, _ ws: [CGFloat] = [5.2, 6.6, 4.2], _ ys: [CGFloat] = [11.6, 9, 6.4], _ h: CGFloat = LW) { for (w, y) in zip(ws, ys) { cap(cx - 3.6, y, w, h) } }
func edge(_ cx: CGFloat, _ r: CGFloat, _ y: CGFloat) -> CGFloat { sqrt(max(0, r*r - (y-9)*(y-9))) }
func left(_ cx: CGFloat, _ r: CGFloat, _ ws: [CGFloat], _ ys: [CGFloat] = [11.6, 9, 6.4], gap: CGFloat = 1.4) { for (w, y) in zip(ws, ys) { let e = cx - edge(cx, r + LW/2, y) - gap; cap(e - w, y, w) } }
func right(_ cx: CGFloat, _ r: CGFloat, _ ws: [CGFloat?], _ ys: [CGFloat] = [11.6, 9, 6.4], gap: CGFloat = 1.4) { for (w, y) in zip(ws, ys) { if let w { cap(cx + edge(cx, r + LW/2, y) + gap, y, w) } } }
let R: CGFloat = 6.6
let vs: [V] = [
  V(name: "0 current (SF doc.text.magnifyingglass)", w: 18) { _ in },
  V(name: "1 lens only", w: 18) { _ in ring(9, R); bars(9) },
  V(name: "2 lens + left pills", w: 24) { _ in ring(15.4, R); bars(15.4); left(15.4, R, [3.6, 2.4, 3.2]) },
  V(name: "3 lens + both sides, one missing", w: 27) { _ in ring(14, R); bars(14); left(14, R, [3.6, 2.4, 3.2]); right(14, R, [2.6, nil, 3.0]) },
  V(name: "4 lens right + left pills, long", w: 26) { _ in ring(17.4, R); bars(17.4); left(17.4, R, [5.2, 3.2, 4.6]) },
  V(name: "5 thick ring, two bars", w: 18) { _ in ring(9, R, 2.2); bars(9, [5.6, 4.2], [10.4, 7.6], 2.0) },
  V(name: "6 filled lens, bars cut out", w: 18) { _ in
      NSBezierPath(ovalIn: NSRect(x: 9 - R - LW/2, y: 9 - R - LW/2, width: 2*R + LW, height: 2*R + LW)).fill()
      NSGraphicsContext.current!.compositingOperation = .destinationOut; bars(9); NSGraphicsContext.current!.compositingOperation = .sourceOver },
  V(name: "7 filled lens + left pills", w: 24) { _ in
      NSBezierPath(ovalIn: NSRect(x: 15.4 - R - LW/2, y: 9 - R - LW/2, width: 2*R + LW, height: 2*R + LW)).fill()
      NSGraphicsContext.current!.compositingOperation = .destinationOut; bars(15.4); NSGraphicsContext.current!.compositingOperation = .sourceOver
      left(15.4, R, [3.6, 2.4, 3.2]) },
]
func glyph(_ v: V, scale: CGFloat, color: NSColor) -> NSImage {
  if v.w == 18 && v.name.hasPrefix("0") {
    let s = NSImage(systemSymbolName: "doc.text.magnifyingglass", accessibilityDescription: nil)!.withSymbolConfiguration(.init(pointSize: 15 * scale, weight: .regular))!
    let im = NSImage(size: NSSize(width: v.w * scale, height: H * scale)); im.lockFocus()
    let r = NSRect(x: (v.w*scale - s.size.width)/2, y: (H*scale - s.size.height)/2, width: s.size.width, height: s.size.height)
    s.draw(in: r); color.set(); r.fill(using: .sourceAtop); im.unlockFocus(); return im
  }
  let im = NSImage(size: NSSize(width: v.w * scale, height: H * scale)); im.lockFocus()
  NSGraphicsContext.current!.cgContext.scaleBy(x: scale, y: scale); color.set(); v.draw(scale); im.unlockFocus(); return im
}
func png(_ im: NSImage, _ path: String) { let r = NSBitmapImageRep(data: im.tiffRepresentation!)!; try! r.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path)) }
try? FileManager.default.createDirectory(atPath: "variants", withIntermediateDirectories: true)
for v in vs { png(glyph(v, scale: 2, color: .black), "variants/\(v.name.split(separator: " ")[0]).png") }
// sheet: per row: name | 8x black on white | light menu bar @2x | dark menu bar @2x
let rowH: CGFloat = 170, W: CGFloat = 1500
let sheet = NSImage(size: NSSize(width: W, height: rowH * CGFloat(vs.count))); sheet.lockFocus()
NSColor(white: 0.97, alpha: 1).setFill(); NSRect(x: 0, y: 0, width: W, height: rowH * CGFloat(vs.count)).fill()
for (i, v) in vs.enumerated() {
  let y = rowH * CGFloat(vs.count - 1 - i)
  (v.name as NSString).draw(at: NSPoint(x: 16, y: y + rowH/2 - 8), withAttributes: [.font: NSFont.systemFont(ofSize: 15)])
  glyph(v, scale: 7, color: .black).draw(at: NSPoint(x: 300, y: y + (rowH - H*7)/2), from: .zero, operation: .sourceOver, fraction: 1)
  for (j, dark) in [false, true].enumerated() {
    let bx: CGFloat = 560 + CGFloat(j) * 470, bar = NSRect(x: bx, y: y + rowH/2 - 22, width: 440, height: 44)
    (dark ? NSColor(white: 0.13, alpha: 1) : NSColor(white: 0.93, alpha: 1)).setFill(); bar.fill()
    let fg: NSColor = dark ? .white : NSColor(white: 0, alpha: 0.85)
    var x = bx + 40
    for s in ["wifi", "battery.75percent"] { let im = NSImage(systemSymbolName: s, accessibilityDescription: nil)!.withSymbolConfiguration(.init(pointSize: 28, weight: .regular))!; let t = NSImage(size: im.size); t.lockFocus(); im.draw(at: .zero, from: .zero, operation: .sourceOver, fraction: 1); fg.set(); NSRect(origin: .zero, size: im.size).fill(using: .sourceAtop); t.unlockFocus(); t.draw(at: NSPoint(x: x, y: bar.midY - im.size.height/2), from: .zero, operation: .sourceOver, fraction: 1); x += im.size.width + 34 }
    let g = glyph(v, scale: 2, color: fg); g.draw(at: NSPoint(x: x, y: bar.midY - g.size.height/2), from: .zero, operation: .sourceOver, fraction: 1)
    ("Thu 3:42 PM" as NSString).draw(at: NSPoint(x: x + g.size.width + 30, y: bar.midY - 14), withAttributes: [.font: NSFont.systemFont(ofSize: 26), .foregroundColor: fg])
  }
}
sheet.unlockFocus(); png(sheet, "sheet.png")
