'use client';

import { useState } from 'react';

interface Connector {
  id: string;
  name: string;
  serverUrl: string;
  authType: string;
  credentialsEncrypted: string | null;
  status: string;
  allowedTools: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export function ConnectorManager({ initialConnectors }: { initialConnectors: Connector[] }) {
  const [connectors, setConnectors] = useState(initialConnectors);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [authType, setAuthType] = useState('none');
  const [token, setToken] = useState('');

  async function handleCreate() {
    if (!name || !serverUrl) return;

    const res = await fetch('/api/mcp-connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        serverUrl,
        authType,
        credentials: authType === 'bearer' ? { token } : undefined,
      }),
    });

    if (res.ok) {
      const { connector } = await res.json();
      setConnectors([...connectors, connector]);
      setCreating(false);
      setName('');
      setServerUrl('');
      setToken('');
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/mcp-connectors/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setConnectors(connectors.filter((c) => c.id !== id));
    }
  }

  async function handleTest(connector: Connector) {
    alert(`Testing connection to ${connector.serverUrl}...\n\nTo fully test, the MCP server must be running and accessible from the Vercel deployment.`);
  }

  return (
    <div className="space-y-4">
      {connectors.length === 0 && !creating && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <span className="text-4xl mb-3 block">🔌</span>
          <h3 className="text-gray-900 font-medium mb-1">No connectors configured</h3>
          <p className="text-gray-500 text-sm mb-4">
            Add MCP server connections to give board members access to external tools during sessions.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500"
          >
            Add Connector
          </button>
        </div>
      )}

      {connectors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connectors.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{c.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{c.serverUrl}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`w-2 h-2 rounded-full ${c.status === 'active' ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                    <span className="text-xs text-gray-500">{c.status}</span>
                    <span className="text-xs text-gray-400">| {c.authType}</span>
                  </div>
                  {Array.isArray(c.allowedTools) && c.allowedTools.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(c.allowedTools as string[]).map((tool) => (
                        <span key={tool} className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 rounded">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleTest(c)} className="text-xs text-blue-600 hover:underline">
                    Test
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="text-xs text-red-500 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-gray-900">Add MCP Connector</h3>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Connector name (e.g., Google Drive)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="Server URL (e.g., http://localhost:3001/mcp)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono" />
          <select value={authType} onChange={(e) => setAuthType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
            <option value="none">No auth</option>
            <option value="bearer">Bearer token</option>
            <option value="oauth">OAuth (configure later)</option>
          </select>
          {authType === 'bearer' && (
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token" type="password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreate}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-500">
              Save
            </button>
            <button onClick={() => setCreating(false)}
              className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      ) : connectors.length > 0 && (
        <button onClick={() => setCreating(true)}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500">
          Add Connector
        </button>
      )}
    </div>
  );
}
