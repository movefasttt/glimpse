// The welcome/settings window: hosts CardView and wires CardModel to the app. Two screens in one window - a demo
// (drag the sample, press ⌘C twice) then settings; first run shows both, later opens only settings.

import AppKit
import Carbon
import ServiceManagement
import SwiftUI

final class WelcomeCard: NSObject, NSWindowDelegate {
    static let shownKey = "welcomeCardShown"

    private weak var app: AppDelegate?
    private let model = CardModel()
    private var window: NSWindow?
    private var poll: Timer?

    init(app: AppDelegate) {
        self.app = app
        super.init()
        model.setLogin = { [weak self] on in
            if self?.app?.setLaunchAtLogin(on) == false { NSSound.beep() }
            self?.refresh()
        }
        model.setPush = { [weak self] on in
            UserDefaults.standard.set(on, forKey: AppDelegate.pushKey)
            self?.refresh()
        }
        model.setRender = { [weak self] on in
            self?.app?.setEmptyCopy(on)
            self?.refresh()
        }
        model.openURL = { if let url = URL(string: $0) { NSWorkspace.shared.open(url) } }
        model.close = { [weak self] in self?.window?.close() }
    }

    /// `tryIt`: first-run demo before the settings; false shows the settings alone.
    func show(tryIt: Bool) {
        model.screen = tryIt ? .demo : .settings
        model.worked = false
        refresh()
        let w = window ?? build()
        window = w
        if !w.isVisible { w.center() }
        NSApp.activate(ignoringOtherApps: true)
        w.makeKeyAndOrderFront(nil)
        poll?.invalidate()
        // Input Monitoring is granted in System Settings, outside the app: watch it while the card is open.
        poll = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.refresh() }
    }

    /// Any render while the demo is up counts: the user may select only part of the sample.
    func didRender(_ raw: String) {
        guard model.screen == .demo, window?.isVisible == true else { return }
        model.worked = true
    }

    private func build() -> NSWindow {
        // The material is the window's tint: a translucent system background instead of a flat opaque colour.
        let controller = NSHostingController(rootView: CardView(model: model).background(.regularMaterial))
        controller.sizingOptions = [.preferredContentSize]  // the window follows the screen's height
        let w = NSWindow(contentViewController: controller)
        // No title bar chrome: the content runs to the top edge, only the traffic lights remain.
        w.styleMask = [.titled, .closable, .fullSizeContentView]
        w.titlebarAppearsTransparent = true
        w.titleVisibility = .visible  // centered, as macOS does it
        w.isOpaque = false
        w.backgroundColor = .clear
        w.isMovableByWindowBackground = true
        w.title = "Glimpse"
        w.isReleasedWhenClosed = false
        w.delegate = self
        return w
    }

    /// Makes the model match the settings; also run by the poll, so a grant made in System Settings shows up.
    func refresh() {
        model.loginOn = SMAppService.mainApp.status == .enabled
        model.pushOn = AppDelegate.pushOn
        model.renderOn = UserDefaults.standard.bool(forKey: AppDelegate.emptyCopyKey)
        model.waitingForInputMonitoring = model.renderOn && !CGPreflightListenEventAccess()
    }

    func windowWillClose(_ notification: Notification) {
        poll?.invalidate()
        poll = nil
    }
}
