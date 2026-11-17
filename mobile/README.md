# FormCraft for Android

An Android app for FormCraft. FormCraft is self-hosted, so the app connects to your own server the way the
Nextcloud app does. On first start it shows a **Server address** screen. You enter your server's address and tap
**Connect**. The app checks `<server>/api/health`, then opens `<server>/login`. After that the app *is* your FormCraft
web app: every page and feature, in its mobile layout, light or dark like the phone. The app remembers the
server and opens it directly on later starts.

Built with Capacitor 6. Everything lives in this `mobile/` folder (own `package.json` and `node_modules`).

## What's in the app

| Piece | Where |
|---|---|
| Server address screen (light/dark, "Can't reach" screen with Retry / Change server) | `www/index.html` |
| Capacitor settings (`in.shatheitguy.formcraft`, `https` scheme, `allowNavigation: *`, cleartext allowed) | `capacitor.config.json` |
| Back button, downloads, external links, offline handling, cookies | `android/app/src/main/java/in/shatheitguy/formcraft/MainActivity.java` |
| Icon and splash artwork | `assets/icon.svg`, `assets/icon-foreground.svg` |
| Icon/splash generator | `scripts/make-icons.mjs` |
| Build script | `scripts/build-apk.ps1` |

Behaviour:
- **Server address.** `forms.example.com` becomes `https://forms.example.com`. Trailing slashes, `/login` and
  `/api/health` are removed. Plain `http://192.168.1.20:3000` works for LAN servers because cleartext traffic is
  allowed. The check runs natively, so CORS doesn't apply. It times out after 10 s, and the error messages say
  what went wrong: unknown host, refused connection, timeout, untrusted certificate, not a FormCraft server, or
  database down.
- **Change server.** Tap *Change server* on the "Connecting…" or "Can't reach" screen, or long-press the app icon
  and choose **Change server**.
- **Server unreachable.** On start, or while browsing, the app shows "Can't reach <server>" with Retry. Retry goes
  back to the page you were on.
- **Back button.** Goes back through the WebView's history. On the first page it closes the app.
- **Links.** Pages on your server stay in the app. Links to other websites open in the phone's browser.
  `mailto:`, `tel:`, WhatsApp and other links open in the matching app.
- **Sign-in.** The session cookie is kept across restarts. Cookies are flushed when the app goes to the background.
- **File uploads.** `<input type=file>` uses Android's file/photo picker. "Take photo" uses the camera app. The
  app asks for no permissions except Internet.
- **Downloads.**
  - Normal `http(s)` downloads go through Android's DownloadManager with your session cookie and land in
    *Downloads* with a notification. These include attachments, backups and files sent as
    `Content-Disposition: attachment`.
  - Files the web app creates in the page (`blob:` / `data:` links) are saved to *Downloads* by the app and then
    opened. These include CSV/PDF/Excel reports, QR codes and recovery codes. Plain Android WebViews can't do
    this; the app adds a small script that hands the file to the app.

## Build

Requirements: Node 18+, JDK 17, and the Android SDK (platform 34, build-tools). The script finds the SDK in
`%LOCALAPPDATA%\Android\Sdk` when `ANDROID_HOME` isn't set.

```powershell
powershell -ExecutionPolicy Bypass -File mobile\scripts\build-apk.ps1
# or, inside mobile/:  npm run build:apk
```

The script runs `npm install` (first time only), writes `android/local.properties`, runs `npx cap sync android` and
`gradlew assembleDebug`, then copies the result to **`mobile/dist/FormCraft-<VERSION>.apk`**. The version name
comes from the repository's `VERSION` file. `versionCode` is 1. Set `FC_VERSION_CODE` to a higher number for each
APK that should install as an update over an older one.

Add `-Icons` to re-render the icons before building.

## Change the icon

```powershell
cd mobile
node scripts/make-icons.mjs --icon C:\path\to\new-icon.svg [--foreground C:\path\to\adaptive-foreground.svg] [--background "#0F172A"] [--splash-bg "#0F172A"]
# then rebuild
```

With no arguments it uses `assets/icon.svg` and `assets/icon-foreground.svg`. To change the default, replace those
two files. The script writes:
- the legacy and round launcher icons (`mipmap-*`)
- the adaptive-icon foreground (108dp canvas; keep the artwork inside the central 66dp)
- the background colour
- the splash images (icon centred on the splash colour)

Add `--favicon ..\docs\img\icon.png` to also write a 256×256 PNG.

The in-app connect screen draws the icon inline. If you change the icon, update the `<svg>` in `www/index.html` too.

## Signed release build

Debug APKs install fine by side-loading. For a release build signed with your own key:

```powershell
keytool -genkeypair -v -keystore formcraft.jks -alias formcraft -keyalg RSA -keysize 2048 -validity 10000
$env:FC_KEYSTORE = "C:\keys\formcraft.jks"
$env:FC_KEYSTORE_PASSWORD = "..."
$env:FC_KEY_ALIAS = "formcraft"
$env:FC_KEY_PASSWORD = "..."      # optional, defaults to the keystore password
powershell -ExecutionPolicy Bypass -File mobile\scripts\build-apk.ps1
```

With a keystore set, the script also runs `assembleRelease`. `dist/FormCraft-<VERSION>.apk` is then the signed
release, and the debug build is kept as `FormCraft-<VERSION>-debug.apk`. Keep the keystore safe: updates must be
signed with the same key. A phone with the debug build must uninstall it before installing the release, because
the signatures differ.

## Install on a phone

1. Copy `FormCraft-<VERSION>.apk` to the phone, or download it from your server or a shared link.
2. Open it. Android asks to allow installing apps from that source (Files, Chrome, …): **Settings → Allow from
   this source**. Go back and tap **Install**.
3. Open **FormCraft**, type your server address (for example `https://forms.example.com`) and tap **Connect**.
4. Sign in with your FormCraft account.

To use a server on your home or office network (`http://192.168.x.x:3000`), the phone must be on the same Wi-Fi or
on a VPN.

## Known limitations

- The app needs the server. There is no offline mode beyond the "Can't reach" screen.
- `blob:` downloads work when the page starts them with a link and `download` attribute, which is how FormCraft
  does it. Other kinds of blob download, such as a blob opened in a new window, can't be saved in a WebView.
- On Android 9 and older, downloads are saved in the app's own folder (`Android/data/in.shatheitguy.formcraft/files/Download`) because the app does not ask for storage permission.
- Push notifications are not included. FormCraft's email and Telegram alerts still work.
- Web push, payment request and other browser-only APIs behave the way Android WebView supports them.
