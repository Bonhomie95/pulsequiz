import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { Plus, Search, RefreshCw, Edit3, Trash2, HelpCircle, X, Download, Upload } from 'lucide-react';

type Question = {
  _id: string;
  category: string;
  question: string;
  options: string[];
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  createdAt: string;
};

type FormData = {
  category: string;
  question: string;
  options: [string, string, string, string];
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
};

const EMPTY_FORM: FormData = {
  category: '', question: '', options: ['', '', '', ''], answer: '', difficulty: 'medium',
};

const DIFF_STYLES: Record<string, string> = {
  easy:   'bg-green-500/15 text-green-400',
  medium: 'bg-yellow-500/15 text-yellow-400',
  hard:   'bg-red-500/15 text-red-400',
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function QuestionForm({ form, setForm, categories, onSave, saving, submitLabel }: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  categories: string[];
  onSave: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const setOption = (i: number, val: string) => {
    const opts = [...form.options] as [string, string, string, string];
    opts[i] = val;
    setForm((f) => ({ ...f, options: opts }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Category</label>
          <input
            list="categories"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="e.g. Science"
            className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none"
          />
          <datalist id="categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Difficulty</label>
          <select
            value={form.difficulty}
            onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as any }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Question</label>
        <textarea
          value={form.question}
          onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none resize-none"
          placeholder="Enter the question text…"
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-2">Answer Options <span className="text-gray-600">(select correct one)</span></label>
        <div className="space-y-2">
          {form.options.map((opt, i) => (
            <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border ${form.answer === opt && opt ? 'border-green-500/50 bg-green-500/5' : 'border-gray-700 bg-gray-800'}`}>
              <button
                type="button"
                onClick={() => opt && setForm((f) => ({ ...f, answer: opt }))}
                className={`w-5 h-5 rounded-full border-2 shrink-0 transition ${form.answer === opt && opt ? 'border-green-500 bg-green-500' : 'border-gray-600 hover:border-indigo-500'}`}
              />
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          ))}
        </div>
        {form.answer && <p className="text-green-400 text-xs mt-1.5">✓ Correct answer: <strong>{form.answer}</strong></p>}
      </div>

      <button
        onClick={onSave}
        disabled={saving || !form.question || !form.category || !form.answer}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed py-2.5 rounded-xl font-bold text-sm transition"
      >
        {saving ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

export default function Questions() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [diffFilter, setDiffFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [editQ, setEditQ] = useState<Question | null>(null);
  const [createForm, setCreateForm] = useState<FormData>({ ...EMPTY_FORM });
  const [editForm, setEditForm] = useState<FormData>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  type Coverage = {
    category: string;
    easy: number;
    medium: number;
    hard: number;
    total: number;
    healthy?: boolean;
  };
  const [coverage, setCoverage] = useState<Coverage[] | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importCsv, setImportCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (catFilter) params.set('category', catFilter);
      if (diffFilter) params.set('difficulty', diffFilter);
      const res = await adminApi.get(`/admin/questions?${params}`);
      setQuestions(res.data.questions ?? []);
      setTotal(res.data.total ?? 0);
      setCategories(res.data.categories ?? []);
    } catch (e) {
      console.error('Questions fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQuestions(); }, [page, catFilter, diffFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchQuestions(); };

  const createQuestion = async () => {
    setSaving(true);
    try {
      await adminApi.post('/admin/questions', createForm);
      setShowCreate(false);
      setCreateForm({ ...EMPTY_FORM });
      fetchQuestions();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error creating');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (q: Question) => {
    setEditQ(q);
    setEditForm({ category: q.category, question: q.question, options: [...q.options] as any, answer: q.answer, difficulty: q.difficulty });
  };

  const saveEdit = async () => {
    if (!editQ) return;
    setSaving(true);
    try {
      await adminApi.patch(`/admin/questions/${editQ._id}`, editForm);
      setEditQ(null);
      fetchQuestions();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error updating');
    } finally {
      setSaving(false);
    }
  };

  /** Per-category health. Thin categories are why players see repeats. */
  const fetchCoverage = async () => {
    try {
      const res = await adminApi.get('/admin/questions/coverage');
      setCoverage(res.data.coverage ?? res.data);
    } catch {
      setCoverage(null);
    }
  };
  useEffect(() => {
    fetchCoverage();
  }, []);

  /**
   * Bulk import. Always dry-run first and show the result — an import that
   * silently rejects half its rows is worse than one that refuses outright.
   */
  const runImport = async (dryRun: boolean) => {
    if (!importCsv.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await adminApi.post('/admin/questions/import', {
        csv: importCsv,
        dryRun,
      });
      const d = res.data;
      setImportResult(
        `${dryRun ? 'Dry run' : 'Imported'}: ${d.inserted ?? 0} added, ` +
          `${d.duplicates ?? 0} duplicates, ${d.rejected?.length ?? d.rejected ?? 0} rejected` +
          (d.errors?.length ? `
${d.errors.slice(0, 5).join('\n')}` : ''),
      );
      if (!dryRun) {
        fetchQuestions();
        fetchCoverage();
      }
    } catch (e: any) {
      setImportResult(e?.response?.data?.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await adminApi.get('/admin/questions/template.csv', {
        responseType: 'blob',
      });
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

  const deleteQ = async (id: string) => {
    if (!confirm('Delete this question?')) return;
    setDeleting(id);
    try {
      await adminApi.delete(`/admin/questions/${id}`);
      fetchQuestions();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Error deleting');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><HelpCircle size={22} className="text-indigo-400" /> Question Bank</h1>
          <p className="text-gray-400 text-sm mt-1">{total.toLocaleString()} questions</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchQuestions} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <RefreshCw size={14} />
          </button>
          <button onClick={downloadTemplate} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Download size={15} /> Template
          </button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Upload size={15} /> Import CSV
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus size={15} /> New Question
          </button>
        </div>
      </div>

      {/* COVERAGE — which categories can actually sustain play */}
      {coverage && coverage.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-5">
          <h2 className="font-bold mb-3 text-sm">Category Coverage</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {coverage.map((c) => {
              // A round needs 4 easy / 4 medium / 2 hard, so the binding
              // constraint is whichever tier runs out first.
              const rounds = Math.min(
                Math.floor(c.easy / 4),
                Math.floor(c.medium / 4),
                Math.floor(c.hard / 2),
              );
              const thin = rounds < 5;
              return (
                <div
                  key={c.category}
                  className="flex items-center justify-between rounded-lg bg-gray-800/60 px-3 py-2 text-sm"
                >
                  <span className="capitalize truncate">{c.category}</span>
                  <span className="shrink-0 text-xs">
                    <span className="text-gray-400">
                      {c.easy}/{c.medium}/{c.hard}
                    </span>
                    <span className={thin ? 'ml-2 text-red-400 font-bold' : 'ml-2 text-green-400'}>
                      {rounds} rounds
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-gray-500">
            Counts are easy/medium/hard. A round consumes 4/4/2 — anything under
            5 rounds means players start seeing repeats quickly.
          </p>
        </div>
      )}

      {/* SEARCH + FILTERS */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[180px]">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-500" />
          </div>
          <button type="submit" className="bg-indigo-600 px-4 py-2 rounded-lg text-sm font-semibold">Search</button>
        </form>
        <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex gap-1.5">
          {[['', 'All'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']].map(([val, label]) => (
            <button key={val} onClick={() => { setDiffFilter(val); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition ${diffFilter === val ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Question</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Difficulty</th>
              <th className="px-4 py-3 text-left">Correct Answer</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-14 text-gray-500">Loading…</td></tr>
            ) : questions.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-14 text-gray-500">No questions found</td></tr>
            ) : questions.map((q) => (
              <tr key={q._id} className="border-t border-gray-800 hover:bg-gray-800/30 transition">
                <td className="px-4 py-3 max-w-sm">
                  <p className="font-medium line-clamp-2 text-xs leading-relaxed">{q.question}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 text-xs font-semibold">{q.category}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${DIFF_STYLES[q.difficulty]}`}>{q.difficulty}</span>
                </td>
                <td className="px-4 py-3 text-green-400 text-xs max-w-[140px] truncate">{q.answer}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(q)} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition"><Edit3 size={13} /></button>
                    <button onClick={() => deleteQ(q._id)} disabled={deleting === q._id}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <span className="text-gray-400 text-sm">{total} questions · Page {page}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm">Prev</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= total} className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 text-sm">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showImport && (
        <Modal
          title="Import Questions from CSV"
          onClose={() => {
            setShowImport(false);
            setImportResult(null);
          }}
        >
          <p className="text-sm text-gray-400 mb-3">
            Paste CSV rows, or download the template for the expected columns.
            Run a dry run first — it reports duplicates and rejects without
            writing anything.
          </p>
          <textarea
            value={importCsv}
            onChange={(e) => setImportCsv(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder="category,difficulty,question,option1,option2,option3,option4,answer"
            className="w-full rounded-lg bg-gray-800 p-3 font-mono text-xs outline-none border border-gray-700 focus:border-indigo-500"
          />
          {importResult && (
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-800/70 p-3 text-xs text-gray-300">
              {importResult}
            </pre>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => runImport(true)}
              disabled={importing || !importCsv.trim()}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition"
            >
              {importing ? 'Checking…' : 'Dry run'}
            </button>
            <button
              onClick={() => runImport(false)}
              disabled={importing || !importCsv.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </Modal>
      )}

      {showCreate && (
        <Modal title="New Question" onClose={() => setShowCreate(false)}>
          <QuestionForm form={createForm} setForm={setCreateForm} categories={categories} onSave={createQuestion} saving={saving} submitLabel="Create Question" />
        </Modal>
      )}

      {/* EDIT MODAL */}
      {editQ && (
        <Modal title="Edit Question" onClose={() => setEditQ(null)}>
          <QuestionForm form={editForm} setForm={setEditForm} categories={categories} onSave={saveEdit} saving={saving} submitLabel="Save Changes" />
        </Modal>
      )}
    </div>
  );
}
