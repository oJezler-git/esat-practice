import { SyncDataPanel } from "./cloudSync/SyncDataPanel";
import { SyncKeyRow } from "./cloudSync/SyncKeyRow";
import { useCloudSync } from "./cloudSync/useCloudSync";

export function CloudSyncSection() {
  const { state, syncStatus, ...actions } = useCloudSync();

  return (
    <section className="mb-8 border border-subtle rounded-xl bg-soft overflow-hidden">
      <div className="px-4 py-3.5 border-b border-subtle">
        <h2 className="text-sm font-medium text-muted">Cloud Sync</h2>
        <p className="text-xs text-muted mt-1">
          Connect once and your practice progress saves automatically across devices. No account needed. Cloud copies that go untouched for a year are automatically deleted.
        </p>
      </div>

      <div className="divide-y divide-subtle">
        <SyncKeyRow
          key_={state.key}
          editingKey={state.editingKey}
          draftKey={state.draftKey}
          choosingWords={state.choosingWords}
          word1={state.word1}
          word2={state.word2}
          wordError={state.wordError}
          creatingKey={state.creatingKey}
          newlyCreated={state.newlyCreated}
          copying={state.copying}
          onStartEdit={actions.onStartEdit}
          onCancelEdit={actions.onCancelEdit}
          onDraftChange={actions.onDraftChange}
          onSaveEdit={actions.onSaveEdit}
          onStartChooseWords={actions.onStartChooseWords}
          onCancelChooseWords={actions.onCancelChooseWords}
          onWord1Change={actions.onWord1Change}
          onWord2Change={actions.onWord2Change}
          onCreateWithWords={() => { void actions.onCreateWithWords(); }}
          onGenerate={actions.onGenerate}
          onCopy={() => { void actions.onCopy(); }}
          onDisconnect={() => { void actions.onDisconnect(); }}
          onDismissNew={actions.onDismissNew}
        />

        <SyncDataPanel
          hasKey={!!state.key}
          phase={syncStatus.status}
          lastSyncedAt={syncStatus.lastSyncedAt}
          error={syncStatus.error}
          onRetry={() => { void actions.onRetry(); }}
        />
      </div>
    </section>
  );
}
