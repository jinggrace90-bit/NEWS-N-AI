import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BarChart3,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  Flame,
  Library,
  Newspaper,
  Plus,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';

type SourceId = 'all' | 'stocktwits' | 'google-finance' | 'everyticker';
type Sentiment = 'bullish' | 'neutral' | 'bearish';

type Concept = {
  term: string;
  definition: string;
};

type MarketNews = {
  id: string;
  date: string;
  source: Exclude<SourceId, 'all'>;
  sourceLabel: string;
  ticker: string;
  title: string;
  summary: string;
  sentiment: Sentiment;
  move: string;
  time: string;
  concepts: Concept[];
  insight: string;
};

type ProgressStore = Record<string, string[]>;

type NotebookEntry = {
  id: string;
  newsId: string;
  ticker: string;
  term: string;
  definition: string;
  reason: 'wrong' | 'saved';
  createdAt: string;
};

type Message = {
  role: 'assistant' | 'user';
  text: string;
};

const SOURCES: Array<{ id: SourceId; label: string; description: string }> = [
  { id: 'all', label: '全部', description: '聚合视图' },
  { id: 'stocktwits', label: 'Stocktwits', description: '社群情绪' },
  { id: 'google-finance', label: 'Google Finance', description: '行情与新闻' },
  { id: 'everyticker', label: 'EveryTicker', description: '全市场扫描' },
];

const NEWS_LIBRARY_KEY = 'news-ai-dashboard:news-library:v2';
const PROGRESS_KEY = 'news-ai-dashboard:progress:v2';
const NOTEBOOK_KEY = 'news-ai-dashboard:notebook:v2';
const SCROLL_POSITION_KEY = 'news-ai-dashboard:scroll-position:v1';

const TOPIC_BANK = [
  {
    ticker: 'NVDA',
    source: 'stocktwits' as const,
    sourceLabel: 'Stocktwits',
    title: 'AI 芯片订单讨论升温，社区情绪继续偏多',
    summary: '社群集中讨论数据中心订单、供应约束与下一季毛利率空间，短线资金关注财报前波动。',
    sentiment: 'bullish' as const,
    move: '+2.8%',
    insight: '情绪热度高不等于确定上涨，适合同时观察成交量、期权隐含波动率和财报日期。',
    concepts: [
      { term: '社群情绪', definition: '投资者在讨论区、帖子和评论中表现出的偏多或偏空态度。' },
      { term: '隐含波动率', definition: '期权价格反映出的市场对未来价格波动幅度的预期。' },
      { term: '毛利率', definition: '公司收入扣除直接成本后剩余的比例，用来观察盈利质量。' },
      { term: '数据中心订单', definition: '云厂商或企业购买服务器、芯片和算力设备形成的需求。' },
    ],
  },
  {
    ticker: 'TSLA',
    source: 'google-finance' as const,
    sourceLabel: 'Google Finance',
    title: '电动车价格竞争延续，市场重新评估利润率',
    summary: '多家车企加大促销力度，投资者比较交付量增长与单车利润下降之间的取舍。',
    sentiment: 'bearish' as const,
    move: '-1.6%',
    insight: '价格战会提升销量弹性，但也可能压缩利润率；读新闻时要区分收入增长和盈利增长。',
    concepts: [
      { term: '利润率', definition: '企业每一单位收入最终转化为利润的比例。' },
      { term: '交付量', definition: '汽车企业实际交给客户的车辆数量，常用于观察需求。' },
      { term: '价格战', definition: '企业通过持续降价争夺市场份额，可能压低行业盈利。' },
      { term: '销量弹性', definition: '价格变化带来销量变化的敏感程度。' },
    ],
  },
  {
    ticker: 'IWM',
    source: 'everyticker' as const,
    sourceLabel: 'EveryTicker',
    title: '小盘股广度改善，更多板块开始跟随上涨',
    summary: '全市场扫描显示，除大型科技股外，工业、金融和医疗设备板块也出现更多创新高个股。',
    sentiment: 'neutral' as const,
    move: '+0.9%',
    insight: '市场广度改善通常说明上涨不只依赖少数龙头，但仍要看趋势能否持续几天以上。',
    concepts: [
      { term: '市场广度', definition: '上涨股票数量与下跌股票数量之间的关系，用来观察行情覆盖面。' },
      { term: '小盘股', definition: '市值较小的上市公司股票，通常波动更大。' },
      { term: '创新高', definition: '价格突破过去一段时间的最高点。' },
      { term: '板块轮动', definition: '资金在不同行业或主题之间切换的现象。' },
    ],
  },
  {
    ticker: 'QQQ',
    source: 'google-finance' as const,
    sourceLabel: 'Google Finance',
    title: '利率预期降温，成长股估值压力缓解',
    summary: '债券收益率回落后，投资者重新买入对利率敏感的成长股和软件公司。',
    sentiment: 'bullish' as const,
    move: '+1.2%',
    insight: '成长股通常对折现率更敏感；利率下降时，远期利润在估值模型中的权重会上升。',
    concepts: [
      { term: '债券收益率', definition: '持有债券可获得的回报率，常被用作市场利率参考。' },
      { term: '成长股', definition: '市场预期未来收入和利润增长较快的公司股票。' },
      { term: '估值压力', definition: '当投资者愿意支付的价格倍数下降时，股价承受的下行压力。' },
      { term: '折现率', definition: '把未来现金流换算成当前价值时使用的利率。' },
    ],
  },
  {
    ticker: 'AAPL',
    source: 'google-finance' as const,
    sourceLabel: 'Google Finance',
    title: '服务收入占比提升，硬件周期影响被部分抵消',
    summary: '投资者关注订阅、应用商店和云服务收入能否平滑硬件换机周期带来的波动。',
    sentiment: 'neutral' as const,
    move: '+0.4%',
    insight: '服务收入通常更稳定，但估值仍取决于用户增长、监管压力和硬件生态黏性。',
    concepts: [
      { term: '服务收入', definition: '来自订阅、软件、广告或平台抽成等非硬件销售的收入。' },
      { term: '换机周期', definition: '消费者更换手机、电脑等硬件设备的平均时间间隔。' },
      { term: '生态黏性', definition: '用户因为产品、服务和数据联动而持续留在同一平台的程度。' },
      { term: '监管压力', definition: '政府规则、反垄断或合规要求对公司业务模式形成的约束。' },
    ],
  },
  {
    ticker: 'MSFT',
    source: 'stocktwits' as const,
    sourceLabel: 'Stocktwits',
    title: '云业务增速成为讨论焦点，AI Copilot 付费率受关注',
    summary: '社区投资者围绕云业务增长、企业 AI 工具渗透率和资本开支回报展开讨论。',
    sentiment: 'bullish' as const,
    move: '+1.1%',
    insight: '云业务的持续增速是估值支撑，AI 工具能否转化为真实付费是下一步验证点。',
    concepts: [
      { term: '云业务增速', definition: '云计算相关收入相比上一时期增长的速度。' },
      { term: '付费率', definition: '使用产品的人群中最终付费用户所占比例。' },
      { term: '资本开支', definition: '企业用于购买服务器、设备、厂房等长期资产的支出。' },
      { term: '渗透率', definition: '某个产品或服务在目标用户群体中的使用比例。' },
    ],
  },
  {
    ticker: 'AMD',
    source: 'everyticker' as const,
    sourceLabel: 'EveryTicker',
    title: '芯片板块轮动扩散，二线 AI 标的成交活跃',
    summary: '扫描显示半导体板块中更多个股放量上涨，资金从龙头向供应链和替代标的扩散。',
    sentiment: 'bullish' as const,
    move: '+3.4%',
    insight: '板块扩散能增强行情持续性，但也可能意味着短线资金开始追逐弹性。',
    concepts: [
      { term: '板块扩散', definition: '上涨从少数龙头扩展到更多同类股票的现象。' },
      { term: '放量上涨', definition: '价格上涨同时成交量明显增加，显示交易参与度提升。' },
      { term: '供应链', definition: '为核心企业提供原料、零件、设备或服务的上下游公司网络。' },
      { term: '弹性标的', definition: '价格对利好消息反应更剧烈、波动更大的投资标的。' },
    ],
  },
  {
    ticker: 'JPM',
    source: 'google-finance' as const,
    sourceLabel: 'Google Finance',
    title: '银行股关注净息差，贷款需求仍是关键变量',
    summary: '大型银行股表现分化，市场关注利率曲线变化、贷款增长和信用成本。',
    sentiment: 'neutral' as const,
    move: '-0.2%',
    insight: '银行新闻要同时看收入端的净息差和风险端的坏账准备，单看利率容易误判。',
    concepts: [
      { term: '净息差', definition: '银行贷款收益率与存款等资金成本之间的差额。' },
      { term: '贷款需求', definition: '企业和个人愿意新增借款的强弱程度。' },
      { term: '信用成本', definition: '银行为潜在坏账、违约和贷款损失承担的成本。' },
      { term: '利率曲线', definition: '不同期限债券收益率连成的曲线，用来观察市场利率结构。' },
    ],
  },
  {
    ticker: 'XOM',
    source: 'everyticker' as const,
    sourceLabel: 'EveryTicker',
    title: '油价反弹带动能源股，现金流预期改善',
    summary: '能源板块跟随油价上涨，投资者重新评估分红、回购和资本纪律。',
    sentiment: 'bullish' as const,
    move: '+1.7%',
    insight: '能源股对大宗商品价格敏感，但长期表现还取决于成本控制和资本配置。',
    concepts: [
      { term: '现金流', definition: '企业经营、投资和融资活动产生的现金流入与流出。' },
      { term: '回购', definition: '公司用资金买回自己的股票，可能提升每股指标。' },
      { term: '资本纪律', definition: '企业在投资扩张时保持谨慎、避免过度支出的管理原则。' },
      { term: '大宗商品', definition: '原油、天然气、铜、粮食等标准化交易的基础商品。' },
    ],
  },
  {
    ticker: 'PFE',
    source: 'stocktwits' as const,
    sourceLabel: 'Stocktwits',
    title: '医药股讨论转向管线进展，社区等待临床数据',
    summary: '投资者关注新药临床试验节点、专利到期压力和并购补充管线的可能性。',
    sentiment: 'neutral' as const,
    move: '+0.3%',
    insight: '医药股新闻常由事件驱动，临床数据、审批进度和专利保护都会改变估值路径。',
    concepts: [
      { term: '药物管线', definition: '公司正在研发、试验或等待审批的新药组合。' },
      { term: '临床数据', definition: '药物在人体试验中获得的安全性和有效性结果。' },
      { term: '专利到期', definition: '药品专利保护结束后，仿制药竞争可能压低收入。' },
      { term: '事件驱动', definition: '股价主要由特定公告、审批、数据或并购事件推动。' },
    ],
  },
  {
    ticker: 'META',
    source: 'google-finance' as const,
    sourceLabel: 'Google Finance',
    title: '广告需求修复，投资者权衡 AI 支出与利润率',
    summary: '数字广告预算改善推高收入预期，但市场继续关注 AI 基础设施投入对利润的影响。',
    sentiment: 'bullish' as const,
    move: '+1.9%',
    insight: '广告恢复能改善收入弹性，但 AI 支出会让自由现金流和利润率成为焦点。',
    concepts: [
      { term: '广告需求', definition: '企业愿意在平台上投放广告预算的强弱程度。' },
      { term: '自由现金流', definition: '企业经营现金流扣除必要资本开支后剩余的现金。' },
      { term: '收入弹性', definition: '收入对经济周期、价格或需求变化的敏感程度。' },
      { term: '基础设施投入', definition: '企业购买服务器、数据中心和网络设备等底层资源的支出。' },
    ],
  },
  {
    ticker: 'BABA',
    source: 'everyticker' as const,
    sourceLabel: 'EveryTicker',
    title: '电商平台竞争加剧，投资者关注货币化效率',
    summary: '平台公司在价格补贴、广告变现和云业务恢复之间寻找平衡。',
    sentiment: 'bearish' as const,
    move: '-0.8%',
    insight: '平台类公司要看用户增长是否能转化为收入质量，补贴带来的增长不一定可持续。',
    concepts: [
      { term: '货币化效率', definition: '平台把用户流量和交易活动转化为收入的能力。' },
      { term: '价格补贴', definition: '平台或商家通过让利降低用户购买成本以换取增长。' },
      { term: '广告变现', definition: '平台通过向商家出售曝光、点击或推荐位置获得收入。' },
      { term: '收入质量', definition: '收入是否稳定、可持续且能带来真实利润的程度。' },
    ],
  },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function useWindowScrollMemory() {
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const savedY = readStorage<number>(SCROLL_POSITION_KEY, 0);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: savedY, left: 0, behavior: 'auto' });
    });

    const saveScroll = () => {
      writeStorage(SCROLL_POSITION_KEY, window.scrollY);
    };

    let frameId = 0;
    const saveScrollSoon = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        saveScroll();
      });
    };

    window.addEventListener('scroll', saveScrollSoon, { passive: true });
    window.addEventListener('beforeunload', saveScroll);
    window.addEventListener('pagehide', saveScroll);
    const intervalId = window.setInterval(saveScroll, 500);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
      saveScroll();
      window.removeEventListener('scroll', saveScrollSoon);
      window.removeEventListener('beforeunload', saveScroll);
      window.removeEventListener('pagehide', saveScroll);
    };
  }, []);
}

function buildDailyNews(date: string, offset = 0): MarketNews[] {
  return Array.from({ length: 12 }, (_, index) => {
    const topic = TOPIC_BANK[(index + offset) % TOPIC_BANK.length];
    return {
      ...topic,
      id: `${date}-${offset}-${index}-${topic.ticker.toLowerCase()}`,
      date,
      time: index < 4 ? `${12 + index * 8} 分钟前` : `${index - 2} 小时前`,
    };
  });
}

function uniqueNews(news: MarketNews[]) {
  const seen = new Set<string>();
  return news.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function sentimentLabel(sentiment: Sentiment) {
  if (sentiment === 'bullish') return '偏多';
  if (sentiment === 'bearish') return '偏空';
  return '中性';
}

function sentimentClass(sentiment: Sentiment) {
  if (sentiment === 'bullish') return 'positive';
  if (sentiment === 'bearish') return 'negative';
  return 'neutral';
}

function SourcePill({
  source,
  active,
  onClick,
}: {
  source: (typeof SOURCES)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`source-pill ${active ? 'active' : ''}`} onClick={onClick}>
      <span>{source.label}</span>
      <small>{source.description}</small>
    </button>
  );
}

function NewsCard({
  news,
  active,
  mastered,
  total,
  onSelect,
}: {
  news: MarketNews;
  active: boolean;
  mastered: number;
  total: number;
  onSelect: () => void;
}) {
  const TrendIcon = news.sentiment === 'bearish' ? TrendingDown : TrendingUp;

  return (
    <button className={`news-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="news-card-top">
        <span className="source-label">{news.sourceLabel}</span>
        <span className={`sentiment ${sentimentClass(news.sentiment)}`}>
          {sentimentLabel(news.sentiment)}
        </span>
      </div>
      <h3>{news.title}</h3>
      <p>{news.summary}</p>
      <div className="news-meta">
        <strong>{news.ticker}</strong>
        <span className={news.move.startsWith('-') ? 'move down' : 'move up'}>
          <TrendIcon size={14} />
          {news.move}
        </span>
        <span>{news.time}</span>
        <span className="mini-progress">{mastered}/{total}</span>
      </div>
    </button>
  );
}

function NewsWorkspace({
  news,
  selectedNews,
  source,
  viewMode,
  progress,
  setSource,
  setViewMode,
  setSelectedNews,
  onGenerateDaily,
  onAddNews,
}: {
  news: MarketNews[];
  selectedNews: MarketNews;
  source: SourceId;
  viewMode: 'today' | 'history';
  progress: ProgressStore;
  setSource: (source: SourceId) => void;
  setViewMode: (mode: 'today' | 'history') => void;
  setSelectedNews: (news: MarketNews) => void;
  onGenerateDaily: () => void;
  onAddNews: (ticker: string, title: string, summary: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [draftTicker, setDraftTicker] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSummary, setDraftSummary] = useState('');

  const filteredNews = news.filter((item) => {
    const matchesDate = viewMode === 'history' || item.date === todayKey();
    const matchesSource = source === 'all' || item.source === source;
    const normalized = query.trim().toLowerCase();
    const matchesQuery =
      !normalized ||
      item.title.toLowerCase().includes(normalized) ||
      item.summary.toLowerCase().includes(normalized) ||
      item.ticker.toLowerCase().includes(normalized);
    return matchesDate && matchesSource && matchesQuery;
  });

  function submitDraft() {
    if (!draftTicker.trim() || !draftTitle.trim()) return;
    onAddNews(draftTicker, draftTitle, draftSummary);
    setDraftTicker('');
    setDraftTitle('');
    setDraftSummary('');
  }

  return (
    <section className="workspace">
      <div className="toolbar">
        <div className="source-list" aria-label="信息源">
          {SOURCES.map((item) => (
            <SourcePill
              key={item.id}
              source={item}
              active={source === item.id}
              onClick={() => setSource(item.id)}
            />
          ))}
        </div>
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 ticker、新闻或主题"
          />
        </label>
      </div>

      <div className="collection-actions">
        <div className="segmented-control">
          <button className={viewMode === 'today' ? 'active' : ''} onClick={() => setViewMode('today')}>
            今日精选
          </button>
          <button className={viewMode === 'history' ? 'active' : ''} onClick={() => setViewMode('history')}>
            历史库
          </button>
        </div>
        <button className="secondary-button" onClick={onGenerateDaily}>
          <RefreshCw size={16} />
          生成今日 12 条
        </button>
      </div>

      <div className="add-news-form">
        <input
          value={draftTicker}
          onChange={(event) => setDraftTicker(event.target.value)}
          placeholder="Ticker"
        />
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder="手动添加新闻标题"
        />
        <input
          value={draftSummary}
          onChange={(event) => setDraftSummary(event.target.value)}
          placeholder="摘要，可留空"
        />
        <button onClick={submitDraft} disabled={!draftTicker.trim() || !draftTitle.trim()}>
          <Plus size={16} />
          添加
        </button>
      </div>

      <div className="news-layout">
        <div className="news-list" aria-label="新闻列表">
          {filteredNews.length === 0 ? (
            <div className="empty-state">没有匹配的新闻，试试切换信息源或生成今日精选。</div>
          ) : (
            filteredNews.map((item) => (
              <NewsCard
                key={item.id}
                news={item}
                active={item.id === selectedNews.id}
                mastered={progress[item.id]?.length ?? 0}
                total={item.concepts.length}
                onSelect={() => setSelectedNews(item)}
              />
            ))
          )}
        </div>

        <article key={selectedNews.id} className="selected-news fade-panel">
          <div className="selected-header">
            <div>
              <span className="eyebrow">
                {selectedNews.sourceLabel} / {selectedNews.ticker} / {selectedNews.date}
              </span>
              <h2>{selectedNews.title}</h2>
            </div>
            <span className={`sentiment large ${sentimentClass(selectedNews.sentiment)}`}>
              {sentimentLabel(selectedNews.sentiment)}
            </span>
          </div>
          <p>{selectedNews.summary}</p>
          <div className="insight-box">
            <Sparkles size={18} />
            <span>{selectedNews.insight}</span>
          </div>
          <div className="concept-row">
            {selectedNews.concepts.map((concept) => (
              <span key={concept.term}>{concept.term}</span>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function MatchingQuiz({
  news,
  masteredTerms,
  onMastered,
  onWrong,
}: {
  news: MarketNews;
  masteredTerms: string[];
  onMastered: (term: string) => void;
  onWrong: (concept: Concept) => void;
}) {
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [selectedDefinition, setSelectedDefinition] = useState<string | null>(null);
  const [wrongPair, setWrongPair] = useState<{ term: string; definition: string } | null>(null);
  const [lastCorrect, setLastCorrect] = useState<string | null>(null);

  const definitions = useMemo(() => {
    return [...news.concepts]
      .map((concept, index) => ({ ...concept, order: `${news.id}-${index}` }))
      .sort((a, b) => a.definition.localeCompare(b.definition, 'zh-CN'));
  }, [news]);

  useEffect(() => {
    setSelectedTerm(null);
    setSelectedDefinition(null);
    setWrongPair(null);
    setLastCorrect(null);
  }, [news.id]);

  function validatePair() {
    if (!selectedTerm || !selectedDefinition) return;
    const concept = news.concepts.find((item) => item.term === selectedTerm);

    if (selectedTerm === selectedDefinition) {
      setLastCorrect(selectedTerm);
      setWrongPair(null);
      onMastered(selectedTerm);
      window.setTimeout(() => {
        setSelectedTerm(null);
        setSelectedDefinition(null);
        setLastCorrect(null);
      }, 420);
      return;
    }

    setWrongPair({ term: selectedTerm, definition: selectedDefinition });
    if (concept) onWrong(concept);
    window.setTimeout(() => {
      setSelectedTerm(null);
      setSelectedDefinition(null);
      setWrongPair(null);
    }, 680);
  }

  function resetRound() {
    setSelectedTerm(null);
    setSelectedDefinition(null);
    setWrongPair(null);
    setLastCorrect(null);
  }

  const progress = Math.round((masteredTerms.length / news.concepts.length) * 100);
  const complete = masteredTerms.length === news.concepts.length;

  return (
    <section key={news.id} className="panel quiz-panel fade-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">根据当前新闻生成</span>
          <h2>配对题</h2>
        </div>
        <button className="icon-button" onClick={resetRound} title="重置当前选择">
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>

      {complete ? (
        <div className="complete-state">
          <CheckCircle2 size={42} />
          <strong>全部配对完成</strong>
          <span>进度已经保存到今日成就和历史库。</span>
        </div>
      ) : (
        <>
          <div className="matching-grid">
            <div>
              <h3>概念</h3>
              {news.concepts.map((concept) => {
                const matched = masteredTerms.includes(concept.term);
                const selected = selectedTerm === concept.term;
                const wrong = wrongPair?.term === concept.term;
                const justCorrect = lastCorrect === concept.term;

                return (
                  <button
                    key={concept.term}
                    className={`match-item ${matched ? 'matched' : ''} ${selected ? 'selected' : ''} ${wrong ? 'wrong' : ''} ${justCorrect ? 'just-correct' : ''}`}
                    disabled={matched}
                    onClick={() => setSelectedTerm(selected ? null : concept.term)}
                  >
                    {concept.term}
                  </button>
                );
              })}
            </div>

            <div>
              <h3>解释</h3>
              {definitions.map((concept) => {
                const matched = masteredTerms.includes(concept.term);
                const selected = selectedDefinition === concept.term;
                const wrong = wrongPair?.definition === concept.term;
                const justCorrect = lastCorrect === concept.term;

                return (
                  <button
                    key={concept.order}
                    className={`match-item definition ${matched ? 'matched' : ''} ${selected ? 'selected' : ''} ${wrong ? 'wrong' : ''} ${justCorrect ? 'just-correct' : ''}`}
                    disabled={matched}
                    onClick={() => setSelectedDefinition(selected ? null : concept.term)}
                  >
                    {concept.definition}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="validate-button" disabled={!selectedTerm || !selectedDefinition} onClick={validatePair}>
            校验本组
          </button>
          {wrongPair && (
            <div className="feedback-line negative">
              <XCircle size={16} />
              不对，已加入错题本。
            </div>
          )}
          {lastCorrect && (
            <div className="feedback-line positive">
              <CheckCircle2 size={16} />
              正确，已保存进度。
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Assistant({ news }: { news: MarketNews }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: '选一条新闻，我会围绕它帮你解释术语、拆解市场逻辑，并生成学习问题。',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatLogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        text: `当前新闻是 ${news.ticker}：${news.title}。你可以问我“这条新闻为什么重要”、“有哪些风险”或“帮我出题”。`,
      },
    ]);
  }, [news.id, news.ticker, news.title]);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog) return;
    chatLog.scrollTop = chatLog.scrollHeight;
  }, [messages, isTyping]);

  function answerFor(text: string) {
    if (text.includes('风险')) {
      return `这条新闻的主要风险是：市场可能只交易了短期情绪，而基本面确认还不够。针对 ${news.ticker}，我会继续看价格变化是否得到成交量和后续新闻支持。`;
    }

    if (text.includes('出题') || text.includes('配对')) {
      return `我已经根据当前新闻生成了配对题。重点概念是：${news.concepts.map((item) => item.term).join('、')}。`;
    }

    if (text.includes('总结') || text.includes('重要')) {
      return `${news.ticker} 这条新闻的重要性在于：${news.insight} 简单说，它把“新闻标题”连接到了投资者真正关心的变量。`;
    }

    return `围绕 ${news.ticker}，我的快速解读是：${news.summary} 学习时建议先抓住“发生了什么”，再问“影响收入、利润、估值还是情绪”。`;
  }

  function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    setMessages((current) => [...current, { role: 'user', text: trimmed }]);
    setInput('');
    setIsTyping(true);

    window.setTimeout(() => {
      setMessages((current) => [...current, { role: 'assistant', text: answerFor(trimmed) }]);
      setIsTyping(false);
    }, 650);
  }

  return (
    <section key={news.id} className="panel assistant-panel fade-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">当前上下文：{news.ticker}</span>
          <h2>AI 助手</h2>
        </div>
        <span className="online-dot" title="模拟在线" />
      </div>

      <div className="chat-log" ref={chatLogRef}>
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
            {message.text}
          </div>
        ))}
        {isTyping && <div className="message assistant typing">正在分析...</div>}
      </div>

      <div className="prompt-row">
        {['这条新闻为什么重要', '有哪些风险', '帮我出题'].map((prompt) => (
          <button key={prompt} onClick={() => setInput(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <div className="chat-input">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') sendMessage();
          }}
          placeholder="问问 AI 当前新闻..."
        />
        <button onClick={sendMessage} disabled={!input.trim() || isTyping} title="发送">
          <Send size={18} />
        </button>
      </div>
    </section>
  );
}

function AchievementRing({ mastered, total }: { mastered: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((mastered / total) * 100);
  return (
    <div className="achievement-card">
      <div className="ring" style={{ '--progress': `${percent}%` } as React.CSSProperties}>
        <span>{percent}%</span>
      </div>
      <div>
        <strong>{mastered}/{total}</strong>
        <span>今日已掌握</span>
      </div>
    </div>
  );
}

function NotebookPanel({ entries }: { entries: NotebookEntry[] }) {
  const wrong = entries.filter((entry) => entry.reason === 'wrong');
  const saved = entries.filter((entry) => entry.reason === 'saved');

  return (
    <section className="panel notebook-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">localStorage 保存</span>
          <h2>生词本 / 错题本</h2>
        </div>
        <Library size={20} />
      </div>
      <div className="notebook-stats">
        <div>
          <strong>{saved.length}</strong>
          <span>收藏概念</span>
        </div>
        <div>
          <strong>{wrong.length}</strong>
          <span>错题记录</span>
        </div>
      </div>
      <div className="notebook-list">
        {entries.length === 0 ? (
          <div className="empty-state">做错一次配对题，或保存概念后，这里会开始积累。</div>
        ) : (
          entries.slice(0, 6).map((entry) => (
            <div key={entry.id} className={`notebook-item ${entry.reason}`}>
              <strong>{entry.term}</strong>
              <span>{entry.ticker} / {entry.reason === 'wrong' ? '错题' : '收藏'}</span>
              <p>{entry.definition}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Watchlist({ news }: { news: MarketNews[] }) {
  const rows = news.slice(0, 4);

  return (
    <section className="watchlist">
      {rows.map((row) => (
        <div key={row.id}>
          <strong>{row.ticker}</strong>
          <span>{row.title.split('，')[0]}</span>
          <em className={row.move.startsWith('-') ? 'down' : 'up'}>{row.move}</em>
        </div>
      ))}
    </section>
  );
}

export default function App() {
  useWindowScrollMemory();

  const [newsLibrary, setNewsLibrary] = useState<MarketNews[]>(() => {
    const stored = readStorage<MarketNews[]>(NEWS_LIBRARY_KEY, []);
    return stored.length > 0 ? stored : buildDailyNews(todayKey());
  });
  const [progress, setProgress] = useState<ProgressStore>(() => readStorage<ProgressStore>(PROGRESS_KEY, {}));
  const [notebook, setNotebook] = useState<NotebookEntry[]>(() => readStorage<NotebookEntry[]>(NOTEBOOK_KEY, []));
  const [source, setSource] = useState<SourceId>('all');
  const [viewMode, setViewMode] = useState<'today' | 'history'>('today');
  const [selectedNewsId, setSelectedNewsId] = useState(newsLibrary[0]?.id ?? '');

  useEffect(() => writeStorage(NEWS_LIBRARY_KEY, newsLibrary), [newsLibrary]);
  useEffect(() => writeStorage(PROGRESS_KEY, progress), [progress]);
  useEffect(() => writeStorage(NOTEBOOK_KEY, notebook), [notebook]);

  const todayNews = newsLibrary.filter((item) => item.date === todayKey());
  const selectedNews = newsLibrary.find((item) => item.id === selectedNewsId) ?? newsLibrary[0];
  const totalConceptsToday = todayNews.reduce((sum, item) => sum + item.concepts.length, 0);
  const masteredToday = todayNews.reduce((sum, item) => sum + (progress[item.id]?.length ?? 0), 0);

  function selectNews(news: MarketNews) {
    setSelectedNewsId(news.id);
  }

  function generateDaily() {
    const date = todayKey();
    const existingToday = newsLibrary.filter((item) => item.date === date).length;
    const newBatch = buildDailyNews(date, existingToday);
    const updated = uniqueNews([...newBatch, ...newsLibrary]);
    setNewsLibrary(updated);
    setSelectedNewsId(newBatch[0].id);
    setViewMode('today');
  }

  function addNews(ticker: string, title: string, summary: string) {
    const cleanTicker = ticker.trim().toUpperCase();
    const base = TOPIC_BANK.find((item) => item.ticker === cleanTicker) ?? TOPIC_BANK[0];
    const date = todayKey();
    const created: MarketNews = {
      ...base,
      id: `${date}-manual-${Date.now()}`,
      date,
      ticker: cleanTicker,
      source: 'everyticker',
      sourceLabel: 'Manual',
      title: title.trim(),
      summary: summary.trim() || '这是一条手动收集的新闻，适合后续用 AI 补全摘要、概念与配对题。',
      insight: '手动添加的新闻会保存在本地历史库；后续可以接入 AI 自动提取概念。',
      time: '刚刚',
    };
    setNewsLibrary((current) => [created, ...current]);
    setSelectedNewsId(created.id);
    setViewMode('today');
  }

  function markMastered(term: string) {
    if (!selectedNews) return;
    setProgress((current) => {
      const currentTerms = current[selectedNews.id] ?? [];
      if (currentTerms.includes(term)) return current;
      return { ...current, [selectedNews.id]: [...currentTerms, term] };
    });
  }

  function addNotebookEntry(concept: Concept, reason: NotebookEntry['reason']) {
    if (!selectedNews) return;
    setNotebook((current) => {
      const exists = current.some(
        (entry) => entry.newsId === selectedNews.id && entry.term === concept.term && entry.reason === reason,
      );
      if (exists) return current;
      return [
        {
          id: `${selectedNews.id}-${reason}-${concept.term}`,
          newsId: selectedNews.id,
          ticker: selectedNews.ticker,
          term: concept.term,
          definition: concept.definition,
          reason,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ];
    });
  }

  if (!selectedNews) {
    return <div className="app-shell empty-app">没有新闻数据。</div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <CircleDollarSign size={22} />
          </div>
          <div>
            <strong>新闻 AI 学习仪表盘</strong>
            <span>纯前端新闻收集基地 / 本地历史保存</span>
          </div>
        </div>
        <a className="source-link" href="https://www.google.com/finance/" target="_blank" rel="noreferrer">
          Google Finance
          <ExternalLink size={16} />
        </a>
      </header>

      <main className="dashboard">
        <section className="hero-band">
          <div>
            <span className="eyebrow">市场新闻变成学习材料</span>
            <h1>每天收集 12 条新闻，选择一条精读，再用配对题沉淀概念。</h1>
          </div>
          <div className="metric-strip">
            <div>
              <Newspaper size={20} />
              <strong>{todayNews.length}</strong>
              <span>今日新闻</span>
            </div>
            <div>
              <Archive size={20} />
              <strong>{newsLibrary.length}</strong>
              <span>历史库存</span>
            </div>
            <div>
              <BarChart3 size={20} />
              <strong>{totalConceptsToday}</strong>
              <span>今日概念</span>
            </div>
            <AchievementRing mastered={masteredToday} total={totalConceptsToday} />
          </div>
        </section>

        <Watchlist news={todayNews.length ? todayNews : newsLibrary} />

        <div className="content-grid">
          <div className="main-column">
            <NewsWorkspace
              news={newsLibrary}
              selectedNews={selectedNews}
              source={source}
              viewMode={viewMode}
              progress={progress}
              setSource={setSource}
              setViewMode={setViewMode}
              setSelectedNews={selectNews}
              onGenerateDaily={generateDaily}
              onAddNews={addNews}
            />
          </div>

          <aside className="side-column">
            <Assistant news={selectedNews} />
            <MatchingQuiz
              news={selectedNews}
              masteredTerms={progress[selectedNews.id] ?? []}
              onMastered={markMastered}
              onWrong={(concept) => addNotebookEntry(concept, 'wrong')}
            />
            <button
              className="save-concepts-button"
              onClick={() => selectedNews.concepts.forEach((concept) => addNotebookEntry(concept, 'saved'))}
            >
              <BookOpenCheck size={18} />
              保存本条新闻概念到生词本
            </button>
            <NotebookPanel entries={notebook} />
          </aside>
        </div>
      </main>
    </div>
  );
}
