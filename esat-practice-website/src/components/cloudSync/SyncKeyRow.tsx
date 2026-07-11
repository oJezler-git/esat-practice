import { ADJECTIVES, NOUNS } from "../../lib/cloudSync";

interface SyncKeyRowProps {
  key_: string;
  editingKey: boolean;
  draftKey: string;
  choosingWords: boolean;
  word1: string;
  word2: string;
  wordError: string;
  creatingKey: boolean;
  newlyCreated: boolean;
  copying: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onDraftChange: (draft: string) => void;
  onSaveEdit: () => void;
  onStartChooseWords: () => void;
  onCancelChooseWords: () => void;
  onWord1Change: (word: string) => void;
  onWord2Change: (word: string) => void;
  onCreateWithWords: () => void;
  onGenerate: () => void;
  onCopy: () => void;
  onDismissNew: () => void;
}

export function SyncKeyRow({
  key_,
  editingKey,
  draftKey,
  choosingWords,
  word1,
  word2,
  wordError,
  creatingKey,
  newlyCreated,
  copying,
  onStartEdit,
  onCancelEdit,
  onDraftChange,
  onSaveEdit,
  onStartChooseWords,
  onCancelChooseWords,
  onWord1Change,
  onWord2Change,
  onCreateWithWords,
  onGenerate,
  onCopy,
  onDismissNew,
}: SyncKeyRowProps) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-secondary">Sync key</div>
          <div className="text-xs text-muted mt-0.5">
            Write this down — anyone with this key can overwrite your data.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editingKey ? (
            <>
              <input
                type="text"
                aria-label="Sync key"
                value={draftKey}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") onCancelEdit(); }}
                autoFocus
                placeholder="e.g. amber-forest-4291"
                className="text-sm font-mono border border-accent rounded-lg px-2 py-1 focus:outline-none focus:border-accent"
                style={{ width: "13rem" }}
                spellCheck={false}
              />
              <button
                type="button"
                onClick={onSaveEdit}
                className="px-3 py-1.5 text-sm border border-accent text-accent-strong rounded-lg hover:bg-accent-soft transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-3 py-1.5 text-sm border border-subtle text-muted rounded-lg hover:bg-soft transition-colors"
              >
                Cancel
              </button>
            </>
          ) : key_ ? (
            <>
              <button
                type="button"
                className="text-sm font-mono text-primary bg-soft border border-subtle rounded-lg px-2 py-1 select-all cursor-pointer"
                onClick={onStartEdit}
                title="Click to edit"
              >
                {key_}
              </button>
              <button
                type="button"
                onClick={onCopy}
                className="px-3 py-1.5 text-sm border border-subtle text-secondary rounded-lg hover:border-strong transition-colors"
                title="Copy key"
              >
                {copying ? "Copied!" : "Copy"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Newly-created banner */}
      {newlyCreated && (
        <div className="mt-2.5 px-3 py-2 rounded-lg bg-accent-soft border border-accent text-xs text-primary flex items-start justify-between gap-2">
          <span>
            Key created — your number was assigned above. Copy it and save it somewhere safe before leaving this page.
          </span>
          <button
            type="button"
            onClick={onDismissNew}
            className="shrink-0 text-muted hover:text-accent"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Word-picker form */}
      {choosingWords ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-muted">
            Pick any two words (letters only). We'll assign a random number automatically — you'll see the full key once it's ready.
          </div>
          <div className="text-xs text-amber bg-amber-soft border border-warning rounded-lg px-2.5 py-1.5">
            Choose words that are somewhat personal or unusual. Common combinations like <code className="font-mono">blue-sky</code> are more likely to be guessed, though the random number we add and rate limiting makes any key hard to brute-force regardless.
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label="First word of sync key"
              list="sync-word-list-adj"
              value={word1}
              onChange={(e) => onWord1Change(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onCancelChooseWords(); }}
              autoFocus
              placeholder="first word"
              className="text-sm font-mono border border-strong rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent w-36"
              spellCheck={false}
              autoComplete="off"
            />
            <datalist id="sync-word-list-adj">
              {ADJECTIVES.map((w) => <option key={w} value={w}>{w}</option>)}
            </datalist>
            <span className="text-muted text-sm select-none">–</span>
            <input
              type="text"
              aria-label="Second word of sync key"
              list="sync-word-list-noun"
              value={word2}
              onChange={(e) => onWord2Change(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreateWithWords();
                if (e.key === "Escape") onCancelChooseWords();
              }}
              placeholder="second word"
              className="text-sm font-mono border border-strong rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent w-36"
              spellCheck={false}
              autoComplete="off"
            />
            <datalist id="sync-word-list-noun">
              {NOUNS.map((w) => <option key={w} value={w}>{w}</option>)}
            </datalist>
            <button
              type="button"
              onClick={onCreateWithWords}
              disabled={creatingKey || !word1 || !word2}
              className="px-3 py-1.5 text-sm border border-accent text-accent-strong rounded-lg hover:bg-accent-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creatingKey ? "Creating…" : "Create key"}
            </button>
            <button
              type="button"
              onClick={onCancelChooseWords}
              disabled={creatingKey}
              className="px-3 py-1.5 text-sm border border-subtle text-muted rounded-lg hover:bg-soft transition-colors"
            >
              Cancel
            </button>
          </div>
          {wordError && (
            <div className="text-xs text-danger-text">{wordError}</div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 mt-2.5">
          <button
            type="button"
            onClick={onGenerate}
            className="text-xs text-accent hover:text-accent-strong transition-colors"
          >
            {key_ ? "Generate new key" : "Generate a sync key"}
          </button>
          <span className="text-xs text-muted">or</span>
          <button
            type="button"
            onClick={onStartChooseWords}
            className="text-xs text-accent hover:text-accent-strong transition-colors"
          >
            Choose your words
          </button>
          {!key_ && (
            <>
              <span className="text-xs text-muted">or</span>
              <button
                type="button"
                onClick={onStartEdit}
                className="text-xs text-muted hover:text-secondary transition-colors"
              >
                Enter existing key
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
