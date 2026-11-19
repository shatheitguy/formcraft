package in.shatheitguy.formcraft;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * In-app updates. New APKs are published as GitHub release files (FormCraft.apk on the latest release). Once a
 * day when the app opens (and whenever the person asks: app-icon shortcut or the connect screen), the app asks
 * GitHub for the latest release. If it's newer than the installed app, it offers to download it and then opens
 * Android's installer. The APK must be signed with the same key as the installed app, or Android refuses it.
 */
class AppUpdater {

    private static final String LATEST = "https://api.github.com/repos/shatheitguy/formcraft/releases/latest";
    private static final String PREFS = "FormCraftUpdates";
    private static final String KEY_LAST_CHECK = "lastCheck";
    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    private static final String FILE_NAME = "FormCraft-update.apk";

    private final Activity activity;
    private long downloadId = -1;
    /** Downloaded, waiting for the person to allow "Install unknown apps" for FormCraft. */
    private File pendingInstall;
    private boolean checking;

    AppUpdater(Activity activity) {
        this.activity = activity;
    }

    /** The installed app's version, e.g. "1.1.2". */
    String currentVersion() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "0";
        }
    }

    /** Automatic check: at most once a day, silent unless there is an update. */
    void checkDaily() {
        SharedPreferences p = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (System.currentTimeMillis() - p.getLong(KEY_LAST_CHECK, 0) < DAY_MS) return;
        check(false);
    }

    /** `manual`: the person asked, so also say when the app is already up to date or the check failed. */
    void check(boolean manual) {
        if (checking) return;
        checking = true;
        if (manual) toast(R.string.update_checking);
        new Thread(() -> {
            String tag = null;
            String apkUrl = null;
            String error = null;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(LATEST).openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(10000);
                c.setRequestProperty("Accept", "application/vnd.github+json");
                c.setRequestProperty("User-Agent", "FormCraft-Android");
                if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                StringBuilder sb = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                    String line;
                    while ((line = r.readLine()) != null) sb.append(line);
                }
                JSONObject release = new JSONObject(sb.toString());
                tag = release.optString("tag_name", "").replaceFirst("^[vV]", "");
                JSONArray assets = release.optJSONArray("assets");
                if (assets != null) {
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject a = assets.getJSONObject(i);
                        String name = a.optString("name", "");
                        String url = a.optString("browser_download_url", "");
                        if (name.equals("FormCraft.apk")) {
                            apkUrl = url;
                            break;
                        }
                        if (apkUrl == null && name.toLowerCase().endsWith(".apk")) apkUrl = url;
                    }
                }
                activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply();
            } catch (Exception e) {
                error = e.getMessage();
            }
            final String latest = tag;
            final String url = apkUrl;
            final boolean failed = error != null;
            activity.runOnUiThread(() -> {
                checking = false;
                if (activity.isFinishing()) return;
                if (failed || latest == null || latest.isEmpty()) {
                    if (manual) toast(R.string.update_check_failed);
                } else if (url != null && isNewer(latest, currentVersion())) {
                    offer(latest, url);
                } else if (manual) {
                    Toast.makeText(activity, activity.getString(R.string.update_latest, currentVersion()), Toast.LENGTH_LONG).show();
                }
            });
        }).start();
    }

    /** "1.10.0" > "1.9.3"; extra parts count ("1.2.1" > "1.2"). */
    static boolean isNewer(String latest, String current) {
        String[] a = latest.split("[.\\-+]");
        String[] b = current.split("[.\\-+]");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            int x = i < a.length ? num(a[i]) : 0;
            int y = i < b.length ? num(b[i]) : 0;
            if (x != y) return x > y;
        }
        return false;
    }

    private static int num(String s) {
        try {
            return Integer.parseInt(s.replaceAll("\\D", ""));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private void offer(String version, String url) {
        new AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.update_available_title, version))
            .setMessage(activity.getString(R.string.update_available_text, currentVersion(), version))
            .setPositiveButton(R.string.update_now, (d, w) -> download(url))
            .setNegativeButton(R.string.update_later, null)
            .show();
    }

    private void download(String url) {
        try {
            File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) throw new IllegalStateException("no folder");
            File old = new File(dir, FILE_NAME);
            if (old.exists() && !old.delete()) throw new IllegalStateException("old file");
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle(activity.getString(R.string.update_download_title));
            req.setMimeType("application/vnd.android.package-archive");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            req.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, FILE_NAME);
            DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            ContextCompat.registerReceiver(activity, done, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
            downloadId = dm.enqueue(req);
            toast(R.string.update_downloading);
        } catch (Exception e) {
            toast(R.string.update_failed);
        }
    }

    private final BroadcastReceiver done = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id != downloadId) return;
            try {
                activity.unregisterReceiver(this);
            } catch (Exception ignored) {
                // already unregistered
            }
            DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            boolean ok = false;
            try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
                if (c != null && c.moveToFirst()) {
                    ok = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL;
                }
            }
            File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            File apk = dir == null ? null : new File(dir, FILE_NAME);
            if (!ok || apk == null || !apk.exists()) {
                toast(R.string.update_failed);
                return;
            }
            install(apk);
        }
    };

    private void install(File apk) {
        // Android 8+: FormCraft needs "Install unknown apps" once; ask for it, then install when the person comes back.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
            pendingInstall = apk;
            toast(R.string.update_allow_install);
            try {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
            } catch (Exception e) {
                toast(R.string.update_failed);
            }
            return;
        }
        pendingInstall = null;
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
        } catch (Exception e) {
            toast(R.string.update_failed);
        }
    }

    /** Back from the "Install unknown apps" setting: install now if it was allowed. */
    void onResume() {
        if (pendingInstall == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) return;
        install(pendingInstall);
    }

    private void toast(int res) {
        Toast.makeText(activity, res, Toast.LENGTH_LONG).show();
    }
}
