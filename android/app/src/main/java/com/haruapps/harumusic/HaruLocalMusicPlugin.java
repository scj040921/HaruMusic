package com.haruapps.harumusic;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

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
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
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
    private final ExecutorService metadataWorker = Executors.newFixedThreadPool(2);

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
    public void readMetadata(PluginCall call) {
        Uri uri = Uri.parse(call.getString("uri", ""));
        if (!"content".equals(uri.getScheme()) || !MediaStore.AUTHORITY.equals(uri.getAuthority())) {
            call.reject("本地音乐地址无效，请重新扫描设备。");
            return;
        }
        metadataWorker.execute(() -> {
            JSObject result = new JSObject();
            try (InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
                if (stream != null) {
                    JSObject flacMetadata = readFlacMetadata(new DataInputStream(stream));
                    if (flacMetadata.has("cover")) result.put("cover", flacMetadata.getString("cover"));
                    if (flacMetadata.has("lyrics")) result.put("lyrics", flacMetadata.getString("lyrics"));
                }
            } catch (Exception ignored) {
                // MediaMetadataRetriever below remains a fallback for artwork.
            }
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                if (!result.has("cover")) {
                    retriever.setDataSource(getContext(), uri);
                    String cover = compressCover(retriever.getEmbeddedPicture());
                    if (cover != null) result.put("cover", cover);
                }
            } catch (Exception ignored) {
                // Some files do not contain embedded artwork.
            } finally {
                try { retriever.release(); } catch (Exception ignored) { }
            }
            getActivity().runOnUiThread(() -> call.resolve(result));
        });
    }

    private JSObject readFlacMetadata(DataInputStream input) throws Exception {
        JSObject metadata = new JSObject();
        if (input.readInt() != 0x664c6143) return metadata;
        for (int block = 0; block < 128; block++) {
            int header = input.readUnsignedByte();
            int type = header & 0x7f;
            int length = (input.readUnsignedByte() << 16) | (input.readUnsignedByte() << 8) | input.readUnsignedByte();
            if ((type == 4 || type == 6) && length <= 8 * 1024 * 1024) {
                byte[] bytes = new byte[length];
                input.readFully(bytes);
                if (type == 4 && !metadata.has("lyrics")) {
                    String lyrics = parseVorbisLyrics(bytes);
                    if (lyrics != null && !lyrics.trim().isEmpty()) metadata.put("lyrics", lyrics);
                } else if (type == 6 && !metadata.has("cover")) {
                    String cover = parseFlacPicture(bytes);
                    if (cover != null) metadata.put("cover", cover);
                }
            }
            else {
                int remaining = length;
                while (remaining > 0) {
                    int skipped = input.skipBytes(remaining);
                    if (skipped <= 0) return metadata;
                    remaining -= skipped;
                }
            }
            if ((header & 0x80) != 0) break;
        }
        return metadata;
    }

    private String parseVorbisLyrics(byte[] bytes) {
        try {
            ByteBuffer data = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
            if (data.remaining() < 8) return null;
            int vendorLength = data.getInt();
            if (vendorLength < 0 || vendorLength > data.remaining() - 4) return null;
            data.position(data.position() + vendorLength);
            int count = data.getInt();
            if (count < 0 || count > 10000) return null;
            for (int i = 0; i < count && data.remaining() >= 4; i++) {
                int size = data.getInt();
                if (size < 0 || size > data.remaining()) return null;
                byte[] comment = new byte[size];
                data.get(comment);
                String value = new String(comment, StandardCharsets.UTF_8);
                int separator = value.indexOf('=');
                if (separator <= 0) continue;
                String key = value.substring(0, separator).toUpperCase(java.util.Locale.ROOT);
                if (key.equals("LYRICS") || key.equals("LYRIC") || key.equals("UNSYNCEDLYRICS") || key.equals("SYNCEDLYRICS")) {
                    String lyrics = value.substring(separator + 1).trim();
                    if (!lyrics.isEmpty()) return lyrics;
                }
            }
        } catch (Exception ignored) {
            // Invalid Vorbis comments are ignored without affecting playback.
        }
        return null;
    }

    private String parseFlacPicture(byte[] block) {
        try {
            ByteBuffer data = ByteBuffer.wrap(block).order(ByteOrder.BIG_ENDIAN);
            if (data.remaining() < 32) return null;
            data.getInt(); // picture type
            int mimeLength = data.getInt();
            if (mimeLength < 0 || mimeLength > data.remaining() - 4) return null;
            byte[] mimeBytes = new byte[mimeLength];
            data.get(mimeBytes);
            String mime = new String(mimeBytes, StandardCharsets.US_ASCII);
            int descriptionLength = data.getInt();
            if (descriptionLength < 0 || descriptionLength > data.remaining() - 20) return null;
            data.position(data.position() + descriptionLength);
            data.getInt(); // width
            data.getInt(); // height
            data.getInt(); // color depth
            data.getInt(); // indexed colors
            int pictureLength = data.getInt();
            if (pictureLength <= 0 || pictureLength > data.remaining() || pictureLength > 8 * 1024 * 1024) return null;
            byte[] picture = new byte[pictureLength];
            data.get(picture);
            String cover = compressCover(picture);
            if (cover != null) return cover;
            return null;
        } catch (Exception ignored) {
            // Invalid PICTURE blocks are ignored.
        }
        return null;
    }

    private String compressCover(byte[] picture) {
        if (picture == null || picture.length == 0 || picture.length > 8 * 1024 * 1024) return null;
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(picture, 0, picture.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        int sampleSize = 1;
        while (bounds.outWidth / sampleSize > 1024 || bounds.outHeight / sampleSize > 1024) sampleSize *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize;
        Bitmap bitmap = BitmapFactory.decodeByteArray(picture, 0, picture.length, options);
        if (bitmap == null) return null;
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, output);
            return "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        } finally {
            bitmap.recycle();
        }
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
