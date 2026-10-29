// Renders the welcome/settings card to PNGs without launching the app: SwiftUI hosted in an offscreen window.
// (ImageRenderer draws Form/Toggle as blank - measured 2026-10-28 - so this uses NSHostingView + cacheDisplay.)
// Run: research/harness/card-snapshot.sh <outdir>

import SwiftUI
import AppKit

func save(_ view: NSView, _ path: String) {
    guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { print("FAIL", path); return }
    view.cacheDisplay(in: view.bounds, to: rep)
    if let d = rep.representation(using: .png, properties: [:]) { try? d.write(to: URL(fileURLWithPath: path)); print("wrote", path) }
}

func render(_ name: String, dark: Bool, _ model: CardModel, into dir: String) {
    // cacheDisplay omits the window background, so draw it: otherwise dark mode is light text on white.
    let host = NSHostingView(rootView: CardView(model: model).background(Color(nsColor: .windowBackgroundColor)))
    host.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
    let size = host.fittingSize
    host.frame = NSRect(origin: .zero, size: size)
    let w = NSWindow(contentRect: host.frame, styleMask: [.titled], backing: .buffered, defer: false)
    w.appearance = host.appearance
    w.contentView = host
    host.layoutSubtreeIfNeeded()
    RunLoop.current.run(until: Date().addingTimeInterval(0.4))
    save(host, "\(dir)/\(name)-\(dark ? "dark" : "light").png")
    w.close()
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let dir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
MainActor.assumeIsolated {
    for dark in [false, true] {
        let demo = CardModel(); demo.screen = .demo
        render("1-demo", dark: dark, demo, into: dir)
        let worked = CardModel(); worked.screen = .demo; worked.worked = true
        render("2-demo-worked", dark: dark, worked, into: dir)
        let settings = CardModel(); settings.loginOn = true
        render("3-settings", dark: dark, settings, into: dir)
        let waiting = CardModel(); waiting.renderOn = true; waiting.waitingForInputMonitoring = true
        render("4-settings-waiting", dark: dark, waiting, into: dir)
    }
}
