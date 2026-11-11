package com.haruapps.harumusic;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class FlacVorbisLyricsTest {
    @Test
    public void readsLanguageQualifiedLrcComment() throws Exception {
        byte[] comments = comments("LYRICS[eng]=[00:00.00]Hello\n[00:01.00]World");

        assertEquals("[00:00.00]Hello\n[00:01.00]World", FlacVorbisLyrics.parse(comments));
    }

    @Test
    public void ignoresUnrelatedComments() throws Exception {
        assertNull(FlacVorbisLyrics.parse(comments("TITLE=Song", "ARTIST=Artist")));
    }

    @Test
    public void readsSynchronizedLyricsComment() throws Exception {
        assertEquals("[00:00.00]Sung", FlacVorbisLyrics.parse(comments("SYNCEDLYRICS=[00:00.00]Sung")));
    }

    private static byte[] comments(String... values) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        writeLittleEndian(output, 6);
        output.write("vendor".getBytes(StandardCharsets.UTF_8));
        writeLittleEndian(output, values.length);
        for (String value : values) {
            byte[] comment = value.getBytes(StandardCharsets.UTF_8);
            writeLittleEndian(output, comment.length);
            output.write(comment);
        }
        return output.toByteArray();
    }

    private static void writeLittleEndian(ByteArrayOutputStream output, int value) {
        output.write(value & 0xff);
        output.write((value >>> 8) & 0xff);
        output.write((value >>> 16) & 0xff);
        output.write((value >>> 24) & 0xff);
    }
}
