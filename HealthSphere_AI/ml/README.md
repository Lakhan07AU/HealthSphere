# HealthSphere embedding pipeline (EmbeddingGemma 300M)

Domain-specific embeddings for lab-report retrieval. The numeric extraction
pipeline (`backend/lib/extraction.js`) stays deterministic — embeddings are
used only for *retrieval/ranking* (finding the right passage or record), never
to decide values, units, bands, or abnormality.

## Layout

- `export_analytes.mjs` — dumps `TEST_LIBRARY` from the backend (single source
  of truth) to `ml/data/analytes.json`.
- `build_dataset.py` — generates synthetic, de-identified contrastive triplets
  (`train/val/test.jsonl`). No patient data is used, ever.
- `train.py` — fine-tunes `google/embeddinggemma-300m` with
  `MultipleNegativesRankingLoss`. Saves versioned artifacts + config.
- `evaluate.py` — Recall@K / MRR / nDCG on the held-out test split; compares
  base vs fine-tuned and embedding dims 768 vs 256 vs 128.
- `requirements.txt` — Python deps (torch CUDA 12.x + sentence-transformers).

## Reproduce

```powershell
# 0. Export backend aliases (re-run whenever TEST_LIBRARY changes)
node ml/export_analytes.mjs

# 1. Build the dataset (deterministic seed)
python ml/build_dataset.py

# 2. Install deps (CUDA build shown; CPU-only alternative in requirements.txt)
pip install torch --index-url https://download.pytorch.org/whl/cu121
pip install -r ml/requirements.txt

# 3. Baseline: measure the base model BEFORE training
python ml/evaluate.py --models base=google/embeddinggemma-300m

# 4. Smoke-test the training loop (24 triplets, ~10 steps)
python ml/train.py --micro --out ml/artifacts/smoke

# 5. Real fine-tune (needs CUDA GPU; RTX 3050 4GB fits batch-size 4)
python ml/train.py --batch-size 4 --grad-accum 2 --epochs 2 `
    --out ml/artifacts/HealthSphere-egemma-v1

# 6. Compare on the identical held-out set (+ dimension comparison)
python ml/evaluate.py `
  --models base=google/embeddinggemma-300m,tuned=ml/artifacts/HealthSphere-egemma-v1
```

Query/document prefixes are fixed constants shared by `train.py` and
`evaluate.py`; production inference must use the same prefixes.

## Model access (verified 2026-10-15)

`google/embeddinggemma-300m` is **gated** (`gated: manual` on the Hub API) and
returns **HTTP 401** for unauthenticated downloads. Baseline evaluation and
fine-tuning therefore cannot run until a human:

1. Opens https://huggingface.co/google/embeddinggemma-300m and accepts the
   Gemma Terms of Use,
2. Creates a read token at https://huggingface.co/settings/tokens,
3. Runs `huggingface-cli login` (or sets `HF_TOKEN`) on the training machine,
4. Re-runs steps 3–6 above.

No training, baseline, or comparison numbers are claimed until those runs
execute. The dataset, scripts, and metric code are validated (deterministic
rebuilds, metric unit checks); only the model-weight-dependent steps await
access.

## Design constraints

- EmbeddingGemma is an *embedding* model: similarity scores rank candidates;
  they never override parsed numeric results.
- 4 GB VRAM fits training only with small batches + short sequences; use
  `--micro` first. CPU training of 300M parameters is not practical.
- No retraining on live patient data: the dataset is synthetic by construction.
