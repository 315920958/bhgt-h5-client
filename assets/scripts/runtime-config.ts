import { JsonAsset, resources } from 'cc';

export type RuntimeConfig = {
  enabled?: boolean;
  environment?: string;
  apiBaseUrl?: string;
};

function autoApiBaseUrl(): string {
  if (typeof location !== 'undefined'
    && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    return 'http://localhost:4001/api';
  }
  return '/api';
}

function loadJson(path: string): Promise<RuntimeConfig> {
  return new Promise((resolve, reject) => {
    resources.load(path, JsonAsset, (error, asset) => {
      if (error || !asset) {
        reject(error || new Error(`runtime config not found: ${path}`));
        return;
      }
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
  } catch {
    return null;
  }
}

/**
 * 配置优先级：production 私有配置 -> local 私有配置 -> 公共配置。
 * 前两个配置不存在或 enabled=false 时，都视为未生效并继续尝试下一个。
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
      console.warn('[BHGT][Config] shared runtime config unavailable; using automatic defaults', error);
      config = {};
    }
  }

  return {
    environment: config.environment || 'auto',
    apiBaseUrl: config.apiBaseUrl || autoApiBaseUrl(),
  };
}
