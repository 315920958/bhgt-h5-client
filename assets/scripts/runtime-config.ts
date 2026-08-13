import { JsonAsset, resources } from 'cc';

export type RuntimeConfig = {
  enabled?: boolean;
  environment?: string;
  apiBaseUrl?: string;
};

function loadJson(path: string): Promise<RuntimeConfig> {
  return new Promise((resolve, reject) => {
    console.info(`[BHGT][Config] loading resource: ${path}`);
    resources.load(path, JsonAsset, (error, asset) => {
      if (error || !asset) {
        console.error(`[BHGT][Config] resource load failed: ${path}`, error || 'asset is empty');
        reject(error || new Error(`runtime config not found: ${path}`));
        return;
      }
      console.info(`[BHGT][Config] resource loaded: ${path}`);
      resolve((asset.json || {}) as RuntimeConfig);
    });
  });
}

async function loadEnabledConfig(path: string, label: string): Promise<RuntimeConfig | null> {
  try {
    const config = await loadJson(path);
    if (config.enabled === false) {
      console.info(`[BHGT][Config] ${label} disabled; trying next config`);
      return null;
    }
    console.info(`[BHGT][Config] loaded ${label} config`);
    return config;
  } catch (error) {
    console.warn(`[BHGT][Config] ${label} config unavailable`, error);
    return null;
  }
}

/**
 * 配置优先级：production 私有配置 -> local 私有配置 -> 公共配置。
 * 前两个配置不存在或 enabled=false 时，都视为未生效并继续尝试下一个。
 * 公共配置也必须提供 apiBaseUrl；服务器地址不在代码中兜底。
 */
export async function loadRuntimeConfig(): Promise<Required<RuntimeConfig>> {
  const productionConfig = await loadEnabledConfig(
    'config/runtime-config.production.local',
    'production local',
  );
  const localConfig = productionConfig || await loadEnabledConfig(
    'config/runtime-config.local',
    'local',
  );

  let config = productionConfig || localConfig;
  if (!config) {
    try {
      config = await loadJson('config/runtime-config');
      console.info('[BHGT][Config] loaded shared runtime config');
    } catch (error) {
      throw new Error('[BHGT][Config] no usable runtime configuration found');
    }
  }

  if (!config.apiBaseUrl) {
    throw new Error('[BHGT][Config] apiBaseUrl is required; configure it in assets/resources/config/*.json');
  }

  return {
    environment: config.environment || 'develop',
    apiBaseUrl: config.apiBaseUrl,
  };
}
