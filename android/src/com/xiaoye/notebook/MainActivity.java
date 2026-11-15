package com.xiaoye.notebook;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.Manifest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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

import java.io.IOException;

public class MainActivity extends Activity {
    private WebView webView;
    private static final int MICROPHONE_REQUEST = 10;

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
        webView.loadUrl("https://appassets.local/index.html");

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
