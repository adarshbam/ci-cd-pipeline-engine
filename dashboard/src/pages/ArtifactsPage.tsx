import React, { useState, useEffect } from 'react';
import {
  Package,
  FolderGit2,
  ArrowRight,
  Download,
  AlertTriangle,
  Search
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { pipelineApi } from '../api/client';
import { useDataMode } from '../context/DataModeContext';
import { Artifact } from '../types';

export const ArtifactsPage: React.FC = () => {
  const navigate = useNavigate();
  const { dataMode } = useDataMode();

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const list = await pipelineApi.getArtifacts(dataMode);
        if (mounted) setArtifacts(list);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [dataMode]);

  const handleDownload = async (art: Artifact) => {
    if (!art.runId || !art.name) return;
    setDownloadingId(art.id);
    setDownloadError(null);
    try {
      await pipelineApi.downloadArtifact(
        art.runId,
        art.jobId || art.jobName,
        art.name
      );
    } catch (err: any) {
      console.error('Artifact download failed:', err);
      setDownloadError(err?.message || 'Failed to download artifact file');
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredArtifacts = artifacts.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.jobName && a.jobName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (a.runId && a.runId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F4F4F5] font-mono">
            Artifacts &amp; Workspace Isolation
          </h1>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#18191E] text-[#A1A1AA] border border-[#27272A]">
            Workspace Filesystem
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1">
          Build packages, test logs, and binary outputs produced by pipeline execution runs.
        </p>
      </div>

      {downloadError && (
        <div className="p-3 rounded-lg bg-[#241215] border border-[#4C1D24] text-xs text-[#F87171] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{downloadError}</span>
          </div>
          <button
            onClick={() => setDownloadError(null)}
            className="text-[#71717A] hover:text-[#F4F4F5] font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Artifacts Table Card */}
      <Card variant="surface" className="p-5 border-[#27272A] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[#3B82F6]" />
            <h3 className="text-sm font-semibold text-[#F4F4F5] font-mono">
              Persisted Artifacts ({filteredArtifacts.length})
            </h3>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name, run, job..."
              className="w-full pl-8 pr-3 py-1 bg-[#141519] border border-[#27272A] rounded-md text-xs text-[#F4F4F5] placeholder-[#71717A] focus:outline-none focus:border-[#3B82F6] transition-colors font-mono"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#71717A] font-mono">
            Scanning runtime artifact storage...
          </div>
        ) : filteredArtifacts.length === 0 ? (
          <div className="p-8 rounded-lg bg-[#141519] border border-[#22242A] text-center space-y-2">
            <Package className="w-8 h-8 text-[#52525B] mx-auto opacity-60" />
            <h4 className="text-xs font-semibold text-[#F4F4F5] font-mono">
              No artifacts stored yet
            </h4>
            <p className="text-[11px] text-[#71717A] max-w-sm mx-auto leading-relaxed">
              When workflows upload outputs via <code className="text-[#3B82F6]">artifacts.upload</code>, they will appear here with instant download capabilities.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#27272A] text-[#71717A]">
                  <th className="py-2.5 px-3.5 first:pl-4 last:pr-4 uppercase text-[11px] font-medium tracking-wider select-none font-mono">
                    Artifact Name
                  </th>
                  <th className="py-2.5 px-3.5 first:pl-4 last:pr-4 uppercase text-[11px] font-medium tracking-wider select-none font-mono">
                    Job
                  </th>
                  <th className="py-2.5 px-3.5 first:pl-4 last:pr-4 uppercase text-[11px] font-medium tracking-wider select-none font-mono">
                    Run ID
                  </th>
                  <th className="py-2.5 px-3.5 first:pl-4 last:pr-4 uppercase text-[11px] font-medium tracking-wider select-none font-mono">
                    Size
                  </th>
                  <th className="py-2.5 px-3.5 first:pl-4 last:pr-4 uppercase text-[11px] font-medium tracking-wider select-none font-mono">
                    Date
                  </th>
                  <th className="py-2.5 px-3.5 first:pl-4 last:pr-4 uppercase text-[11px] font-medium tracking-wider select-none font-mono text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2026]">
                {filteredArtifacts.map((art) => {
                  const isDownloading = downloadingId === art.id;
                  const fileTypeBadge =
                    art.type === 'tar'
                      ? 'TAR'
                      : art.type === 'zip'
                      ? 'ZIP'
                      : art.type === 'report'
                      ? 'DOC'
                      : art.type === 'directory'
                      ? 'DIR'
                      : 'BIN';

                  return (
                    <tr
                      key={art.id}
                      className="hover:bg-[#16181F] transition-colors"
                    >
                      <td className="py-3 px-3.5 first:pl-4 last:pr-4">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded bg-[#18191E] border border-[#27272A] text-[#3B82F6] flex items-center justify-center font-mono text-[9px] font-bold shrink-0">
                            {fileTypeBadge}
                          </span>
                          <div>
                            <span className="text-xs font-medium text-[#F4F4F5] font-mono block">
                              {art.name}
                            </span>
                            {art.sha256 && (
                              <span
                                className="text-[10px] text-[#52525B] font-mono block"
                                title={`SHA256: ${art.sha256}`}
                              >
                                {art.sha256.slice(0, 12)}...
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3.5 first:pl-4 last:pr-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#18191E] text-[#D4D4D8] border border-[#27272A]">
                          {art.jobName || art.jobId}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 first:pl-4 last:pr-4">
                        <button
                          onClick={() =>
                            art.runId && navigate(`/runs/${art.runId}`)
                          }
                          className="text-xs text-[#3B82F6] hover:underline font-mono"
                          title="View run execution"
                        >
                          {art.runId ? `#${art.runId.slice(0, 8)}` : '—'}
                        </button>
                      </td>
                      <td className="py-3 px-3.5 first:pl-4 last:pr-4 text-xs font-mono text-[#A1A1AA]">
                        {art.size}
                      </td>
                      <td className="py-3 px-3.5 first:pl-4 last:pr-4 text-xs font-mono text-[#71717A]">
                        {art.createdAt
                          ? new Date(art.createdAt).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="py-3 px-3.5 first:pl-4 last:pr-4 text-right">
                        <Button
                          variant="secondary"
                          size="xs"
                          icon={<Download className="w-3 h-3" />}
                          isLoading={isDownloading}
                          onClick={() => handleDownload(art)}
                        >
                          Download
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Local Workspace Architecture Info */}
      <Card variant="surface" className="p-5 border-[#27272A] space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-[#18191E] border border-[#27272A] text-[#3B82F6] flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#F4F4F5] font-mono">
              Local Workspace Architecture
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
              Every job in this engine runs in an isolated temporary workspace located in{' '}
              <code className="text-[#3B82F6] font-mono">runtime/workspaces/&lt;runId&gt;/&lt;jobId&gt;</code>.
              Generated outputs are preserved per run lifecycle.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          <div className="p-3.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F4F4F5] font-mono">
              <FolderGit2 className="w-3.5 h-3.5 text-[#3B82F6]" />
              Cross-Job Artifacts
            </div>
            <p className="text-[11px] text-[#71717A] leading-relaxed font-mono">
              When workflows declare <code className="text-[#D4D4D8]">artifacts</code> in job definitions, outputs are transferred across dependent pipeline stages via the engine's <code className="text-[#D4D4D8]">ArtifactManager</code>.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#34D399] font-mono">
              <Package className="w-3.5 h-3.5 text-[#10B981]" />
              Instant File Downloads
            </div>
            <p className="text-[11px] text-[#71717A] leading-relaxed font-mono">
              Direct binary and text downloads are streamed from local storage with filename retention and SHA-256 verification.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] flex items-center justify-between text-xs text-[#A1A1AA]">
          <span>Inspect job outputs and execution logs across your pipeline runs:</span>
          <button
            onClick={() => navigate('/runs')}
            className="flex items-center gap-1.5 text-xs font-mono font-medium text-[#3B82F6] hover:text-white px-2.5 py-1 rounded bg-[#18191E] border border-[#27272A] hover:bg-[#20222A] transition-colors"
          >
            View Runs <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </Card>
    </div>
  );
};

export default ArtifactsPage;
