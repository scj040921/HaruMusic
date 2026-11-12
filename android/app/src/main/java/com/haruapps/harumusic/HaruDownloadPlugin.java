package com.haruapps.harumusic;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.*;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "HaruDownloads")
public class HaruDownloadPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private SharedPreferences records() { return getContext().getSharedPreferences("music-downloads", Context.MODE_PRIVATE); }
    private DownloadManager manager() { return (DownloadManager)getContext().getSystemService(Context.DOWNLOAD_SERVICE); }
    private JSONObject record(String id) throws Exception {
        String raw = records().getString(id, null);
        if (raw == null || !id.matches("[0-9]+")) throw new IOException("下载任务不存在");
        return new JSONObject(raw);
    }
    @PluginMethod public void enqueue(PluginCall call) {
        try {
            String url = call.getString("url", "");
            Uri uri = Uri.parse(url);
            if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) throw new IOException("无效的下载地址");
            JSObject song = call.getObject("songInfo", new JSObject());
            String extension = call.getString("type", "mp3").toLowerCase(java.util.Locale.ROOT);
            if (!extension.matches("mp3|flac|m4a|aac|ogg|opus|wav")) extension = "mp3";
            String title = song.optString("name", "音乐");
            String filename = call.getString("filename", title).replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
            if (filename.length() > 100) filename = filename.substring(0,100);
            filename += "-" + System.currentTimeMillis() + "." + extension;
            DownloadManager.Request request = new DownloadManager.Request(uri).setTitle(title)
                .setDescription("HaruMusic · 音乐下载")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setAllowedOverMetered(true).setAllowedOverRoaming(false);
            JSObject headers = call.getObject("headers", new JSObject());
            Iterator<String> names = headers.keys();
            while (names.hasNext()) { String name = names.next(); if (!name.matches("(?i)host|connection|content-length|range")) request.addRequestHeader(name, headers.getString(name)); }
            if (Build.VERSION.SDK_INT >= 29) request.setDestinationInExternalPublicDir(Environment.DIRECTORY_MUSIC,"HaruMusic/"+filename);
            else request.setDestinationInExternalFilesDir(getContext(),Environment.DIRECTORY_MUSIC,filename);
            request.allowScanningByMediaScanner();
            long id = manager().enqueue(request);
            JSONObject data = new JSONObject().put("taskId",String.valueOf(id)).put("songInfo",song)
                .put("filename",filename).put("type",extension).put("createdAt",System.currentTimeMillis());
            records().edit().putString(String.valueOf(id),data.toString()).apply();
            call.resolve(new JSObject().put("taskId",String.valueOf(id)));
        } catch(Exception e) { call.reject("无法开始下载："+e.getMessage()); }
    }
    @PluginMethod public void list(PluginCall call) {
        worker.execute(() -> {
            JSArray tasks = new JSArray();
            for (String id : records().getAll().keySet()) {
                try (Cursor cursor = manager().query(new DownloadManager.Query().setFilterById(Long.parseLong(id)))) {
                    if (cursor == null || !cursor.moveToFirst()) continue;
                    JSONObject data = record(id);
                    int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long loaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                    String state = status == DownloadManager.STATUS_SUCCESSFUL ? "completed" : status == DownloadManager.STATUS_FAILED ? "error" : status == DownloadManager.STATUS_RUNNING ? "downloading" : "queued";
                    data.put("state",state).put("loaded",loaded).put("total",Math.max(0,total)).put("progress",total>0?loaded*100.0/total:0)
                        .put("error",status == DownloadManager.STATUS_FAILED ? "系统下载失败（"+reason+"），可重新解析后重试。" : "")
                        .put("uri",status == DownloadManager.STATUS_SUCCESSFUL ? String.valueOf(manager().getUriForDownloadedFile(Long.parseLong(id))) : "");
                    tasks.put(data);
                } catch(Exception ignored) { }
            }
            call.resolve(new JSObject().put("tasks",tasks));
        });
    }
    @PluginMethod public void remove(PluginCall call) {
        try { String id = call.getString("taskId", ""); JSONObject data=record(id); manager().remove(Long.parseLong(id)); new File(getContext().getCacheDir(),"download-playback/"+id+"."+data.optString("type","mp3")).delete(); records().edit().remove(id).apply(); call.resolve(); }
        catch(Exception e) { call.reject("无法删除下载任务"); }
    }
    @PluginMethod public void openFolder(PluginCall call) {
        try { getActivity().startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)); call.resolve(); }
        catch(Exception e) { call.reject("系统未提供下载管理入口"); }
    }
    @PluginMethod public void playbackFile(PluginCall call) {
        worker.execute(() -> {
            try {
                String id = call.getString("taskId", ""); JSONObject data = record(id);
                Uri uri = manager().getUriForDownloadedFile(Long.parseLong(id));
                if (uri == null) throw new IOException("音乐尚未下载完成或已被移除");
                File directory = new File(getContext().getCacheDir(),"download-playback"); directory.mkdirs();
                File file = new File(directory,id+"."+data.optString("type","mp3"));
                if (!file.isFile()) {
                    File part = new File(directory,id+".part");
                    try(InputStream input = getContext().getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(part)) {
                        if(input == null) throw new IOException("无法读取音乐文件");
                        byte[] buffer = new byte[65536]; int size;
                        while((size=input.read(buffer))!=-1) out.write(buffer,0,size);
                    }
                    if(!part.renameTo(file)) throw new IOException("无法准备离线音乐");
                }
                call.resolve(new JSObject().put("path",file.getAbsolutePath()));
            } catch(Exception e) { call.reject(e.getMessage()); }
        });
    }
    @Override protected void handleOnDestroy() { worker.shutdownNow(); }
}
