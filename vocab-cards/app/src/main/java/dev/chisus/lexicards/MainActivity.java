package dev.chisus.lexicards;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int APP_BACKGROUND = Color.rgb(13, 16, 21);
    private static final int REQUEST_EXPORT_BACKUP = 4101;
    private static final int REQUEST_IMPORT_BACKUP = 4102;
    private static final int MAX_BACKUP_BYTES = 20 * 1024 * 1024;

    private WebView webView;
    private String pendingBackupJson;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(APP_BACKGROUND);
        getWindow().setNavigationBarColor(APP_BACKGROUND);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);

        webView = new WebView(this);
        webView.setBackgroundColor(APP_BACKGROUND);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.loadUrl("file:///android_asset/index.html");
        setContentView(webView);
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public void exportBackup(String json, String fileName) {
            runOnUiThread(() -> beginBackupExport(json, fileName));
        }

        @JavascriptInterface
        public void importBackup() {
            runOnUiThread(MainActivity.this::beginBackupImport);
        }
    }

    private void beginBackupExport(String json, String fileName) {
        pendingBackupJson = json == null ? "" : json;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, safeFileName(fileName));
        try {
            startActivityForResult(intent, REQUEST_EXPORT_BACKUP);
        } catch (Exception exception) {
            pendingBackupJson = null;
            notifyJavascript("export", false, "Не удалось открыть выбор файла");
        }
    }

    private void beginBackupImport() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
            "application/json",
            "text/json",
            "text/plain",
            "application/octet-stream"
        });
        try {
            startActivityForResult(intent, REQUEST_IMPORT_BACKUP);
        } catch (Exception exception) {
            notifyJavascript("import", false, "Не удалось открыть выбор файла");
        }
    }

    private String safeFileName(String fileName) {
        String value = fileName == null ? "" : fileName.trim();
        if (value.isEmpty()) value = "lexicards-backup.json";
        value = value.replace('/', '-').replace('\\', '-');
        if (!value.toLowerCase().endsWith(".json")) value += ".json";
        return value;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_EXPORT_BACKUP) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                pendingBackupJson = null;
                notifyJavascript("export", false, "Сохранение отменено");
                return;
            }
            Uri uri = data.getData();
            try (OutputStream output = getContentResolver().openOutputStream(uri, "w")) {
                if (output == null) throw new IOException("Output stream is unavailable");
                String content = pendingBackupJson == null ? "" : pendingBackupJson;
                output.write(content.getBytes(StandardCharsets.UTF_8));
                output.flush();
                notifyJavascript("export", true, "Резервная копия сохранена");
            } catch (Exception exception) {
                notifyJavascript("export", false, "Не удалось сохранить резервную копию");
            } finally {
                pendingBackupJson = null;
            }
            return;
        }

        if (requestCode == REQUEST_IMPORT_BACKUP) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                notifyJavascript("import", false, "Импорт отменён");
                return;
            }
            try {
                String content = readUtf8(data.getData());
                sendBackupToJavascript(content);
            } catch (Exception exception) {
                notifyJavascript("import", false, "Не удалось прочитать резервную копию");
            }
        }
    }

    private String readUtf8(Uri uri) throws IOException {
        try (InputStream input = getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IOException("Input stream is unavailable");
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BACKUP_BYTES) throw new IOException("Backup is too large");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private void sendBackupToJavascript(String content) {
        String script = "window.lexiCardsReceiveBackup && window.lexiCardsReceiveBackup("
            + JSONObject.quote(content) + ");";
        evaluateJavascript(script);
    }

    private void notifyJavascript(String kind, boolean success, String message) {
        String script = "window.lexiCardsNativeMessage && window.lexiCardsNativeMessage("
            + JSONObject.quote(kind) + ","
            + success + ","
            + JSONObject.quote(message) + ");";
        evaluateJavascript(script);
    }

    private void evaluateJavascript(String script) {
        if (webView == null) return;
        webView.post(() -> {
            if (webView != null) webView.evaluateJavascript(script, null);
        });
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
            "window.lexiCardsHandleBack ? window.lexiCardsHandleBack() : false",
            handled -> {
                if (!"true".equals(handled)) MainActivity.super.onBackPressed();
            }
        );
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
