package com.haruapps.harumusic;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import androidx.annotation.NonNull;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "HaruLocalMusic",
    permissions = {
        @Permission(alias = "audioModern", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "audioLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class HaruLocalMusicPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    private String activeAudioPermissionAlias() {
        return Build.VERSION.SDK_INT >= 33 ? "audioModern" : "audioLegacy";
    }

    @PluginMethod
    public void scanFlac(PluginCall call) {
        String alias = activeAudioPermissionAlias();
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "scanFlacPermissionCallback");
            return;
        }
        queryFlac(call);
    }

    @PermissionCallback
    private void scanFlacPermissionCallback(PluginCall call) {
        if (getPermissionState(activeAudioPermissionAlias()) != PermissionState.GRANTED) {
            call.reject("需要允许访问音乐和音频，才能扫描设备中的 FLAC 文件。");
            return;
        }
        queryFlac(call);
    }

    private void queryFlac(PluginCall call) {
        worker.execute(() -> {
            JSArray tracks = new JSArray();
            Uri collection = Build.VERSION.SDK_INT >= 29
                ? MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
                : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.MIME_TYPE
            };

            try (Cursor cursor = getContext().getContentResolver().query(
                collection,
                projection,
                "LOWER(" + MediaStore.Audio.Media.DISPLAY_NAME + ") LIKE ? OR LOWER(" + MediaStore.Audio.Media.TITLE + ") LIKE ?",
                new String[] { "%.flac", "%.flac" },
                MediaStore.Audio.Media.DISPLAY_NAME + " COLLATE NOCASE ASC"
            )) {
                if (cursor != null) {
                    int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                    int displayNameColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                    int titleColumn = cursor.getColumnIndex(MediaStore.Audio.Media.TITLE);
                    int artistColumn = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
                    int albumColumn = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM);
                    int durationColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
                    int sizeColumn = cursor.getColumnIndex(MediaStore.Audio.Media.SIZE);
                    int mimeColumn = cursor.getColumnIndex(MediaStore.Audio.Media.MIME_TYPE);

                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(idColumn);
                        String displayName = cursor.getString(displayNameColumn);
                        String title = titleColumn >= 0 ? cursor.getString(titleColumn) : null;
                        if (title == null || title.trim().isEmpty()) title = displayName;
                        if (title != null) title = title.replaceFirst("(?i)\\.flac$", "");

                        Uri itemUri = ContentUris.withAppendedId(collection, id);
                        JSObject track = new JSObject();
                        track.put("id", "android-local:" + itemUri.toString());
                        track.put("uri", itemUri.toString());
                        track.put("name", title == null ? "FLAC 音频" : title);
                        track.put("artist", artistColumn >= 0 ? cursor.getString(artistColumn) : "");
                        track.put("album", albumColumn >= 0 ? cursor.getString(albumColumn) : "");
                        track.put("duration", durationColumn >= 0 ? cursor.getLong(durationColumn) : 0L);
                        track.put("size", sizeColumn >= 0 ? cursor.getLong(sizeColumn) : 0L);
                        String mime = mimeColumn >= 0 ? cursor.getString(mimeColumn) : null;
                        track.put("mimeType", mime == null || mime.isEmpty() ? "audio/flac" : mime);
                        tracks.put(track);
                    }
                }
                JSObject result = new JSObject();
                result.put("tracks", tracks);
                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception error) {
                getActivity().runOnUiThread(() -> call.reject("扫描 FLAC 文件失败。", error));
            }
        });
    }

    @PluginMethod
    public void copyToCache(PluginCall call) {
        String rawUri = call.getString("uri", "");
        Uri uri = Uri.parse(rawUri);
        if (!"content".equals(uri.getScheme()) || !MediaStore.AUTHORITY.equals(uri.getAuthority())) {
            call.reject("本地音乐地址无效，请重新扫描设备。");
            return;
        }

        Long expectedSize = call.getLong("size");
        worker.execute(() -> {
            File directory = new File(getContext().getCacheDir(), "scanned-flac");
            File target = new File(directory, sha256(rawUri) + ".flac");
            if (expectedSize != null && target.isFile() && target.length() == expectedSize) {
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                getActivity().runOnUiThread(() -> call.resolve(result));
                return;
            }

            File temporary = new File(directory, target.getName() + ".part");
            try {
                if (!directory.exists() && !directory.mkdirs()) throw new Exception("cache directory unavailable");
                try (InputStream input = getContext().getContentResolver().openInputStream(uri);
                     FileOutputStream output = new FileOutputStream(temporary)) {
                    if (input == null) throw new Exception("media provider returned no stream");
                    byte[] buffer = new byte[128 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    output.getFD().sync();
                }
                if (expectedSize != null && temporary.length() != expectedSize) {
                    throw new Exception("copied media size does not match the media library");
                }
                if (target.exists() && !target.delete()) throw new Exception("cannot replace cached media");
                if (!temporary.renameTo(target)) throw new Exception("cannot finalize cached media");
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception error) {
                if (temporary.exists()) temporary.delete();
                getActivity().runOnUiThread(() -> call.reject("无法读取该 FLAC 文件，请检查存储权限或文件是否已移除。", error));
            }
        });
    }

    @PluginMethod
    public void removeCachedFile(PluginCall call) {
        String rawUri = call.getString("uri", "");
        File target = new File(new File(getContext().getCacheDir(), "scanned-flac"), sha256(rawUri) + ".flac");
        boolean removed = !target.exists() || target.delete();
        JSObject result = new JSObject();
        result.put("removed", removed);
        call.resolve(result);
    }

    private String sha256(@NonNull String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder output = new StringBuilder(digest.length * 2);
            for (byte item : digest) output.append(String.format(java.util.Locale.US, "%02x", item));
            return output.toString();
        } catch (Exception error) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
