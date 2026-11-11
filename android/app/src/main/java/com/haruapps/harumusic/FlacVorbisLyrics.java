package com.haruapps.harumusic;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

final class FlacVorbisLyrics {
    private FlacVorbisLyrics() { }

    static String parse(byte[] bytes) {
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
                if (separator <= 0 || !isLyricsKey(value.substring(0, separator))) continue;
                String lyrics = value.substring(separator + 1).trim();
                if (!lyrics.isEmpty()) return lyrics;
            }
        } catch (Exception ignored) {
            // Ignore malformed Vorbis comments and continue playback without embedded lyrics.
        }
        return null;
    }

    private static boolean isLyricsKey(String rawKey) {
        String key = rawKey.trim().toUpperCase(Locale.ROOT);
        return key.equals("LYRIC") || key.equals("LYRICS") ||
            key.equals("SYNCEDLYRICS") || key.equals("UNSYNCEDLYRICS") ||
            key.matches("(?:SYNCED|UNSYNCED)?LYRICS(?:[-_\\[]?[A-Z]{2,3}\\]?)?");
    }
}
