import { DEFAULT_LYRIC_CONFIG, LyricConfig } from '@/types/lyric';

export const LYRIC_CONFIG_STORAGE_KEY = 'music-full-config';

// 跨组件同步歌词配置用的自定义事件（播放页 / 设置页双向绑定）
export const LYRIC_CONFIG_CHANGE_EVENT = 'music-full-config-change';

const supportedConfig = (saved: Partial<LyricConfig>): LyricConfig =>
  Object.fromEntries(
    Object.entries(DEFAULT_LYRIC_CONFIG).map(([key, value]) => [
      key,
      Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] : value
    ])
  ) as LyricConfig;

export const readLyricConfig = (): LyricConfig => {
  try {
    const savedConfig = localStorage.getItem(LYRIC_CONFIG_STORAGE_KEY);
    if (savedConfig) {
      const config = supportedConfig(JSON.parse(savedConfig));
      // Persist the supported schema so removed mode settings cannot return.
      localStorage.setItem(LYRIC_CONFIG_STORAGE_KEY, JSON.stringify(config));
      return config;
    }
  } catch (error) {
    console.error('读取歌词配置失败:', error);
  }
  return { ...DEFAULT_LYRIC_CONFIG };
};

export const writeLyricConfig = (config: LyricConfig): void => {
  localStorage.setItem(LYRIC_CONFIG_STORAGE_KEY, JSON.stringify(supportedConfig(config)));
  window.dispatchEvent(new CustomEvent(LYRIC_CONFIG_CHANGE_EVENT));
};
