# dmgbuild settings for the Glimpse disk image (writes .DS_Store itself: no Finder automation, no template).
# release.sh: dmgbuild -s packaging/dmg_settings.py -D app=<Glimpse.app> "Glimpse" build/Glimpse.dmg
import os.path
app = defines["app"]
format = "UDZO"
files = [app]
symlinks = {"Applications": "/Applications"}
icon = os.path.join(app, "Contents/Resources/AppIcon.icns")      # volume icon
window_rect = ((200, 140), (640, 400))
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
default_view = "icon-view"
icon_size = 128
text_size = 13
icon_locations = {os.path.basename(app): (180, 190), "Applications": (460, 190)}
