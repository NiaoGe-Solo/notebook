package com.xiaoye.notebook;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.Manifest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;

import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView webView;
    private static final int MICROPHONE_REQUEST = 10;
    private static final int FILE_CHOOSER_REQUEST = 20;
    private static final int IMAGE_PICK_REQUEST = 21;
    private static final String MIGRATION_PREFS = "xiaoye_migration";
    private static final String MIGRATION_DONE = "secure_origin_migrated";
    private ValueCallback<Uri[]> fileChooserCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyNativeTheme("editorial");

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(246, 242, 232));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("appassets.local".equals(uri.getHost())) {
                    return serveAsset(uri);
                }
                return null;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                            return;
                        }
                    }
                    request.deny();
                });
            }

            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileChooserCallback = null;
                    return false;
                }
            }
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(true);

        webView.addJavascriptInterface(new NativeBridge(), "AndroidNotepad");
        setContentView(webView);

        SharedPreferences migrationPrefs = getSharedPreferences(MIGRATION_PREFS, MODE_PRIVATE);
        if (migrationPrefs.getBoolean(MIGRATION_DONE, false)) {
            loadCurrentApp();
        } else {
            webView.loadUrl("file:///android_asset/migrate.html");
        }

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, MICROPHONE_REQUEST);
        }
    }

    private final class NativeBridge {
        @JavascriptInterface
        public void shareText(String title, String text) {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_SUBJECT, title);
                intent.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(intent, "分享笔记"));
            });
        }

        @JavascriptInterface
        public void setTheme(String theme) {
            runOnUiThread(() -> applyNativeTheme(theme));
        }

        @JavascriptInterface
        public void pickImages() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    startActivityForResult(intent, IMAGE_PICK_REQUEST);
                } catch (Exception error) {
                    notifyImagePickerError("系统相册没有启动");
                }
            });
        }

        @JavascriptInterface
        public void captureLegacyData(String notes, String theme) {
            getSharedPreferences(MIGRATION_PREFS, MODE_PRIVATE)
                .edit()
                .putString("legacy_notes", notes == null ? "" : notes)
                .putString("legacy_theme", theme == null ? "" : theme)
                .putBoolean(MIGRATION_DONE, true)
                .apply();
            runOnUiThread(MainActivity.this::loadCurrentApp);
        }

        @JavascriptInterface
        public String getLegacyData() {
            return getSharedPreferences(MIGRATION_PREFS, MODE_PRIVATE)
                .getString("legacy_notes", "");
        }

        @JavascriptInterface
        public String getLegacyTheme() {
            return getSharedPreferences(MIGRATION_PREFS, MODE_PRIVATE)
                .getString("legacy_theme", "");
        }

        @JavascriptInterface
        public void clearLegacyData() {
            getSharedPreferences(MIGRATION_PREFS, MODE_PRIVATE)
                .edit()
                .remove("legacy_notes")
                .remove("legacy_theme")
                .apply();
        }
    }

    private void loadCurrentApp() {
        if (webView != null) {
            webView.loadUrl("https://appassets.local/index.html");
        }
    }

    private void applyNativeTheme(String theme) {
        int background = Color.rgb(247, 243, 232);
        boolean useLightIcons = false;
        if ("recorder".equals(theme)) {
            background = Color.rgb(11, 11, 12);
            useLightIcons = true;
        } else if ("native".equals(theme)) {
            background = Color.rgb(246, 247, 250);
        }

        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
        if (!useLightIcons) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
        }
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    private WebResourceResponse serveAsset(Uri uri) {
        String path = uri.getPath();
        if (path == null || path.equals("/")) path = "/index.html";
        String assetPath = path.substring(1);
        String extension = MimeTypeMap.getFileExtensionFromUrl(assetPath);
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        if ("webmanifest".equals(extension)) mime = "application/manifest+json";
        if (mime == null) mime = "application/octet-stream";
        String encoding = mime.startsWith("text/") || mime.contains("javascript") ||
            mime.contains("json") || mime.contains("svg") ? "UTF-8" : null;
        try {
            return new WebResourceResponse(mime, encoding, getAssets().open(assetPath));
        } catch (IOException error) {
            return new WebResourceResponse("text/plain", "UTF-8", null);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }

        webView.evaluateJavascript(
            "Boolean(window.handleNativeBack && window.handleNativeBack())",
            handled -> {
                if (!"true".equals(handled)) finish();
            }
        );
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == IMAGE_PICK_REQUEST) {
            if (resultCode == RESULT_OK && data != null) {
                new Thread(() -> readSelectedImages(data)).start();
            } else {
                runOnUiThread(() -> webView.evaluateJavascript(
                    "window.XiaoyeNativeImagePickerClosed && window.XiaoyeNativeImagePickerClosed()",
                    null
                ));
            }
            return;
        }
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (fileChooserCallback != null) {
                Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                fileChooserCallback.onReceiveValue(result);
                fileChooserCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void readSelectedImages(Intent data) {
        JSONArray files = new JSONArray();
        try {
            if (data.getClipData() != null) {
                ClipData clipData = data.getClipData();
                for (int index = 0; index < clipData.getItemCount(); index++) {
                    addImagePayload(files, clipData.getItemAt(index).getUri());
                }
            } else if (data.getData() != null) {
                addImagePayload(files, data.getData());
            }
            String payload = files.toString();
            runOnUiThread(() -> webView.evaluateJavascript(
                "window.XiaoyeNativeReceiveImages && window.XiaoyeNativeReceiveImages(" + payload + ")",
                null
            ));
        } catch (Exception error) {
            notifyImagePickerError("读取所选图片失败");
        }
    }

    private void addImagePayload(JSONArray files, Uri uri) throws Exception {
        String mime = getContentResolver().getType(uri);
        String name = "图片";
        Cursor cursor = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) name = cursor.getString(0);
            } finally {
                cursor.close();
            }
        }

        byte[] bytes;
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) throw new IOException("Image input is unavailable");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > 12 * 1024 * 1024) throw new IOException("Image exceeds 12 MB");
                output.write(buffer, 0, read);
            }
            bytes = output.toByteArray();
        }

        JSONObject file = new JSONObject();
        file.put("name", name);
        file.put("mime", mime == null ? "image/jpeg" : mime);
        file.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
        files.put(file);
    }

    private void notifyImagePickerError(String message) {
        runOnUiThread(() -> webView.evaluateJavascript(
            "window.XiaoyeNativeImageError && window.XiaoyeNativeImageError(" + JSONObject.quote(message) + ")",
            null
        ));
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }
}
