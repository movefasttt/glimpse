// The welcome/settings card's SwiftUI (docs/app-readiness.md 1c). Pure view + model: no app dependency, so
// research/harness/card-snapshot.swift renders it headlessly. Minimal by rule (Darwin, 2026-10-28): every element
// earns its place, text is cut by default, no slogan or pitch.

import SwiftUI

final class CardModel: ObservableObject {
    enum Screen { case demo, settings }

    @Published var screen: Screen = .settings
    @Published var worked = false
    @Published var loginOn = false
    @Published var pushOn = true  // a render replaces the clipboard with the formatted text (opt-out)
    @Published var renderOn = false  // ⌘C with nothing selected renders the clipboard (opt-in)
    @Published var waitingForInputMonitoring = false

    var setLogin: (Bool) -> Void = { _ in }
    var setPush: (Bool) -> Void = { _ in }
    var setRender: (Bool) -> Void = { _ in }
    var openURL: (String) -> Void = { _ in }
    var close: () -> Void = {}
}

/// A key as a keycap: soft rounded chip, regular system font (Darwin picked this over a hairline border and plain text, 2026-10-28).
struct KeyCap: View {
    let key: String
    init(_ key: String) { self.key = key }
    var body: some View {
        Text(key)
            .font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 6)
            .padding(.vertical, 1.5)
            .background(Color.primary.opacity(0.10), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
    }
}

struct CardView: View {
    static let width: CGFloat = 420
    static let repoURL = "https://github.com/movefasttt/glimpse"
    static let sponsorURL = "https://github.com/sponsors/movefasttt"

    /// Demo sample: a hard-wrapped sentence, a bare Mermaid diagram and a box table, as a terminal shows them.
    /// The table keeps a separator between rows, as Claude Code draws it: without one the engine reads the rows
    /// as one wrapped cell. Verified with research/harness/panel.mjs (blocks: P, DIV.diagram, TABLE).
    static let sample = """
    The terminal wrapped this sentence at fifty
    columns, so it breaks mid-thought wherever
    you paste it.

    graph LR
      A[Broken output] --> B[Glimpse]
      B --> C[Paste-ready Markdown]

    ┌──────────┬───────┐
    │ Tool     │ Calls │
    ├──────────┼───────┤
    │ Read     │    12 │
    ├──────────┼───────┤
    │ Edit     │     4 │
    └──────────┴───────┘
    """

    @ObservedObject var model: CardModel

    var body: some View {
        Group {
            switch model.screen {
            case .demo: demo
            case .settings: settings
            }
        }
        .frame(width: Self.width)
        .onExitCommand { model.close() }  // Esc
    }

    private var demo: some View {
        VStack(alignment: .leading, spacing: 14) {
            if model.worked {
                Text("✓ Works in any app.").font(.title2.bold()).foregroundStyle(.green)
            } else {
                Text("Try it").font(.title2.bold())
                HStack(spacing: 4) {
                    Text("Drag to select the text below, then press")
                    KeyCap("⌘C")
                    Text("twice.")
                }
                .foregroundStyle(.secondary)
            }
            Text(Self.sample)
                .font(.system(.callout, design: .monospaced))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            HStack {
                if !model.worked { Button("Skip") { model.screen = .settings }.buttonStyle(.link) }
                Spacer()
                Button("Continue") { model.screen = .settings }
                    .buttonStyle(.borderedProminent)
                    .disabled(!model.worked)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
    }

    private var settings: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Select text anywhere").font(.title3.bold())
                    HStack(spacing: 4) { Text("Press"); KeyCap("⌘C"); Text("twice to render it.") }.foregroundStyle(.secondary)
                }
                Spacer()
                Button("Try it") { model.worked = false; model.screen = .demo }.controlSize(.small)
            }
            row(Text("Launch at Login")) {
                Toggle("", isOn: Binding(get: { model.loginOn }, set: model.setLogin)).labelsHidden().toggleStyle(.switch).controlSize(.small)
            }
            row(Text("Auto-copy formatted text on render")) {
                Toggle("", isOn: Binding(get: { model.pushOn }, set: model.setPush)).labelsHidden().toggleStyle(.switch).controlSize(.small)
            }
            VStack(alignment: .leading, spacing: 4) {
                row(HStack(spacing: 4) { KeyCap("⌘C"); Text("with nothing selected renders clipboard") }) {
                    Toggle("", isOn: Binding(get: { model.renderOn }, set: model.setRender)).labelsHidden().toggleStyle(.switch).controlSize(.small)
                }
                if model.renderOn, model.waitingForInputMonitoring {
                    Text("Waiting for Input Monitoring in System Settings…").font(.caption).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 12) {
                // Monochrome, like the rest of the card: only Done carries weight (Darwin, 2026-10-28: blue/red links read old).
                HStack(spacing: 6) {
                    Button("GitHub") { model.openURL(Self.repoURL) }.buttonStyle(.plain)
                    Text("·")
                    Button { model.openURL(Self.sponsorURL) } label: {
                        HStack(spacing: 3) { Image(systemName: "heart"); Text("Sponsor") }
                    }.buttonStyle(.plain)
                }
                .foregroundStyle(.secondary)
                Spacer()
                Button("Done") { model.close() }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
            }
            .padding(.top, 8)
        }
        .padding(24)
    }

    /// A label on the left, its control on the right: no fills, no dividers - whitespace separates rows.
    private func row<L: View, C: View>(_ label: L, @ViewBuilder _ control: () -> C) -> some View {
        HStack { label; Spacer(); control() }
    }
}
