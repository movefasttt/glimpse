// Glimpse - renders your clipboard as readable text (format.js does the formatting). Copy twice (⌘C⌘C) in any app, or (opt-in)
// press ⌘C with nothing selected.
// One floating panel near the cursor; Esc or click-away closes it. Glimpse only reads the clipboard.

import AppKit
import Carbon
import ServiceManagement
import WebKit
import os

let log = Logger(subsystem: "com.blueball.glimpse", category: "trigger")

// MARK: - Double-copy trigger

/// Fires when the same text is copied twice in quick succession (⌘C⌘C), in any app.
/// Polls changeCount like a clipboard manager does: no permissions, no key monitoring.
/// A single copy that writes several times lands in one tick and counts once. Two different
/// texts (programmatic writers) never pair, and concealed/transient copies (password managers) are ignored.
final class DoubleCopyWatcher {
    static let window: TimeInterval = 0.5
    private var lastCount = NSPasteboard.general.changeCount
    private var lastChange = Date.distantPast
    private var lastText: String?
    private let onDoubleCopy: () -> Void
    static let ignored: Set<NSPasteboard.PasteboardType> = [
        .init("org.nspasteboard.ConcealedType"), .init("org.nspasteboard.TransientType"),
    ]

    init(_ onDoubleCopy: @escaping () -> Void) {
        self.onDoubleCopy = onDoubleCopy
        let timer = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in self?.tick() }
        // A clipboard poll is never urgent; let the system coalesce it so an idle app stays off the CPU.
        timer.tolerance = 0.02
        RunLoop.main.add(timer, forMode: .common)
    }

    private func tick() {
        let pb = NSPasteboard.general
        guard pb.changeCount != lastCount else { return }
        lastCount = pb.changeCount
        // Skip, don't reset: writers clear then write, and a tick can land in between.
        guard Self.ignored.isDisjoint(with: pb.types ?? []), let text = pb.string(forType: .string) else { return }
        let now = Date()
        if now.timeIntervalSince(lastChange) < Self.window, text == lastText {
            lastChange = .distantPast  // a third copy starts a fresh pair
            onDoubleCopy()
        } else {
            lastChange = now
            lastText = text
        }
    }

    /// Glimpse's own copy buttons write the clipboard; skip that write so it can never pair into a re-render.
    func skipOwnWrite() { lastCount = NSPasteboard.general.changeCount }
}

// MARK: - Empty-copy trigger (opt-in)

/// Opt-in: ⌘C with nothing selected shows the clipboard. Most apps write nothing on an empty ⌘C, so the keystroke
/// is the only sign: a listen-only event tap (Input Monitoring) that never blocks or synthesizes keys.
/// Never collides with the double-copy path: fires only if the clipboard did not change within `settle` of ⌘C.
/// Any write means text was selected, and that copy belongs to DoubleCopyWatcher.
final class EmptyCopyWatcher {
    static let settle: TimeInterval = 0.2
    private var tap: CFMachPort?
    private var retry: Timer?
    private var lastFire = Date.distantPast
    private let onEmptyCopy: () -> Void

    init(_ onEmptyCopy: @escaping () -> Void) { self.onEmptyCopy = onEmptyCopy }

    /// Asks for Input Monitoring if needed. The tap can't be created until it is granted, so keep retrying.
    func start() {
        guard tap == nil, retry == nil else { return }
        let granted = CGPreflightListenEventAccess()
        log.info("empty-copy start: input monitoring granted=\(granted)")
        if !granted { log.info("empty-copy request: \(CGRequestListenEventAccess())") }
        attach()
    }

    func stop() {
        retry?.invalidate()
        retry = nil
        if let tap { CFMachPortInvalidate(tap) }
        tap = nil
    }

    private func attach() {
        let callback: CGEventTapCallBack = { _, type, event, me in
            Unmanaged<EmptyCopyWatcher>.fromOpaque(me!).takeUnretainedValue().handle(type, event)
            return Unmanaged.passUnretained(event)
        }
        guard let t = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .tailAppendEventTap, options: .listenOnly,
                                        eventsOfInterest: CGEventMask(1 << CGEventType.keyDown.rawValue),
                                        callback: callback, userInfo: Unmanaged.passUnretained(self).toOpaque()) else {
            log.info("empty-copy tap: not created, retrying in 2 s")
            retry = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self] _ in
                self?.retry = nil
                self?.attach()
            }
            return
        }
        log.info("empty-copy tap: created")
        tap = t
        CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, t, 0), .commonModes)
    }

    private func handle(_ type: CGEventType, _ event: CGEvent) {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return
        }
        guard type == .keyDown, Self.isCommandC(event), event.getIntegerValueField(.keyboardEventAutorepeat) == 0 else { return }
        let before = NSPasteboard.general.changeCount
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.settle) { [weak self] in
            log.info("empty-copy ⌘C: clipboard changed=\(NSPasteboard.general.changeCount != before)")
            guard let self, NSPasteboard.general.changeCount == before,
                  Date().timeIntervalSince(self.lastFire) > DoubleCopyWatcher.window else { return }  // ⌘C⌘C on nothing: once
            self.lastFire = Date()
            self.onEmptyCopy()
        }
    }

    /// ⌘C exactly (no ⇧⌃⌥), matched by character so it follows the layout (Dvorak). Non-Latin input sources
    /// (Korean...) type their own letters, so there the physical C key counts.
    private static func isCommandC(_ e: CGEvent) -> Bool {
        guard e.flags.intersection([.maskCommand, .maskShift, .maskControl, .maskAlternate]) == .maskCommand else { return false }
        let c = NSEvent(cgEvent: e)?.charactersIgnoringModifiers?.lowercased() ?? ""
        return c == "c" || (!(c.first?.isASCII ?? false) && e.getIntegerValueField(.keyboardEventKeycode) == Int64(kVK_ANSI_C))
    }
}

// MARK: - Dogfood capture (dev only)

/// Saves each render - raw input and a panel snapshot - so real usage builds the test corpus.
/// Off unless `defaults write com.blueball.glimpse captureDir <dir>`.
enum Dogfood {
    static var pending: URL?

    static func begin(raw: String, via: String) {
        guard let path = UserDefaults.standard.string(forKey: "captureDir") else { return }
        let stamp = Date().formatted(.iso8601.year().month().day().time(includingFractionalSeconds: false))
            .replacingOccurrences(of: ":", with: "")
        let dir = URL(fileURLWithPath: (path as NSString).expandingTildeInPath).appendingPathComponent("\(stamp)-\(via)")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? raw.write(to: dir.appendingPathComponent("input.txt"), atomically: true, encoding: .utf8)
        pending = dir
    }

    static func snapshot(_ web: WKWebView) {
        guard let dir = pending else { return }
        pending = nil
        png(of: web) { try? $0.write(to: dir.appendingPathComponent("panel.png")) }
    }

    /// Web view is transparent over the panel blur; flatten onto the window background so the PNG reads like the panel.
    /// Visible area only: WebKit paints nothing outside the viewport, so a taller snapshot rect comes back blank.
    static func png(of web: WKWebView, _ done: @escaping (Data) -> Void) {
        web.takeSnapshot(with: nil) { image, _ in
            guard let image else { return }
            let flat = NSImage(size: image.size)
            flat.lockFocus()
            web.effectiveAppearance.performAsCurrentDrawingAppearance { NSColor.windowBackgroundColor.setFill() }
            NSRect(origin: .zero, size: image.size).fill()
            image.draw(at: .zero, from: .zero, operation: .sourceOver, fraction: 1)
            flat.unlockFocus()
            guard let tiff = flat.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else { return }
            done(png)
        }
    }
}

// MARK: - Panel

final class GlimpsePanel: NSPanel {
    /// Set by the first click, scroll or key inside the panel: from then on losing focus no longer closes it.
    var engaged = false
    override var canBecomeKey: Bool { true }
    override func cancelOperation(_ sender: Any?) { close() }
    override func sendEvent(_ event: NSEvent) {
        if [.leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel, .keyDown].contains(event.type) { engaged = true }
        super.sendEvent(event)
    }
}

/// The web view swallows drags (text selection), titlebar included; this strip over the titlebar moves the window.
final class DragStrip: NSView {
    override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
}

final class Viewer: NSObject, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    static let width: CGFloat = 680
    /// ⌘+ / ⌘- / ⌘0 steps, as in Safari. The level is remembered: it is how big the user reads, not a per-text choice.
    static let zoomSteps: [CGFloat] = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
    static let zoomKey = "zoom"
    /// The panel's minimum width scales with the zoom, so zooming in keeps the same line length, only larger.
    var minWidth: CGFloat { Viewer.width * web.pageZoom }
    let panel: GlimpsePanel
    let web: WKWebView
    let template: String
    let mermaidJS: String
    let copyButton = Viewer.button("doc.on.doc", "Copy formatted", #selector(Viewer.copyShown))
    let imageButton = Viewer.button("photo", "Copy as image", #selector(Viewer.copyImage))
    let rawButton = Viewer.button("chevron.left.forwardslash.chevron.right", "Show original", #selector(Viewer.toggleRaw))

    override init() {
        panel = GlimpsePanel(
            contentRect: NSRect(x: 0, y: 0, width: Viewer.width, height: 200),
            styleMask: [.titled, .closable, .resizable, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered, defer: false)
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.isMovableByWindowBackground = true
        panel.level = .floating
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true

        let blur = NSVisualEffectView()
        blur.material = .popover
        blur.blendingMode = .behindWindow
        blur.state = .active

        let config = WKWebViewConfiguration()
        web = WKWebView(frame: .zero, configuration: config)
        web.setValue(false, forKey: "drawsBackground")
        let zoom = UserDefaults.standard.double(forKey: Viewer.zoomKey)
        web.pageZoom = zoom > 0 ? zoom : 1

        let res = Bundle.main.resourceURL!
        let read = { (f: String) in (try? String(contentsOf: res.appendingPathComponent(f), encoding: .utf8)) ?? "" }
        template = read("template.html")
            .replacingOccurrences(of: "/*MARKED*/", with: read("marked.min.js"))
            .replacingOccurrences(of: "/*FORMAT*/", with: read("format.js"))
        mermaidJS = read("mermaid.min.js")
        super.init()

        config.userContentController.add(self, name: "size")
        config.userContentController.add(self, name: "rendered")
        config.userContentController.add(self, name: "width")
        web.navigationDelegate = self
        blur.addSubview(web)
        web.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: blur.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: blur.trailingAnchor),
            web.topAnchor.constraint(equalTo: blur.topAnchor),
            web.bottomAnchor.constraint(equalTo: blur.bottomAnchor),
        ])
        let strip = DragStrip()
        blur.addSubview(strip)
        strip.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            strip.leadingAnchor.constraint(equalTo: blur.leadingAnchor),
            strip.trailingAnchor.constraint(equalTo: blur.trailingAnchor),
            strip.topAnchor.constraint(equalTo: blur.topAnchor),
            strip.heightAnchor.constraint(equalToConstant: 28),
        ])
        // Buttons sit inside the strip: hit-testing gives them their clicks, the strip still drags everywhere else.
        rawButton.setButtonType(.pushOnPushOff)
        let buttons = NSStackView(views: [copyButton, imageButton, rawButton])
        buttons.spacing = 2
        strip.addSubview(buttons)
        buttons.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            buttons.trailingAnchor.constraint(equalTo: strip.trailingAnchor, constant: -8),
            buttons.centerYAnchor.constraint(equalTo: strip.centerYAnchor),
        ])
        [copyButton, imageButton, rawButton].forEach { $0.target = self }
        panel.contentView = blur
        panel.delegate = self
    }

    /// Lines that could open a mermaid diagram. Only gates the 5.5MB bundle; mermaid's parser makes the real call.
    static let mermaidHint = try! NSRegularExpression(
        pattern: #"^\s*(mermaid|graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey|xychart|block|packet|kanban|architecture|requirement|C4|radar|treemap)\b"#,
        options: .anchorsMatchLines)

    /// Names the page load in flight; the page echoes it in its `rendered` message, so a late message from an
    /// earlier page can never trigger this load's push.
    private var loadToken = 0
    /// Set by a ⌘C⌘C render: the clipboard count to push over. Pushes only if nothing was copied since (the user's newer copy wins).
    private var pushOverCount: Int?

    func show(_ text: String, push: Bool = false) {
        loadToken += 1
        pushOverCount = push ? NSPasteboard.general.changeCount : nil
        // JSONEncoder escapes "/" (so "</script>" is safe) but not "<": "<!--<script" would swallow the page's own </script>.
        let json = ((try? JSONEncoder().encode(text)).flatMap { String(data: $0, encoding: .utf8) } ?? "\"\"")
            .replacingOccurrences(of: "<", with: "\\u003c")
        let mayHaveDiagram = Viewer.mermaidHint.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
        let html = template
            .replacingOccurrences(of: "/*MERMAID*/", with: mayHaveDiagram ? mermaidJS : "")
            .replacingOccurrences(of: "/*SOURCE*/", with: json)
            .replacingOccurrences(of: "/*TOKEN*/0", with: String(loadToken))
        web.loadHTMLString(html, baseURL: nil)
        showRawState(false)
        panel.engaged = false

        let mouse = NSEvent.mouseLocation
        // No force unwrap: a screen-less moment must not crash the app, it just skips positioning.
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(mouse) }) ?? NSScreen.main else { return }
        let vis = screen.visibleFrame
        var frame = panel.frame
        frame.size.width = min(minWidth, vis.width * 0.85)
        frame.origin.x = min(max(mouse.x - frame.width / 2, vis.minX + 12), vis.maxX - frame.width - 12)
        frame.origin.y = min(max(mouse.y - 24 - frame.height, vis.minY + 12), vis.maxY - frame.height)
        panel.setFrame(frame, display: false)

        if !panel.isVisible { panel.alphaValue = 0 }
        panel.makeKeyAndOrderFront(nil)
        NSAnimationContext.runAnimationGroup { $0.duration = 0.12; panel.animator().alphaValue = 1 }
    }

    // Fit the panel to rendered content: width from the page's `width` message, height keeping the top edge anchored.
    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "rendered" {
            if message.body as? Int == loadToken, let count = pushOverCount, count == NSPasteboard.general.changeCount {
                copyFormatted()
            }
            pushOverCount = nil
            return
        }
        // Width: the page's widest unwrappable block, clamped to 680..85% of the screen, re-centered on the panel's
        // center; then the page re-measures its height at the new width. Each summon starts again at 680.
        if message.name == "width" {
            guard let w = message.body as? Double, let vis = panel.screen?.visibleFrame else { return }
            var frame = panel.frame
            let width = min(max(CGFloat(w) * web.pageZoom, minWidth), vis.width * 0.85)  // the page measures in CSS px
            guard abs(width - frame.width) > 1 else { return }
            frame.origin.x = min(max(frame.midX - width / 2, vis.minX + 12), vis.maxX - width - 12)
            frame.size.width = width
            panel.setFrame(frame, display: true, animate: false)
            web.evaluateJavaScript("postSize()")
            return
        }
        guard let h = message.body as? Double, let screen = panel.screen else { return }
        var frame = panel.frame
        let top = frame.maxY
        frame.size.height = min(max(CGFloat(h) * web.pageZoom, 80), screen.visibleFrame.height * 0.85)
        frame.origin.y = max(top - frame.height, screen.visibleFrame.minY + 12)
        panel.setFrame(frame, display: true, animate: false)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { Dogfood.snapshot(self.web) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.navigationType == .linkActivated, let url = action.request.url {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }

    // MARK: Zoom (View menu: ⌘+, ⌘-, ⌘0)

    @objc func zoomIn() { setZoom(Viewer.zoomSteps.first { $0 > web.pageZoom + 0.001 } ?? web.pageZoom) }
    @objc func zoomOut() { setZoom(Viewer.zoomSteps.last { $0 < web.pageZoom - 0.001 } ?? web.pageZoom) }
    @objc func actualSize() { setZoom(1) }

    func setZoom(_ z: CGFloat) {
        guard z != web.pageZoom else { return }
        web.pageZoom = z
        UserDefaults.standard.set(z, forKey: Viewer.zoomKey)
        web.evaluateJavaScript("glimpseMeasure()")  // width and height again, at the new scale
    }

    /// A closed panel is a dismissed render: a push still in flight must not touch the clipboard.
    func windowWillClose(_ notification: Notification) { pushOverCount = nil }
    func windowDidResignKey(_ notification: Notification) { if !panel.engaged { panel.close() } }

    // MARK: Buttons (visual, not shortcuts: discoverable without learning anything)

    /// Icon only, outline on hover. Never first responder, so ⌘C keeps going to the web view's selection.
    static func button(_ symbol: String, _ tip: String, _ action: Selector) -> NSButton {
        let b = NSButton(image: NSImage(systemSymbolName: symbol, accessibilityDescription: tip)!, target: nil, action: action)
        b.bezelStyle = .recessed
        b.showsBorderOnlyWhileMouseInside = true
        b.refusesFirstResponder = true
        b.contentTintColor = .secondaryLabelColor
        b.toolTip = tip
        b.widthAnchor.constraint(equalToConstant: 26).isActive = true
        return b
    }

    /// User-initiated, so it fits "read-only toward the world". The watcher skips the write; the icon confirms it.
    func writePasteboard(_ button: NSButton, restore symbol: String, _ fill: (NSPasteboard) -> Void) {
        let pb = NSPasteboard.general
        pb.clearContents()
        fill(pb)
        (NSApp.delegate as? AppDelegate)?.watcher?.skipOwnWrite()
        button.image = NSImage(systemSymbolName: "checkmark", accessibilityDescription: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: button.toolTip)
        }
    }

    /// The copy button copies what the panel shows: the formatted version, or the original while that is showing.
    @objc func copyShown() {
        guard rawButton.state == .on else { return copyFormatted() }
        web.evaluateJavaScript("source") { result, _ in
            guard let text = result as? String, !text.isEmpty else { return }
            self.writePasteboard(self.copyButton, restore: "doc.on.doc") { $0.setString(text, forType: .string) }
        }
    }

    @objc func copyFormatted() {
        web.evaluateJavaScript("glimpseCopyPayload()") { result, _ in
            // An empty read (page not rendered yet) must never replace what the user copied.
            guard let p = result as? [String: String], let text = p["text"], !text.isEmpty else { return }
            // Plain text only (the maintainer, 2026-10-28): no HTML flavor, so every app receives the same minimal markdown.
            self.writePasteboard(self.copyButton, restore: "doc.on.doc") { $0.setString(text, forType: .string) }
        }
    }

    @objc func copyImage() {
        Dogfood.png(of: web) { png in self.writePasteboard(self.imageButton, restore: "photo") { $0.setData(png, forType: .png) } }
    }

    // The button flips its own state on click; the page's answer is the truth.
    @objc func toggleRaw() {
        web.evaluateJavaScript("glimpseToggleRaw()") { result, _ in self.showRawState(result as? Bool ?? false) }
    }

    /// Accent tint too, not just the on-state bezel: the bezel only shows on hover.
    func showRawState(_ raw: Bool) {
        rawButton.state = raw ? .on : .off
        rawButton.contentTintColor = raw ? .controlAccentColor : .secondaryLabelColor
        rawButton.toolTip = raw ? "Show formatted" : "Show original"
        copyButton.toolTip = raw ? "Copy original" : "Copy formatted"
    }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate {
    var viewer: Viewer!
    var status: NSStatusItem!
    var watcher: DoubleCopyWatcher?
    var emptyCopy: EmptyCopyWatcher!
    var pendingFiles: [URL] = []
    var card: WelcomeCard!

    func applicationDidFinishLaunching(_ n: Notification) {
        viewer = Viewer()
        buildMainMenu()
        watcher = DoubleCopyWatcher { [weak self] in self?.renderClipboard(via: "copy") }
        emptyCopy = EmptyCopyWatcher { [weak self] in
            guard let self, !self.viewer.panel.isKeyWindow else { return }  // ⌘C inside the panel is the panel's own
            self.renderClipboard(via: "empty-copy")
        }
        applyEmptyCopy()
        buildStatusItem()
        card = WelcomeCard(app: self)
        if !UserDefaults.standard.bool(forKey: WelcomeCard.shownKey) {
            UserDefaults.standard.set(true, forKey: WelcomeCard.shownKey)  // set on show: it never reappears on its own
            card.show(tryIt: true)
        }
        NSApp.servicesProvider = self
        NSUpdateDynamicServices()
        pendingFiles.forEach(openFile)
        pendingFiles = []
    }

    func application(_ app: NSApplication, open urls: [URL]) {
        if viewer == nil { pendingFiles += urls } else { urls.forEach(openFile) }
    }

    func openFile(_ url: URL) {
        guard let s = try? String(contentsOf: url, encoding: .utf8) else { NSSound.beep(); return }
        render(s, via: "file")
        // Files the CLI dropped for us in its own sweep dir are disposable; a user-opened .md is not.
        if url.lastPathComponent.hasPrefix("glimpse-"), url.deletingLastPathComponent().lastPathComponent.hasPrefix("glimpse-") {
            try? FileManager.default.removeItem(at: url)
        }
    }

    /// Only ⌘C⌘C pushes the formatted result back: it is the one gesture that is itself a copy (docs/design.md, 2026-10-24).
    func render(_ raw: String, via: String) {
        Dogfood.begin(raw: raw, via: via)
        viewer.show(raw, push: via == "copy" && Self.pushOn)
        card.didRender(raw)
    }

    // Right-click > Services > Render with Glimpse, in apps that implement Services (not every app does).
    @objc func renderService(_ pb: NSPasteboard, userData: String?, error: AutoreleasingUnsafeMutablePointer<NSString?>) {
        guard let text = Self.readable(pb) else { NSSound.beep(); return }
        render(text, via: "service")
    }

    @objc func renderClipboard() { renderClipboard(via: "menu") }

    func renderClipboard(via: String) {
        guard let text = Self.readable(.general) else { NSSound.beep(); return }
        render(text, via: via)
    }

    /// The one read path for every trigger. Concealed/transient copies (password managers) are never shown,
    /// whichever route reached them - hotkey, double copy, Services or file.
    static func readable(_ pb: NSPasteboard) -> String? {
        guard DoubleCopyWatcher.ignored.isDisjoint(with: pb.types ?? []),
              let text = pb.string(forType: .string), !text.isEmpty else { return nil }
        return text
    }

    /// Opens the releases page in the browser: no update traffic from the app itself, so "no network" stays literally true.
    @objc func checkForUpdates() {
        if let url = URL(string: "https://github.com/movefasttt/glimpse/releases") { NSWorkspace.shared.open(url) }
    }

    /// Returns whether the system accepted the change; the caller shows the real state either way.
    @discardableResult func setLaunchAtLogin(_ on: Bool) -> Bool {
        let svc = SMAppService.mainApp
        do {
            if on { try svc.register() } else { try svc.unregister() }
        } catch { return false }
        return true
    }

    @objc func toggleLogin(_ item: NSMenuItem) {
        if !setLaunchAtLogin(SMAppService.mainApp.status != .enabled) { NSSound.beep() }
        item.state = SMAppService.mainApp.status == .enabled ? .on : .off
    }

    @objc func showSettings() { card.show(tryIt: false) }

    // MARK: ⌘C on nothing
    //
    // Opt-in (needs Input Monitoring). Tied to ⌘C itself: "nothing is selected" is read as "the app copied nothing",
    // so it cannot move to another key. A global shortcut was cut for 1.0 (the maintainer, 2026-10-28): without reading the
    // selection (Accessibility) it can only render the clipboard, which is the same as ⌘C ⌘C with an extra step.

    static let emptyCopyKey = "emptyCopyShowsClipboard"
    static let pushKey = "copyFormattedOnRender"
    /// Opt-out: on until the user turns it off in Settings.
    static var pushOn: Bool { UserDefaults.standard.object(forKey: pushKey) as? Bool ?? true }

    func applyEmptyCopy() {
        if UserDefaults.standard.bool(forKey: Self.emptyCopyKey) { emptyCopy.start() } else { emptyCopy.stop() }
    }

    /// Opening Glimpse again (Finder, Spotlight) answers "where did it go?" with the settings card.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        card.show(tryIt: false)
        return false
    }

    @objc func toggleEmptyCopy(_ item: NSMenuItem) {
        setEmptyCopy(!UserDefaults.standard.bool(forKey: Self.emptyCopyKey))
        item.state = UserDefaults.standard.bool(forKey: Self.emptyCopyKey) ? .on : .off
    }

    func setEmptyCopy(_ on: Bool) {
        UserDefaults.standard.set(on, forKey: Self.emptyCopyKey)
        applyEmptyCopy()
        // No System Settings jump: the system's own prompt (Open System Settings / Deny) is the way there.
        // (An ad-hoc build got no prompt on 27 - dev builds are Developer ID signed now.)
        buildMenu()
    }

    /// Menu bar glyph: the app icon's lens distilled to a template - a ring with three left-aligned bars
    /// (docs/icon-design.md "Menu bar icon", variant 1; source sheet icon/menubar/menubar.swift).
    static func statusGlyph() -> NSImage {
        let im = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { _ in
            NSColor.black.set()
            let ring = NSBezierPath(ovalIn: NSRect(x: 2.4, y: 2.4, width: 13.2, height: 13.2))
            ring.lineWidth = 1.6
            ring.stroke()
            for (w, y) in [(5.2, 11.6), (6.6, 9.0), (4.2, 6.4)] as [(CGFloat, CGFloat)] {
                NSBezierPath(roundedRect: NSRect(x: 5.4, y: y - 0.8, width: w, height: 1.6), xRadius: 0.8, yRadius: 0.8).fill()
            }
            return true
        }
        im.isTemplate = true
        im.accessibilityDescription = "Glimpse"
        return im
    }

    func buildStatusItem() {
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        status.button?.image = Self.statusGlyph()
        buildMenu()
    }

    func buildMenu() {
        let menu = NSMenu()
        menu.addItem(withTitle: "Render Clipboard", action: #selector(renderClipboard as () -> Void), keyEquivalent: "")
        menu.addItem(.separator())
        let render = menu.addItem(withTitle: "⌘C With Nothing Selected Renders Clipboard", action: #selector(toggleEmptyCopy(_:)), keyEquivalent: "")
        render.state = UserDefaults.standard.bool(forKey: Self.emptyCopyKey) ? .on : .off
        render.toolTip = "Needs Input Monitoring. Glimpse only listens for ⌘C; it never blocks or sends keys."
        let login = menu.addItem(withTitle: "Launch at Login", action: #selector(toggleLogin(_:)), keyEquivalent: "")
        login.state = SMAppService.mainApp.status == .enabled ? .on : .off
        menu.addItem(.separator())
        menu.addItem(withTitle: "Settings…", action: #selector(showSettings), keyEquivalent: ",")
        menu.addItem(withTitle: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: "")
        menu.addItem(withTitle: "Quit Glimpse", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.items.forEach { if $0.action != #selector(NSApplication.terminate(_:)) { $0.target = self } }
        status.menu = menu
    }

    // Invisible for an accessory app, but routes ⌘C / ⌘A / ⌘W to the panel.
    func buildMainMenu() {
        let main = NSMenu()
        let appMenu = NSMenu(title: "Glimpse")
        appMenu.addItem(withTitle: "Settings…", action: #selector(showSettings), keyEquivalent: ",")
        let appItem = NSMenuItem()
        appItem.submenu = appMenu
        main.addItem(appItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let item = NSMenuItem()
        item.submenu = edit
        main.addItem(item)
        // No menu bar shows (accessory app); these exist for their key equivalents while the panel is key.
        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Zoom In", action: #selector(Viewer.zoomIn), keyEquivalent: "+")
        view.addItem(withTitle: "Zoom In", action: #selector(Viewer.zoomIn), keyEquivalent: "=")  // ⌘= : ⌘+ without shift
        view.addItem(withTitle: "Zoom Out", action: #selector(Viewer.zoomOut), keyEquivalent: "-")
        view.addItem(withTitle: "Actual Size", action: #selector(Viewer.actualSize), keyEquivalent: "0")
        view.items.forEach { $0.target = viewer }
        let viewItem = NSMenuItem()
        viewItem.submenu = view
        main.addItem(viewItem)
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
