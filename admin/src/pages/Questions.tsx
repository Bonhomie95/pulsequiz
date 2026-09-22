import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '../api/client';
import { errMsg } from '../utils/errMsg';
import { useAdminRole } from '../auth/useAdminRole';
import {
  Plus, Search, RefreshCw, Edit3, Trash2, HelpCircle, X, Download, Upload, Eye, EyeOff, Flag,
} from 'lucide-react';

type Difficulty = 'easy' | 'medium' | 'hard';

type Question = {
  _id: string;
  category: string;
  question: string;
  options: string[];
  /** 0-based index into options. */
  answer: number;
  difficulty: Difficulty;
  explanation?: string | null;
  disabled?: boolean;
  reportCount?: number;
  createdAt: string;
};

type FormData = {
  category: string;
  question: string;
  options: [string, string, string, string];
  /** Index of the correct option, or null until one is picked. */
  answer: number | null;
  difficulty: Difficulty;
  /** Shown to players after the answer is revealed. Optional. */
  explanation: string;
};

type ImportReport = {
  received: number;
  valid: number;
  inserted: number;
  duplicatesInFile: number;
  duplicatesInDatabase: number;
  errors: { row: number; message: string; question?: string }[];
};

type Coverage = { category: string; easy: number; medium: number; hard: number; total: number };

const EMPTY_FORM: FormData = {
  category: '', question: '', options: ['', '', '', ''], answer: null, difficulty: 'medium', explanation: '',
};

const DIFF_STYLES: Record<Difficulty, string> = {
  easy: 'bg-green-500/15 text-green-400',
  medium: 'bg-yellow-500/15 text-yellow-400',
  hard: 'bg-red-500/15 text-red-400',
};

const PAGE_SIZE = 20;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function QuestionForm({ form, setForm, categories, onSave, saving, submitLabel, error }: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  categories: string[];
  onSave: () => void;
  saving: boolean;
  submitLabel: string;
  error: string | null;
}) {
  const setOption = (i: number, val: string) => {
    const opts = [...form.options] as FormData['options'];
    opts[i] = val;
    setForm((f) => ({ ...f, options: opts }));
  };
  const filled = form.options.every((o) => o.trim());
  const distinct = new Set(form.options.map((o) => o.trim().toLowerCase())).size === 4;
  const valid =
    form.category.trim().length >= 2 &&
    form.question.trim().length >= 8 &&
    filled && distinct && form.answer !== null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1" htmlFor="q-category">Category</label>
          <input
            id="q-category"
            list="categories"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="e.g. science"
            className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none"
          />
          <datalist id="categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1" htmlFor="q-difficulty">Difficulty</label>
          <select
            id="q-difficulty"
            value={form.difficulty}
            onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as Difficulty }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1" htmlFor="q-text">Question <span className="text-gray-600">(8–300 chars)</span></label>
        <textarea
          id="q-text"
          value={form.question}
          onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
          rows={2}
          maxLength={300}
          className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none resize-none"
          placeholder="Enter the question text…"
        />
      </div>

      <div>
        <p className="text-xs text-gray-400 mb-2">Answer options <span className="text-gray-600">(click the circle next to the correct one)</span></p>
        <div className="space-y-2">
          {form.options.map((opt, i) => {
            const correct = form.answer === i;
            return (
              <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border ${correct ? 'border-green-500/50 bg-green-500/5' : 'border-gray-700 bg-gray-800'}`}>
                <button
                  type="button"
                  aria-label={`Mark option ${i + 1} as correct`}
                  aria-pressed={correct}
                  onClick={() => setForm((f) => ({ ...f, answer: i }))}
                  className={`w-5 h-5 rounded-full border-2 shrink-0 transition ${correct ? 'border-green-500 bg-green-500' : 'border-gray-600 hover:border-indigo-500'}`}
                />
                <input
                  value={opt}
                  maxLength={120}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  aria-label={`Option ${i + 1}`}
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            );
          })}
        </div>
        {filled && !distinct && <p className="text-red-400 text-xs mt-1.5">Options must all be different.</p>}
        {form.answer !== null && form.options[form.answer] && (
          <p className="text-green-400 text-xs mt-1.5">✓ Correct answer: <strong>{form.options[form.answer]}</strong></p>
        )}
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1" htmlFor="q-explanation">
          Explanation <span className="text-gray-600">(optional — shown after the answer)</span>
        </label>
        <textarea
          id="q-explanation"
          value={form.explanation}
          maxLength={400}
          rows={2}
          onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          placeholder="One or two sentences on why the answer is right"
          className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-sm text-white outline-none transition resize-none"
        />
        <p className="text-gray-600 text-xs text-right">{form.explanation.length}/400</p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={onSave}
        disabled={saving || !valid}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed py-2.5 rounded-xl font-bold text-sm transition"
      >
        {saving ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

/** Accept a JSON array or `{ questions: [...] }`. */
function parseJsonQuestions(text: string): unknown[] {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.questions)) return data.questions;
  throw new Error('JSON must be an array of questions or { "questions": [...] }');
}

export default function Questions() {
  const { isSuperAdmin } = useAdminRole();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [diffFilter, setDiffFilter] = useState('');
  const [view, setView] = useState<'' | 'flagged' | 'disabled'>('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editQ, setEditQ] = useState<Question | null>(null);
  const [createForm, setCreateForm] = useState<FormData>({ ...EMPTY_FORM });
  const [editForm, setEditForm] = useState<FormData>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [coverage, setCoverage] = useState<Coverage[] | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<'csv' | 'json'>('csv');
  const [importText, setImportText] = useState('');
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<(ImportReport & { dryRun: boolean }) | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (catFilter) params.set('category', catFilter);
      if (diffFilter) params.set('difficulty', diffFilter);
      if (view === 'flagged') params.set('flagged', '1');
      if (view === 'disabled') params.set('status', 'disabled');
      const res = await adminApi.get(`/admin/questions?${params}`);
      setQuestions(res.data.questions ?? []);
      setTotal(res.data.total ?? 0);
      setCategories(res.data.categories ?? []);
    } catch (e) {
      setListError(errMsg(e, 'Could not load questions'));
    } finally {
      setLoading(false);
    }
  }, [page, search, catFilter, diffFilter, view]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  const fetchCoverage = useCallback(async () => {
    try {
      const res = await adminApi.get('/admin/questions/coverage');
      setCoverage(res.data.coverage ?? []);
    } catch {
      setCoverage(null);
    }
  }, []);
  useEffect(() => { fetchCoverage(); }, [fetchCoverage]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const toPayload = (f: FormData) => ({
    category: f.category.trim(),
    question: f.question.trim(),
    options: f.options.map((o) => o.trim()),
    answer: f.answer,
    difficulty: f.difficulty,
    explanation: f.explanation.trim(),
  });

  const createQuestion = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await adminApi.post('/admin/questions', toPayload(createForm));
      setShowCreate(false);
      setCreateForm({ ...EMPTY_FORM, category: createForm.category, difficulty: createForm.difficulty });
      fetchQuestions();
      fetchCoverage();
    } catch (e) {
      setFormError(errMsg(e, 'Error creating question'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (q: Question) => {
    setFormError(null);
    setEditQ(q);
    setEditForm({
      category: q.category,
      question: q.question,
      options: [q.options[0] ?? '', q.options[1] ?? '', q.options[2] ?? '', q.options[3] ?? ''],
      answer: Number.isInteger(q.answer) ? q.answer : null,
      difficulty: q.difficulty,
      explanation: q.explanation ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editQ) return;
    setSaving(true);
    setFormError(null);
    try {
      await adminApi.patch(`/admin/questions/${editQ._id}`, toPayload(editForm));
      setEditQ(null);
      fetchQuestions();
    } catch (e) {
      setFormError(errMsg(e, 'Error updating question'));
    } finally {
      setSaving(false);
    }
  };

  const toggleDisabled = async (q: Question) => {
    setBusyId(q._id);
    try {
      await adminApi.patch(`/admin/questions/${q._id}`, { disabled: !q.disabled });
      fetchQuestions();
      fetchCoverage();
    } catch (e) {
      alert(errMsg(e, 'Could not update question'));
    } finally {
      setBusyId(null);
    }
  };

  const deleteQ = async (q: Question) => {
    if (!confirm(`Delete this question permanently?\n\n"${q.question}"`)) return;
    setBusyId(q._id);
    try {
      await adminApi.delete(`/admin/questions/${q._id}`);
      fetchQuestions();
      fetchCoverage();
    } catch (e) {
      alert(errMsg(e, 'Error deleting question'));
    } finally {
      setBusyId(null);
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setImportReport(null);
    setImportError(null);
    if (file.size > MAX_FILE_BYTES) {
      setImportError('File is larger than 4 MB — split it into smaller files.');
      return;
    }
    const text = await file.text();
    setImportMode(file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv');
    setImportText(text);
    setImportFileName(file.name);
  };

  const runImport = async (dryRun: boolean) => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportError(null);
    try {
      const body =
        importMode === 'json'
          ? { questions: parseJsonQuestions(importText), dryRun }
          : { csv: importText, dryRun };
      const res = await adminApi.post('/admin/questions/import', body);
      setImportReport({ ...(res.data as ImportReport), dryRun });
      if (!dryRun) {
        fetchQuestions();
        fetchCoverage();
      }
    } catch (e) {
      setImportError(e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : errMsg(e, (e as Error)?.message || 'Import failed'));
    } finally {
      setImporting(false);
    }
  };

  const closeImport = () => {
    setShowImport(false);
    setImportReport(null);
    setImportError(null);
    setImportText('');
    setImportFileName(null);
  };

  const downloadTemplate = async () => {
    try {
      const res = await adminApi.get('/admin/questions/template.csv', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'question-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Could not download the template.');
    }
  };

  const willImport = importReport ? importReport.valid - importReport.duplicatesInDatabase : 0;

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><HelpCircle size={22} className="text-indigo-400" /> Question Bank</h1>
          <p className="text-gray-400 text-sm mt-1">{total.toLocaleString()} questions</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={fetchQuestions} aria-label="Refresh" className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <RefreshCw size={14} />
          </button>
          <button onClick={downloadTemplate} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Download size={15} /> CSV template
          </button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Upload size={15} /> Upload questions
          </button>
          <button onClick={() => { setFormError(null); setShowCreate(true); }} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus size={15} /> New question
          </button>
        </div>
      </div>

      {/* COVERAGE — which categories can actually sustain play */}
      {coverage && coverage.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-5">
          <h2 className="font-bold mb-3 text-sm">Category coverage (active questions)</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {coverage.map((c) => {
              const rounds = Math.min(Math.floor(c.easy / 4), Math.floor(c.medium / 4), Math.floor(c.hard / 2));
              const thin = rounds < 5;
              return (
                <button
                  key={c.category}
                  onClick={() => { setCatFilter(c.category); setPage(1); }}
                  className="flex items-center justify-between rounded-lg bg-gray-800/60 hover:bg-gray-800 px-3 py-2 text-sm text-left"
                >
                  <span className="capitalize truncate">{c.category}</span>
                  <span className="shrink-0 text-xs">
                    <span className="text-gray-400">{c.easy}/{c.medium}/{c.hard}</span>
                    <span className={thin ? 'ml-2 text-red-400 font-bold' : 'ml-2 text-green-400'}>{rounds} rounds</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-gray-500">
            Counts are easy/medium/hard. A round consumes 4/4/2 — under 5 rounds means players see repeats quickly.
          </p>
        </div>
      )}

      {/* SEARCH + FILTERS */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[180px]">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search questions…" aria-label="Search questions"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-500" />
          </div>
          <button type="submit" className="bg-indigo-600 px-4 py-2 rounded-lg text-sm font-semibold">Search</button>
        </form>
        <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }} aria-label="Category"
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex gap-1.5">
          {([['', 'All'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']] as const).map(([val, label]) => (
            <button key={val} onClick={() => { setDiffFilter(val); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition ${diffFilter === val ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {([['', 'Active + all'], ['flagged', 'Reported'], ['disabled', 'Disabled']] as const).map(([val, label]) => (
            <button key={val} onClick={() => { setView(val); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition ${view === val ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {listError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">{listError}</div>}

      {/* TABLE */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Question</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Difficulty</th>
              <th className="px-4 py-3 text-left">Correct answer</th>
              <th className="px-4 py-3 text-left">Reports</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-14 text-gray-500">Loading…</td></tr>
            ) : questions.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-14 text-gray-500">No questions found</td></tr>
            ) : questions.map((q) => (
              <tr key={q._id} className={`border-t border-gray-800 hover:bg-gray-800/30 transition ${q.disabled ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 max-w-sm">
                  <p className="font-medium line-clamp-2 text-xs leading-relaxed">{q.question}</p>
                  {q.disabled && <span className="text-[10px] font-bold text-gray-400">DISABLED</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 text-xs font-semibold">{q.category}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${DIFF_STYLES[q.difficulty]}`}>{q.difficulty}</span>
                </td>
                <td className="px-4 py-3 text-green-400 text-xs max-w-[160px] truncate">{q.options[q.answer] ?? `#${q.answer}`}</td>
                <td className="px-4 py-3 text-xs">
                  {q.reportCount ? <span className="inline-flex items-center gap-1 text-orange-400"><Flag size={12} /> {q.reportCount}</span> : <span className="text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(q)} aria-label="Edit question" className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition"><Edit3 size={13} /></button>
                    <button onClick={() => toggleDisabled(q)} disabled={busyId === q._id} aria-label={q.disabled ? 'Enable question' : 'Disable question'}
                      title={q.disabled ? 'Enable' : 'Disable (stop serving it)'}
                      className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-40">
                      {q.disabled ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    {isSuperAdmin && (
                      <button onClick={() => deleteQ(q)} disabled={busyId === q._id} aria-label="Delete question"
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition disabled:opacity-40">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <span className="text-gray-400 text-sm">{total} questions · Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm">Prev</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page * PAGE_SIZE >= total} className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* IMPORT MODAL */}
      {showImport && (
        <Modal title="Upload questions" onClose={closeImport}>
          <p className="text-sm text-gray-400 mb-3">
            Upload a <strong>.csv</strong> (columns: <code className="text-xs">category, difficulty, question, option1–option4, answer, explanation</code>)
            or a <strong>.json</strong> array of <code className="text-xs">{'{ category, difficulty, question, options: [4], answer, explanation }'}</code>.
            Explanation is optional.
            The answer may be the option text or its number (1–4). Up to 5,000 rows per file.
          </p>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }}
            />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition">
              <Upload size={14} /> Choose file
            </button>
            {importFileName && <span className="text-xs text-gray-400 truncate max-w-[220px]">{importFileName}</span>}
            <div className="ml-auto flex gap-1">
              {(['csv', 'json'] as const).map((m) => (
                <button key={m} onClick={() => { setImportMode(m); setImportReport(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${importMode === m ? 'bg-gray-700' : 'bg-gray-800 text-gray-400'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setImportReport(null); }}
            rows={8}
            spellCheck={false}
            aria-label="Questions to import"
            placeholder={importMode === 'csv'
              ? 'category,difficulty,question,option1,option2,option3,option4,answer,explanation'
              : '[{ "category": "science", "difficulty": "easy", "question": "…", "options": ["a","b","c","d"], "answer": "a" }]'}
            className="w-full rounded-lg bg-gray-800 p-3 font-mono text-xs outline-none border border-gray-700 focus:border-indigo-500"
          />

          {importError && <p className="mt-3 text-sm text-red-400">{importError}</p>}

          {importReport && (
            <div className="mt-3 rounded-lg bg-gray-800/70 p-3 text-xs text-gray-300 space-y-2">
              <p className="font-bold text-sm">
                {importReport.dryRun
                  ? `Dry run: ${willImport} of ${importReport.received} rows will be added`
                  : `Imported ${importReport.inserted} of ${importReport.received} rows`}
              </p>
              <p>
                {importReport.errors.length} invalid · {importReport.duplicatesInFile} duplicate in file ·{' '}
                {importReport.duplicatesInDatabase} already in the bank
              </p>
              {importReport.errors.length > 0 && (
                <ul className="max-h-40 overflow-y-auto space-y-1 text-red-300">
                  {importReport.errors.slice(0, 100).map((er) => (
                    <li key={`${er.row}-${er.message}`}>Row {er.row}: {er.message}{er.question ? ` — “${er.question.slice(0, 60)}”` : ''}</li>
                  ))}
                  {importReport.errors.length > 100 && <li>…and {importReport.errors.length - 100} more</li>}
                </ul>
              )}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => runImport(true)}
              disabled={importing || !importText.trim()}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition"
            >
              {importing ? 'Checking…' : 'Check file (dry run)'}
            </button>
            <button
              onClick={() => runImport(false)}
              // Import only after a clean-enough dry run of this exact text.
              disabled={importing || !importReport?.dryRun || willImport <= 0}
              title={!importReport?.dryRun ? 'Run the check first' : undefined}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              {importing ? 'Importing…' : importReport?.dryRun ? `Import ${willImport} questions` : 'Import'}
            </button>
          </div>
        </Modal>
      )}

      {showCreate && (
        <Modal title="New question" onClose={() => setShowCreate(false)}>
          <QuestionForm form={createForm} setForm={setCreateForm} categories={categories} onSave={createQuestion} saving={saving} submitLabel="Create question" error={formError} />
        </Modal>
      )}

      {editQ && (
        <Modal title="Edit question" onClose={() => setEditQ(null)}>
          <QuestionForm form={editForm} setForm={setEditForm} categories={categories} onSave={saveEdit} saving={saving} submitLabel="Save changes" error={formError} />
        </Modal>
      )}
    </div>
  );
}
