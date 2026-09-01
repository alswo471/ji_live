export type ProxyRule = {
  minimumWeight: number;
  inputs: Array<{ symbol: string; weight: number }>;
};

export const PROXY_MAP: Record<string, ProxyRule> = {
  '005930': { minimumWeight: 0.6, inputs: [{ symbol: 'QQQ', weight: 0.35 }, { symbol: 'NVDA', weight: 0.45 }, { symbol: 'USDKRW', weight: 0.2 }] },
  '000660': { minimumWeight: 0.6, inputs: [{ symbol: 'QQQ', weight: 0.3 }, { symbol: 'NVDA', weight: 0.5 }, { symbol: 'USDKRW', weight: 0.2 }] },
  '042700': { minimumWeight: 0.6, inputs: [{ symbol: 'QQQ', weight: 0.3 }, { symbol: 'NVDA', weight: 0.5 }, { symbol: 'USDKRW', weight: 0.2 }] },
};
