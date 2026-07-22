'use client';

import { useState } from 'react';

interface Template {
  id: string;
  templateSet: string;
  sortOrder: number;
  name: string;
  title: string;
  committeeRole: string | null;
  expertise: string[];
  personaPrompt: string | null;
  avatarEmoji: string | null;
  interrogationStyle: string | null;
}

interface Props {
  templates: Template[];
  onAdd: (templateId: string) => Promise<void>;
  existingNames: string[];
}

export function TemplateLibrary({ templates, onAdd, existingNames }: Props) {
  const [activeSet, setActiveSet] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const sets = [...new Set(templates.map((t) => t.templateSet))];
  const filtered = activeSet ? templates.filter((t) => t.templateSet === activeSet) : templates;

  const handleAdd = async (templateId: string) => {
    setAdding(templateId);
    await onAdd(templateId);
    setAdding(null);
  };

  const alreadyAdded = (name: string) => existingNames.includes(name);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveSet(null)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeSet === null ? 'bg-emerald-100 text-emerald-800' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          All Sets
        </button>
        {sets.map((set) => (
          <button
            key={set}
            onClick={() => setActiveSet(set)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeSet === set ? 'bg-emerald-100 text-emerald-800' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {set}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.sort((a, b) => a.sortOrder - b.sortOrder).map((t) => (
          <div
            key={t.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{t.avatarEmoji || '👤'}</span>
                <div>
                  <h4 className="font-medium text-gray-900 text-sm">{t.name}</h4>
                  <p className="text-xs text-gray-500">{t.title}</p>
                  {t.committeeRole && (
                    <p className="text-xs text-emerald-600 mt-0.5">{t.committeeRole}</p>
                  )}
                </div>
              </div>
            </div>

            {t.expertise && t.expertise.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {(t.expertise as string[]).slice(0, 4).map((e) => (
                  <span key={e} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                    {e}
                  </span>
                ))}
                {t.expertise.length > 4 && (
                  <span className="text-xs text-gray-400">+{t.expertise.length - 4}</span>
                )}
              </div>
            )}

            {t.interrogationStyle && (
              <p className="text-xs text-gray-500 mt-2 italic line-clamp-2">{t.interrogationStyle}</p>
            )}

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => setPreview(preview === t.id ? null : t.id)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {preview === t.id ? 'Hide' : 'Preview'}
              </button>
              {alreadyAdded(t.name) ? (
                <span className="ml-auto text-xs text-gray-400">Already added</span>
              ) : (
                <button
                  onClick={() => handleAdd(t.id)}
                  disabled={adding === t.id}
                  className="ml-auto px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  {adding === t.id ? 'Adding...' : 'Add to My Board'}
                </button>
              )}
            </div>

            {preview === t.id && t.personaPrompt && (
              <div className="mt-3 p-3 bg-gray-50 rounded-md">
                <p className="text-xs text-gray-600 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {t.personaPrompt}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
