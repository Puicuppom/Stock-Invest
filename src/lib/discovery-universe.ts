// A maintained discovery universe, not an index membership list or a recommendation.
export const discoveryUniverse = {
  US: ["AAPL", "MSFT", "META", "GOOGL", "AMZN", "NVDA", "AVGO", "AMD", "TSLA", "ORCL", "CRM", "ADBE", "JPM", "BAC", "V", "MA", "BRK-B", "KO", "PEP", "PG", "JNJ", "ABBV", "MRK", "UNH", "XOM", "CVX", "CAT", "WMT", "COST", "HD"],
  TH: ["PTT", "PTTEP", "TOP", "BCP", "ADVANC", "TRUE", "AOT", "CPALL", "CPAXT", "CRC", "HMPRO", "BDMS", "BH", "BEM", "BTS", "KBANK", "BBL", "SCB", "KTB", "TISCO", "TTB", "SCC", "SCGP", "IVL", "CPN", "LH", "AP", "WHA", "DELTA", "KCE"],
} satisfies Record<"US" | "TH", string[]>;
