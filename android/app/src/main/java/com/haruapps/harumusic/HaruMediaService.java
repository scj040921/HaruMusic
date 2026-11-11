package com.haruapps.harumusic;

import android.app.*;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.IBinder;
import java.net.HttpURLConnection;
import java.net.URL;

public class HaruMediaService extends Service {
    private static final String CHANNEL = "harumusic_playback";
    private static final int NOTIFICATION_ID = 30488;
    private MediaSession session;
    private String title = "", artist = "", album = "";
    private String artworkUrl = "";
    private Bitmap artwork;
    private boolean destroyed = false;
    private long position = 0, duration = 0;
    private boolean playing = false;
    @Override public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "音乐播放", NotificationManager.IMPORTANCE_LOW);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        session = new MediaSession(this, "HaruMusic");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { HaruMediaPlugin.dispatch("play", 0); }
            @Override public void onPause() { HaruMediaPlugin.dispatch("pause", 0); }
            @Override public void onSkipToNext() { HaruMediaPlugin.dispatch("next", 0); }
            @Override public void onSkipToPrevious() { HaruMediaPlugin.dispatch("previous", 0); }
            @Override public void onSeekTo(long pos) { HaruMediaPlugin.dispatch("seek", pos); }
        });
        session.setActive(true);
    }
    private PendingIntent action(String name, int id) {
        Intent intent = new Intent(this, HaruMediaService.class).setAction(name);
        return PendingIntent.getService(this, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (!"update".equals(action)) { HaruMediaPlugin.dispatch(action, 0); return START_NOT_STICKY; }
        title = intent.getStringExtra("title"); artist = intent.getStringExtra("artist"); album = intent.getStringExtra("album");
        position = intent.getLongExtra("position", 0); duration = intent.getLongExtra("duration", 0); playing = intent.getBooleanExtra("playing", false);
        String nextArtwork = intent.getStringExtra("artwork");
        if (nextArtwork == null) nextArtwork = "";
        if (!nextArtwork.equals(artworkUrl)) {
            artworkUrl = nextArtwork; artwork = null;
            final String requested = nextArtwork;
            if (requested.startsWith("https://")) new Thread(() -> {
                Bitmap bitmap = null; HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(requested).openConnection();
                    connection.setConnectTimeout(5000); connection.setReadTimeout(5000);
                    BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 2;
                    bitmap = BitmapFactory.decodeStream(connection.getInputStream(), null, options);
                } catch (Exception ignored) { } finally { if (connection != null) connection.disconnect(); }
                final Bitmap loaded = bitmap;
                new Handler(Looper.getMainLooper()).post(() -> { if (!destroyed && requested.equals(artworkUrl) && loaded != null) { artwork = loaded; publish(); } });
            }).start();
        }
        publish();
        return START_NOT_STICKY;
    }
    private void publish() {
        MediaMetadata.Builder metadata = new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title).putString(MediaMetadata.METADATA_KEY_ARTIST, artist).putString(MediaMetadata.METADATA_KEY_ALBUM, album).putLong(MediaMetadata.METADATA_KEY_DURATION, duration);
        if (artwork != null) metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        session.setMetadata(metadata.build());
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO;
        session.setPlaybackState(new PlaybackState.Builder().setActions(actions).setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, position, playing ? 1f : 0f).build());
        Intent launch = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 1, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Notification notification = builder.setSmallIcon(android.R.drawable.ic_media_play).setLargeIcon(artwork).setContentTitle(title).setContentText(artist).setContentIntent(content).setVisibility(Notification.VISIBILITY_PUBLIC).setOnlyAlertOnce(true).setOngoing(playing)
            .addAction(android.R.drawable.ic_media_previous, "上一首", action("previous", 2))
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "暂停" : "播放", action(playing ? "pause" : "play", 3))
            .addAction(android.R.drawable.ic_media_next, "下一首", action("next", 4))
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2)).build();
        if (playing) startForeground(NOTIFICATION_ID, notification);
        else { stopForeground(false); getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification); }
    }
    @Override public void onDestroy() { destroyed = true; session.release(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
