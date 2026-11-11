import { computed } from 'vue';

import { playMusic } from '@/hooks/MusicHook';
import { usePlayerStore } from '@/store/modules/player';
import { isElectron } from '@/utils';

/**
 * 播放控制 composable（播放/暂停、上一首、下一首）
 */
export function usePlaybackControl() {
  const playerStore = usePlayerStore();

  /** 是否正在播放 */
  const isPlaying = computed(() => playerStore.isPlay);

  /** 播放/暂停切换 */
  const playMusicEvent = async () => {
    // The player store is the source of truth. The old MusicHook singleton can
    // still be empty during the first app restore, leaving lyric controls inert.
    const currentSong = isElectron ? playerStore.playMusic : playMusic.value;
    if (!currentSong?.id) return false;
    try {
      return await playerStore.setPlay({ ...currentSong });
    } catch (error) {
      console.error('播放出错:', error);
      playerStore.nextPlay();
      return false;
    }
  };

  /** 下一首 */
  const handleNext = () => {
    playerStore.nextPlay();
  };

  /** 上一首 */
  const handlePrev = () => {
    playerStore.prevPlay();
  };

  return {
    isPlaying,
    playMusicEvent,
    handleNext,
    handlePrev
  };
}
