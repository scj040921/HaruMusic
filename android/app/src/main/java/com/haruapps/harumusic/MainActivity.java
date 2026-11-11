package com.haruapps.harumusic;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(HaruMediaPlugin.class);
        registerPlugin(HaruLocalMusicPlugin.class);
        super.onCreate(savedInstanceState);
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        if (android.os.Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        android.view.View decor = getWindow().getDecorView();
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars() | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
            float density = getResources().getDisplayMetrics().density;
            String script = String.format(java.util.Locale.US, "document.documentElement.style.setProperty('--safe-area-inset-top','%fpx');document.documentElement.style.setProperty('--safe-area-inset-right','%fpx');document.documentElement.style.setProperty('--safe-area-inset-bottom','%fpx');document.documentElement.style.setProperty('--safe-area-inset-left','%fpx');", bars.top / density, bars.right / density, bars.bottom / density, bars.left / density);
            if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(script, null));
            return insets;
        });
        androidx.core.view.ViewCompat.requestApplyInsets(decor);
    }
}
