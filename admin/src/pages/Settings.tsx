import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import {
  Save,
  RefreshCw,
  Settings as SettingsIcon,
  Coins,
  Shield,
  Bell,
  Gift,
} from 'lucide-react';

type Setting = {
  key: string;
  value: string | number | boolean;
};

const SETTING_META: Record<
  string,
  {
    label: string;
    description: string;
    type: 'number' | 'boolean';
    group: string;
    min?: number;
    max?: number;
  }
> = {
  referral_coin_referrer: {
    label: 'Referral Coins — Referrer',
    description: 'Coins given to the person who referred a new user',
    type: 'number',
    group: 'Referral',
    min: 0,
  },
  referral_coin_new_user: {
    label: 'Referral Coins — New User',
    description: 'Coins given to the new user who used a referral code',
    type: 'number',
    group: 'Referral',
    min: 0,
  },
  daily_ad_reward_coins: {
    label: 'Rewarded Ad — Coins Per View',
    description: 'Coins awarded each time a user watches a rewarded video ad',
    type: 'number',
    group: 'Ads',
    min: 1,
  },
  daily_ad_reward_max: {
    label: 'Rewarded Ad — Max Per Day',
    description: 'Maximum number of rewarded ads a user can watch per day',
    type: 'number',
    group: 'Ads',
    min: 1,
    max: 20,
  },
  daily_checkin_coins: {
    label: 'Daily Check-In Coins',
    description: 'Coins given for each daily streak check-in',
    type: 'number',
    group: 'Coins',
    min: 0,
  },
  max_pvp_wager: {
    label: 'Max PvP Wager',
    description: 'Maximum coins a player can stake in a single PvP match',
    type: 'number',
    group: 'PvP',
    min: 50,
    max: 10000,
  },
  daily_session_cap: {
    label: 'Daily Session Cap',
    description:
      'Max sessions that count toward leaderboard per user per day (anti-farming)',
    type: 'number',
    group: 'Anti-Cheat',
    min: 5,
    max: 100,
  },
  min_payout_usd: {
    label: 'Minimum Payout (USDT)',
    description:
      'Minimum USDT required before a payout is sent (amounts below accumulate)',
    type: 'number',
    group: 'Payouts',
    min: 1,
  },
  min_account_age_days: {
    label: 'Min Account Age for Payout (days)',
    description:
      'Account must be at least this many days old to receive a USDT payout',
    type: 'number',
    group: 'Payouts',
    min: 0,
  },
  min_sessions_for_payout: {
    label: 'Min Quiz Sessions for Payout',
    description:
      'User must have completed at least this many sessions before receiving a payout',
    type: 'number',
    group: 'Payouts',
    min: 0,
  },
};

const GROUP_ICONS: Record<string, React.ReactNode> = {
  Referral: <Gift size={16} />,
  Ads: <Bell size={16} />,
  Coins: <Coins size={16} />,
  PvP: <SettingsIcon size={16} />,
  'Anti-Cheat': <Shield size={16} />,
  Payouts: <Coins size={16} />,
};

function groupSettings(settings: Setting[]) {
  const groups: Record<string, Setting[]> = {};
  for (const s of settings) {
    const meta = SETTING_META[s.key];
    if (!meta) continue;
    if (!groups[meta.group]) groups[meta.group] = [];
    groups[meta.group].push(s);
  }
  return groups;
}

export default function Settings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await adminApi.get('/admin/settings');
      setSettings(res.data.settings ?? []);
      setEdits({});
    } catch (e: any) {
        alert(e?.response?.data?.message ?? 'Error fetching settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const setEdit = (key: string, value: any) => {
    setEdits((e) => ({ ...e, [key]: value }));
  };

  const getVal = (key: string): any => {
    if (edits[key] !== undefined) return edits[key];
    return settings.find((s) => s.key === key)?.value ?? 0;
  };

  const hasChanges = Object.keys(edits).length > 0;

  const saveAll = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      await adminApi.put('/admin/settings/bulk', { settings: edits });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      fetchSettings();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const groups = groupSettings(settings);

  return (
    <div className="text-white">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Game Settings</h1>
          <p className="text-gray-400 text-sm mt-1">
            Configure coins, payouts, PvP limits, and more
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchSettings}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={saveAll}
            disabled={saving || !hasChanges}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition ${
              saved
                ? 'bg-green-600'
                : hasChanges
                  ? 'bg-indigo-600 hover:bg-indigo-500'
                  : 'bg-gray-800 opacity-40 cursor-not-allowed'
            }`}
          >
            <Save size={15} />
            {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading settings…</div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(groups).map(([group, groupSettings]) => (
            <div
              key={group}
              className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
            >
              {/* GROUP HEADER */}
              <div className="flex items-center gap-2 px-5 py-3 bg-gray-800/60 border-b border-gray-800">
                {GROUP_ICONS[group] ?? <SettingsIcon size={16} />}
                <h2 className="font-bold text-sm">{group}</h2>
              </div>

              {/* SETTINGS */}
              <div className="divide-y divide-gray-800">
                {groupSettings.map((s) => {
                  const meta = SETTING_META[s.key];
                  if (!meta) return null;
                  const currentVal = getVal(s.key);
                  const isEdited = edits[s.key] !== undefined;

                  return (
                    <div
                      key={s.key}
                      className="flex items-center justify-between px-5 py-4 gap-6 hover:bg-gray-800/30 transition"
                    >
                      <div className="flex-1">
                        <p
                          className={`font-semibold text-sm ${isEdited ? 'text-indigo-300' : ''}`}
                        >
                          {meta.label}
                          {isEdited && (
                            <span className="ml-2 text-xs text-indigo-400">
                              ● edited
                            </span>
                          )}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {meta.description}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {meta.type === 'boolean' ? (
                          <button
                            onClick={() => setEdit(s.key, !currentVal)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${currentVal ? 'bg-indigo-600' : 'bg-gray-700'}`}
                          >
                            <span
                              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${currentVal ? 'left-7' : 'left-1'}`}
                            />
                          </button>
                        ) : (
                          <input
                            type="number"
                            min={meta.min ?? 0}
                            max={meta.max}
                            value={currentVal}
                            onChange={(e) =>
                              setEdit(s.key, Number(e.target.value))
                            }
                            className="w-28 bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white text-right outline-none transition"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* UNSAVED BANNER */}
          {hasChanges && (
            <div className="fixed bottom-6 right-6 bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 z-50">
              <span className="text-sm font-semibold">
                {Object.keys(edits).length} unsaved change
                {Object.keys(edits).length > 1 ? 's' : ''}
              </span>
              <button
                onClick={saveAll}
                disabled={saving}
                className="bg-white text-indigo-700 font-bold text-sm px-4 py-1.5 rounded-lg hover:bg-indigo-50 transition"
              >
                {saving ? 'Saving…' : 'Save Now'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
