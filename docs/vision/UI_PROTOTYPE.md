import React, { useState, useEffect } from 'react';
import { 
  BookOpen, BarChart3, Activity, Clock, Network, Highlighter, 
  Zap, Brain, Sliders, CheckCircle, MessageSquare, ChevronDown,
  ChevronRight, TrendingUp, Search, Sparkles, X, Send, Menu,
  ArrowLeft, Eye, FileText, GitBranch, AlertTriangle
} from 'lucide-react';

const MOCK_DATA = {
  document: {
    title: "Gravity's Rainbow",
    progress: 23,
    currentChunk: 42,
    totalChunks: 382,
    currentSection: "Part 3: In the Zone"
  },
  outline: [
    { level: 1, title: "Part 1: Beyond the Zero", progress: 100, connections: 34 },
    { level: 1, title: "Part 2: Un Perm' au Casino Hermann Goering", progress: 100, connections: 28 },
    { level: 1, title: "Part 3: In the Zone", progress: 45, connections: 25, current: true },
    { level: 2, title: "Chapter 1: The Counterforce", progress: 100, connections: 12 },
    { level: 2, title: "Chapter 2: Paranoia Systems", progress: 23, connections: 8, current: true },
  ],
  stats: {
    totalWords: 152847,
    readingTime: { thisSession: 12, thisChapter: 47, total: 202 },
    weeklyTime: 495,
    sparks: 23,
    annotations: 47
  },
  connections: [
    { type: 'contradiction', strength: 0.92, target: '1984 - Chapter 3', reason: 'Opposing views on institutional control', badge: '⚡' },
    { type: 'bridge', strength: 0.87, target: 'Surveillance Capitalism - Part 2', reason: 'Cross-domain: paranoia (lit) → surveillance (tech)', badge: '🌉' },
    { type: 'semantic', strength: 0.79, target: 'Catch-22 - Opening', reason: 'Similar: military absurdism', badge: '📊' }
  ],
  sparks: [
    { id: 1, content: 'The intersection of paranoia and technology feels incredibly relevant', time: '12m ago', tags: ['paranoia', 'technology'] },
    { id: 2, content: 'Entropy concept relates to information theory', time: '1h ago', tags: ['entropy', 'theory'] }
  ],
  aiSuggestions: [
    { type: 'spark', content: 'Institutional control mechanisms mirror modern algorithmic systems', confidence: 0.85, reason: 'High connection density, no annotations' },
    { type: 'connection', content: 'Pattern detected: "surveillance" across 3 books', documents: ['Surveillance Capitalism', 'Automating Inequality', 'Race After Technology'] }
  ]
};

function Button({ children, variant = 'default', size = 'default', className = '', onClick, active }) {
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    ghost: 'hover:bg-gray-100',
    outline: 'border border-gray-300 hover:bg-gray-50'
  };
  const sizes = {
    default: 'px-4 py-2',
    sm: 'px-3 py-1.5 text-sm',
    icon: 'p-2'
  };
  return (
    <button 
      className={`inline-flex items-center justify-center rounded-md transition-colors ${variants[variant]} ${sizes[size]} ${active ? 'bg-blue-100 text-blue-700' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Badge({ children, variant = 'default' }) {
  const variants = {
    default: 'bg-gray-200 text-gray-900',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700'
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[variant]}`}>{children}</span>;
}

function LeftPanel({ collapsed, activeTab, setActiveTab }) {
  const tabs = [
    { id: 'outline', icon: FileText, label: 'Outline' },
    { id: 'stats', icon: BarChart3, label: 'Stats' },
    { id: 'heatmap', icon: Activity, label: 'Heatmap' },
    { id: 'history', icon: Clock, label: 'History' }
  ];

  if (collapsed) {
    return (
      <div className="w-12 border-r bg-white flex flex-col items-center py-4 gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`p-2 rounded hover:bg-gray-100 ${activeTab === tab.id ? 'bg-blue-50 text-blue-600' : ''}`}
            title={tab.label}
          >
            <tab.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-80 border-r bg-white flex flex-col">
      <div className="flex border-b">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 p-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent hover:bg-gray-50'
            }`}
          >
            <tab.icon className="h-4 w-4 mx-auto" />
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'outline' && (
          <div className="space-y-1">
            {MOCK_DATA.outline.map((item, i) => (
              <div
                key={i}
                className={`p-2 rounded hover:bg-gray-50 cursor-pointer ${item.current ? 'bg-blue-50 border-l-2 border-blue-600' : ''}`}
                style={{ paddingLeft: `${item.level * 12 + 8}px` }}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${item.current ? 'font-medium' : ''}`}>{item.title}</span>
                  <Badge variant={item.connections > 10 ? 'blue' : 'default'}>{item.connections}</Badge>
                </div>
                {item.progress < 100 && (
                  <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-4 text-sm">
            <div>
              <div className="font-semibold mb-2">📚 Document Stats</div>
              <div className="space-y-1 text-gray-700">
                <div>Total: {MOCK_DATA.stats.totalWords.toLocaleString()} words</div>
                <div>Progress: {MOCK_DATA.document.progress}% complete</div>
                <div>Connections: {MOCK_DATA.connections.length} visible</div>
              </div>
            </div>

            <div>
              <div className="font-semibold mb-2">⏱️ Reading Time</div>
              <div className="space-y-1 text-gray-700">
                <div>This session: {MOCK_DATA.stats.readingTime.thisSession} min</div>
                <div>This chapter: {MOCK_DATA.stats.readingTime.thisChapter} min</div>
                <div>This document: {Math.floor(MOCK_DATA.stats.readingTime.total / 60)}h {MOCK_DATA.stats.readingTime.total % 60}m</div>
                <div>This week: {Math.floor(MOCK_DATA.stats.weeklyTime / 60)}h {MOCK_DATA.stats.weeklyTime % 60}m</div>
              </div>
            </div>

            <div>
              <div className="font-semibold mb-2">🔥 Reading Patterns</div>
              <div className="space-y-1 text-gray-700">
                <div>Peak focus: Monday 2-4 PM</div>
                <div>Most sparks: Weekend mornings</div>
                <div>{MOCK_DATA.stats.sparks} sparks captured</div>
                <div>{MOCK_DATA.stats.annotations} annotations</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'heatmap' && (
          <div>
            <div className="font-semibold mb-3">Connection Density</div>
            <div className="relative h-96 bg-gray-100 rounded">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute w-full hover:ring-2 ring-blue-500 cursor-pointer transition-all"
                  style={{
                    top: `${(i / 20) * 100}%`,
                    height: '4%',
                    backgroundColor: `rgba(59, 130, 246, ${Math.random() * 0.8})`
                  }}
                  title={`${Math.floor(Math.random() * 100)}% density`}
                />
              ))}
              <div 
                className="absolute w-full h-1 bg-red-500"
                style={{ top: '23%' }}
                title="Current position"
              />
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span>Connection density</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-1 bg-red-500"></div>
                <span>Your position (23%)</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="font-semibold mb-3">Reading Timeline</div>
            {[
              { date: 'Today, 2:34 PM', position: '23%', duration: '12 min', sparks: 0 },
              { date: 'Yesterday, 9:15 AM', position: '18%', duration: '35 min', sparks: 2 },
              { date: '2 days ago, 7:22 PM', position: '12%', duration: '28 min', sparks: 1 }
            ].map((session, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
                <div className="font-medium text-sm">{session.date}</div>
                <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                  <div>Position: {session.position}</div>
                  <div>Duration: {session.duration}</div>
                  <div>Sparks: {session.sparks}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RightPanel({ collapsed, activeTab, setActiveTab }) {
  const tabs = [
    { id: 'connections', icon: Network, label: 'Connections', badge: 3 },
    { id: 'annotations', icon: Highlighter, label: 'Annotations', badge: 12 },
    { id: 'sparks', icon: Zap, label: 'Sparks', badge: 8 },
    { id: 'cards', icon: Brain, label: 'Cards', badge: 2 },
    { id: 'tune', icon: Sliders, label: 'Tune' },
    { id: 'quality', icon: CheckCircle, label: 'Quality' }
  ];

  if (collapsed) {
    return (
      <div className="w-12 border-l bg-white flex flex-col items-center py-4 gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative p-2 rounded hover:bg-gray-100 ${activeTab === tab.id ? 'bg-blue-50 text-blue-600' : ''}`}
            title={tab.label}
          >
            <tab.icon className="h-4 w-4" />
            {tab.badge && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-96 border-l bg-white flex flex-col">
      <div className="grid grid-cols-6 border-b p-2 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative p-2 rounded flex flex-col items-center justify-center transition-colors ${
              activeTab === tab.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'
            }`}
            title={tab.label}
          >
            <tab.icon className="h-4 w-4" />
            {tab.badge && (
              <Badge variant="red" className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs flex items-center justify-center">
                {tab.badge}
              </Badge>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'connections' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Active Connections</div>
              <Button variant="ghost" size="icon"><Search className="h-4 w-4" /></Button>
            </div>
            {MOCK_DATA.connections.map((conn, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">{conn.badge}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{conn.target}</div>
                    <div className="text-xs text-gray-600 mt-1">{conn.reason}</div>
                  </div>
                  <Badge variant="blue">{(conn.strength * 100).toFixed(0)}%</Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'sparks' && (
          <div className="space-y-3">
            <Button variant="outline" className="w-full justify-start gap-2 mb-3">
              <Zap className="h-4 w-4" />
              Capture a spark... (⌘K)
            </Button>

            <div className="p-3 bg-purple-50 border border-purple-200 rounded mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium">AI Suggestion</span>
              </div>
              <p className="text-sm text-gray-700 mb-2">
                {MOCK_DATA.aiSuggestions[0].content}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1">Accept</Button>
                <Button size="sm" variant="ghost" className="flex-1">Dismiss</Button>
              </div>
            </div>

            {MOCK_DATA.sparks.map(spark => (
              <div key={spark.id} className="p-3 bg-gray-50 rounded">
                <p className="text-sm mb-2">{spark.content}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">{spark.time}</span>
                  {spark.tags.map(tag => (
                    <Badge key={tag} variant="default">{tag}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'cards' && (
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded">
              <div className="font-medium mb-1">Due for Review</div>
              <div className="text-sm text-gray-600 mb-2">2 cards • Est. 5 min</div>
              <Button size="sm" className="w-full">Start Review</Button>
            </div>
          </div>
        )}

        {activeTab === 'tune' && (
          <div className="space-y-4">
            <div className="font-semibold mb-3">Engine Weights</div>
            {[
              { name: 'Contradiction', value: 40 },
              { name: 'Thematic Bridge', value: 35 },
              { name: 'Semantic', value: 25 }
            ].map(engine => (
              <div key={engine.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{engine.name}</span>
                  <span className="font-mono">{engine.value}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={engine.value}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BottomPanel({ expanded, setExpanded, showChat, setShowChat, chatMode, setChatMode }) {
  const [message, setMessage] = useState('');
  const [contextInfo, setContextInfo] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setContextInfo(prev => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const contextMessages = [
    `${MOCK_DATA.document.currentSection} (${MOCK_DATA.document.progress}%) · ${MOCK_DATA.connections.length} connections · ${MOCK_DATA.stats.readingTime.thisSession} min reading`,
    `💡 2 unvalidated contradictions nearby`,
    `🌉 This section bridges to Surveillance Capitalism`
  ];

  if (showChat) {
    return (
      <div className="fixed bottom-0 left-0 right-0 h-[40vh] bg-white border-t shadow-lg flex flex-col">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-3">
            <span className="font-semibold">Chat with Document</span>
            <select 
              value={chatMode}
              onChange={(e) => setChatMode(e.target.value)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="full">📚 Entire Book</option>
              <option value="section">📖 Current Section</option>
              <option value="local">🔍 Nearby Chunks</option>
            </select>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setShowChat(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {chatMode === 'full' && (
          <div className="px-3 py-2 bg-blue-50 text-sm text-blue-700 border-b">
            ⚡ Context cached • Full document available • 75% cost reduction
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 space-y-3">
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm">AI</div>
            <div className="flex-1 bg-gray-100 rounded-lg p-3 text-sm">
              I can help you understand this document. What would you like to know about "{MOCK_DATA.document.currentSection}"?
            </div>
          </div>
        </div>

        <div className="border-t p-3">
          <div className="flex gap-2 mb-2">
            <Button size="sm" variant="outline">Summarize</Button>
            <Button size="sm" variant="outline">Connect to...</Button>
            <Button size="sm" variant="outline">Challenge</Button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask about this section..."
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            <Button size="icon"><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-white border-t transition-all ${expanded ? 'h-60' : 'h-14'}`}>
      <div className="h-14 flex items-center justify-between px-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); }}>
          <Zap className="h-4 w-4 mr-2" />
          Quick Spark
        </Button>

        <div className="flex-1 text-center text-sm text-gray-600">
          {contextMessages[contextInfo]}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); }}>
            📍 Where was I?
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setShowChat(true); }}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Chat
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 border-t">
          <div className="mb-4">
            <div className="font-semibold mb-2">{MOCK_DATA.document.currentSection}</div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-blue-600" style={{ width: `${MOCK_DATA.document.progress}%` }} />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium mb-1">Reading Stats</div>
                <div className="text-gray-600 space-y-1">
                  <div>• This session: {MOCK_DATA.stats.readingTime.thisSession} min</div>
                  <div>• {MOCK_DATA.connections.length} active connections</div>
                  <div>• {MOCK_DATA.stats.sparks} sparks captured</div>
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">AI Insights</div>
                <div className="text-gray-600 space-y-1">
                  <div>• 2 unvalidated contradictions</div>
                  <div>• Pattern across 3 books detected</div>
                  <div>• High-density region ahead (67%)</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1">
              📍 Where was I? (Generate Summary)
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowChat(true)}>
              💬 Ask about this section
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RhizomeReaderPrototype() {
  const [viewMode, setViewMode] = useState('normal');
  const [leftTab, setLeftTab] = useState('outline');
  const [rightTab, setRightTab] = useState('connections');
  const [bottomExpanded, setBottomExpanded] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMode, setChatMode] = useState('full');

  const leftCollapsed = viewMode === 'focus' || viewMode === 'normal';
  const rightCollapsed = viewMode === 'focus' || viewMode === 'normal';

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Top Panel */}
      <div className="h-14 bg-white border-b flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="font-semibold">{MOCK_DATA.document.title}</div>
            <div className="text-xs text-gray-600">
              {MOCK_DATA.stats.totalWords.toLocaleString()} words • {MOCK_DATA.document.totalChunks} chunks
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant={viewMode === 'normal' ? 'outline' : 'ghost'} active={viewMode === 'normal'} onClick={() => setViewMode('normal')}>
            <Menu className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={viewMode === 'focus' ? 'outline' : 'ghost'} active={viewMode === 'focus'} onClick={() => setViewMode('focus')}>
            <BookOpen className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={viewMode === 'explore' ? 'outline' : 'ghost'} active={viewMode === 'explore'} onClick={() => setViewMode('explore')}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="h-11 bg-white border-b flex items-center justify-between px-6 text-sm">
        <div className="flex items-center gap-4">
          <span className="text-gray-600">View:</span>
          <span className="font-medium">{viewMode === 'focus' ? 'Focus' : viewMode === 'explore' ? 'Explore' : 'Normal'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-600">{MOCK_DATA.document.progress}%</span>
          <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600" style={{ width: `${MOCK_DATA.document.progress}%` }} />
          </div>
          <Button size="sm" variant="ghost">Next Dense</Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        {viewMode !== 'focus' && (
          <LeftPanel collapsed={leftCollapsed} activeTab={leftTab} setActiveTab={setLeftTab} />
        )}

        {/* Reading Area */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="prose prose-gray max-w-none">
              <h1>Part 3: In the Zone</h1>
              <h2>Chapter 2: Paranoia Systems</h2>
              
              <div className="bg-yellow-50 border-l-4 border-yellow-500 pl-4 -ml-4 mb-4">
                <p>
                  A screaming comes across the sky. It has happened before, but there is nothing 
                  to compare it to now. The institutional machinery grinds on, processing behaviors 
                  into statistical patterns, transforming human agency into predictive models.
                </p>
              </div>

              <p>
                They've been watching him, of course. Every liaison catalogued, every movement tracked. 
                The data points on the map correspond too perfectly with the rocket strikes to be 
                coincidence. But causation? That's the question that haunts Pointsman and his team.
              </p>

              <p>
                The war effort demands it—demands the reduction of chaos into calculable risk. 
                Slothrop's unconscious desires become statistics, his patterns become predictions. 
                The intersection of paranoia and technology creates a surveillance architecture 
                that extends beyond any individual consciousness.
              </p>

              <div className="bg-blue-50 border-l-4 border-blue-500 pl-4 -ml-4">
                <p>
                  This mirrors modern systems of control—algorithmic prediction, behavioral surplus, 
                  the transformation of lived experience into extractable data. The techniques of 
                  1944 presage the mechanisms of 2025.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        {viewMode !== 'focus' && (
          <RightPanel collapsed={rightCollapsed} activeTab={rightTab} setActiveTab={setRightTab} />
        )}
      </div>

      {/* Bottom Panel */}
      <BottomPanel 
        expanded={bottomExpanded}
        setExpanded={setBottomExpanded}
        showChat={showChat}
        setShowChat={setShowChat}
        chatMode={chatMode}
        setChatMode={setChatMode}
      />
    </div>
  );
}