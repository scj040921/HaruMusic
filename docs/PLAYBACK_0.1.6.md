# Playback transport 0.1.6

The shared Fetch transport implements foreground-first range scheduling for
Electron and the Android embedded API. It uses 512 KiB blocks, a 24 MiB LRU
memory budget, five-minute block expiry, at most two speculative future blocks,
and one speculative worker. Foreground requests may bypass speculative work
after 150 ms. Each block is verified before caching or responding with 206;
truncated blocks are never committed. Cancellation reaches upstream Fetch.
Servers without Range support retain streaming playback.

The scheduling principles were studied in Salt Extend Online commit
f56794b152508bf58df0fecbe610184014f00ddd:
https://github.com/YGHFv/Salt-Extend-Online/blob/f56794b152508bf58df0fecbe610184014f00ddd/plugin/src/main/java/io/github/yghfv/saltneri/plugin/transport/LoopbackRangeServer.java

This is an independent TypeScript implementation for Fetch and HTML audio;
the project's Java/BASS adapter and source code are not included.

URL cache entries honor explicit CDN expiry. Failed replay clears resolution
cache and performs bounded renewal. Speculative audio element warmup never
blocks track selection. Android closes upstream downloads on client disconnect.

Validation includes range reuse, cancellation, truncated responses, non-range
fallback, gateway integration and playback recovery. Synthetic tests cannot
guarantee availability or latency of third-party sources on every mobile network.
