import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  Shield, Target, Swords, Rocket, Settings2,
  Cpu, CheckCircle, AlertTriangle, Loader2, ChevronRight, Lock, Zap
} from 'lucide-react';

// ── Configuration ──────────────────────────────────────────────────────────────
const AGENT_ADDRESS    = "0xD40628dF285897C72Ecb7f5b2dEb31a6Bfd7F815";
const VAULT_ADDRESS    = "0xC36d724BFbC540F2b4f531AaB7B941B3DaD20Eb8";
const STRATEGY_ADDRESS = "0x9a0d057FCEadB9C7E876b15948b37F5E2405E18a";
const GALILEO_CHAIN_ID = '0x40da';

const AGENT_ABI = [
  "function mintAgent(string memory tokenURI) external payable",
  "function mintPrice() external view returns (uint256)",
  "function totalMinted() external view returns (uint256)",
];

const STRATEGY_ABI = [
  "function commitStrategy(uint256 tokenId, uint8 strategyClass) external",
  "function commitCustomStrategy(uint256 tokenId, uint256 buyThresholdBps, uint256 reduceThresholdBps, uint256 buySizeBps) external",
  "function getStrategy(uint256 tokenId) external view returns (tuple(uint8 strategyClass, uint256 customBuyThresholdBps, uint256 customReduceThresholdBps, uint256 customBuySizeBps, uint256 committedAt, bool committed))",
  "function isStrategyLocked(uint256 tokenId) external view returns (bool)",
];

// ── Strategy Class Definitions ─────────────────────────────────────────────────
const STRATEGY_CLASSES = [
  {
    id: 0,
    name: 'Safe Guardian',
    emoji: '🛡️',
    archetype: 'TANK',
    color: 'from-blue-600/30 to-cyan-600/20',
    border: 'border-blue-500/40',
    glow: 'shadow-blue-500/20',
    accentColor: 'text-blue-400',
    badgeBg: 'bg-blue-500/20',
    icon: Shield,
    tagline: 'Capital is sacred. Losses are unacceptable.',
    description: 'The safest path. Enters markets only on strong 4% bullish confirmations. Exits quickly on the slightest weakness to preserve capital at all costs.',
    stats: {
      risk: 1,
      speed: 2,
      aggression: 1,
      yield: 2,
    },
    params: { buyThreshold: '4.0%', reduceThreshold: '1.5%', positionSize: '2%' },
  },
  {
    id: 1,
    name: 'Yield Sniper',
    emoji: '🎯',
    archetype: 'ROGUE',
    color: 'from-green-600/30 to-emerald-600/20',
    border: 'border-green-500/40',
    glow: 'shadow-green-500/20',
    accentColor: 'text-green-400',
    badgeBg: 'bg-green-500/20',
    icon: Target,
    tagline: 'Every tick is an opportunity.',
    description: 'High-frequency micro-trading. Enters on the smallest 0.5% moves with large 15% position sizes to squeeze maximum yield from near-flat market conditions.',
    stats: {
      risk: 3,
      speed: 5,
      aggression: 4,
      yield: 5,
    },
    params: { buyThreshold: '0.5%', reduceThreshold: '2.0%', positionSize: '15%' },
  },
  {
    id: 2,
    name: 'Balanced Merc',
    emoji: '⚔️',
    archetype: 'WARRIOR',
    color: 'from-purple-600/30 to-violet-600/20',
    border: 'border-purple-500/40',
    glow: 'shadow-purple-500/20',
    accentColor: 'text-purple-400',
    badgeBg: 'bg-purple-500/20',
    icon: Swords,
    tagline: 'Calculated risks. Consistent returns.',
    description: 'The field-tested veteran. A proven 2%/3% momentum strategy with moderate 5% position sizing. The default for users who want reliable, battle-tested performance.',
    stats: {
      risk: 2,
      speed: 3,
      aggression: 3,
      yield: 3,
    },
    params: { buyThreshold: '2.0%', reduceThreshold: '3.0%', positionSize: '5%' },
  },
  {
    id: 3,
    name: 'Moon Chaser',
    emoji: '🚀',
    archetype: 'MAGE',
    color: 'from-orange-600/30 to-amber-600/20',
    border: 'border-orange-500/40',
    glow: 'shadow-orange-500/20',
    accentColor: 'text-orange-400',
    badgeBg: 'bg-orange-500/20',
    icon: Rocket,
    tagline: 'To the moon or bust. No half measures.',
    description: 'All-in, all-out. Deploys a massive 25% position on any 1% rally, riding waves until a 5% crash forces a retreat. Extreme volatility. Extreme potential.',
    stats: {
      risk: 5,
      speed: 4,
      aggression: 5,
      yield: 4,
    },
    params: { buyThreshold: '1.0%', reduceThreshold: '5.0%', positionSize: '25%' },
  },
  {
    id: 4,
    name: 'Custom',
    emoji: '⚙️',
    archetype: 'ARCHITECT',
    color: 'from-gray-600/30 to-slate-600/20',
    border: 'border-gray-500/40',
    glow: 'shadow-gray-500/20',
    accentColor: 'text-gray-300',
    badgeBg: 'bg-gray-500/20',
    icon: Settings2,
    tagline: 'Your rules. Your edge.',
    description: 'Complete control for experienced traders. Define your exact buy/sell thresholds and position sizing. Maximum flexibility, maximum responsibility.',
    stats: null,
    params: null,
  },
];

// ── Stat Bar Component ─────────────────────────────────────────────────────────
function StatBar({ label, value, max = 5, color }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
        <span className="text-gray-500">{label}</span>
        <span className={color}>{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${
            value >= 4 ? 'from-orange-500 to-red-400' :
            value >= 3 ? 'from-purple-500 to-blue-400' :
            'from-blue-500 to-cyan-400'
          }`}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function MintPage({ account, onNavigate }) {
  const [step, setStep] = useState(1); // 1: Choose Class, 2: Configure, 3: Mint & Commit
  const [selectedClass, setSelectedClass] = useState(null);
  const [customParams, setCustomParams] = useState({
    buyThresholdBps: 200,
    reduceThresholdBps: 300,
    buySizeBps: 500,
  });
  const [mintedTokenId, setMintedTokenId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSelectClass = (cls) => {
    setSelectedClass(cls);
    setStep(2);
  };

  const handleMintAndCommit = async () => {
    if (!account || selectedClass === null) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Step 1: Mint the iNFT
      setLoadingStep('Minting your Agent iNFT...');
      const agentContract = new ethers.Contract(AGENT_ADDRESS, AGENT_ABI, signer);
      const mintPrice = await agentContract.mintPrice();
      const totalMinted = await agentContract.totalMinted();
      const nextTokenId = Number(totalMinted);

      const mintTx = await agentContract.mintAgent(`SealedClaw-Agent-Class${selectedClass.id}`, { value: mintPrice });
      await mintTx.wait();
      setMintedTokenId(nextTokenId);

      // Step 2: Commit Strategy
      setLoadingStep(`Committing ${selectedClass.name} strategy on-chain...`);
      const strategyContract = new ethers.Contract(STRATEGY_ADDRESS, STRATEGY_ABI, signer);

      let strategyTx;
      if (selectedClass.id === 4) {
        // CUSTOM
        strategyTx = await strategyContract.commitCustomStrategy(
          nextTokenId,
          customParams.buyThresholdBps,
          customParams.reduceThresholdBps,
          customParams.buySizeBps
        );
      } else {
        strategyTx = await strategyContract.commitStrategy(nextTokenId, selectedClass.id);
      }
      await strategyTx.wait();

      setSuccess(`✅ Agent #${nextTokenId} minted with ${selectedClass.emoji} ${selectedClass.name} strategy!`);
      setStep(3);
    } catch (e) {
      console.error(e);
      setError(e.reason || e.message || 'Transaction failed');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] text-white font-['Inter',sans-serif]">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-700/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-700/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-xs font-bold text-purple-400 uppercase tracking-widest mb-6">
            <Zap size={12} /> Choose Your Agent Class
          </div>
          <h1 className="text-5xl md:text-6xl font-black mb-4 bg-gradient-to-br from-white via-purple-200 to-blue-400 bg-clip-text text-transparent leading-tight">
            Summon Your Agent
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Each iNFT is a sovereign trading agent with a committed strategy.
            Choose your class wisely — your risk profile is <strong className="text-white">locked during handover</strong>.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-3 mb-12">
          {['Choose Class', 'Review & Configure', 'Mint & Commit'].map((label, i) => (
            <React.Fragment key={label}>
              <div className={`flex items-center gap-2 transition-all ${step > i + 1 ? 'text-green-400' : step === i + 1 ? 'text-white' : 'text-gray-600'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border transition-all ${
                  step > i + 1 ? 'bg-green-400/20 border-green-400/50' :
                  step === i + 1 ? 'bg-white/10 border-white/30' :
                  'border-white/10'
                }`}>
                  {step > i + 1 ? <CheckCircle size={14} /> : i + 1}
                </div>
                <span className="text-xs font-bold hidden sm:block">{label}</span>
              </div>
              {i < 2 && <ChevronRight size={14} className="text-gray-700" />}
            </React.Fragment>
          ))}
        </div>

        {/* STEP 1: Class Selection */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {STRATEGY_CLASSES.map((cls) => {
              const Icon = cls.icon;
              return (
                <button
                  key={cls.id}
                  id={`strategy-class-${cls.id}-btn`}
                  onClick={() => handleSelectClass(cls)}
                  className={`group relative text-left p-6 rounded-3xl border bg-gradient-to-br ${cls.color} ${cls.border} 
                    hover:scale-[1.02] hover:shadow-xl hover:${cls.glow} transition-all duration-300 cursor-pointer`}
                >
                  {/* Archetype badge */}
                  <div className={`absolute top-4 right-4 px-2 py-0.5 ${cls.badgeBg} rounded-full text-[9px] font-black tracking-widest ${cls.accentColor} uppercase`}>
                    {cls.archetype}
                  </div>

                  {/* Icon */}
                  <div className={`w-14 h-14 flex items-center justify-center text-3xl mb-4 rounded-2xl bg-white/5 border border-white/5`}>
                    {cls.emoji}
                  </div>

                  <h3 className={`text-xl font-black text-white mb-1`}>{cls.name}</h3>
                  <p className={`text-xs font-bold mb-3 ${cls.accentColor} italic`}>"{cls.tagline}"</p>
                  <p className="text-gray-400 text-xs leading-relaxed mb-5">{cls.description}</p>

                  {/* Stat bars */}
                  {cls.stats && (
                    <div className="space-y-2 mb-5">
                      <StatBar label="Risk" value={cls.stats.risk} color={cls.accentColor} />
                      <StatBar label="Speed" value={cls.stats.speed} color={cls.accentColor} />
                      <StatBar label="Aggression" value={cls.stats.aggression} color={cls.accentColor} />
                      <StatBar label="Yield" value={cls.stats.yield} color={cls.accentColor} />
                    </div>
                  )}

                  {cls.params && (
                    <div className={`grid grid-cols-3 gap-1 text-center text-[10px] p-2 rounded-xl bg-black/20`}>
                      {Object.entries(cls.params).map(([key, val]) => (
                        <div key={key}>
                          <div className="text-gray-600 uppercase tracking-wider">{key.replace(/([A-Z])/g,' $1').trim()}</div>
                          <div className={`font-black text-sm ${cls.accentColor}`}>{val}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`mt-5 flex items-center justify-end gap-1 ${cls.accentColor} text-xs font-bold`}>
                    Select Class <ChevronRight size={14} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* STEP 2: Review & Configure */}
        {step === 2 && selectedClass && (
          <div className="max-w-2xl mx-auto space-y-8">
            {/* Class Card preview */}
            <div className={`p-8 rounded-3xl border bg-gradient-to-br ${selectedClass.color} ${selectedClass.border}`}>
              <div className="flex items-center gap-4 mb-4">
                <div className="text-5xl">{selectedClass.emoji}</div>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${selectedClass.accentColor}`}>{selectedClass.archetype}</div>
                  <h2 className="text-3xl font-black text-white">{selectedClass.name}</h2>
                  <p className={`text-sm italic ${selectedClass.accentColor}`}>"{selectedClass.tagline}"</p>
                </div>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">{selectedClass.description}</p>
            </div>

            {/* Custom params (only for Custom class) */}
            {selectedClass.id === 4 && (
              <div className="p-6 rounded-3xl border border-gray-700/50 bg-black/40 space-y-6">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <Settings2 size={18} className="text-gray-400" /> Configure Custom Parameters
                </h3>
                {[
                  { key: 'buyThresholdBps', label: 'Buy Trigger (bps)', hint: '50 = 0.5%, 200 = 2%. Min: 10, Max: 5000', min: 10, max: 5000 },
                  { key: 'reduceThresholdBps', label: 'Reduce Trigger (bps)', hint: '150 = 1.5%, 300 = 3%. Min: 10, Max: 5000', min: 10, max: 5000 },
                  { key: 'buySizeBps', label: 'Position Size (bps)', hint: '500 = 5%, 1500 = 15%. Min: 10, Max: 5000', min: 10, max: 5000 },
                ].map(({ key, label, hint, min, max }) => (
                  <div key={key}>
                    <div className="flex justify-between mb-1">
                      <label className="text-gray-400 text-xs font-bold uppercase tracking-wider">{label}</label>
                      <span className="text-gray-300 font-mono text-xs">{(customParams[key] / 100).toFixed(2)}%</span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={10}
                      value={customParams[key]}
                      onChange={(e) => setCustomParams({ ...customParams, [key]: Number(e.target.value) })}
                      className="w-full accent-purple-400"
                    />
                    <p className="text-gray-600 text-[10px] mt-1">{hint}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Strategy Commitment Pattern — Explanation */}
            <div className="p-5 rounded-2xl border border-orange-500/20 bg-orange-500/5 flex gap-3">
              <Lock size={20} className="text-orange-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-orange-300 font-bold text-sm mb-1">Strategy Commitment Lock</h4>
                <p className="text-gray-400 text-xs leading-relaxed">
                  Your strategy is stored <strong className="text-white">on-chain</strong> and automatically <strong className="text-orange-300">locked</strong> when you initiate a handover.
                  This prevents bait-and-switch attacks where a seller degrades the strategy before transferring.
                  Buyers can verify your committed strategy before purchase.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex gap-2 items-start text-red-400 text-sm">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => { setStep(1); setError(''); }}
                className="flex-1 py-4 rounded-2xl border border-white/10 text-gray-400 font-bold hover:border-white/20 hover:text-white transition-all"
              >
                ← Back
              </button>
              <button
                id="mint-commit-btn"
                onClick={handleMintAndCommit}
                disabled={loading || !account}
                className={`flex-2 flex-grow-[2] py-4 rounded-2xl bg-gradient-to-r ${selectedClass.color} border ${selectedClass.border}
                  text-white font-black uppercase tracking-widest text-sm hover:opacity-90 active:scale-[0.98]
                  transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3`}
              >
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /> {loadingStep || 'Processing...'}</>
                ) : (
                  <><Cpu size={18} /> Mint & Commit Strategy</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Success */}
        {step === 3 && (
          <div className="max-w-lg mx-auto text-center">
            <div className="w-24 h-24 mx-auto mb-6 flex items-center justify-center rounded-full bg-green-400/10 border border-green-400/30">
              <CheckCircle size={48} className="text-green-400" />
            </div>
            <h2 className="text-4xl font-black text-white mb-3">Agent Summoned!</h2>
            <p className="text-gray-400 mb-2">
              Token <span className="text-white font-mono font-bold">#{mintedTokenId}</span> minted with
            </p>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${selectedClass.badgeBg} border ${selectedClass.border} ${selectedClass.accentColor} font-black text-lg mb-8`}>
              {selectedClass.emoji} {selectedClass.name}
            </div>
            {success && <p className="text-green-400 text-sm mb-8">{success}</p>}
            <div className="flex gap-4">
              <button
                onClick={() => onNavigate('dashboard')}
                className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 text-white font-black uppercase tracking-widest hover:from-purple-600/30 transition-all"
              >
                Open Dashboard →
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
