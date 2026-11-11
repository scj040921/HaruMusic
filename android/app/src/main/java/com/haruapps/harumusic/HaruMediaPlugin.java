package com.haruapps.harumusic;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HaruMedia")
public class HaruMediaPlugin extends Plugin {
    private static HaruMediaPlugin current;
    @Override public void load() { current = this; }
    @Override protected void handleOnDestroy() { if (current == this) current = null; }
    static void dispatch(String action, long position) {
        HaruMediaPlugin plugin = current;
        if (plugin == null) return;
        JSObject data = new JSObject(); data.put("action", action); data.put("position", position / 1000.0);
        plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners("mediaAction", data));
    }
    @PluginMethod public void setSystemBars(PluginCall call) {
        boolean dark = call.getBoolean("dark", false);
        getActivity().runOnUiThread(() -> {
            androidx.core.view.WindowInsetsControllerCompat controller = androidx.core.view.WindowCompat.getInsetsController(getActivity().getWindow(), getActivity().getWindow().getDecorView());
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
            androidx.core.view.ViewCompat.requestApplyInsets(getActivity().getWindow().getDecorView());
            call.resolve();
        });
    }
    @PluginMethod public void update(PluginCall call) {
        Intent intent = new Intent(getContext(), HaruMediaService.class).setAction("update");
        intent.putExtra("title", call.getString("title", ""));
        intent.putExtra("artist", call.getString("artist", ""));
        intent.putExtra("album", call.getString("album", ""));
        intent.putExtra("artwork", call.getString("artwork", ""));
        intent.putExtra("position", Math.max(0L, (long) (call.getDouble("position", 0.0) * 1000)));
        intent.putExtra("duration", Math.max(0L, (long) (call.getDouble("duration", 0.0) * 1000)));
        boolean playing = call.getBoolean("playing", false); intent.putExtra("playing", playing);
        try {
            if (playing) ContextCompat.startForegroundService(getContext(), intent);
            else getContext().startService(intent);
            call.resolve();
        } catch (Exception error) { call.reject("Unable to update the media notification", error); }
    }
}
