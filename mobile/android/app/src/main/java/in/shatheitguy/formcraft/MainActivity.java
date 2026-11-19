package in.shatheitguy.formcraft;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebBackForwardList;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Collections;

/**
 * FormCraft is self-hosted, so the APK only bundles a small "connect to your server" screen (www/index.html).
 * Once connected, the WebView shows the person's own FormCraft server. This activity adds what a browser would
 * otherwise give: the back button, file downloads (including blob:/data: downloads made by the web app), external
 * links in the phone's browser, and a "can't reach the server" screen when the server goes away.
 */
public class MainActivity extends BridgeActivity {

    /** Same storage the Capacitor Preferences plugin uses (www/index.html saves the server address there). */
    private static final String PREFS_GROUP = "CapacitorStorage";
    private static final String KEY_SERVER = "serverUrl";
    /** Static app shortcut (long-press the app icon): "Change server". */
    private static final String ACTION_CHANGE_SERVER = "in.shatheitguy.formcraft.CHANGE_SERVER";

    /**
     * Runs at document start in every page: remembers Blobs passed to URL.createObjectURL so a later
     * a.click() on a blob:/data: link (CSV/PDF/Excel reports, QR codes, recovery codes) can be handed to the app
     * instead, because Android's WebView cannot download blob: URLs itself.
     */
    private static final String DOWNLOAD_SHIM =
        "(function(){if(window.__fcDl||!window.FormCraftNative)return;window.__fcDl=1;" +
        "var blobs=new Map();var oc=URL.createObjectURL;" +
        "URL.createObjectURL=function(o){var u=oc.apply(URL,arguments);" +
        "try{if(o instanceof Blob){blobs.set(u,o);setTimeout(function(){blobs.delete(u)},300000);}}catch(e){}return u;};" +
        "function send(name,type,dataUrl){try{FormCraftNative.saveFile(String(dataUrl),name||'download',type||'');}catch(e){}}" +
        "function save(a){var h=a&&a.href;if(!h)return false;" +
        "var name=a.getAttribute('download');" +
        "if(h.indexOf('data:')===0){if(name===null)return false;send(name,'',h);return true;}" +
        "if(h.indexOf('blob:')!==0)return false;var b=blobs.get(h);if(!b)return false;" +
        "var r=new FileReader();r.onload=function(){send(name,b.type,r.result);};r.readAsDataURL(b);return true;}" +
        "var ck=HTMLAnchorElement.prototype.click;" +
        "HTMLAnchorElement.prototype.click=function(){if(save(this))return;return ck.apply(this,arguments);};" +
        "document.addEventListener('click',function(e){var t=e.target;var a=t&&t.closest?t.closest('a[href^=\"blob:\"],a[href^=\"data:\"]'):null;" +
        "if(a&&save(a))e.preventDefault();},true);})();";

    private boolean shimAtDocumentStart = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = bridge.getWebView();
        WebSettings settings = webView.getSettings();
        settings.setSupportMultipleWindows(false);
        // Login sessions are cookies: keep them across restarts (flushed in onPause)
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // Smoothness: use the HTTP cache normally (scripts/styles of the web app are cached between pages and
        // restarts), draw the page ahead of scrolling, and no over-scroll glow fighting the page's own scrolling.
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) settings.setOffscreenPreRaster(true);
        webView.setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);
        // match the page colour of the light / dark theme while pages load
        boolean night = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
            == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        webView.setBackgroundColor(night ? 0xFF020617 : 0xFFF8FAFC);

        bridge.setWebViewClient(new ServerClient(bridge));
        webView.addJavascriptInterface(new NativeFiles(), "FormCraftNative");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, DOWNLOAD_SHIM, Collections.singleton("*"));
            shimAtDocumentStart = true;
        }
        webView.setDownloadListener(this::onDownload);

        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        goBackOrExit();
                    }
                }
            );

        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent != null && ACTION_CHANGE_SERVER.equals(intent.getAction())) {
            bridge.getWebView().loadUrl(bridge.getLocalUrl() + "/?change=1");
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onStop() {
        super.onStop();
        CookieManager.getInstance().flush();
    }

    // ---- back button ----------------------------------------------------------------------------------------

    /** Back goes back in the WebView's history; at the first page (or the step before is the connect screen) it exits. */
    private void goBackOrExit() {
        WebView webView = bridge.getWebView();
        WebBackForwardList history = webView.copyBackForwardList();
        int i = history.getCurrentIndex();
        if (i > 0) {
            String prev = history.getItemAtIndex(i - 1).getUrl();
            String current = history.getItemAtIndex(i).getUrl();
            // Going back onto the connect screen would just forward to the server again
            if (!(isLocal(prev) && !isLocal(current)) && webView.canGoBack()) {
                webView.goBack();
                return;
            }
        }
        finish();
    }

    private boolean isLocal(String url) {
        if (url == null) return false;
        Uri u = Uri.parse(url);
        return u.getHost() != null && u.getHost().equalsIgnoreCase(bridge.getHost());
    }

    private String savedServer() {
        SharedPreferences p = getSharedPreferences(PREFS_GROUP, Context.MODE_PRIVATE);
        return p.getString(KEY_SERVER, null);
    }

    // ---- navigation ------------------------------------------------------------------------------------------

    private class ServerClient extends BridgeWebViewClient {

        ServerClient(Bridge bridge) {
            super(bridge);
        }

        /** Only the bundled connect screen is served by Capacitor; the FormCraft server is loaded by the WebView
         *  itself (real redirects, status codes and cookies instead of Capacitor's proxy). */
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (isLocal(request.getUrl().toString())) return super.shouldInterceptRequest(view, request);
            return null;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase();
            if (scheme.equals("http") || scheme.equals("https")) {
                if (isLocal(url.toString()) || request.isRedirect() || !request.isForMainFrame()) return false;
                String server = savedServer();
                if (server == null) return false;
                Uri s = Uri.parse(server);
                if (s.getHost() != null && s.getHost().equalsIgnoreCase(url.getHost())) return false;
                // a link to another website: the phone's browser
                openExternal(url);
                return true;
            }
            if (scheme.equals("blob") || scheme.equals("data") || scheme.equals("about") || scheme.equals("javascript")) {
                return false;
            }
            // mailto:, tel:, intent:, whatsapp: ... handled by other apps
            openExternal(url);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (!shimAtDocumentStart) view.evaluateJavascript(DOWNLOAD_SHIM, null);
        }

        /** The server could not be reached while browsing: show the connect screen's "Can't reach" state. */
        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (!request.isForMainFrame()) return;
            String failed = request.getUrl().toString();
            if (isLocal(failed)) return;
            view.loadUrl(bridge.getLocalUrl() + "/?offline=" + Uri.encode(failed));
        }
    }

    private void openExternal(Uri url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, url);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    // ---- downloads -------------------------------------------------------------------------------------------

    /** http(s) downloads (attachments, backups, files served with Content-Disposition: attachment). */
    private void onDownload(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        if (url == null) return;
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            // handled by DOWNLOAD_SHIM when the page used a.click(); anything else cannot be saved by a WebView
            if (!shimAtDocumentStart) Toast.makeText(this, R.string.download_unsupported, Toast.LENGTH_LONG).show();
            return;
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) return;
        try {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) req.addRequestHeader("Cookie", cookies);
            if (userAgent != null) req.addRequestHeader("User-Agent", userAgent);
            if (mimeType != null) req.setMimeType(mimeType);
            req.setTitle(name);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            } else {
                // no storage permission is asked for on Android 9 and older: the app's own Downloads folder
                req.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, name);
            }
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            dm.enqueue(req);
            Toast.makeText(this, getString(R.string.downloading, name), Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show();
        }
    }

    /** Called from DOWNLOAD_SHIM with the file as a data: URL. */
    private class NativeFiles {

        @JavascriptInterface
        public void saveFile(String dataUrl, String fileName, String mimeType) {
            int comma = dataUrl == null ? -1 : dataUrl.indexOf(',');
            if (comma < 0) return;
            String header = dataUrl.substring(0, comma);
            String mime = mimeType != null && !mimeType.isEmpty() ? mimeType : header.replaceFirst("^data:", "").split(";")[0];
            if (mime.isEmpty()) mime = "application/octet-stream";
            final String finalMime = mime;
            final String name = safeName(fileName);
            try {
                byte[] bytes = header.contains(";base64")
                    ? Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
                    : Uri.decode(dataUrl.substring(comma + 1)).getBytes("UTF-8");
                Uri saved = writeToDownloads(name, finalMime, bytes);
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, getString(R.string.saved_to_downloads, name), Toast.LENGTH_LONG).show();
                    openFile(saved, finalMime);
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, R.string.download_failed, Toast.LENGTH_LONG).show());
            }
        }
    }

    private static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (n.isEmpty() || n.equals(".") || n.equals("..")) n = "download";
        return n.length() > 120 ? n.substring(n.length() - 120) : n;
    }

    private Uri writeToDownloads(String name, String mime, byte[] bytes) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            v.put(MediaStore.Downloads.MIME_TYPE, mime);
            v.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IllegalStateException("insert failed");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                out.write(bytes);
            }
            v.clear();
            v.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(uri, v, null, null);
            return uri;
        }
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) dir = new File(getCacheDir(), "downloads");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("no folder");
        File f = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f);
    }

    private void openFile(Uri uri, String mime) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, mime);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            // no viewer for this type: the toast already says where the file is
        }
    }
}
