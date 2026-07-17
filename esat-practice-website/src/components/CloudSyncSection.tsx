import { SyncDataPanel } from "./cloudSync/SyncDataPanel";
import { SyncKeyRow } from "./cloudSync/SyncKeyRow";
import { useCloudSync } from "./cloudSync/useCloudSync";

export function CloudSyncSection() {
  const { state, busy, showUndo, ...actions } = useCloudSync();

  return (
    <section className="mb-8 border border-subtle rounded-xl bg-soft overflow-hidden">
      <div className="px-4 py-3.5 border-b border-subtle">
        <h2 className="text-sm font-medium text-muted">Cloud Sync</h2>
        <p className="text-xs text-muted mt-1">
          Sync your progress across devices using a personal sync key. No account needed.
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
          onDismissNew={actions.onDismissNew}
        />

        <SyncDataPanel
          hasKey={!!state.key}
          busy={busy}
          pushing={state.pushing}
          pulling={state.pulling}
          restoring={state.restoring}
          lastPush={state.lastPush}
          lastPull={state.lastPull}
          showUndo={showUndo}
          status={state.status}
          onPush={() => { void actions.onPush(); }}
          onPull={() => { void actions.onPull(); }}
          onRestore={() => { void actions.onRestore(); }}
        />
      </div>
    </section>
  );
}
