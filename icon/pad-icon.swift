// Place a full-bleed icon render on the macOS app-icon grid: the rounded square occupies 824 of 1024, centred
// (ictool exports the tile edge to edge; Apple's own .icns leave ~10% transparent margin).
// usage: swift pad-icon.swift <in.png> <out.png> <pixels>
import AppKit
let a = CommandLine.arguments, n = Int(a[3])!
let src = NSImage(contentsOfFile: a[1])!
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: n, pixelsHigh: n, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSGraphicsContext.current!.imageInterpolation = .high
let side = CGFloat(n) * 824 / 1024, o = (CGFloat(n) - side) / 2
src.draw(in: NSRect(x: o, y: o, width: side, height: side))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
